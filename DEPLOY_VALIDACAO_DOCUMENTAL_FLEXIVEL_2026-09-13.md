# DEPLOY — VALIDAÇÃO DOCUMENTAL FLEXÍVEL

## 1. Substituir o conteúdo do repositório

Use o ZIP completo entregue e preserve a pasta `.git` do clone existente (não copie uma `.git` de outro lugar).

## 2. Conferir alterações

```bash
git status
git diff --check
git diff --stat
```

## 3. Validar dependências, tipos, testes e build

```bash
npm ci
npm run typecheck:server
npm test -- --run
npm run build
```

Se o ambiente de homologação estiver completo, execute também:

```bash
bash VALIDAR_ANTES_DO_DEPLOY.sh
```

## 4. Commit e push

```bash
git add .
git status
git commit -m "fix: flexibilizar validacao documental no checkout"
git push origin main
```

## 5. Coolify

No serviço de produção, confirme `main`, o novo SHA e o volume persistente de uploads. Para o comportamento flexível, os valores recomendados são:

```env
DOCUMENT_VALIDATION_BLOCK_CONTRACT=false
CONTRACT_REQUIRES_CADASTRO_APPROVAL=false
DOCUMENT_VALIDATION_MODE=assistido
```

`DOCUMENT_IDENTITY_REQUIRED_FOR_CONTRACT` pode permanecer como indicação operacional de upload; ele não é mais o gate que bloqueia contrato. Para refletir a política atual também no estado retornado ao frontend, recomenda-se `false`.

Salve as variáveis e execute o redeploy do último commit.

## 6. Smoke test obrigatório

1. cadastro com dados essenciais completos;
2. e-mail confirmado;
3. checkout abre normalmente;
4. opção **Tirar foto** abre a câmera no celular;
5. opção **Escolher arquivo** aceita PDF/JPG/JPEG/PNG/WEBP;
6. após enviar, resposta é imediata e a análise fica em segundo plano;
7. cliente consegue abrir o contrato sem esperar OCR/aprovação administrativa;
8. OTP por e-mail funciona;
9. OTP por WhatsApp funciona quando o canal estiver configurado;
10. assinatura conclui;
11. tentativa de cobrança antes de aprovação administrativa continua bloqueada;
12. após aprovação administrativa do cadastro e contrato, fluxo financeiro segue pelas regras existentes.

## 7. Rollback

Se houver problema no smoke test, reverta o commit novo e redeploye o commit anterior. Não apague banco, uploads, contratos ou pagamentos.
