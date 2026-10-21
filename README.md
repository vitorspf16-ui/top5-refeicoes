# Top 5 do Grupo de Refeições

## Testar agora (modo demonstração)
Os módulos JS não funcionam abrindo o arquivo direto (file://). Rode um servidor local na pasta:
`python3 -m http.server 8000` e abra http://localhost:8000
1. Clique em **Administrador** (na demo entra direto).
2. Escolha o participante, o nome do prato e uma foto da galeria. Veja a prévia e os tamanhos (original → compactada).
3. **Confirmar e salvar**: a foto aparece no cartão de votação e no ranking. Teste também trocar, remover foto e excluir prato.
4. Na demo as fotos ficam só em memória (somem ao recarregar).

## Conectar ao Supabase (plano gratuito)
1. Crie uma conta em supabase.com e um projeto novo.
2. **SQL Editor** → cole `supabase/setup.sql` → Run. Cria tabelas, regras (RLS), o bucket `pratos` e as permissões. Execute em um projeto novo/vazio; o script não é uma migração para corrigir tabelas já criadas.
3. **Authentication → Sign In / Providers**: ligue **Allow anonymous sign-ins** (é o que identifica cada votante).
4. **Authentication → Users → Add user**: crie o administrador (e-mail + senha). Depois rode no SQL Editor a última linha do `setup.sql` (insert em `admins`) com o e-mail dele. Só quem está nessa tabela consegue enviar, trocar ou excluir fotos.
5. Cadastre os participantes (exemplo comentado no `setup.sql` ou **Table Editor → participantes**).
6. **Project Settings → API**: copie a *Project URL* e a chave pública/anon. Cole em `js/config.js` e mude `modo` para `"supabase"`. Nunca use a chave `service_role` no navegador.
   - Use SOMENTE a chave anon. Nunca use a `service_role` no site. A anon é pública por design; a proteção vem das regras RLS.
7. **Authentication → URL Configuration**: coloque a URL do seu GitHub Pages em *Site URL*.
8. GitHub Pages: suba a pasta, em **Settings → Pages** escolha a branch `main` e a raiz.

## Como as fotos funcionam
- Navegador: valida tipo (JPG/PNG/WebP) e rejeita original acima de 15 MB → redimensiona proporcionalmente (máx. 800×800) → WebP com qualidade 0,75, baixando 0,07 por vez (até 0,40) até chegar em 150 KB. Se não chegar, avisa e mantém o menor resultado.
- Só a versão compactada é enviada. O original não é guardado.
- Caminho único `pratos/<id-do-prato>/<uuid>.webp`: uma foto nunca sobrescreve outra. O banco guarda só o caminho (`foto_path`).
- Trocar: envia a nova, grava o caminho e só então apaga a antiga. Se gravar falhar, a nova é apagada. Excluir prato ou foto apaga o arquivo.
- O bucket também recusa no servidor qualquer arquivo que não seja WebP ou passe de 300 KB.

## Limites a conhecer
- Login anônimo identifica uma sessão/navegador, não uma pessoa real: quem limpar os dados do navegador ou criar outra sessão pode votar de novo. Para controle mais rígido, exija login individual por e-mail.
- A API permite consultar somente a coluna de participante usada para somar votos; a identificação do votante não fica disponível pela consulta pública. O site consulta o ranking a cada 4 segundos, pois a tabela de votos não é transmitida pelo Realtime.
- Esta versão considera uma única votação por projeto: cada usuário autenticado pode registrar um voto e a restrição permanece até que o banco seja administrativamente ajustado. Para campanhas/votações recorrentes, é necessário acrescentar uma tabela de rodadas e vincular cada voto a uma rodada.
- Projetos gratuitos têm cotas de armazenamento e banco e podem ser pausados por inatividade. Confira os limites atuais no painel do Supabase.
- Os arquivos do bucket são públicos para leitura (necessário para exibir as fotos); não envie nada sensível.
