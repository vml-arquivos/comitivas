# Correção de build — Coolify — 2026-09-08

Base: `main@620abfdf9b6cb9dcce161a9c011af871b5193c55` (`VALIDACAO_FINAL_AREA_CLIENTE`).

Falhas observadas no build de produção:

1. `String.prototype.replaceAll` incompatível com o target/lib TypeScript atual em `MinhaConta.tsx`.
2. `ReceiptText` não exportado pela versão instalada de `lucide-react`.
3. `TicketCheck` não exportado pela versão instalada de `lucide-react`.

Correções aplicadas:

- `replaceAll('_', ' ')` substituído por `split('_').join(' ')`, preservando o mesmo resultado sem exigir ES2021.
- `ReceiptText` e `TicketCheck` removidos dos imports e substituídos por `FileText`, já disponível e utilizado no projeto.
- Nenhuma migration, alteração de banco, rota, regra financeira, contrato, autenticação ou gateway foi modificada nesta correção.

Validações locais executadas:

- varredura do código: nenhuma ocorrência restante de `replaceAll`, `ReceiptText` ou `TicketCheck`;
- parser TypeScript/TSX dos dois arquivos alterados: 0 erros sintáticos;
- base dos arquivos afetados conferida por Git blob hash contra o commit remoto `620abfdf...` antes da correção.

O build integral depende das dependências npm do ambiente. O Coolify deve executar `npm ci` e `npm run build`; esta entrega corrige exatamente os três erros reportados pelo TypeScript no deploy.
