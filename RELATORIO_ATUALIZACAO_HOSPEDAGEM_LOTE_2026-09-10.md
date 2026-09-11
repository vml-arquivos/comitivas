# Atualização — Hospedagem em lote e correção do deploy

Data: 10/09/2026 (America/Sao_Paulo)

## Motivo desta entrega

O deploy do commit `3e049f29f6bf20738d8c4f22da7a2e69af884e14` falhou no frontend porque `MinhaContaAdmin.tsx` chamava `refreshUser`, enquanto o `AuthContextType` daquele pacote já não expunha a função. Além disso, a comparação com o commit imediatamente anterior mostrou remoções amplas de funcionalidades; por isso esse commit quebrado não foi usado como base de confiança para esta entrega.

## Base preservada

O pacote foi reconstruído a partir da entrega local validada anterior, que já contém `refreshUser`, Minha Conta administrativa, operações de ônibus, contratos, boletos, clientes, acesso DEV/ADMIN e demais módulos presentes naquela entrega. Nenhuma dessas rotas foi removida para implementar a hospedagem.

## Hospedagem — inclusão em lote

A página **Hospedagem e quartos** foi adicionada ao menu administrativo e possui dois caminhos:

1. **Criar quartos em lote** — fluxo principal;
2. **Quarto avulso** — mantido para preservar a função anterior e permitir exceções.

No fluxo em lote o administrador informa:

- título/identificação do conjunto, como “Primeiro final de semana”;
- quantidade de quartos;
- quantidade de vagas por quarto;
- grupo masculino ou feminino;
- climatização: ar-condicionado, ventilador ou sem climatização;
- pacote específico opcional;
- observação opcional.

O botão **Incluir mais configuração** permite misturar, no mesmo título, por exemplo: 10 quartos de 4 vagas, 5 quartos de 2 vagas e 3 quartos individuais, com grupos e climatizações diferentes.

Os IDs são gerados automaticamente no backend. Os quartos continuam sendo registros individuais depois da criação, portanto permanecem editáveis, alocáveis e remanejáveis sem quebrar o mapa operacional.

## Integridade e banco

Foi adicionada a migration forward-only `0014_fila_onibus_quartos_solicitacoes.sql`, sem `DROP TABLE`, `DROP COLUMN` ou `TRUNCATE TABLE`. O journal do Drizzle foi atualizado e o schema passou a reconhecer `venda_ordem`, `quartos_hospedagem`, `quarto_alocacoes` e `reserva_solicitacoes`.

A criação em lote roda em uma única transação. Se uma configuração, pacote, quantidade ou capacidade for inválida, a operação é rejeitada antes de deixar um conjunto parcial de quartos.

## Validações executadas neste empacotamento

- parse sintático de 121 arquivos TS/TSX/MTS: aprovado;
- imports relativos: nenhum ausente;
- arquivos centrais alterados: parse aprovado;
- `drizzle/meta/_journal.json`: JSON válido e contém `0014`;
- migration `0014`: gate estático sem operações destrutivas;
- rota `/api/hospedagem` registrada no servidor;
- rota `/admin/hospedagem` registrada no frontend;
- `refreshUser` presente no `AuthContext` e compatível com `MinhaContaAdmin`.

## Validação que depende do ambiente

O sandbox desta entrega não possui `node_modules` nem acesso ao npm registry, portanto não foi possível executar um novo `npm ci`/`npm run build` completo aqui. O pacote inclui `VALIDAR_ANTES_DO_DEPLOY.sh`; em ambiente com acesso ao registry e banco de homologação, execute-o antes do redeploy. A validação integrada de banco também depende de `DATABASE_URL` de homologação.

## Segurança do ZIP

O pacote não inclui `.git`, `node_modules`, `dist`, uploads reais, `.env` real nem snapshots de variáveis do Coolify. O `.env.example` permanece como referência.
