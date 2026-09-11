# Atualização — remetentes automáticos por finalidade

Base: `main@c671f7d7804f99adbf73eaa4489ce70289a354c5`.

Implementado:

- configuração centralizada de remetentes por finalidade;
- `sistema@` para cadastro, senha e follow-ups;
- `contratos@` para OTP, contrato validado e reenvio;
- `financeiro@` para boletos e confirmações de pagamento;
- `atendimento@` como `Reply-To` padrão;
- fallback compatível com `SMTP_FROM`;
- outbox transacional preservando o remetente da mensagem;
- reenvio administrativo inferindo a categoria do e-mail histórico;
- `.env.example` e documentação operacional atualizados.

Não há migration de banco nesta atualização.
