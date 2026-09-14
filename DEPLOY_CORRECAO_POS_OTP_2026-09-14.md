# Deploy — correção de avanço após OTP

## Base esperada

Antes de aplicar, confira que a `main` contém o commit:

`c7395e0037bff1ef4d0fe76d1db76ac550a1a0b2`

Se houver commit posterior, compare antes de substituir arquivos.

## Validação obrigatória antes do push

```bash
git status
git diff --check
npm ci
npm run typecheck:server
npm test -- --run
npm run build
```

## Commit sugerido

```bash
git add .
git commit -m "fix: avancar checkout apos validacao otp"
git push origin main
```

## Coolify

- repositório: `vml-arquivos/comitivas`
- branch: `main`
- confirmar o novo SHA
- preservar banco e volume de uploads
- não há migration nova nesta rodada
- executar `Deploy latest commit` / `Redeploy`

## Smoke test

1. abrir uma reserva nova;
2. preencher dados e enviar documento;
3. escolher boleto e parcelas;
4. preparar e ler o contrato;
5. marcar contrato e regras;
6. receber OTP por e-mail;
7. informar o OTP uma única vez;
8. confirmar que a tela sai do checkout automaticamente;
9. confirmar abertura de `/confirmacao/:reservaId`;
10. para boleto manual, confirmar estado `Boletos em preparação`;
11. atualizar a página de confirmação e verificar que o estado permanece;
12. abrir novamente `/checkout/:reservaId` e confirmar redirecionamento automático para a confirmação;
13. verificar contrato final em Minhas reservas;
14. não solicitar novo OTP para a mesma versão já validada.

## Rollback

Reverta apenas o commit desta correção e redeploye o SHA anterior. Não apague banco, uploads, contratos, OTPs, reservas ou pagamentos.
