-- MIGRAÇÃO 04 — nova votação (reset de votos) + endurecimento de permissões.
-- Requer as migrações 01 e 03 já aplicadas. Idempotente. Rode manualmente no SQL Editor, de uma vez. O site nunca executa SQL.
--
-- TABELAS AFETADAS PELA FUNÇÃO DE RESET: apenas public.votos (DELETE) e public.configuracoes (prazo).
-- NÃO toca em: participantes, pratos, admins, auth.users, storage.objects (fotos).
begin;

do $$ begin
  if to_regprocedure('public.sou_admin_master()') is null then raise exception 'Rode antes a migração 03 (sou_admin_master não existe).'; end if;
  if to_regclass('public.configuracoes') is null or to_regprocedure('public.votacao_aberta()') is null then raise exception 'Rode antes a migração 01.'; end if;
end $$;

-- 1) RLS ligada em tudo que a API expõe (não remove nenhuma policy).
alter table public.admins        enable row level security;
alter table public.participantes enable row level security;
alter table public.pratos        enable row level security;
alter table public.votos         enable row level security;
alter table public.configuracoes enable row level security;

-- 2) Ninguém lê nem escreve em admins pela API: o site usa só RPCs; a Edge Function usa a chave de servidor (que ignora este revoke).
--    Mesmo que alguém crie uma policy por engano, usuários comuns não conseguem se promover.
revoke all on table public.admins from anon, authenticated;

-- 3) Funções sensíveis: só usuários autenticados podem chamar (cada uma ainda confere o papel por dentro).
revoke all on function public.sou_admin_master() from public, anon;  grant execute on function public.sou_admin_master() to authenticated;
revoke all on function public.listar_admins()    from public, anon;  grant execute on function public.listar_admins()    to authenticated;
revoke all on function public.meu_voto()         from public, anon;  grant execute on function public.meu_voto()         to authenticated;

-- 4) Prazo: passa a ser alterável SOMENTE pelo master (antes: qualquer administrador).
create or replace function public.definir_encerramento(p_local text) returns timestamptz
language plpgsql security definer set search_path = public
as $$ declare t timestamptz; begin
  if not public.sou_admin_master() then raise exception 'Apenas o administrador master.' using errcode = '42501'; end if;
  if p_local is null or btrim(p_local) = '' then t := null;
  elsif p_local !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$' then raise exception 'Formato inválido. Use AAAA-MM-DDTHH:MM.' using errcode = '22023';
  else t := p_local::timestamp at time zone 'America/Sao_Paulo'; end if;
  update public.configuracoes set votacao_encerra_em = t, atualizado_em = now() where id = 1;
  return t;
end $$;
revoke all on function public.definir_encerramento(text) from public, anon;
grant execute on function public.definir_encerramento(text) to authenticated;

-- 5) Nova votação: apaga os votos e define o novo prazo, tudo numa única transação (ou tudo, ou nada).
--    * Só o master (verificado aqui dentro, no servidor).
--    * LOCK em votos: nenhum voto novo entra durante a limpeza; quem tenta votar espera o COMMIT e o voto é avaliado
--      já contra o NOVO prazo (conta na nova votação). Nenhum voto é perdido "no meio".
--    * O novo prazo é obrigatório e precisa estar no futuro: a votação nunca nasce encerrada.
--    * Sem TRUNCATE; DELETE apenas em votos. A sequência de ids dos votos não é alterada.
create or replace function public.iniciar_nova_votacao(p_local text) returns jsonb
language plpgsql security definer set search_path = public
as $$ declare t timestamptz; n bigint; begin
  if not public.sou_admin_master() then raise exception 'Apenas o administrador master.' using errcode = '42501'; end if;
  if p_local is null or p_local !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$' then
    raise exception 'Formato inválido. Use AAAA-MM-DDTHH:MM.' using errcode = '22023'; end if;
  t := p_local::timestamp at time zone 'America/Sao_Paulo';
  if t <= now() + interval '1 minute' then raise exception 'O novo prazo precisa estar no futuro.' using errcode = '22023'; end if;
  lock table public.votos in exclusive mode;
  delete from public.votos where true;
  get diagnostics n = row_count;
  update public.configuracoes set votacao_encerra_em = t, atualizado_em = now() where id = 1;
  return jsonb_build_object('votos_apagados', n, 'encerra_em', t);
end $$;
revoke all on function public.iniciar_nova_votacao(text) from public, anon;
grant execute on function public.iniciar_nova_votacao(text) to authenticated;

commit;
