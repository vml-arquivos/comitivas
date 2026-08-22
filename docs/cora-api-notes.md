# Notas técnicas — Banco Cora

Fontes oficiais consultadas em 22/08/2026:

- https://developers.cora.com.br/
- https://developers.cora.com.br/docs/client-credentials-int-direta
- https://developers.cora.com.br/reference/cria%C3%A7%C3%A3o-de-endpoints
- https://developers.cora.com.br/reference/emiss%C3%A3o-de-boleto-registrado
- https://developers.cora.com.br/reference/qr-code-pix
- https://developers.cora.com.br/reference/emiss%C3%A3o-de-boleto-parcelado

## Autenticação

A documentação da Integração Direta confirma `POST https://matls-clients.api.stage.cora.com.br/token`, certificado e private key mTLS, `Content-Type: application/x-www-form-urlencoded` e os campos `grant_type=client_credentials&client_id=...`. Stage e produção usam credenciais próprias. A resposta fornece `access_token` e `expires_in`.

## Cobranças

A emissão de boleto registrado e cobrança QR Code Pix usa a API de invoices. Os valores são enviados em centavos. Boleto/QR Code usam `customer`, `services`, `payment_terms` e `Idempotency-Key`; QR Code Pix usa `payment_forms: PIX`, enquanto boleto pode usar `BANK_SLIP` e a documentação descreve boleto com QR Code Pix. A documentação do carnê usa `POST /v2/invoices/installments`, `service`, `installment.number_of` entre 2 e 24, vencimentos por datas ou dia do mês e `payment_forms: ["BANK_SLIP"]`.

## Status e webhooks

A documentação lista status de invoice `DRAFT`, `OPEN`, `IN_PAYMENT`, `LATE`, `PAID` e `CANCELLED`. O recurso de webhook é `invoice`, com triggers `drafted`, `created`, `paid`, `canceled`, `overdue` e `*`. A API de criação de endpoint usa `url`, `resource`, `trigger` e também exige `Idempotency-Key`.

## Consequências para a implementação

O sistema usa mTLS somente no backend, não imprime tokens, não envia segredos ao frontend e usa a consulta direta da invoice após webhook `paid` antes de marcar reserva como paga. Cartão não foi implementado porque a documentação consultada para Integração Direta não fornece um fluxo de cartão para este caso; o checkout produtivo oferece Pix e boleto/carnê apenas.
