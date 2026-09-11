# Brevo API no DigitalOcean

## Motivo

No ambiente de produção foi confirmado timeout na porta 587 e conectividade na porta 2525. Para evitar dependência de SMTP e travamentos, o transporte principal passa a ser a API HTTPS da Brevo (porta 443).

## Configuração recomendada

Use a API HTTPS da Brevo como transporte principal:

```env
BREVO_API_KEY=CHAVE_API_REAL_DA_BREVO
BREVO_API_URL=https://api.brevo.com/v3/smtp/email
BREVO_API_TIMEOUT_MS=15000
EMAIL_SMTP_FALLBACK=true
```

O sistema usa a API HTTPS como transporte principal. Se `EMAIL_SMTP_FALLBACK=true`, usa SMTP na porta 2525 como fallback com timeouts explícitos; a aplicação não fica mais presa indefinidamente em uma conexão SMTP.

## Remetentes

- sistema: `sistema@excursaodascomitivas.com.br`
- contratos: `contratos@excursaodascomitivas.com.br`
- financeiro: `financeiro@excursaodascomitivas.com.br`
- atendimento/reply-to: `atendimento@excursaodascomitivas.com.br`

## Teste

1. Solicite redefinição de senha no site.
2. A chamada `/api/auth/esqueci-senha` deve retornar rapidamente.
3. Em Brevo > Transacional > Logs deve aparecer o assunto `Redefinição de senha — Excursão das Comitivas`.
4. O link recebido deve abrir `/redefinir-senha?token=...`.


## Fallback SMTP de produção

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_CONNECTION_TIMEOUT_MS=10000
SMTP_GREETING_TIMEOUT_MS=10000
SMTP_SOCKET_TIMEOUT_MS=15000
```
