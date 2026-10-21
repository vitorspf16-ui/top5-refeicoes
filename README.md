# Top 5 do Grupo de Refeições

Aplicação web para votação de pratos, com ranking, painel administrativo
e envio de fotos.

## Executar localmente

Os módulos JavaScript precisam ser servidos por um servidor local; não
abra `index.html` diretamente com `file://`.

Com Python instalado, abra o terminal na pasta do projeto e execute:

``` bash
python -m http.server 8000
```

Depois, acesse `http://localhost:8000`.

**Atenção:** a versão local pode usar o banco de dados configurado para
a aplicação. Testes de votação e administração podem alterar dados
reais.

## Configuração

A aplicação utiliza Supabase para autenticação, banco de dados e
armazenamento de imagens. Para configurar uma instância própria,
consulte a documentação e os scripts de configuração incluídos no
projeto.

Nunca publique senhas, tokens privados ou chaves administrativas. Chaves
privilegiadas devem permanecer apenas em ambientes seguros do servidor,
nunca no código executado pelo navegador.

## Funcionamento

-   A votação pode ter prazo de encerramento.
-   O ranking permanece disponível após o encerramento.
-   Imagens enviadas são processadas no navegador antes do envio, quando
    o navegador oferece suporte.
-   O acesso às funções administrativas depende das permissões
    configuradas no serviço.

## Antes de disponibilizar o site

-   Teste login, votação, prazo e permissões com contas de teste.
-   Verifique se visitantes sem permissão não conseguem alterar dados.
-   Teste o envio de imagens em computador e celular.
-   Confira as políticas de segurança do banco e do armazenamento.
-   Faça backup antes de executar alterações no banco de dados.

## Desenvolvimento

O projeto usa HTML, CSS e JavaScript no frontend e Supabase nos serviços
de backend.
