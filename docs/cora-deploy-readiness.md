# Prontidão para ativação do Banco Cora

O código do projeto já está preparado para operar com o Banco Cora como gateway único em produção. As credenciais ainda não foram emitidas/configuradas na conta Cora, portanto a aplicação não deve ser redeployada com `PAYMENT_GATEWAY=cora` até que o conjunto mínimo esteja completo. O Coolify permanece preservando a versão anterior saudável por rollback automático.

## Checklist de configuração no Coolify

| Variável | Obrigatória | Como preencher |
|---|---:|---|
| `PAYMENT_GATEWAY` | Sim | `cora` |
| `CORA_ENV` | Sim | `stage` para homologação ou `production` para produção, conforme a conta |
| `CORA_CLIENT_ID` | Sim | Client ID emitido pela Cora |
| `CORA_CLIENT_SECRET` | Conforme o cadastro | Secret emitido pela Cora, se o fluxo da conta exigir |
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

O certificado e a chave privada não devem ser commitados no GitHub nem colados em mensagens. No Coolify, montar os arquivos como secrets/volumes seguros e usar no runtime caminhos como `/run/secrets/cora-production-certificate.pem` e `/run/secrets/cora-production-private-key.key`. Os paths configurados precisam existir dentro do container; caso contrário, o runtime bloqueará a emissão de cobranças.

## Sequência segura quando a conta estiver pronta

Primeiro, cadastrar os secrets da Cora e do canal de notificações no ambiente `production`, sem remover `DATABASE_URL` ou `JWT_SECRET`. Em seguida, confirmar que `PAYMENT_GATEWAY` está como `cora`, salvar as variáveis e executar um redeploy. O Coolify deverá construir a imagem, iniciar o container e passar o healthcheck `/api/health`.

Depois do primeiro container saudável, validar `GET /api/health`, a home pública, `/regras`, `/galeria`, login/recuperação de senha, preparação do contrato e o fluxo de pagamento em Stage ou com uma cobrança de baixo risco aprovada pela operação. Confirmar também a migration `0007_evolucao_comitivas.sql` no PostgreSQL real antes de aceitar reservas novas. Nunca usar `mock` em produção e nunca testar uma cobrança real sem autorização operacional.

## Estado registrado em 22/08/2026

O commit publicado é `fe6e2bb20e91d205cd9aab5207cc13ea32ce88e0`. O Coolify importou esse commit corretamente, concluiu o build Docker e iniciou o rolling update, mas o container abortou porque o ambiente ainda mantinha `PAYMENT_GATEWAY=mock`; o rollback automático preservou o container anterior. A ausência de variáveis `CORA_*` foi confirmada sem leitura de valores secretos. Nenhuma variável foi alterada nesta etapa de preparação.
