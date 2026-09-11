# Backup e restore antes do deploy

Antes da promoção, executar backup lógico do PostgreSQL com retenção protegida, validar checksum e restaurar em ambiente isolado. Fazer também cópia do volume `STORAGE_PATH`/`uploads`, incluindo contratos PDF, certificados e mídia, e confirmar que o volume no Coolify é persistente.

O ensaio deve registrar data UTC, origem redigida, duração, tamanho, checksum, versão do schema, resultado da restauração, contagem de tabelas críticas e verificação de leitura do contrato/PDF. O rollback de aplicação não deve apagar contratos ou pagamentos novos; restauração de banco é procedimento excepcional e requer decisão operacional.

No ambiente local desta execução não havia `DATABASE_URL`; por isso não foi alegado backup ou restore real. O bloqueio deve ser resolvido no ambiente autorizado antes da promoção final.
