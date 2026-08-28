# Banco Cora — Stage e produção

A produção usa exclusivamente o Banco Cora. A Integração Direta exige certificado, chave privada e token em todas as requisições. Os certificados devem ser montados como arquivos de segredo legíveis somente pelo processo; nenhum segredo deve entrar no Git ou nos logs.

| Operação | Endpoint/runtime | Regra |
| --- | --- | --- |
| Invoice simples | `POST /v2/invoices` | `payment_forms` é lista; valores em centavos |
| Consulta | `GET /v2/invoices/{invoice_id}` | Consulta antes de reconciliar evento |
| Cancelamento | `DELETE /v2/invoices/{invoice_id}` | Somente invoice aberta e operação autorizada |
| Carnê | `POST /v2/invoices/installments` | `service` singular, `installment`, somente `BANK_SLIP`, 2–24 parcelas |
| Webhook | URL pública configurada | HMAC, deduplicação e consulta mTLS antes de efetivar |

Stage deve ser usado para token, criação, repetição da mesma Idempotency-Key, consulta, cancelamento, carnê, evento de parcela e reconciliação. Não executar cobrança real na produção durante smoke tests. Na ausência de mTLS, credencial ou webhook secret, a vitrine permanece disponível, mas a emissão de cobrança falha de forma explícita e segura.

As fontes oficiais verificadas em 28/08/2026 estão registradas em `docs/operacao/cora-docs-verificacao-2026-08-28.md`.
