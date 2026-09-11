# Relatório final — operação, hospedagem, pós-venda e PWA

Data da validação: 10/09/2026

## Base utilizada

- Repositório oficial: `vml-arquivos/comitivas`.
- Branch: `main`.
- HEAD utilizado: `d8d6a5db3d0d054c685b15821413ffd07ba6c3e4`.
- ZIP comparado: `comitivas-main (11).zip`, commit `b8946ce70ec49c149247a90b092ac7854827071b`.
- O ZIP era ancestral do HEAD da `main`; por isso a continuidade foi feita sobre o HEAD mais novo, preservando as alterações posteriores.

## Entrega executiva

Esta entrega mantém a arquitetura existente e acrescenta, de forma integrada:

- fila sequencial de ônibus: vários veículos podem ser cadastrados, mas somente o primeiro com lugar livre fica disponível para novas vendas;
- atribuição automática da primeira poltrona elegível ao criar a reserva, sem impedir a venda caso o mapa operacional ainda não esteja configurado;
- remanejamento, liberação, bloqueio e histórico de poltronas;
- mapa de hospedagem por viagem/pacote, capacidade, quartos masculinos e femininos, ocupantes e remanejamentos;
- solicitações de cancelamento, troca de pacote e reinício com motivo, análise manual, parecer e controle de estorno;
- reabertura idempotente da vaga comercial após cancelamento concluído, inclusive quando o inventário já havia sido convertido;
- edição e prorrogação de cupons, mantendo desativação segura quando existe histórico;
- CTA de instalação PWA na primeira dobra, diálogo nativo direto no Android quando o navegador o disponibiliza e instrução contextual no iPhone;
- integração de ônibus/quartos/solicitações ao dashboard, área do cliente, vendas internas, menu e novos contratos gerados;
- preservação integral de contratos validados, pagamentos, histórico e auditoria.

## Regras implementadas

### Ônibus e poltronas

1. Cada ônibus recebe `venda_ordem` dentro da saída.
2. O primeiro ônibus ativo com lugar realmente livre fica `em_venda`.
3. Os posteriores ficam `aguardando` até o anterior esgotar.
4. Lugares ocupados, bloqueados ou em reserva temporária não contam como livres.
5. O backend repete a validação dentro de transação com advisory locks; manipulação do frontend não libera ônibus futuro.
6. O remanejamento administrativo pode mover o passageiro para outra poltrona da mesma saída, mantendo a alocação anterior como `movida` no histórico.

### Hospedagem

- Quartos pertencem a um lote e podem ser gerais ou exclusivos de um pacote.
- Cada quarto possui grupo `masculino` ou `feminino` e capacidade de 1 a 30 vagas.
- Uma reserva só pode possuir uma alocação ativa; uma vaga física só pode possuir um ocupante ativo.
- A capacidade não pode ser reduzida abaixo da ocupação atual.
- Remanejamento e liberação não apagam a alocação anterior.
- O quarto só pode ser arquivado depois de liberar/remanejar os hóspedes.
- Novos contratos passam a registrar a hospedagem operacional vigente; versões assinadas antigas não mudam.

### Cancelamento e alteração de pacote

- O cliente, vendedor responsável, ADMIN ou DEV pode abrir uma solicitação dentro do próprio escopo.
- A troca exige a escolha de outro pacote ativo da mesma viagem.
- Solicitações iguais abertas não podem ser duplicadas.
- Somente ADMIN/DEV pode analisar, aprovar, rejeitar e concluir.
- Cancelamento pago não pode ser concluído enquanto o resultado do estorno não estiver registrado.
- A conclusão cancela apenas as alocações ativas e invalida somente contratos ainda não validados; documentos assinados e pagamentos permanecem acessíveis.
- Liberação de inventário e conclusão são feitas na mesma transação e podem ser repetidas com segurança sem devolver a vaga duas vezes.

### Cupons

- Cupom existente pode ser editado, reativado, prorrogado e ter desconto, campanha, limites e vínculos atualizados.
- A remoção comum desativa o cupom para preservar utilizações e relatórios já existentes.

### PWA

- O evento `beforeinstallprompt` é capturado no bootstrap, antes da montagem das páginas.
- No Android/Chrome compatível, o clique no CTA abre diretamente a confirmação nativa de instalação.
- No iPhone, o sistema detecta o aparelho e leva diretamente às instruções do Safari para `Compartilhar` → `Adicionar à Tela de Início`.
- O modo instalado recebe contenção horizontal e viewport próprio para evitar deslocamento lateral.

## Banco e migrations

### `0013_operacao_onibus_equipe.sql`

Mantém a operação de saídas, ônibus, poltronas, embarque, equipe e segurança criada na etapa anterior.

### `0014_fila_onibus_quartos_solicitacoes.sql`

- adiciona `venda_ordem` aos ônibus e faz backfill determinístico;
- cria `quartos_hospedagem` e `quarto_alocacoes`;
- cria `reserva_solicitacoes`;
- cria índices parciais para impedir duplicidade de ordem, vaga, reserva e solicitação aberta;
- é forward-only e aditiva: não contém `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` ou exclusão em massa.

