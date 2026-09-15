# Gateway de pagamentos Cora — referências oficiais

## Conclusão

A documentação oficial consultada confirma o uso de mTLS com Client ID, certificado e private key no backend, cobrança por boleto registrado, carnê parcelado e cobrança via PIX. Não foi localizada uma API oficial documentada para cobrança por cartão de crédito ou débito. O sistema, portanto, deixa os cartões preparados na interface e bloqueados no backend até que um adquirente compatível seja definido e documentado.

A documentação de webhook confirma os headers `webhook-event-id`, `webhook-event-type` e `webhook-resource-id`. Não foi localizada documentação oficial de HMAC, segredo compartilhado, JWS ou assinatura criptográfica. O receptor foi ajustado para deduplicar eventos pelo ID e confirmar o estado financeiro por consulta autenticada à Cora.

## Capacidades confirmadas

| Capacidade | Estado no sistema | Base oficial |
| --- | --- | --- |
| Token Client Credentials | Implementado no backend com mTLS e Bearer | [1] [2] |
| Boleto registrado | Implementado no provider Cora | [3] |
| Carnê parcelado | Implementado com 2 a 24 parcelas e persistência dos IDs/URLs | [4] |
| PIX em cobrança | Implementado com QR Code/Copia e Cola quando retornado | [5] |
| PDF de boleto | Usa `document_url` ou `payment_options.bank_slip.url` retornados pela Cora | [3] [4] |
| Webhook | Recebe headers oficiais, deduplica e reconcilia por API | [6] [7] |
| Cartão de crédito | Interface preparada; backend bloqueado até adquirente | Não documentado pela Cora consultada |
| Cartão de débito | Interface preparada; backend bloqueado até adquirente | Não documentado pela Cora consultada |

## Decisões de segurança

Certificados, private key, Client ID, token e qualquer credencial permanecem no backend e no runtime do Coolify. O navegador recebe somente capacidade, status e dados financeiros autorizados da própria reserva. A chave `Idempotency-Key` é preservada para que uma repetição da mesma criação não gere uma nova cobrança.

O envio de cobrança e confirmação de pagamento permanece na fila idempotente de notificações. A confirmação só é reconciliada após consulta do estado retornado pela Cora. O e-mail usa Brevo API ou SMTP conforme a configuração existente do ambiente.

## Incertezas que exigem validação em Stage

A Cora publica bases e endpoints diferentes para Integração Direta e Parceria Cora. A conta utilizada precisa confirmar a modalidade, o conjunto de credenciais, a base de parcelamento e o endpoint de produção. As URLs de PDF retornadas pela Cora também devem ser validadas quanto a validade e autenticação antes de serem transformadas em proxy ou armazenamento permanente.

A documentação não define política de retry, backoff ou entrega exatamente uma vez para webhooks. Por isso, a aplicação persiste `webhook-event-id`, responde rapidamente e reconcilia o recurso pela API autenticada.

## Referências

[1]: https://developers.cora.com.br/docs/client-credentials-int-direta.md "Client Credentials e Client ID — Integração Direta Cora"
[2]: https://developers.cora.com.br/docs/integracao-direta.md "Integração Direta Cora"
[3]: https://developers.cora.com.br/reference/emissão-de-boleto-registrado-v2.md "Emissão de Boleto Registrado v2 Cora"
[4]: https://developers.cora.com.br/reference/emissão-de-boleto-parcelado-v2.md "Emissão de Boleto Parcelado v2 Cora"
[5]: https://developers.cora.com.br/reference/qr-code-pix-v2.md "Emissão de QR Code Pix v2 Cora"
[6]: https://developers.cora.com.br/reference/criação-de-endpoints.md "Criação de Endpoints de Webhook Cora"
[7]: https://developers.cora.com.br/reference/exemplo-de-post-da-notificação.md "Exemplo de POST da Notificação Cora"
[8]: https://developers.cora.com.br/llms.txt "Índice oficial da documentação técnica Cora"

## Autor

Manus AI
