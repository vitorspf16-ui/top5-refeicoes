-- Cole TUDO no Supabase: SQL Editor > New query > Run. Pode rodar uma vez só.

create table public.participantes (id uuid primary key default gen_random_uuid(), nome text not null, apelido text not null);
create table public.pratos (
  id uuid primary key default gen_random_uuid(),
  participante_id uuid not null unique references public.participantes(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 80),
  descricao text check (char_length(descricao) <= 200),
  foto_path text,                       -- só o caminho no Storage, nunca a imagem
  criado_em timestamptz not null default now());
create table public.votos (               -- uma linha por pessoa: voter_id é UNIQUE
  id bigint generated always as identity primary key,
  voter_id uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  participante_id uuid not null references public.participantes(id) on delete cascade,
  criado_em timestamptz not null default now());
create table public.admins (user_id uuid primary key references auth.users(id) on delete cascade);

alter table public.participantes enable row level security;
alter table public.pratos        enable row level security;
alter table public.votos         enable row level security;
alter table public.admins        enable row level security;  -- sem policies: ninguém lê pela API

create function public.sou_admin() returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;
grant execute on function public.sou_admin() to anon, authenticated;

create policy "todos leem participantes" on public.participantes for select using (true);
create policy "admin gerencia participantes" on public.participantes for all to authenticated using (public.sou_admin()) with check (public.sou_admin());
create policy "todos leem pratos" on public.pratos for select using (true);
create policy "admin gerencia pratos" on public.pratos for all to authenticated using (public.sou_admin()) with check (public.sou_admin());
-- Visitantes podem consultar apenas a coluna usada para contar votos; nunca o identificador do votante.
create policy "contagem publica de votos" on public.votos for select to anon, authenticated using (true);
create policy "cada pessoa vota uma vez" on public.votos for insert to authenticated with check (voter_id = auth.uid());
revoke all on table public.votos from public, anon, authenticated;
grant select (participante_id) on table public.votos to anon, authenticated;
grant insert (voter_id, participante_id) on table public.votos to authenticated;

-- Consulta segura do próprio voto: não expõe voter_id nem os votos individuais de terceiros.
create or replace function public.meu_voto() returns uuid
language sql stable security definer set search_path = public
as $$ select participante_id from public.votos where voter_id = auth.uid() limit 1 $$;
revoke all on function public.meu_voto() from public;
grant execute on function public.meu_voto() to authenticated;
-- Nenhum update/delete de votos é permitido pela API.

-- Storage: bucket público para leitura, limite de 300 KB; WebP, JPEG ou PNG
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pratos', 'pratos', true, 307200, array['image/webp','image/jpeg','image/png']) on conflict (id) do nothing;
create policy "admin lista fotos"    on storage.objects for select to authenticated using (bucket_id = 'pratos' and public.sou_admin());
create policy "admin envia fotos"    on storage.objects for insert to authenticated with check (bucket_id = 'pratos' and public.sou_admin());
create policy "admin atualiza fotos" on storage.objects for update to authenticated using (bucket_id = 'pratos' and public.sou_admin()) with check (bucket_id = 'pratos' and public.sou_admin());
create policy "admin exclui fotos"   on storage.objects for delete to authenticated using (bucket_id = 'pratos' and public.sou_admin());

-- Tempo real para votos e pratos
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pratos') then
    alter publication supabase_realtime add table public.pratos;
  end if;
  -- Não publicamos a tabela votos no Realtime, para evitar enviar linhas de votos individuais.
end $$;

-- Participantes de exemplo (troque pelos nomes reais):
-- insert into public.participantes (nome, apelido) values ('Nome Completo', 'Apelido');

-- DEPOIS de criar o usuário admin em Authentication > Users, rode (com o seu e-mail):
-- insert into public.admins (user_id) select id from auth.users where email = 'seu@email.com';
