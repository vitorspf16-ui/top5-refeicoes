# Top 5 do Grupo de Refeições

Site estático (HTML/CSS/JS em módulos) publicado no GitHub Pages. Supabase fornece autenticação, banco (com RLS), armazenamento das fotos e uma Edge Function para gerenciar administradores. Não há servidor próprio.

## Estrutura
- `index.html`, `css/style.css`, `js/app.js` (interface), `js/store-supabase.js` (acesso ao Supabase), `js/compress.js` (preparo das fotos), `js/config.js` (URL e chave **pública**).
- `supabase/setup.sql` (projeto novo) · `supabase/migracoes/01…04` · `supabase/00-verificar-esquema.sql` e `05-auditoria-seguranca.sql` (somente leitura) · `supabase/testes/` (testes SQL manuais) · `supabase/functions/gerenciar-admins/index.ts`.
- `tests/teste-fotos.html` (testes no navegador) e `tests/ui-smoke.py` (interface com Supabase simulado).

## Executar localmente
Servir por HTTP (não abrir via `file://`): `python3 -m http.server 8000` e abrir http://localhost:8000. **Atenção:** o site local usa o Supabase real configurado em `js/config.js`; votos e ações de admin feitos nele alteram dados reais.

## Papéis
- **Visitante**: vota (login anônimo, 1 voto) e vê o ranking.
- **admin**: cadastra/edita/desativa participantes, pratos e fotos.
- **master**: tudo isso + prazo da votação, criar/remover administradores e **Nova votação**. O papel vem da tabela `public.admins` (coluna `role`), verificado no servidor (RPC `sou_admin_master` e Edge Function). O e-mail nunca autoriza nada.

## Aplicar a atualização (ordem)
1. **Backup**: Database → Backups (ou exporte `votos`, `pratos`, `participantes`, `admins`).
2. SQL Editor → rode `supabase/00-verificar-esquema.sql` (leitura) e confira o esquema.
3. Rode, nesta ordem, só as que ainda não rodou: `01-participantes-prazo.sql`, `02-fotos-formatos.sql`, `03-admin-master.sql`, **`04-nova-votacao-e-seguranca.sql`** (nova). Todas são idempotentes.
4. Rode `supabase/05-auditoria-seguranca.sql` (leitura) e compare com os comentários de cada bloco.
5. Publique a Edge Function (no terminal, com a Supabase CLI logada no seu projeto):
   ```
   supabase functions deploy gerenciar-admins --project-ref qvpnuwqqdoilzonqrurk
   supabase secrets set ALLOWED_ORIGINS="https://vitorspf16-ui.github.io" --project-ref qvpnuwqqdoilzonqrurk
   ```
   (Para testar em localhost, acrescente `,http://localhost:8000` ao valor.) `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já são injetadas pelo Supabase; **não** as coloque em arquivos.
6. Authentication → URL Configuration: **Site URL** e **Redirect URLs** devem conter `https://vitorspf16-ui.github.io/top5-refeicoes/` (a redefinição de senha só redireciona para endereços dessa lista).
7. Authentication → Providers: mantenha **Anonymous sign-ins** ligado.

## Publicar no GitHub Pages
```
git rm -r --cached supabase/.temp js/store-demo.js   # se ainda estiverem versionados
git add -A && git commit -m "Atualização: master, nova votação, fotos e visual" && git push origin main
```
Settings → Pages: branch `main`, raiz. Aguarde o deploy e recarregue com Ctrl+F5.

## Nova votação (reset de votos)
Entre como master → seção **Nova votação** → **Encerrar e iniciar nova votação** → informe o novo prazo, marque a confirmação e confirme. A função `iniciar_nova_votacao` roda numa única transação: bloqueia a tabela de votos, apaga **somente** `public.votos`, grava o novo prazo e libera. Participantes, pratos, fotos, contas e admins não são tocados. O novo prazo é obrigatório e precisa estar no futuro; a nova votação abre no mesmo instante do commit. Não há histórico de vencedores.
Para testar sem risco: `supabase/testes/reset-votos.sql` executa a função real e termina em `ROLLBACK`.

## Prazo
America/Sao_Paulo na interface; guardado como `timestamptz`; conversão feita no banco. O bloqueio de voto após o prazo é um trigger + policy em `votos` (vale para chamadas diretas à API). O ranking continua visível. Só o master altera o prazo.

## Fotos
Formatos de entrada: JPG, PNG, WebP e HEIC/HEIF (HEIC só se o navegador abrir; Safari abre). Convertidas no navegador: WebP → JPEG → PNG (PNG antes do JPEG apenas com transparência), reduzindo qualidade (0,75 → 0,40) e dimensões (800 → 400 px) até caber em 150 KB; no máximo 40 tentativas, cada uma com timeout de 10 s. O MIME é conferido nos bytes reais; extensão e `contentType` do upload sempre coincidem. Limite do servidor: 300 KB (bucket `pratos`: WebP/JPEG/PNG). Há botão de câmera no celular e arrastar-e-soltar no computador.

## Segurança — resumo
Corrigido: erro `.catch`; master sem interface; remoção de admin apagava a conta de login (agora remove só a permissão); mensagens da Edge Function eram perdidas no front; prazo editável por qualquer admin (agora só master); `admins` sem revoke explícito; RPCs sensíveis executáveis por `anon`; falso sucesso quando o vínculo da foto afetava 0 linhas; destino da redefinição de senha derivado da URL aberta (agora fixo em `SITE_URL`); CORS `*` na função (agora lista de origens); `supabase/.temp` e `store-demo.js` removidos do pacote.
Não encontrado no código: `service_role`, `sb_secret_`, senhas ou tokens privados. A chave `sb_publishable_` no `config.js` é pública por desenho; sua segurança depende das policies (verifique com `05-auditoria-seguranca.sql`).
Limites conhecidos: login anônimo identifica um navegador, não uma pessoa (quem limpar os dados pode votar de novo); o master define a senha inicial de novos admins (use "Esqueci a senha" para trocá-la); sem limite de tentativas de login além do que o Supabase aplica.

## Testes
**Automáticos:** abra `tests/teste-fotos.html` (22 casos: WebP, sem WebP, falha/travamento da conversão, acima do limite, HEIC, falha de upload, envio válido, erros da função de admin, nova votação, voto encerrado) e rode `python3 tests/ui-smoke.py` (papéis, master, nova votação e layout, com Supabase simulado).
**Manuais (exigem seu Supabase e aparelhos reais):**
1. Login de usuário comum (deve ser recusado como admin), de admin e do master; reabrir o navegador e conferir que o painel continua.
2. Master vê: Prazo, Administradores, Nova votação. Admin comum não vê.
3. Criar admin; entrar com ele; remover o acesso e conferir que ele perdeu o painel mas a conta existe.
4. Votar dentro do prazo; depois do prazo (ver `supabase/testes/votacao-encerrada.sql`); ranking visível após o encerramento.
5. Nova votação (ou `supabase/testes/reset-votos.sql`); conferir participantes, pratos e fotos intactos.
6. Fotos em iPhone (Safari) e Android (Chrome): galeria, câmera, HEIC; trocar e remover.
7. "Esqueci a senha": o e-mail chega, o link volta para o site, a nova senha funciona.
8. APIs sem autorização (console como visitante): `update` em `participantes`/`configuracoes`, `select` em `admins`, `rpc('iniciar_nova_votacao')`, `rpc('definir_encerramento')`, `functions.invoke('gerenciar-admins')`; todos devem falhar.
9. Varredura de segredos no repositório publicado (`git grep -nE "service_role|sb_secret_"`).
