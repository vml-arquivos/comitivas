# Fonte única operacional

Este documento é a referência atual para operação, deploy e validação da plataforma **Excursão das Comitivas**. Os arquivos históricos de Coolify, Mercado Pago, Asaas, Permupay e ambientes de teste permanecem no repositório apenas como registro de auditoria e não devem ser copiados para produção.

## Estado funcional

A aplicação atual é um monólito Node.js com API Express, frontend React/Vite, PostgreSQL com Drizzle e geração de contratos em PDF. A cadeia operacional é: cadastro do cliente, confirmação de e-mail, aprovação/rejeição administrativa auditada, origem comercial, evento, lote, pacote, adicionais, cupom, reserva, contrato versionado, OTP, aprovação administrativa do contrato, boleto manual ou pagamento Cora, webhook, voucher e notificações. O catálogo, contratos, parcelas e valores usam snapshots e centavos quando o fluxo já os fornece.

As correções desta versão reforçam o isolamento de carteira do vendedor, a posse do lead antes de alterações públicas, a revogação de sessões após mudanças administrativas, a proteção contra administrador de teste em produção, o bloqueio seguro quando a configuração financeira não pode ser lida, a fila idempotente de follow-up, a aceitação de `PAID_OUT` da Cora, a paridade entre decimal e centavos no contrato administrativo, e o build do app mobile.

## Produção e domínio

| Item | Valor operacional |
| --- | --- |
| Domínio oficial | `https://excursaodascomitivas.com.br` |
| API pública | Mesmo domínio, sob `/api` |
| Healthcheck | `GET /api/health` |
| Gateway de produção | Banco Cora exclusivamente |
| Banco | PostgreSQL persistente |
| Arquivos de contrato | Volume persistente configurado para `STORAGE_PATH` |
| Deploy | Imagem Docker construída pelo Coolify a partir do branch principal |

O domínio oficial deve ser validado depois de cada deploy com a Home, `/api/health`, páginas públicas, login, checkout e contrato. O container iniciado não é evidência suficiente de deploy concluído.

## Variáveis obrigatórias

Os valores secretos devem existir somente no ambiente seguro do Coolify ou do ambiente local protegido. Nunca devem ser commitados.

| Variável | Finalidade |
| --- | --- |
| `NODE_ENV` | Use `production` no ambiente produtivo. |
| `DATABASE_URL` | Conexão PostgreSQL persistente. |
| `JWT_SECRET` | Assinatura de sessão. É obrigatório em produção. |
| `OTP_PEPPER` | Proteção dos desafios OTP. |
| `PAYMENT_GATEWAY` | Deve ser `cora` em produção. |
| `CORA_ENV` | Ambiente Cora usado pela integração. |
| `CORA_CLIENT_ID` | Identificador da aplicação Cora. |
| `CORA_CERT_PATH` | Caminho do certificado mTLS montado no container. |
| `CORA_PRIVATE_KEY_PATH` | Caminho da chave privada mTLS montada no container. |
| `CORA_TOKEN_URL` | Endpoint de token do ambiente Cora. |
| `CORA_API_BASE_URL` | Endpoint de cobranças do ambiente Cora. |
| `CORA_INSTALLMENTS_API_BASE_URL` | Endpoint Cora de carnês/parcelas usado pelo preflight financeiro. |
| `CORA_WEBHOOK_PUBLIC_URL` | URL pública do webhook Cora sob `/api/pagamentos/webhook/cora`. |
| `CORA_WEBHOOK_HMAC_SECRET` | Segredo para validação da assinatura do webhook, quando fornecido pela Cora. |
| `STORAGE_PATH` | Volume persistente dos PDFs e arquivos operacionais. |
| `CORA_HTTP_TIMEOUT_MS`, `CORA_CARNE_TIMEOUT_MS` | Limites de espera das chamadas Cora. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Entrega de e-mails e processamento da outbox. |
| `SMTP_FINANCEIRO_FROM` | Remetente opcional da central financeira; não altera documentos contratuais. |
| `ENABLE_TEST_ADMIN` | Deve estar ausente ou `false` em produção. O código bloqueia `true` em produção. |

As variáveis `MERCADOPAGO_*`, `ASAAS_*`, `PAGSEGURO_*`, `STRIPE_*` e `ALLOW_MOCK_PAYMENT_IN_PROD` são históricas e não fazem parte do fluxo produtivo atual.

## Procedimento de deploy

Antes de uma migration, faça backup verificável do PostgreSQL e confirme a possibilidade de restauração. Execute as migrations existentes de forma forward-only. Não apague migrations aplicadas nem altere contratos históricos.

Depois, valide localmente:

```bash
npm ci
npm run lint
npm run typecheck:server
npm run build
npm test -- --run
(cd apps/mobile && npm ci && npm run build)
```

Os testes de integração, Cora stage e E2E dependem de banco, credenciais e ambiente isolado. Quando qualquer pré-requisito não estiver presente, o resultado correto é **BLOCKED**, nunca PASS simulado.

No Coolify, confirme `NODE_ENV=production`, as credenciais Cora mTLS, o HMAC do webhook, o volume de `STORAGE_PATH`, o healthcheck e o commit publicado. Não habilite o administrador de teste. Após o redeploy, acompanhe os logs e execute apenas smoke tests sem criar cobrança real, exceto quando a validação financeira de stage estiver autorizada e isolada.

## Segurança operacional

O vendedor só pode acessar leads, clientes, reservas e jornadas da própria carteira. A API aplica essa regra no banco, e não apenas na interface. Alterações de papel, senha e status revogam tokens anteriores por `session_version`.

Clientes seguem os estados `pendente`, `aprovado`, `rejeitado` e `revisao_necessaria`. O contrato só é preparado/validado após aprovação do cadastro; depois da validação do cliente, um administrador deve aprovar a versão antes da cobrança. PDFs de boleto são anexos manuais, armazenados sob `STORAGE_PATH`, vinculados à parcela por hash SHA-256 e enviados por e-mail somente por ação explícita do financeiro. O registro de WhatsApp é manual e auditável; não há disparo automático.

A atualização pública de intenção exige `lead_intent_token` assinado e expirável. O token não substitui autenticação para operações financeiras ou contratuais. A criação de cobrança permanece limitada ao usuário da reserva ou ao administrador autorizado.

A configuração financeira não pode ser substituída silenciosamente por defaults quando o ambiente é produção. Se o banco ou a tabela de configuração estiver indisponível, a preparação contratual deve ser bloqueada até a recuperação da fonte de verdade.

## Arquivos históricos

Os seguintes documentos devem ser tratados como legado e não como instrução de produção: `MERCADO_PAGO_SETUP.md`, `TESTE_PERMUPAY.md`, `TESTE_SUBDOMIOS.md`, `COOLIFY_ENV_BLOCO.txt`, `COOLIFY_VARIAVEIS_FINAIS.txt`, `COOLIFY_SEM_CONFLITOS.md` e relatórios datados de incidentes. A referência operacional é este documento e [docs/cora-deploy-readiness.md](../cora-deploy-readiness.md).

## Referências internas

- [README principal](../../README.md)
- [Prontidão Cora](../cora-deploy-readiness.md)
- [Notas da API Cora](../cora-api-notes.md)
- [Relatório técnico consolidado](../../AUDITORIA_TECNICA_CONSOLIDADA.md)
