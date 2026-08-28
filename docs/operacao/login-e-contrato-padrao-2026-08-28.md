# Correção de login e geração contratual padrão — 28/08/2026

## Causa do erro de login

O endpoint `POST /api/auth/login` retornava HTTP 500 porque o código publicado consultava `usuarios.session_version`, mas o journal do Drizzle no repositório terminava na migration 0007. A migration 0008, que cria a coluna e as estruturas de contratação, existia como arquivo SQL, porém não estava registrada no `drizzle/meta/_journal.json`; portanto, o runner não a aplicava. O bootstrap mantinha o container ativo somente quando o banco era considerado inicializado, enquanto a consulta de login ficava incompatível com o schema publicado.

A correção registra a migration 0008 no journal, adiciona a coluna `session_version` de forma idempotente no bootstrap para bancos legados e restringe o login aos campos realmente necessários. O fluxo segue usando cookie `auth_token` HttpOnly, Secure em produção e SameSite=Lax, com Bearer mantido apenas para compatibilidade. O verificador fail-closed agora exige nove migrations, `session_version`, as tabelas de contratação/checkout e seus índices.

## Conta administrativa

A aplicação não cria uma conta administrativa real automaticamente. `ENABLE_TEST_ADMIN` permanece desabilitado por padrão e o usuário `admin@comitivas.test` é reservado a ambiente de teste isolado. Em produção, o admin deve usar uma conta real já cadastrada ou o fluxo público de recuperação de senha por e-mail; não são gravadas credenciais de produção no repositório.

## Modelo contratual

O template runtime segue a estrutura do documento anexado: qualificação das partes, hospedagem, serviços inclusos, pagamento, atraso, cancelamento, exclusões, danos, transporte, embarque, bagagem, poltrona, seguro, imprevistos, convivência, responsável operacional, translado, comunicações e uso de imagem.

A geração administrativa dispõe de formulário para nome, CPF, RG, nacionalidade, estado civil, profissão, nascimento, endereço, telefone, e-mail, hospedagem, transporte, referência, datas e horários, tipo de veículo, limite de bagagem, seguro, uso de imagem e observações. O preview é somente leitura e o envio final congela os campos no snapshot; alterações posteriores exigem nova versão.

## Nota de revisão jurídica

Este documento é um registro técnico de implementação, não substitui a revisão jurídica do contrato antes de seu uso comercial. A redação contratual foi baseada nos arquivos fornecidos pelo usuário e mantém `Não informado` quando um dado editável ainda não foi preenchido.
