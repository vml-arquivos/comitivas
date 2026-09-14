# DEPLOY — CORREÇÃO DA ESCOLHA DO CONTRATO

1. Faça backup do PostgreSQL e confirme o volume persistente de uploads.
2. Substitua os arquivos no clone preservando `.git`.
3. Execute:

```bash
git status
git diff --check
npm ci
npm run typecheck:server
npm test -- --run
npm run build
```

4. Commit/push:

```bash
git add .
git commit -m "fix: corrigir escolha do tipo de contratacao"
git push origin main
```

5. Faça redeploy do novo SHA no Coolify.

A migration `0022_corrige_escopo_comercial_pacotes.sql` roda no startup pelo mecanismo Drizzle existente. Ela não edita migrations antigas e não reescreve contratos assinados.

## Smoke test
- abrir um pacote pela vitrine e confirmar que nenhum tipo vem marcado;
- selecionar Transporte + hospedagem;
- escolher quarto com ar-condicionado;
- conferir R$ 3.200 no Barretos 2027 e o resumo `Transporte + hospedagem`;
- conferir condições de pagamento no resumo;
- continuar para checkout e confirmar o mesmo escopo;
- concluir dados/documento/OTP;
- validar que contrato e operação usam transporte + hospedagem;
- testar Somente hospedagem e Somente transporte apenas onde houver oferta/preço publicado;
- confirmar que pacote legado `livre` não é vendido silenciosamente como hospedagem.
