# Relatório final — quartos em lote e identificação nos mapas

Data: 11/09/2026  
Base Git: `d8d6a5db3d0d054c685b15821413ffd07ba6c3e4`

## Resultado entregue

- Cadastro automático de vários quartos em uma única operação.
- Título comum para identificação do grupo, com numeração individual e ID próprio para cada quarto.
- Linhas configuráveis com quantidade de quartos, vagas por quarto, gênero e estrutura (ar-condicionado, ventilador, sem climatização ou outro).
- Botão **Incluir mais** para combinar, no mesmo cadastro, quartos de capacidades e características diferentes.
- Limites e validações aplicados também no backend.
- Proteção idempotente contra duplicação em reenvio, atualização da página ou clique repetido.
- Quartos continuam editáveis, removíveis e aptos a alocação, liberação e remanejamento individual.
- Mapa de quartos com todas as vagas, numeração e iniciais dos ocupantes.
- Nome completo por foco/hover no desktop e por toque/clique no celular, com detalhes e ações autorizadas.
- Mapa de ônibus atualizado com iniciais, nome por hover/foco e identificação persistente após toque/clique.
- Regras existentes de autorização administrativa e histórico operacional preservadas.

## Arquivos alterados nesta etapa

- `apps/web/src/pages/admin/HospedagemQuartos.tsx`
- `apps/web/src/pages/admin/OperacaoOnibus.tsx`
- `apps/web/src/utils/nome.ts`
- `server/routes/hospedagem.ts`
- `server/services/hospedagemService.ts`
- `tests/hospedagemLoteVisual.spec.ts`

## Banco e migrations

Nenhuma migration nova foi criada nesta etapa. O cadastro em lote grava registros individuais nas estruturas já existentes e registra a operação no histórico atual. As migrations existentes continuam sendo executadas automaticamente na inicialização do servidor antes da abertura da aplicação.

## Validações executadas

- Testes: **15 arquivos / 76 testes aprovados**.
- Lint: aprovado.
- TypeScript do servidor: aprovado.
- Build completo (`build:server`, `build:seed`, `build:web`): aprovado.
- Build mobile: aprovado.
- Verificação estática de acessibilidade: aprovada.
- `git diff --check`: aprovado.

## Limitação de ambiente

Não foi possível executar testes integrados contra um banco real porque o ambiente de trabalho não possui `DATABASE_URL`. A compilação, os testes unitários/de regressão e as validações estáticas foram concluídos. Após o redeploy, validar a criação de um lote de quartos e um remanejamento com dados de homologação/produção.

## Validação manual recomendada após o redeploy

1. Abrir **Hospedagem > Quartos e hóspedes** e selecionar viagem/período.
2. Clicar em **Cadastrar quartos**.
3. Criar duas linhas, por exemplo: 3 quartos femininos de 4 vagas com ar-condicionado e 2 quartos masculinos de 2 vagas com ventilador.
4. Confirmar que foram criados cinco quartos independentes, com nomes sequenciais e IDs distintos.
5. Alocar e remanejar um hóspede; conferir iniciais e nome por hover/toque.
6. Abrir **Transporte e lugares** e conferir iniciais e nome do passageiro nas poltronas ocupadas.
7. Repetir o envio da mesma requisição e confirmar que não há quartos duplicados.

## Commit sugerido

`feat: automatizar cadastro de quartos e identificar ocupantes nos mapas`
