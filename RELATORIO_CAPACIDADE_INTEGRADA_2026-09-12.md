# Entrega — capacidade integrada de transporte, hospedagem e contrato

Data: 12/09/2026

## Base utilizada

- Arquivo recebido: `comitivas-main (15).zip`.
- Commit informado no ZIP: `1c77120b7c3f04de2d9f1fce34140923366ee122`.
- HEAD da `main` verificado: `1c77120b7c3f04de2d9f1fce34140923366ee122`.
- Decisão: ZIP 15 e `main` estavam na mesma revisão; a implementação foi feita sobre o ZIP 15.

## Regras implementadas

- Camping ocupa somente uma vaga de transporte e gera contrato sem hospedagem.
- Hospedagem em quarto ocupa somente a estrutura e o grupo contratados quando o pacote é `hospedagem`.
- Transporte com hospedagem ocupa, atomicamente, uma poltrona e uma vaga de quarto compatível.
- A reserva inteira é revertida se qualquer recurso necessário estiver esgotado.
- Ônibus são preenchidos na ordem de venda; o próximo começa a receber passageiros quando o anterior não possui lugar disponível.
- Quarto é selecionado pelo período, pacote, estrutura (`ventilador` ou `ar_condicionado`) e grupo (`masculino` ou `feminino`).
- A disponibilidade pública considera simultaneamente o limite do lote e os recursos físicos exigidos.
- Expiração ou liberação do checkout devolve lote, poltrona e quarto na mesma operação.
- Capacidades podem aumentar ou diminuir, mas nunca abaixo de vagas ocupadas ou bloqueadas.
- Quartos ocupados não podem trocar grupo, estrutura ou pacote sem remanejamento prévio.
- Contratos usam o registro autoritativo do backend para recursos, datas, valor, ônibus, poltrona, quarto e adicionais.
- Dados enviados pelo navegador não podem acrescentar serviço, transporte ou hospedagem não contratados.

## Migration

- `drizzle/0017_capacidade_contratacao.sql`.
- Somente alterações aditivas, índices e preenchimento compatível da estrutura de quartos antigos.
- Não contém `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` ou exclusão de dados.
- A aplicação executa as migrations automaticamente no início do deploy, antes de abrir o servidor HTTP.

## Arquivos alterados

- `apps/web/src/pages/admin/HospedagemQuartos.tsx`
- `apps/web/src/pages/admin/OperacaoOnibus.tsx`
- `apps/web/src/pages/cliente/ConfiguradorPacote.tsx`
- `apps/web/src/utils/checkoutIntent.ts`
- `drizzle/0017_capacidade_contratacao.sql`
- `drizzle/meta/_journal.json`
- `packages/contract-engine/contratoModeloPadrao.ts`
- `server/db/schema.ts`
- `server/routes/lotes.ts`
- `server/routes/operacao.ts`
- `server/routes/pacotes.ts`
- `server/services/contratacaoRecursos.ts`
- `server/services/contratoService.ts`
- `server/services/hospedagemService.ts`
- `server/services/inventoryService.ts`
- `server/services/operacaoOnibusService.ts`
- `server/services/pacoteService.ts`
- `tests/capacidadeContratacao.spec.ts`
- `tests/contratoHtml.spec.ts`

## Validação executada

- Linha de base: 18 arquivos e 94 testes aprovados; lint, typecheck e build aprovados.
- Resultado final: 19 arquivos e 99 testes aprovados.
- `npm run typecheck:server`: aprovado.
- `npm run lint`: aprovado.
- `npm run build`: aprovado (`build:server`, `build:seed` e `build:web`).
- `npm run test:a11y`: aprovado na verificação estática.
- `git diff --check`: sem erros de espaço ou conflito.

## Limitação de ambiente

O teste de integração contra PostgreSQL real não foi executado porque este ambiente não recebeu `DATABASE_URL`. O projeto não simulou banco nem aplicou migrations em produção. O deploy executará a migration automaticamente; ainda assim, faça o backup operacional habitual do PostgreSQL antes do redeploy e valide a matriz abaixo em homologação ou produção controlada.

## Validação manual recomendada após o redeploy

1. Criar dois ônibus em ordem de venda e confirmar que o segundo só recebe passageiro após o primeiro ficar sem lugar disponível.
2. Criar quartos masculinos e femininos, com ventilador e ar-condicionado.
3. Comprar camping e confirmar apenas poltrona/contrato de transporte.
4. Comprar somente hospedagem e confirmar apenas quarto/contrato de hospedagem.
5. Comprar transporte com hospedagem e confirmar poltrona e quarto na mesma reserva.
6. Tentar comprar com grupo ou estrutura esgotados e confirmar bloqueio sem consumo parcial de vaga.
7. Expirar/cancelar um checkout e confirmar a devolução dos três contadores aplicáveis.
8. Tentar reduzir ônibus, quarto e lote abaixo da ocupação e confirmar o bloqueio.
9. Gerar, visualizar e baixar o PDF de cada modalidade e conferir datas, valor e recursos.

## Commit sugerido

`feat: integrar capacidade de ônibus e quartos à reserva e ao contrato`