As migrations executam automaticamente no startup normal: `server/index.ts` chama `initializeDatabase()`, que chama o migrador Drizzle antes de abrir a porta HTTP. Em Coolify, não é necessário executar manualmente se o start permanecer `npm start`/`node dist/index.js` e a pasta `drizzle` estiver na imagem. Faça backup verificável do PostgreSQL antes do redeploy.

## Arquivos centrais desta atualização

- `drizzle/0014_fila_onibus_quartos_solicitacoes.sql`
- `drizzle/meta/_journal.json`
- `server/db/schema.ts`
- `server/index.ts`
- `server/routes/admin.ts`
- `server/routes/cliente.ts`
- `server/routes/hospedagem.ts`
- `server/routes/operacao.ts`
- `server/routes/solicitacoes.ts`
- `server/routes/cupons.ts`
- `server/routes/pacotes.ts`
- `server/services/hospedagemService.ts`
- `server/services/operacaoOnibusService.ts`
- `server/services/reservaSolicitacaoService.ts`
- `server/services/inventoryService.ts`
- `server/services/contratoService.ts`
- `packages/contract-engine/contratoModeloPadrao.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/layouts/AdminLayout.tsx`
- `apps/web/src/layouts/MainLayout.tsx`
- `apps/web/src/main.tsx`
- `apps/web/src/components/PwaInstallButton.tsx`
- `apps/web/src/pages/admin/Dashboard.tsx`
- `apps/web/src/pages/admin/HospedagemQuartos.tsx`
- `apps/web/src/pages/admin/OperacaoOnibus.tsx`
- `apps/web/src/pages/admin/Solicitacoes.tsx`
- `apps/web/src/pages/admin/Vendas.tsx`
- `apps/web/src/pages/admin/Cupons.tsx`
- `apps/web/src/pages/cliente/MinhaConta.tsx`
- `apps/web/src/pages/publico/Aplicativo.tsx`
- `apps/web/src/pages/publico/Legal.tsx`
- `apps/web/src/utils/pwaInstall.ts`
- `tests/hospedagemSolicitacoesPwa.spec.ts`
- `tests/operacaoOnibus.spec.ts`

As demais alterações visuais, de autenticação, exclusão segura, upload de fotos, checkout, contratos e painéis estão descritas em `RELATORIO_FINAL_CONTINUIDADE_2026-09-09.md` e foram preservadas nesta base.

## Validações executadas

- `npm test -- --run`: aprovado — 14 arquivos, 72 testes.
- `npm run lint`: aprovado.
- `npm run typecheck:server`: aprovado.
- `npm run build`: aprovado (`build:server`, `build:seed`, `build:web`).
- `npm --prefix apps/mobile run build`: aprovado.
- `npm run test:a11y`: aprovado para os marcadores estáticos do shell publicado.
- `git diff --check`: aprovado.
- `npm run test:integration`: bloqueado de forma explícita porque este ambiente não recebeu `DATABASE_URL`; nenhum banco ou serviço de produção foi simulado.

## Validação manual após o redeploy

1. Confirmar no log que migrations `0013` e `0014` foram aplicadas antes do healthcheck.
2. Criar uma saída com dois ônibus; preencher o primeiro e confirmar que o segundo muda de `Aguardando` para `Em venda`.
3. Mover um passageiro entre poltronas e conferir manifesto, reserva, contrato novo e histórico.
4. Criar quartos masculino/feminino, alocar hóspedes, remanejar e confirmar limites de capacidade.
5. Solicitar cancelamento com motivo, aprovar, registrar estorno e concluir; conferir vaga reaberta uma única vez.
6. Solicitar troca de pacote pelo cliente e por vendas internas; conferir pacote de destino na fila administrativa.
7. Editar/prorrogar um cupom e repetir cálculo no checkout.
8. No Android, clicar no CTA da primeira dobra e confirmar o diálogo nativo de instalação.
9. No iPhone/Safari, seguir a instrução contextual e confirmar abertura em modo aplicativo sem rolagem lateral.
10. Gerar novo contrato depois da alocação de ônibus/quarto e conferir PDF; abrir um contrato validado antigo e confirmar que permaneceu imutável.

## Limitações reais

- Não houve acesso ao PostgreSQL de produção; a migration e os fluxos transacionais devem receber o teste integrado final em homologação após o redeploy.
- O iOS não oferece ao site uma API equivalente ao prompt nativo de instalação do Android. O passo de confirmação no menu do Safari continua obrigatório por regra da plataforma.
- Se ainda não houver saída/ônibus configurado para o lote, a reserva comercial é preservada e a poltrona fica pendente para atribuição no mapa, evitando perda da venda.
- A separação masculino/feminino é operacional e administrada pela equipe; nenhum novo dado sensível de gênero foi tornado obrigatório no cadastro mínimo.
- Alterações de pacote são deliberadamente concluídas com análise humana. Diferenças financeiras, novo aceite contratual e eventual estorno devem ser formalizados antes do encerramento.

## Commit sugerido

`feat: integrar fila de ônibus, hospedagem e pós-venda auditável`

## Pacote final

- Nome: `comitivas-producao-final-operacao-2026-09-10.zip`.
- Conteúdo: projeto completo sem `.git`, `node_modules`, builds `dist`, uploads, `.env` real, chaves ou tokens.
- SHA-256: fornecido junto ao ZIP no fechamento da entrega.
