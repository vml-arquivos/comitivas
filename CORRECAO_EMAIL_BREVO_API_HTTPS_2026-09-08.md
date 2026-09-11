# Correção final — entrega de e-mail Brevo

Base funcional: `main@b1d2720ab7b414df3034d017d064b294dd9d9471`.

## Problema confirmado

A porta TCP 587 do ambiente de produção apresenta timeout. A porta 2525 responde, mas o fluxo anterior dependia apenas de Nodemailer e não possuía timeouts explícitos em todos os pontos, podendo manter requisições abertas por muito tempo.

## Correção

- Brevo API HTTPS (`/v3/smtp/email`, porta 443) como transporte principal quando `BREVO_API_KEY` estiver configurada.
- SMTP 2525 como fallback opcional.
- Timeouts explícitos de conexão, greeting e socket no SMTP.
- Timeout explícito na API Brevo.
- Confirmação de e-mail, recuperação de senha, OTP, contratos, boletos e confirmações financeiras usam o mesmo serviço de entrega.
- Remetentes `sistema`, `contratos`, `financeiro` e `atendimento` preservados.
- Em recuperação de senha, se o provedor não confirmar envio, o token recém-criado é invalidado para não deixar cooldown falso.
- Sem migration e sem alteração de schema/banco.

## Variáveis de produção

```env
BREVO_API_KEY=
BREVO_API_URL=https://api.brevo.com/v3/smtp/email
BREVO_API_TIMEOUT_MS=15000
EMAIL_SMTP_FALLBACK=true

SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_CONNECTION_TIMEOUT_MS=10000
SMTP_GREETING_TIMEOUT_MS=10000
SMTP_SOCKET_TIMEOUT_MS=15000
```

Nunca versionar chaves reais no repositório.
