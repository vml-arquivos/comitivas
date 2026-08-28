# Auditoria dos nomes de variáveis no Coolify — 28/08/2026

A aplicação de produção possui as variáveis necessárias para o bootstrap básico e para o fluxo atual: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`, `PORT`, `WEB_URL`, `API_URL`, `MOBILE_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `STORAGE_TYPE`, `STORAGE_PATH`, `FOLLOWUP_CHECK_INTERVAL_MINUTOS`, `LOG_LEVEL` e `OTP_PEPPER`.

A auditoria foi limitada aos nomes. Nenhum valor secreto foi persistido ou incluído neste documento.

Ponto operacional: a aplicação já tinha 12 alterações de configuração não aplicadas no Coolify. O deploy só deve ocorrer depois que a branch com o código, a migration 0008 e a configuração de runtime forem conferidas.
