-- MIGRAÇÃO: administradores master + redefinição de senha
-- Execute após confirmar que o usuário vitorspf16@gmail.com já existe em Authentication > Users.
begin;

alter table public.admins
  add column if not exists role text not null default 'admin'
  check (role in ('master','admin'));

-- Promove a conta indicada a master, desde que ela já exista no Supabase Auth.
insert into public.admins (user_id, role)
select id, 'master'
from auth.users
where lower(email) = lower('vitorspf16@gmail.com')
on conflict (user_id) do update set role = 'master';

do $$
begin
  if not exists (
    select 1 from public.admins a
    join auth.users u on u.id = a.user_id
    where lower(u.email) = lower('vitorspf16@gmail.com')
      and a.role = 'master'
  ) then
    raise exception 'Conta vitorspf16@gmail.com não encontrada em Authentication > Users. Crie/confirme essa conta e execute novamente esta migração.';
  end if;
end $$;

create or replace function public.sou_admin_master()
returns boolean
language sql stable security definer
set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid() and role = 'master') $$;

create or replace function public.listar_admins()
returns table (user_id uuid, email text, nome text, role text)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.sou_admin_master() then
    raise exception 'Apenas o administrador master.' using errcode = '42501';
  end if;
  return query
    select a.user_id, u.email::text, coalesce(u.raw_user_meta_data->>'nome', u.raw_user_meta_data->>'name', '')::text, a.role
    from public.admins a join auth.users u on u.id = a.user_id
    order by case when a.role = 'master' then 0 else 1 end, u.email;
end
$$;

revoke all on function public.sou_admin_master() from public;
grant execute on function public.sou_admin_master() to authenticated;
revoke all on function public.listar_admins() from public;
grant execute on function public.listar_admins() to authenticated;

commit;
