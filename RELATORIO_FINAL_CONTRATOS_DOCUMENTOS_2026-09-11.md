# Relatório final — contratos, cupom e validação documental

Data: 11/09/2026  
Base: `production-full` sobre o commit `d8d6a5db3d0d054c685b15821413ffd07ba6c3e4`.

## Resultado executivo

- Corrigida a falha real da confirmação OTP `value.toISOString is not a function`. O timestamp retornado pelo SQL com `FOR UPDATE` agora é convertido e validado antes da escrita pelo Drizzle.
- O cliente pode abrir ou baixar a minuta em PDF durante o checkout. Contratos assinados continuam imutáveis: arquivo final ausente não é regenerado silenciosamente.
- O contrato passou a registrar no conteúdo individual o evento, destino, período, datas, pacote, valor final, forma de pagamento, parcelas e reserva congelados no snapshot da contratação.
- O cupom aplicado é preservado ao passar por cadastro/login e é exibido a partir do valor efetivamente persistido e recalculado pelo backend.
- Adicionada leitura real de documento de identificação em PDF ou imagem. Nome, CPF e nascimento são comparados com o cadastro, e a presença de foto/legibilidade é conferida. Resultado duvidoso nunca é aprovado silenciosamente: segue para análise manual.
- RG, CNH, passaporte e outros documentos oficiais com foto são aceitos. Uploads são privados, limitados a 12 MB, verificados por assinatura do arquivo, protegidos contra duplicação por SHA-256 e servidos somente mediante autorização.

## Configuração de produção

Variáveis novas documentadas em `.env.example`:

```env
DOCUMENT_AI_PROVIDER=gemini
DOCUMENT_IDENTITY_REQUIRED_FOR_CONTRACT=true
GEMINI_API_KEY=
GEMINI_DOCUMENT_MODEL=gemini-2.5-flash
DOCUMENT_AI_TIMEOUT_MS=30000
DOCUMENT_AI_MIN_CONFIDENCE=0.85
```

A chave deve ser cadastrada como segredo no Coolify e nunca enviada ao frontend ou versionada. Sem provedor configurado, o documento é preservado e marcado para análise manual. Para ativar o bloqueio contratual, usar exatamente `DOCUMENT_IDENTITY_REQUIRED_FOR_CONTRACT=true`.

## Migration

`drizzle/0015_validacao_documental_identidade.sql` é forward-only e não destrutiva. Ela adiciona metadados de validação a `cliente_documentos`, constraints e índice, sem remover ou modificar documentos históricos.

As migrations são executadas automaticamente na inicialização da aplicação por `initializeDatabase()`. O deploy precisa manter a pasta `drizzle` no contêiner e acesso exclusivo/estável ao PostgreSQL durante o startup.

## Arquivos centrais desta correção

- `.env.example`
- `drizzle/0015_validacao_documental_identidade.sql`
- `drizzle/meta/_journal.json`
- `server/db/schema.ts`
- `server/services/identityDocumentService.ts`
- `server/services/otpService.ts`
- `server/services/contratoService.ts`
- `server/routes/cliente.ts`
- `server/routes/admin.ts`
- `server/routes/contratos.ts`
- `server/index.ts`
- `packages/contract-engine/contratoModeloPadrao.ts`
- `apps/web/src/pages/cliente/Checkout.tsx`
- `apps/web/src/pages/cliente/MinhaConta.tsx`
- `apps/web/src/pages/admin/ClienteFicha.tsx`
- `tests/identityDocumentService.spec.ts`
- `tests/checkoutCupomContrato.spec.ts`
- `tests/contratoHtml.spec.ts`

Este conjunto integra-se às alterações operacionais anteriores do mesmo pacote (ônibus, quartos, solicitações, cupom, PWA, autenticação e interface), preservadas no ZIP completo.

## Validações executadas

- `npm test -- --run`: 17 arquivos e 88 testes aprovados.
- `npm run lint`: aprovado.
- `npm run typecheck:server`: aprovado.
- `npx tsc --noEmit -p apps/web/tsconfig.json`: aprovado.
- `npm run build`: aprovado (`build:server`, `build:seed`, `build:web`).
- `npm run test:a11y`: verificação estática aprovada.
- `npm test -- --run tests/mobileViewport.spec.ts`: 3 testes aprovados.
- `git diff --check`: aprovado.

## Validação manual após o redeploy

1. Configurar as variáveis acima no Coolify e redeployar.
2. Confirmar no log de startup a aplicação da migration `0015`.
3. Entrar como cliente e enviar uma imagem nítida/PDF de documento em **Minha Conta > Documentos**.
4. Conferir o resultado; em caso de dúvida, decidir manualmente pela Ficha 360.
5. Abrir a mesma reserva no checkout e confirmar que **Abrir minuta** e **Baixar minuta** funcionam.
6. Solicitar OTP, confirmar o código e baixar o contrato final.
7. Aplicar um cupom antes do login, retomar a compra e conferir código/desconto no checkout e contrato.

## Limites reais

- O ambiente de desenvolvimento não recebeu `DATABASE_URL` de produção nem `GEMINI_API_KEY`; por segurança, não foram feitas chamadas ao banco real ou ao provedor. A integração foi validada por tipos, build e testes automatizados.
- A leitura compara os dados visíveis e a presença de foto. Ela não substitui consulta governamental, prova de autenticidade, biometria ou prova de vida.
- A validação visual final com dados reais deve ser executada após a migration no ambiente publicado.

## Commit sugerido

`fix: estabilizar OTP, contratos, cupons e validação documental`
