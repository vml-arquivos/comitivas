# DEPLOY — Integridade contratação / transporte / hospedagem

## Base esperada

Antes da substituição, confirme que a `main` contém o commit:

`98b9247f7677394c734cf7488254a1efca3444f1`

Se houver commit posterior, compare antes de sobrescrever.

## Aplicação

Descompacte o ZIP completo por cima do clone local, preservando `.git`.

Depois execute:

```bash
git status
git diff --check
npm ci
npm run typecheck:server
npm test -- --run
npm run build
```

Somente com os comandos aprovados:

```bash
git add .
git commit -m "fix: garantir integridade entre contrato e vagas operacionais"
git push origin main
```

No Coolify, faça **Deploy latest commit / Redeploy** e confirme o SHA novo.

## Smoke test obrigatório

1. cadastrar uma compra `Transporte + hospedagem`;
2. confirmar que a reserva mostra transporte e hospedagem;
3. antes do OTP, conferir no mapa operacional uma poltrona ativa e a hospedagem ativa para cada viajante;
4. validar o contrato por OTP;
5. confirmar que o hold ficou convertido e que a contratação avançou normalmente;
6. confirmar que a poltrona continua ocupada após 30 minutos;
7. testar boleto manual e confirmar que o financeiro não remove os recursos;
8. tentar liberar manualmente uma poltrona de contrato assinado: deve bloquear e orientar remanejamento/cancelamento;
9. usar Mover para trocar a poltrona: a quantidade de vagas ativas deve permanecer igual à quantidade de viajantes;
10. repetir com 2 ou mais viajantes e confirmar 1 poltrona + 1 vaga de hospedagem por pessoa.

## Rollback

Se algum teste crítico falhar, reverta somente o commit novo e redeploye o SHA anterior. Não apague banco, contratos, pagamentos, uploads ou inventário manualmente.
