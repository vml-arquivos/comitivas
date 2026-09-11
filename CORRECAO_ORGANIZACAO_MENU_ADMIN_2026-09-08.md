# Correção — organização do menu administrativo

Data: 2026-09-08
Base: main@1ac1277793df2b12a5e125dee6b5c4d00a6497cb

## Objetivo
Organizar o menu lateral do painel administrativo por módulos funcionais, sem alterar rotas, permissões ou regras de negócio.

## Nova organização

- Visão geral
  - Dashboard
- Comercial & clientes
  - Vendas internas
  - Clientes
  - Jornada (CRM)
  - Cupons
- Operação da excursão
  - Eventos & Lotes
  - Reservas
  - Contratos
- Financeiro
  - Pagamentos
  - Boletos bancários
  - Comissões
- Gestão
  - Relatórios
  - Configurações
- Sistema & segurança
  - Equipe & Acessos
  - Gateway

## Segurança e permissões
As permissões originais de cada item foram preservadas. Grupos sem itens disponíveis para o papel atual não são exibidos.

## Layout
- títulos de módulo discretos em caixa alta;
- separadores visuais entre grupos;
- item ativo com destaque claro;
- ícones e textos com hierarquia consistente;
- sidebar com rolagem própria quando necessário;
- rodapé da conta permanece fixo no final da sidebar;
- nenhuma alteração nas páginas internas ou rotas.

## Validação
- parser TypeScript/TSX do `AdminLayout.tsx`: 0 erros sintáticos;
- nenhuma migration;
- nenhuma alteração em banco, contratos, pagamentos, autenticação ou APIs.

O build completo deve ser confirmado pelo pipeline Docker/Coolify, pois este ambiente não conseguiu concluir `npm ci` por indisponibilidade do pacote `@vitejs/plugin-react` no cache local.
