-- SOMENTE LEITURA. Rode no SQL Editor depois das migrações e compare com o "esperado" de cada bloco.
-- 1) RLS: rowsecurity deve ser TRUE em admins, configuracoes, participantes, pratos, votos.
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
-- 2) Permissões de anon/authenticated nas tabelas. Esperado: admins sem NENHUMA linha; votos só SELECT(participante_id) e INSERT(voter_id, participante_id) em colunas.
select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated') order by 1,2,3;
select table_name, column_name, grantee, privilege_type from information_schema.column_privileges where table_schema = 'public' and table_name = 'votos' and grantee in ('anon','authenticated') order by 2,3,4;
-- 3) Policies. Esperado: nenhuma policy de escrita para anon/authenticated sem sou_admin() (ou voter_id = auth.uid() em votos).
select tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname in ('public','storage') order by 1,2;
-- 4) Funções: security_definer e search_path. Quem pode executar (anon NÃO deve aparecer em sou_admin_master, listar_admins, definir_encerramento, iniciar_nova_votacao, meu_voto).
select p.proname, p.prosecdef as security_definer, p.proconfig as config, has_function_privilege('anon', p.oid, 'execute') as anon_executa, has_function_privilege('authenticated', p.oid, 'execute') as auth_executa
  from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1;
-- 5) Papéis cadastrados (confira se só as pessoas esperadas são admin/master).
select a.role, u.email from public.admins a join auth.users u on u.id = a.user_id order by 1, 2;
-- 6) Bucket de fotos: público para leitura (necessário), mas só admin escreve; limite e tipos.
select id, public, file_size_limit, allowed_mime_types from storage.buckets;
-- 7) Trigger de bloqueio de votos.
select tgname, tgenabled from pg_trigger where tgrelid = 'public.votos'::regclass and not tgisinternal;
