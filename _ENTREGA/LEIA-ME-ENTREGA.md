# Pacote completo — Excursão das Comitivas + Ficha 360º de Clientes

Base remota utilizada: `main` no commit `2d5766fa9037778af0b451192c088e3b67a0b76d` (`correção visual`).

Este pacote contém o projeto completo com a implementação da Ficha 360º de Clientes integrada, incluindo:

- tela administrativa de clientes;
- ficha detalhada do cliente;
- dados cadastrais e edição;
- reservas e viagens;
- contratos e acesso aos documentos contratuais existentes;
- financeiro e parcelas;
- histórico cronológico;
- acervo documental do cliente;
- upload/visualização/download/remoção controlada de documentos;
- relatório individual e exportação;
- migration `drizzle/0010_clientes_ficha_documentos_historico.sql`;
- journal Drizzle atualizado.

## Segurança do pacote

Por precaução, não foram incluídos:

- `.git`;
- `node_modules`;
- `.env` e `.env.teste`;
- arquivos históricos de variáveis do Coolify com potencial de conter segredos;
- diretório de uploads de produção.

O arquivo `.env.example` permanece no projeto como referência de configuração.

## Validação

A alteração foi preparada especificamente sobre o HEAD acima. O patch correspondente está em `_ENTREGA/ficha-360-clientes-head-2d5766f.patch`.

A migration é forward-only e cria as estruturas de documentos e histórico. Antes de produção: fazer backup do PostgreSQL, confirmar `STORAGE_PATH` persistente, executar migration/testes/build e então redeploy.

O build completo não foi declarado como aprovado neste sandbox porque as dependências npm não estavam integralmente disponíveis localmente.
