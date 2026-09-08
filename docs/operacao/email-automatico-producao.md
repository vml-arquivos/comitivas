# E-mail automático de produção

O SMTP de produção é consumido pelo backend via Nodemailer. A configuração esperada é `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` e `SMTP_FROM`.

## Fluxos automáticos já existentes

- confirmação de e-mail de cadastro;
- redefinição de senha;
- OTP de 6 dígitos para validação eletrônica do contrato;
- registro de envio, message id e horário do OTP;
- e-mail pós-validação do contrato enfileirado na outbox transacional;
- processamento da outbox pelo scheduler configurado por `FOLLOWUP_CHECK_INTERVAL_MINUTOS`;
- follow-ups de jornada;
- confirmação de pagamento após quitação do boleto manual;
- reenvio de contrato.

## Boleto manual

O boleto não é gerado pelo sistema. Após aprovação do cadastro e validação do contrato, o administrador libera o financeiro, anexa cada PDF e usa a ação **Enviar por e-mail**. O sistema envia o PDF real e registra o envio na parcela, histórico do cliente e auditoria.

## Operação

Antes de liberar vendas, homologar: cadastro → código de e-mail → reserva → contrato → OTP → validação → e-mail pós-validação → aprovação administrativa → boleto PDF → envio → baixa → confirmação de pagamento.
