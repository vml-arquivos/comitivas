# E-mail automático de produção

O backend envia e-mails transacionais pela Brevo via Nodemailer. O recebimento das respostas é roteado pela Cloudflare Email Routing para a caixa central verificada.

## Variáveis SMTP

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=SEU_LOGIN_SMTP_BREVO
SMTP_PASS=SUA_CHAVE_SMTP_BREVO
SMTP_FROM=Excursão das Comitivas <sistema@excursaodascomitivas.com.br>
```

`SMTP_FROM` permanece como fallback para compatibilidade.

## Remetentes por finalidade

```env
EMAIL_FROM_SYSTEM=Excursão das Comitivas <sistema@excursaodascomitivas.com.br>
EMAIL_FROM_SUPPORT=Excursão das Comitivas | Atendimento <atendimento@excursaodascomitivas.com.br>
EMAIL_FROM_CONTRACTS=Excursão das Comitivas | Contratos <contratos@excursaodascomitivas.com.br>
EMAIL_FROM_FINANCE=Excursão das Comitivas | Financeiro <financeiro@excursaodascomitivas.com.br>
EMAIL_REPLY_TO=atendimento@excursaodascomitivas.com.br
```

Todos os remetentes precisam existir e estar verificados na Brevo. O `EMAIL_REPLY_TO` é aplicado por padrão para que respostas de clientes cheguem ao atendimento, mesmo quando o e-mail saiu de contratos ou financeiro.

## Mapeamento automático

- confirmação de cadastro e redefinição de senha → `EMAIL_FROM_SYSTEM`;
- OTP de validação do contrato → `EMAIL_FROM_CONTRACTS`;
- contrato validado e reenvio de contrato → `EMAIL_FROM_CONTRACTS`;
- boleto manual e confirmação de pagamento → `EMAIL_FROM_FINANCE`;
- follow-ups automáticos → `EMAIL_FROM_SYSTEM`;
- atendimento humano/futuras mensagens de suporte → `EMAIL_FROM_SUPPORT`;
- mensagens antigas ou sem categoria → `SMTP_FROM`.

## Fluxos automáticos existentes

- confirmação de e-mail de cadastro;
- redefinição de senha;
- OTP de 6 dígitos para validação eletrônica do contrato;
- registro de envio, message id e horário do OTP;
- e-mail pós-validação do contrato enfileirado na outbox transacional;
- processamento da outbox pelo scheduler configurado por `FOLLOWUP_CHECK_INTERVAL_MINUTOS`;
- follow-ups de jornada;
- envio de boleto manual com PDF anexado;
- confirmação de pagamento após quitação do boleto manual;
- reenvio de contrato.

## Recebimento via Cloudflare

As regras de Email Routing devem manter ativos:

- `sistema@excursaodascomitivas.com.br` → Gmail central verificado;
- `atendimento@excursaodascomitivas.com.br` → Gmail central verificado;
- `contratos@excursaodascomitivas.com.br` → Gmail central verificado;
- `financeiro@excursaodascomitivas.com.br` → Gmail central verificado.

## Homologação

Validar nesta ordem: cadastro → código de e-mail → redefinição de senha → reserva → contrato → OTP → validação → e-mail pós-validação → aprovação administrativa → boleto PDF → envio → resposta do cliente → baixa → confirmação de pagamento.
