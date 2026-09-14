# RELATÓRIO — Integridade entre contratação, contrato e vagas físicas

Data: 14/09/2026
Base: `vml-arquivos/comitivas` — `main` em `98b9247f7677394c734cf7488254a1efca3444f1`

## Problema corrigido

Foi identificado um caminho em que uma reserva podia registrar `transporte + hospedagem` no contrato, mas a ocupação física ficar incompleta (por exemplo, hospedagem ativa sem poltrona de ônibus). O problema ocorria porque contrato, hold comercial e alocações físicas eram validados em etapas diferentes e um hold ainda ativo podia expirar após a assinatura.

## Invariantes implementadas

Para toda reserva ativa:

- `transporte=true` exige exatamente uma `assento_alocacao` ativa por viajante;
- hospedagem em quarto exige exatamente uma `quarto_alocacao` ativa por viajante;
- recurso não contratado não pode permanecer alocado;
- quantidade do `inventario_hold` deve coincidir com a quantidade de viajantes;
- o contrato não é preparado nem validado se a operação física estiver divergente;
- no OTP, recursos físicos e participantes são travados e conferidos na mesma transação da assinatura;
- após a assinatura correta, o hold é convertido e não expira pelo scheduler;
- pagamento/boleto também possui gate de integridade;
- vendas internas usam a mesma regra do checkout público;
- contratos já assinados são reconciliados no startup, usando o snapshot assinado como autoridade máxima;
- poltrona/hospedagem de contrato validado não pode ser simplesmente liberada; remanejamento preserva a vaga.

## Caminhos protegidos

1. criação pública da reserva;
2. retomada de carrinho;
3. preparação do contrato;
4. solicitação do OTP;
5. confirmação do OTP;
6. criação do pagamento/boleto;
7. venda interna;
8. geração do snapshot contratual;
9. startup/reconciliação de contratos anteriores;
10. liberação manual de poltrona e hospedagem.

## Compatibilidade

- nenhuma migration nova foi necessária;
- nenhum contrato validado é reescrito;
- nenhum pagamento histórico é apagado;
- nenhuma tabela existente foi removida;
- preços e condições de pagamento permanecem intactos;
- a seleção explícita `transporte + hospedagem / somente hospedagem / somente transporte` é preservada.

## Validações executadas neste ambiente

- parse sintático de 154 arquivos TS/TSX/MTS: 0 erros;
- verificações estáticas dos 14 gates/invariantes críticos: aprovadas;
- diff de escopo conferido contra a base recebida;
- pacote final testado quanto à integridade ZIP e SHA-256.

A suíte completa `npm ci + typecheck + vitest + build` deve ser executada no CI/clone com dependências instaladas antes do redeploy. O ambiente desta execução não possui as dependências npm materializadas para concluir essa etapa integral localmente.
