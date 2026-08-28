# Verificação da documentação oficial Cora — 28/08/2026

A documentação oficial de Utilização das APIs informa que a Integração Direta exige certificado e chave em todas as requisições, token de autenticação e URL base específica do ambiente. O exemplo de emissão usa `https://matls-clients.api.stage.cora.com.br/v2/invoices` e `Idempotency-Key`.

A referência oficial de emissão de carnê informa o endpoint `POST https://api.stage.cora.com.br/v2/invoices/installments`. O recurso é boleto parcelado e não deve receber Pix como forma de pagamento. O código deve manter a URL base configurável por ambiente, usar mTLS em todas as requisições e manter valores monetários em centavos.

Fontes consultadas:

- https://developers.cora.com.br/docs/utilização-das-apis
- https://developers.cora.com.br/reference/emissão-de-boleto-parcelado-v2


## Verificação adicional — notificações, consulta e cancelamento

A documentação oficial informa que o POST de notificação envia `webhook-event-id`, `webhook-event-type` e `webhook-resource-id` nos headers, e recomenda configurar o endpoint e monitorar os eventos. A criação de endpoints exige token válido, URL, recurso e trigger, além de `Idempotency-Key` UUID. A consulta de detalhes v2 usa `GET https://api.stage.cora.com.br/v2/invoices/{invoice_id}` e retorna `total_amount`/`total_paid` em centavos e estados como `OPEN`, `PAID`, `LATE` e `CANCELED`. O cancelamento usa `DELETE` no mesmo recurso e não deve ser feito após o boleto ser pago.

A documentação consultada não apresentou HMAC de webhook como header padrão; o sistema mantém HMAC opcional por segredo configurado, além de preservar a defesa principal de consulta mTLS à Cora antes da reconciliação. Nenhuma credencial foi registrada.

### Referências

[1] [Exemplo de POST da Notificação](https://developers.cora.com.br/reference/exemplo-de-post-da-notificação)

[2] [Criação de endpoints](https://developers.cora.com.br/reference/criação-de-endpoints)

[3] [Consulta de detalhes do boleto v2](https://developers.cora.com.br/reference/consultar-detalhes-de-um-boleto-v2)

[4] [Cancelamento de boleto v2](https://developers.cora.com.br/reference/cancelamento-de-boleto-v2)
