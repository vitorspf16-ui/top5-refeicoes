-- MIGRAÇÃO 01 — participantes administráveis + prazo de encerramento.
-- Não apaga nem recria dados. Idempotente (pode rodar de novo). Rode no SQL Editor, de uma vez.
begin;

-- 0) Confere se o esquema esperado existe (aborta tudo, sem alterar nada, se não existir).
do $$ begin
  if to_regclass('public.participantes') is null or to_regclass('public.pratos') is null
     or to_regclass('public.votos') is null or to_regclass('public.admins') is null
     or to_regprocedure('public.sou_admin()') is null then
    raise exception 'Esquema esperado não encontrado. Rode supabase/00-verificar-esquema.sql e confira.';
  end if;
end $$;

-- 1) Desativar participante em vez de apagar (preserva o histórico de votos).
alter table public.participantes add column if not exists ativo boolean not null default true;

-- 2) Proteção do histórico: excluir participante COM votos passa a ser recusado pelo banco
--    (antes, "on delete cascade" apagaria os votos junto). Só troca a regra da chave estrangeira.
do $$ declare c text; begin
  for c in select conname from pg_constraint
           where conrelid='public.votos'::regclass and contype='f' and confrelid='public.participantes'::regclass
  loop execute format('alter table public.votos drop constraint %I', c); end loop;
  alter table public.votos add constraint votos_participante_id_fkey
    foreign key (participante_id) references public.participantes(id) on delete restrict;
end $$;

-- 3) Visitantes só enxergam participantes ativos; admin enxerga todos. (Escrita continua só do admin.)
drop policy if exists "todos leem participantes" on public.participantes;
drop policy if exists "leitura de participantes ativos" on public.participantes;
create policy "leitura de participantes ativos" on public.participantes for select using (ativo or public.sou_admin());

-- 4) Configuração (linha única). Ninguém escreve direto pela API: só via função de admin abaixo.
create table if not exists public.configuracoes (
  id smallint primary key default 1 check (id = 1),
  votacao_encerra_em timestamptz,               -- instante absoluto (UTC); null = sem prazo
  atualizado_em timestamptz not null default now());
insert into public.configuracoes (id) values (1) on conflict (id) do nothing;
alter table public.configuracoes enable row level security;
revoke all on table public.configuracoes from public, anon, authenticated;
grant select on table public.configuracoes to anon, authenticated;
drop policy if exists "todos leem configuracoes" on public.configuracoes;
create policy "todos leem configuracoes" on public.configuracoes for select using (true);

-- 5) Funções.
create or replace function public.votacao_aberta() returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select votacao_encerra_em is null or now() < votacao_encerra_em from public.configuracoes where id = 1), true) $$;

create or replace function public.config_votacao() returns table (agora timestamptz, encerra_em timestamptz)
language sql stable security definer set search_path = public
as $$ select now(), (select votacao_encerra_em from public.configuracoes where id = 1) $$;

-- Recebe "YYYY-MM-DDTHH:MM" como horário de Brasília e converte NO BANCO (independe do fuso do navegador).
create or replace function public.definir_encerramento(p_local text) returns timestamptz
language plpgsql security definer set search_path = public
as $$ declare t timestamptz; begin
  if not public.sou_admin() then raise exception 'Apenas administradores.' using errcode = '42501'; end if;
  if p_local is null or btrim(p_local) = '' then t := null;
  else t := p_local::timestamp at time zone 'America/Sao_Paulo'; end if;
  update public.configuracoes set votacao_encerra_em = t, atualizado_em = now() where id = 1;
  return t;
end $$;

revoke all on function public.definir_encerramento(text) from public, anon;
grant execute on function public.definir_encerramento(text) to authenticated;
grant execute on function public.votacao_aberta() to anon, authenticated;
grant execute on function public.config_votacao() to anon, authenticated;

-- 6) Bloqueio no servidor: vale para qualquer requisição à API, não só pelo site.
create or replace function public.votos_validar() returns trigger language plpgsql security definer set search_path = public
as $$ begin
  if not public.votacao_aberta() then raise exception 'VOTACAO_ENCERRADA' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.participantes where id = new.participante_id and ativo) then
    raise exception 'PARTICIPANTE_INATIVO' using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists votos_validar on public.votos;
create trigger votos_validar before insert on public.votos for each row execute function public.votos_validar();

drop policy if exists "cada pessoa vota uma vez" on public.votos;
create policy "cada pessoa vota uma vez" on public.votos for insert to authenticated
  with check (voter_id = auth.uid() and public.votacao_aberta());

commit;
