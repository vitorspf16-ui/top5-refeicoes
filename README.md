# Top 5 do Grupo de Refeições

Site estático (HTML/CSS/JS em módulos) publicado no GitHub Pages. O Supabase fornece autenticação, banco de dados com RLS, armazenamento das fotos e uma Edge Function para gerenciar administradores. Não há servidor próprio.

## Estrutura

- `index.html`, `css/style.css`, `js/app.js` (interface), `js/store-supabase.js` (acesso ao Supabase), `js/compress.js` (preparo das fotos), `js/config.js` (URL e chave pública).
- `supabase/setup.sql` (projeto novo), `supabase/migracoes/01…04`, `supabase/00-verificar-esquema.sql` e `05-auditoria-seguranca.sql` (somente leitura), `supabase/testes/` (testes SQL manuais) e `supabase/functions/gerenciar-admins/index.ts`.
- `tests/teste-fotos.html` (testes no navegador) e `tests/ui-smoke.py` (interface com Supabase simulado).

## Executar localmente

Servir por HTTP, sem abrir via `file://`:

```bash
python3 -m http.server 8000
```

Abrir `http://localhost:8000`.

**Atenção:** o site local usa o Supabase real configurado em `js/config.js`. Votos e ações administrativas feitos nele alteram dados reais.

## Papéis

- **Visitante:** vota com login anônimo, um voto por identidade anônima, e vê o ranking.
- **admin:** cadastra, edita e desativa participantes, pratos e fotos.
- **master:** todas as permissões anteriores, além de alterar o prazo, gerenciar administradores e iniciar uma nova votação.

O papel vem da tabela `public.admins`, coluna `role`, e é verificado no servidor por meio da RPC `sou_admin_master` e da Edge Function. O e-mail, por si só, não concede permissões.

## Aplicar a atualização

1. **Backup:** use a opção de backup do banco ou exporte as tabelas `votos`, `pratos`, `participantes` e `admins`.
2. No SQL Editor, execute `supabase/00-verificar-esquema.sql` e confira o esquema.
3. Execute, nesta ordem, apenas as migrações que ainda não foram aplicadas:
   - `01-participantes-prazo.sql`
   - `02-fotos-formatos.sql`
   - `03-admin-master.sql`
   - `04-nova-votacao-e-seguranca.sql`

   As migrações foram projetadas para serem idempotentes, mas confira o conteúdo e o esquema antes de executá-las.
