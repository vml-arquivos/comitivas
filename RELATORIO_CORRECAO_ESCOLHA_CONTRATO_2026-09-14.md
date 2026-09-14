# RELATÓRIO — CORREÇÃO DEFINITIVA DA ESCOLHA DO CONTRATO

Base: `vml-arquivos/comitivas` main `17df39be37ecc5eafcf5cf5ffecbc0ffafa1da37`.

## Problema confirmado
A página recebia `?pacote=...` e copiava automaticamente `pacote.forma_contratacao` para o estado do contrato. Também selecionava automaticamente o único tipo disponível e convertia o legado `livre` em `hospedagem`. Isso explicava o print com **Somente hospedagem** marcado sem decisão do cliente.

## Correção
- link de pacote não define mais o contrato;
- nenhum tipo é pré-selecionado automaticamente;
- retorno após login só restaura uma escolha que o próprio cliente já fez;
- escolher modalidade não altera o tipo do contrato;
- `livre` deixa de virar `hospedagem` silenciosamente e fica indisponível até configuração no Admin;
- tipo de contratação e modelo técnico do contrato passam a ser coerentes e não podem divergir pelo formulário;
- resumo mostra o tipo, pacote, preço e condição de pagamento antes de continuar;
- cada tipo continua usando o preço real de seu próprio pacote, sem duplicação/invenção de valor;
- migration 0022 corrige o caso de produção informado: Barretos 2027, quarto com ar-condicionado de R$ 3.200, para transporte + hospedagem;
- a migration não altera snapshots/contratos históricos já assinados.

## Fluxo final
1. Tipo de contratação (decisão explícita do cliente)
2. Pacote/modalidade compatível
3. Preço e condições de pagamento daquele pacote
4. Pessoas
5. Conta/dados/documento
6. Checkout e forma de pagamento
7. Contrato construído do snapshot `recursos_contratados`
8. OTP
9. Fluxo automático de venda/boletos já implementado

## Compatibilidade
A estrutura existente de `pacotes`, `reservas.recursos_contratados`, inventário, contrato, OTP e pagamentos foi preservada. Não foi criado um motor contratual paralelo.
