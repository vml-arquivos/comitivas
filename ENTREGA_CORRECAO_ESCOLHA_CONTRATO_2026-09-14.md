# ENTREGA — ESCOLHA EXPLÍCITA DO TIPO DE CONTRATAÇÃO

Base operacional validada: `vml-arquivos/comitivas` main `17df39be37ecc5eafcf5cf5ffecbc0ffafa1da37`.

## Resultado

- abrir um pacote pela vitrine não escolhe mais automaticamente `Somente hospedagem`;
- o cliente precisa escolher explicitamente `Transporte + hospedagem`, `Somente hospedagem` ou `Somente transporte`;
- depois escolhe o pacote/modalidade compatível e vê o preço real daquela oferta;
- o resumo mostra tipo de contratação, pacote, preço e formas de pagamento antes do checkout;
- uma oferta legado `livre` não é convertida silenciosamente para hospedagem;
- o backend rejeita mistura entre tipo escolhido e pacote publicado para outro escopo;
- o Admin tem uma única decisão comercial de tipo; o modelo técnico do contrato é derivado automaticamente para não divergir;
- a sincronização rápida das modalidades atua apenas nas ofertas `Transporte + hospedagem` e não sobrescreve variantes `Somente hospedagem` / `Somente transporte`;
- migration `0022_corrige_escopo_comercial_pacotes.sql` corrige o caso informado de Barretos 2027 / Quarto com ar-condicionado / R$ 3.200 para transporte + hospedagem;
- reservas e contratos históricos assinados não são reescritos pela migration.

## Validação executada no ambiente de entrega

- parse sintático de 151 arquivos TypeScript/TSX/MTS: `0` erros;
- transpile isolado dos 5 arquivos TS/TSX alterados: `0` erros;
- 20 verificações específicas do novo fluxo: `20/20` aprovadas;
- `git diff --no-index --check`: sem erros de whitespace.

## Validação que ainda deve rodar no clone/CI antes do redeploy

O `npm ci` não concluiu neste ambiente por indisponibilidade/timeout de acesso ao registry externo. Execute em ambiente com npm disponível:

```bash
npm ci
npm run typecheck:server
npm test -- --run
npm run build
```

Não faça redeploy se qualquer etapa crítica falhar.