4. Execute `supabase/05-auditoria-seguranca.sql`, que é somente leitura, e compare os resultados com os comentários de cada bloco.
5. Publique a Edge Function usando a Supabase CLI, autenticada no projeto correto:

   ```bash
   supabase functions deploy gerenciar-admins --project-ref SEU_PROJECT_REF
   supabase secrets set ALLOWED_ORIGINS="https://SEU_USUARIO.github.io" --project-ref SEU_PROJECT_REF
   ```

   Substitua os valores de exemplo pelos dados do seu projeto. Se precisar testar em localhost, inclua `http://localhost:8000` na lista de origens permitidas.

   As variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` devem ser configuradas de forma segura no ambiente da função. Nunca coloque a chave `service_role` em arquivos públicos ou no frontend. Antes de alterar secrets existentes, confira os valores e preserve outras origens necessárias.

6. Em Authentication → URL Configuration, configure o Site URL e as Redirect URLs com o endereço público correto do site. O endereço de redefinição de senha precisa estar autorizado.
7. Em Authentication → Providers, mantenha o login anônimo habilitado, se ele continuar sendo necessário para a votação.

## Publicar no GitHub Pages

Confira os arquivos que serão enviados antes de fazer o commit. Se os arquivos indicados estiverem versionados indevidamente, remova-os do índice do Git:

```bash
git rm -r --cached supabase/.temp js/store-demo.js
```

Depois:

```bash
git add -A
git commit -m "Atualização: master, nova votação, fotos e visual"
git push origin main
```

No GitHub, acesse Settings → Pages e confira se a publicação está configurada para a branch `main`, na raiz do repositório. Aguarde o deploy e recarregue a página com `Ctrl+F5`.

## Nova votação (reinício dos votos)

Entre como master e acesse a seção **Nova votação**. Escolha **Encerrar e iniciar nova votação**, informe o novo prazo, marque a confirmação e conclua.

A função `iniciar_nova_votacao` deve executar, em uma única transação, as seguintes ações:

- Bloquear a tabela de votos durante a operação.
- Apagar somente os registros de `public.votos`.
- Gravar o novo prazo.
- Liberar a transação.

Participantes, pratos, fotos, contas e administradores devem permanecer intactos. O novo prazo é obrigatório e precisa estar no futuro. A votação é aberta no instante em que a transação é confirmada. Não há histórico de vencedores.

Para testar, use `supabase/testes/reset-votos.sql`, que chama a função real e termina com `ROLLBACK`. Leia o script antes de executá-lo e confirme que todas as alterações de teste são revertidas.

## Prazo da votação

A interface utiliza o fuso `America/Sao_Paulo`; o prazo é armazenado como `timestamptz` e convertido no banco.

O bloqueio de votos após o prazo deve ser aplicado por trigger e policy na tabela `votos`, inclusive para chamadas diretas à API. O ranking permanece visível após o encerramento. Somente o master pode alterar o prazo.

## Fotos

Formatos de entrada: JPG, PNG, WebP e HEIC/HEIF, desde que o navegador consiga abrir o arquivo. As imagens são convertidas no navegador para WebP, JPEG ou PNG, conforme o suporte e a necessidade de transparência.

O processo reduz a qualidade de `0,75` até `0,40` e as dimensões de `800` até `400` pixels, com limite de 40 tentativas e timeout de 10 segundos por tentativa, para tentar manter o arquivo abaixo de 150 KB.

O MIME é conferido nos bytes reais, e a extensão e o `contentType` do upload devem coincidir. O limite do servidor é de 300 KB. O bucket `pratos` aceita WebP, JPEG e PNG. Há botão de câmera no celular e suporte a arrastar e soltar no computador.

## Segurança — resumo

Correções registradas:

- Erro de `.catch` e ausência da interface de master.
- Remoção de administrador que apagava a conta de login; agora deve remover somente a permissão.
- Mensagens da Edge Function que não chegavam ao frontend.
- Prazo editável por qualquer admin; agora somente master.
- Ausência de revogação explícita de permissões na tabela `admins`.
- RPCs sensíveis executáveis por usuários não autorizados.
- Falso sucesso quando a atualização do vínculo de uma foto afetava zero linhas.
- Destino da redefinição de senha derivado da URL aberta; agora deve usar uma URL fixa e autorizada.
- CORS com `*` na função; agora deve usar uma lista explícita de origens.
- Remoção de `supabase/.temp` e `store-demo.js` do pacote público.

Não foram encontrados no código analisado valores de `service_role`, chaves `sb_secret_`, senhas ou tokens privados. A chave `sb_publishable_` no `config.js` é pública por desenho; a segurança depende das policies e da configuração correta do banco. Confira os resultados de `05-auditoria-seguranca.sql`.

Limitações conhecidas:

- O login anônimo identifica uma sessão ou identidade anônima do navegador, não uma pessoa. Limpar os dados ou usar outro navegador pode permitir um novo voto, dependendo da implementação.
- O master define a senha inicial dos novos administradores. Eles devem trocá-la usando a opção de redefinição de senha.
- Não há limite adicional de tentativas de login além dos mecanismos aplicados pelo Supabase.

## Testes

### Automáticos

- Abra `tests/teste-fotos.html`. O arquivo contém 22 casos para WebP, ausência de WebP, falha ou travamento da conversão, arquivos acima do limite, HEIC, falha de upload, envio válido, erros da função administrativa, nova votação e voto encerrado.
- Execute:

  ```bash
  python3 tests/ui-smoke.py
  ```

  O teste utiliza um Supabase simulado para verificar papéis, master, nova votação e layout.

### Manuais

1. Faça login com usuário comum, admin e master. Confirme que cada perfil recebe apenas as permissões esperadas e que elas persistem após reabrir o navegador.
2. Confira se somente o master vê as seções Prazo, Administradores e Nova votação.
3. Crie um admin, entre com ele, remova seu acesso administrativo e confirme que a conta continua existindo.
4. Vote dentro do prazo e tente votar após o encerramento. Confira também se o ranking continua visível.
5. Teste uma nova votação e confirme que participantes, pratos e fotos continuam intactos.
6. Teste fotos no Safari do iPhone e no Chrome do Android, incluindo galeria, câmera, HEIC, substituição e remoção.
7. Teste Esqueci a senha: o e-mail deve chegar, o link deve retornar ao site autorizado e a nova senha deve funcionar.
8. Teste as APIs sem autorização usando uma conta visitante. As operações abaixo devem falhar:
   - `update` em `participantes` e `configuracoes`;
   - `select` em `admins`;
   - `rpc('iniciar_nova_votacao')`;
   - `rpc('definir_encerramento')`;
   - `functions.invoke('gerenciar-admins')`.
9. Procure possíveis segredos no repositório:

   ```bash
   git grep -nE "service_role|sb_secret_"
   ```

   Revise os resultados manualmente. Uma busca sem correspondências não garante, por si só, que o repositório esteja livre de segredos.

**Importante:** os resultados e as correções descritos neste documento precisam ser confirmados no código e no Supabase atual antes de serem considerados uma auditoria de segurança concluída.
