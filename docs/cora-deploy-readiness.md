# Prontidão para ativação do Banco Cora

O código do projeto já está preparado para operar com o Banco Cora como gateway único em produção. As credenciais ainda não foram emitidas/configuradas na conta Cora, portanto a aplicação não deve ser redeployada com `PAYMENT_GATEWAY=cora` até que o conjunto mínimo esteja completo. O Coolify permanece preservando a versão anterior saudável por rollback automático.

## Checklist de configuração no Coolify

| Variável | Obrigatória | Como preencher |
|---|---:|---|
| `PAYMENT_GATEWAY` | Sim | `cora` |
| `CORA_ENV` | Sim | `stage` para homologação ou `production` para produção, conforme a conta |
| `CORA_CLIENT_ID` | Sim | Client ID emitido pela Cora |
| `CORA_CERT_PATH` | Sim | Caminho interno do certificado mTLS montado como secret no container |
| `CORA_PRIVATE_KEY_PATH` | Sim | Caminho interno da chave privada mTLS montada como secret no container |
| `CORA_TOKEN_URL` | Sim | Endpoint oficial correspondente ao ambiente Cora |
| `CORA_API_BASE_URL` | Sim | Base URL oficial correspondente ao ambiente Cora |
| `CORA_WEBHOOK_PUBLIC_URL` | Sim | URL pública HTTPS terminando em `/api/pagamentos/webhook/cora` |
| `CORA_HTTP_TIMEOUT_MS` | Não | `15000` é o padrão recomendado |
| `OTP_PEPPER` | Sim | Segredo forte independente do `JWT_SECRET` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Para OTP por e-mail | Credenciais do provedor SMTP autorizado |
| `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, template e idioma | Para OTP por WhatsApp | Credenciais e template aprovado da WhatsApp Business Platform/BSP |

## Certificados mTLS

O certificado e a chave privada não devem ser commitados no GitHub nem colados em mensagens. No Coolify, montar os arquivos como secrets/volumes seguros e usar no runtime caminhos como `/run/secrets/cora-production-certificate.pem` e `/run/secrets/cora-production-private-key.key`. A Integração Direta mTLS não deve receber `CORA_CLIENT_SECRET` arbitrariamente. Os paths configurados precisam existir dentro do container; caso contrário, o runtime bloqueará a emissão de cobranças.

## Sequência segura quando a conta estiver pronta

Primeiro, cadastrar os secrets da Cora e do canal de notificações no ambiente `production`, sem remover `DATABASE_URL` ou `JWT_SECRET`. Em seguida, confirmar que `PAYMENT_GATEWAY` está como `cora`, salvar as variáveis e executar um redeploy. O Coolify deverá construir a imagem, iniciar o container e passar o healthcheck `/api/health`.

Depois do primeiro container saudável, validar `GET /api/health`, a home pública, `/regras`, `/galeria`, login/recuperação de senha, preparação do contrato e o fluxo de pagamento em Stage ou com uma cobrança de baixo risco aprovada pela operação. Confirmar também a migration `0007_evolucao_comitivas.sql` no PostgreSQL real antes de aceitar reservas novas. Nunca usar `mock` em produção e nunca testar uma cobrança real sem autorização operacional.

## Estado registrado em 22/08/2026

O incidente anterior foi corrigido no commit publicado `c7a6785`. O container antigo continua saudável e não houve redeploy após as correções, preservando a produção durante a preparação. O Coolify foi ajustado nominalmente para remover os gateways legados, manter URLs oficiais e usar somente `https://excursaodascomitivas.com.br` no campo Domains. As variáveis nomeadas estão runtime-only; `OTP_PEPPER` foi criado com valor CSPRNG forte, sem exposição, com build-time=false e runtime=true.

A migration `0007_evolucao_comitivas.sql` foi baixada do commit publicado, conferida por SHA-256, aplicada pelo migrator nativo Drizzle e verificada no PostgreSQL real: histórico com 8 migrations, 10 tabelas, 132 colunas, 9 índices e regras `2026.1` com hash íntegro.

O novo deploy permanece bloqueado somente porque a conta Cora ainda não forneceu/configurou as credenciais externas de Stage: `CORA_CLIENT_ID`, certificado mTLS, private key mTLS e os endpoints oficiais correspondentes. Não existem certificados, chaves ou variáveis `CORA_*` no Coolify; nenhum segredo fictício foi criado e `CORA_CLIENT_SECRET` não deve ser adicionado arbitrariamente. O SMTP e o WhatsApp permanecem sem teste real por ausência de autorização/destino de teste. A produção deve continuar no container antigo até a configuração oficial e o teste não destrutivo de autenticação mTLS.
