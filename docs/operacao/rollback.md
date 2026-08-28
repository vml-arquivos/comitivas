# Rollback operacional

1. Interromper a promoção e manter o recurso atual saudável.
2. Identificar o commit, imagem/digest e migration que falharam.
3. Reimplantar o último commit saudável pelo histórico do próprio Coolify, sem `force push`, reset destrutivo ou exclusão de dados.
4. Não reverter migrations aplicadas automaticamente; corrigir com migration forward-only compatível ou seguir procedimento de restauração previamente ensaiado.
5. Preservar contratos, validações, pagamentos, webhooks, outbox e arquivos PDF criados durante a janela.
6. Confirmar `/api/health`, readiness, volume persistente, filas e logs redigidos.
7. Registrar causa, impacto, commit, horário UTC e decisão de nova tentativa.

O rollback de aplicação é preferível ao rollback destrutivo de banco. Nunca declarar sucesso sem smoke test pós-rollback.
