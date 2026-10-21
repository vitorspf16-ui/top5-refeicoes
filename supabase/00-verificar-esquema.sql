-- SOMENTE LEITURA. Rode no SQL Editor ANTES da migração e confira se bate com o esperado (README).
select table_name, column_name, data_type, is_nullable from information_schema.columns
 where table_schema='public' and table_name in ('participantes','pratos','votos','admins','configuracoes') order by 1, ordinal_position;
select conrelid::regclass as tabela, conname, pg_get_constraintdef(oid) as definicao from pg_constraint where connamespace='public'::regnamespace order by 1,2;
select schemaname, tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname in ('public','storage') order by 1,2,3;
select proname, prosecdef as security_definer from pg_proc where pronamespace='public'::regnamespace order by 1;
select id, public, file_size_limit, allowed_mime_types from storage.buckets;
select (select count(*) from public.participantes) participantes, (select count(*) from public.pratos) pratos, (select count(*) from public.votos) votos;
