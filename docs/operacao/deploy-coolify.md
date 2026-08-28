# Deploy no Coolify

O recurso existente deve continuar sendo usado, sem criar nova aplicação, banco, domínio ou volume. A origem, branch e configuração observadas no Coolify são a autoridade operacional. O release deve ser promovido somente após o commit chegar à branch de deploy e o Coolify concluir a imagem, migrations e healthcheck.

Checklist: registrar commit anterior, iniciar backup, conferir `ENABLE_TEST_ADMIN=false`, confirmar `DATABASE_URL`, `JWT_SECRET`, `OTP_PEPPER`, mTLS Cora, SMTP, storage persistente e webhook secret apenas por presença; acompanhar build/logs sem valores secretos; confirmar `/api/health` e readiness; abrir páginas públicas e executar smoke sem emissão real em produção.

O redeploy precisa ser validado pelo commit efetivamente publicado, não apenas pelo disparo do webhook. Em caso de erro de migration, health, contrato, pagamento ou smoke, interromper a promoção, manter a última versão saudável e seguir o runbook de rollback.
