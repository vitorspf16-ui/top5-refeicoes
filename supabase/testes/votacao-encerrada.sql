-- TESTE MANUAL (nada é gravado: termina em ROLLBACK). Verifica que o BANCO recusa voto depois do prazo,
-- mesmo por requisição direta, e que usuário comum não altera o prazo. Rode no SQL Editor após a migração 01.
-- Requer ao menos 1 usuário em auth.users (de preferência anônimo, não admin) e 1 participante ativo.
begin;
update public.configuracoes set votacao_encerra_em = now() - interval '1 minute' where id = 1;
do $$
declare u uuid; p uuid;
begin
  select id into u from auth.users where id not in (select user_id from public.admins) limit 1;
  select id into p from public.participantes where ativo limit 1;
  if u is null or p is null then raise exception 'Faltam dados para o teste (usuário não-admin e participante ativo).'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- 1) voto após o prazo deve falhar
  begin
    insert into public.votos (voter_id, participante_id) values (u, p);
    raise exception 'FALHA: voto aceito depois do prazo';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
    raise notice 'OK 1: voto bloqueado (%)', sqlerrm;
  end;
  -- 2) usuário comum não pode alterar o prazo
  begin
    perform public.definir_encerramento('2099-01-01T10:00');
    raise exception 'FALHA: usuário comum alterou o prazo';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
    raise notice 'OK 2: alteração do prazo negada (%)', sqlerrm;
  end;
  -- 3) usuário comum não pode escrever em configuracoes nem em participantes
  begin
    update public.configuracoes set votacao_encerra_em = null;
    raise exception 'FALHA: update direto em configuracoes permitido';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
    raise notice 'OK 3: update direto negado (%)', sqlerrm;
  end;
end $$;
rollback;
