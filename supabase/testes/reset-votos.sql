-- TESTE MANUAL do reset. Executa a função REAL e desfaz tudo com ROLLBACK (nenhum dado é alterado de forma permanente).
-- Rode fora do horário de pico: durante a transação a tabela votos fica travada para novos votos.
-- Requer: migração 04, ao menos 1 master em public.admins.
begin;
do $$
declare m uuid; c uuid; r jsonb;
  p0 bigint; pr0 bigint; u0 bigint; a0 bigint; o0 bigint; v0 bigint;
  p1 bigint; pr1 bigint; u1 bigint; a1 bigint; o1 bigint; v1 bigint;
begin
  select user_id into m from public.admins where role = 'master' limit 1;
  select id into c from auth.users where id not in (select user_id from public.admins) limit 1;
  if m is null then raise exception 'Nenhum master encontrado em public.admins.'; end if;
  select count(*) into p0 from public.participantes; select count(*) into pr0 from public.pratos;
  select count(*) into u0 from auth.users;           select count(*) into a0 from public.admins;
  select count(*) into o0 from storage.objects where bucket_id = 'pratos'; select count(*) into v0 from public.votos;

  -- 1) usuário comum NÃO pode resetar
  if c is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform public.iniciar_nova_votacao('2099-01-01T10:00');
      raise exception 'FALHA: usuário comum conseguiu resetar';
    exception when others then
      if sqlerrm like 'FALHA%' then raise; end if;
      raise notice 'OK 1: usuário comum negado (%)', sqlerrm;
    end;
    reset role;
  end if;

  -- 2) prazo no passado é recusado
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.iniciar_nova_votacao('2000-01-01T10:00');
    raise exception 'FALHA: prazo no passado aceito';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
    raise notice 'OK 2: prazo no passado recusado (%)', sqlerrm;
  end;

  -- 3) master reseta: votos zerados; o resto intacto
  r := public.iniciar_nova_votacao(to_char((now() at time zone 'America/Sao_Paulo') + interval '2 days', 'YYYY-MM-DD"T"HH24:MI'));
  reset role;
  select count(*) into v1 from public.votos;           select count(*) into p1 from public.participantes;
  select count(*) into pr1 from public.pratos;         select count(*) into u1 from auth.users;
  select count(*) into a1 from public.admins;          select count(*) into o1 from storage.objects where bucket_id = 'pratos';
  if v1 <> 0 then raise exception 'FALHA: ainda há % votos', v1; end if;
  if (p0, pr0, u0, a0, o0) is distinct from (p1, pr1, u1, a1, o1) then raise exception 'FALHA: algo além dos votos mudou'; end if;
  if not public.votacao_aberta() then raise exception 'FALHA: a nova votação não ficou aberta'; end if;
  raise notice 'OK 3: % votos apagados (antes: %); participantes=%, pratos=%, usuários=%, admins=%, fotos=% preservados; votação aberta', r->>'votos_apagados', v0, p1, pr1, u1, a1, o1;
end $$;
rollback;
