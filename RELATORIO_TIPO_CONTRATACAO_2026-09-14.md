# Seleção explícita do tipo de contratação — 14/09/2026

## Base operacional

- Repositório: `vml-arquivos/comitivas`
- `main` conferida antes desta entrega: `1601bc55d9183ed899d2208f87eebdcd14af475f`
- Esta entrega preserva a flexibilização documental já presente nesse commit e incorpora as correções posteriores de aprovação automática, boleto e escopo contratual.

## Problema corrigido

A tela de montagem do pacote tratava modalidade de hospedagem e escopo do contrato como se fossem a mesma escolha. Isso permitia um quarto ser interpretado automaticamente como “somente hospedagem”, mesmo quando a venda deveria incluir transporte, e não oferecia ao cliente uma escolha explícita do tipo de contratação.

## Regra nova

A jornada passa a ter duas decisões separadas:

1. **Tipo de contratação**
   - Transporte + hospedagem
   - Somente hospedagem
   - Somente transporte
2. **Pacote/modalidade** correspondente ao tipo escolhido.

As três opções aparecem na tela. Uma opção só pode ser selecionada quando existe um pacote ativo daquele tipo, com preço e disponibilidade próprios. Isso evita inventar preço ou reaproveitar indevidamente o valor de outro serviço.

## Autoridade de dados

- `pacotes.forma_contratacao` define o tipo comercial publicado daquele pacote.
- `reservas.recursos_contratados` congela os recursos efetivamente contratados.
- O contrato usa `recursos_contratados` como fonte prioritária e não infere escopo pelo nome do quarto.
- O backend valida que o tipo enviado pelo frontend corresponde ao pacote escolhido.
- Pagamento e ledger continuam usando o preço do pacote real selecionado.

## Mudanças de UX

### Cliente — Configurador de pacote

Antes da escolha do quarto/pacote, a tela mostra:

- Transporte + hospedagem
- Somente hospedagem
- Somente transporte

Opções sem pacote/preço/vaga ficam visíveis, porém desabilitadas como “Indisponível nesta excursão”.

O resumo lateral passa a mostrar explicitamente o tipo de contrato antes do checkout.

### Cliente — Checkout

O resumo da reserva confirma novamente o **Tipo de contratação** antes de gerar/validar o contrato e antes do pagamento.

### Admin — Pacotes

O campo foi esclarecido para **Tipo de contratação deste pacote**. O próprio formulário orienta que, para oferecer três escolhas com valores diferentes, deve existir um pacote/preço para cada tipo desejado.

## Camping

A modalidade não decide mais o escopo. Camping pode ser:

- somente hospedagem;
- transporte + hospedagem;
- somente transporte, se um pacote desse tipo realmente for publicado.

A modalidade define a estrutura da hospedagem; o tipo de contratação define os serviços do contrato.

## Segurança contra mistura indevida

O backend rejeita uma requisição em que o cliente tente combinar, por exemplo, “somente hospedagem” com um pacote publicado como “transporte + hospedagem”.

## Compatibilidade e regressão

- Nenhuma coluna nova foi criada para esta seleção; foi reutilizado o modelo existente de `forma_contratacao` e `recursos_contratados`.
- A migration `0021_fluxo_automatico_contratacao.sql`, já incluída na rodada anterior, continua responsável pela normalização dos pacotes legados de quarto que tinham sido publicados incorretamente como somente hospedagem.
- Contratos históricos validados não são reescritos.
- Preços não são recalculados por inferência; cada tipo usa seu pacote/preço publicado.

## Validações executadas neste ambiente

- Transpilação sintática TypeScript/TSX/MTS: **149 arquivos, 0 erros**.
- 16 verificações estáticas específicas do novo fluxo: **16 aprovadas**.
- Teste direto de `resolverRecursosContratacao` para quarto/camping e os três escopos: **5 casos aprovados**.
- `git diff --check`: sem apontamentos de whitespace.
- O teste completo com `npm ci` não pôde ser concluído neste ambiente porque o acesso ao registry externo expirou; antes do push, execute a suíte oficial em ambiente com acesso ao npm.

## Regra operacional após o deploy

Para que as três opções fiquem habilitadas no site, o Admin deve ter pelo menos um pacote ativo e com preço correto para cada tipo que deseja vender. Não é seguro duplicar automaticamente R$ 3.200 para todos os tipos, pois transporte e hospedagem podem possuir valores comerciais diferentes.
