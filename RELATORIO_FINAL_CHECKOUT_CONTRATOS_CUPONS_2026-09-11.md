# Relatório final — checkout, cupons, contratos e operação

Data da validação: 11/09/2026

## Base utilizada

- Repositório oficial: `vml-arquivos/comitivas`.
- Branch de referência: `main`.
- HEAD utilizado: `d8d6a5db3d0d054c685b15821413ffd07ba6c3e4`.
- O trabalho foi mantido sobre a base mais nova já comparada com o ZIP recebido, sem substituir correções posteriores por código antigo.

## Correções desta conclusão

### Checkout e cupom

- Corrigida a exceção `value.toISOString is not a function`: datas vindas do PostgreSQL agora são normalizadas antes da serialização, aceitando `Date` ou texto válido.
- A intenção de compra passa a guardar também o código do cupom antes do login.
- Ao retornar do login, pacote, adicionais e cupom são restaurados e reenviados ao backend.
- O backend continua recalculando o cupom e o valor da reserva; o navegador não define o desconto.
- Código e desconto persistidos passam a aparecer no resumo do checkout.
- O valor da composição, desconto do cupom, desconto PIX, taxas, juros, total e parcelas usam a mesma reserva/simulação autoritativa.
- Mensagens de cupom inválido, expirado ou incompatível são devolvidas como erro de regra compreensível, sem stack trace.
- O token seguro da origem comercial também sobrevive ao login, preservando a atribuição do vendedor.

### Reserva e contrato

- A resposta da reserva agora inclui nome do evento, local, nome do período e datas de início/fim; isso elimina os fallbacks `Não informado` vistos no print.
- Datas do certificado de assinatura aceitam valores do banco em formato `Date` ou string.
- A pré-visualização continua usando a versão contratual persistida e autenticada.
- O PDF é criado somente após a validação OTP, armazenado, associado à versão e protegido por SHA-256.
- Download e visualização respeitam o proprietário da reserva ou perfil administrativo autorizado.
- Contrato invalidado não é aberto; contrato validado não é regenerado silenciosamente.
- O Docker de produção contém Chromium do sistema e a configuração usada pelo gerador PDF.

### Quartos e mapas

- Cadastro em lote permite várias configurações com quantidade, capacidade, grupo e estrutura.
- O mapa mostra iniciais, nome por hover/foco e detalhe por toque.
- Cards foram compactados e passam a usar até três colunas em telas largas, com número do quarto, conjunto, estrutura e estado de ocupação.
- Remanejamento e liberação preservam histórico.

## Regras preservadas

- Cupom é validado novamente dentro do serviço e consumido em transação.
- Valor final e desconto são persistidos na reserva e no ledger de preços.
- Quantidade de parcelas e vencimentos são recalculados no backend.
- Clique repetido não cria nova versão contratual válida nem cobrança duplicada fora das chaves idempotentes existentes.
- Versões assinadas permanecem imutáveis e verificáveis por hash.
- Fluxo de boleto manual, gates de aprovação e histórico financeiro permanecem intactos.

## Banco e migrations

- Nenhuma migration nova foi necessária para esta correção de checkout/cupom/contrato.
- As migrations aditivas acumuladas `0013_operacao_onibus_equipe.sql` e `0014_fila_onibus_quartos_solicitacoes.sql` permanecem incluídas.
- O deploy normal executa migrations automaticamente: `server/index.ts` chama `initializeDatabase()` antes de abrir a porta HTTP, e a imagem Docker copia a pasta `drizzle`.
- Recomenda-se backup verificável do PostgreSQL antes do redeploy.

## Arquivos diretamente envolvidos nesta conclusão

- `apps/web/src/pages/cliente/ConfiguradorPacote.tsx`
- `apps/web/src/pages/cliente/Checkout.tsx`
- `apps/web/src/utils/checkoutIntent.ts`
- `apps/web/src/pages/admin/HospedagemQuartos.tsx`
- `server/routes/pacotes.ts`
- `server/services/contratoService.ts`
- `tests/checkoutCupomContrato.spec.ts`
- `tests/contratoService.spec.ts`
- `tests/hospedagemLoteVisual.spec.ts`

As demais correções acumuladas de autenticação, DEV, exclusão segura, operação de ônibus, quartos, solicitações, PWA, dashboards, cupons, contratos e identidade visual foram preservadas e constam nos relatórios anteriores incluídos no projeto.

## Validação executada

- Testes completos: **16 arquivos / 80 testes aprovados**.
- Testes direcionados de checkout, cupom e contrato: **3 arquivos / 25 testes aprovados**.
- TypeScript do servidor: aprovado.
- Lint/TypeScript do frontend: aprovado.
- Build completo: aprovado (`build:server`, `build:seed`, `build:web`).
- Build mobile: aprovado.
- Verificação estática de acessibilidade: aprovada.
- `git diff --check`: aprovado.

## Limitação real do ambiente

O ambiente de trabalho não recebeu `DATABASE_URL`, credenciais de notificação, gateway nem banco de homologação. Por isso não foi possível executar aqui o teste integrado real com PostgreSQL, envio OTP, banco Cora e Chromium do contêiner. Nenhum desses serviços foi simulado como sucesso. A compilação, os testes unitários/de regressão e a verificação estática foram concluídos.

## Validação manual após o redeploy

1. Confirmar no log que as migrations terminaram antes de `Servidor iniciado`.
2. Abrir um pacote, aplicar um cupom válido e conferir o desconto na própria página.
3. Continuar sem login, entrar na conta e confirmar que o mesmo pacote e cupom foram restaurados.
4. Criar a reserva e conferir evento, período, cupom, composição, total e parcelas no checkout.
5. Preparar o contrato e conferir a pré-visualização completa.
6. Solicitar e confirmar o OTP; conferir criação do PDF, protocolo e hash.
7. Abrir e baixar o contrato como cliente; repetir como ADMIN/DEV autorizado.
8. Repetir clique/refresh para confirmar ausência de reserva, contrato ou cobrança duplicada.
9. Conferir no mapa de hospedagem os cards compactos e o nome do ocupante por hover/toque.

## Commit sugerido

`fix: preservar cupom e estabilizar checkout e contratos`
