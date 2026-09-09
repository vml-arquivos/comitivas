# Relatório final — continuidade técnica de produção

Data da validação: 09/09/2026

## 1. Base utilizada

- Repositório oficial: `vml-arquivos/comitivas`.
- Branch consultada: `main`.
- HEAD utilizado: `d8d6a5db3d0d054c685b15821413ffd07ba6c3e4` (`Update Boletos.tsx`, 09/09/2026 00:13:46 -03:00).
- ZIP mais recente comparado: `comitivas-main (11).zip`, identificado pelo commit `b8946ce70ec49c149247a90b092ac7854827071b` (`feat: restore sales team and package operations`).
- Decisão: o commit do ZIP é ancestral da `main`; portanto, a implementação foi feita exclusivamente sobre o HEAD mais novo da `main`. Nenhuma atualização posterior foi sobrescrita.

## 2. Resultado executivo

O sistema existente foi preservado e recebeu alterações direcionadas para completar a operação comercial e física da excursão. A entrega inclui upload real de fotos, gestão completa da equipe, painel gerencial mais útil, informações operacionais nos contratos e áreas do cliente/admin e um novo controle normalizado de saídas, transportes, lugares, embarques e manifesto.

Também foi aplicado o padrão visual fornecido nos mockups: fundo marfim, navegação azul-petróleo, ação principal coral, cards claros, tabelas mais leves, hierarquia tipográfica consistente e adaptação responsiva. Nenhum gráfico ou indicador fictício foi incluído; as novas apresentações consomem os dados reais já retornados pelo backend.

Os fluxos já existentes de cadastro mínimo, referência assinada de vendedor, parcelamento dinâmico, contratos versionados, boletos manuais, pagamentos idempotentes, proteção do DEV, e-mail e redefinição de senha não foram reescritos. Foram inspecionados e preservados.

## 3. Correções e funcionalidades

### Cadastro mínimo e privacidade

- Confirmado o cadastro padrão somente com nome, CPF, nascimento, telefone, e-mail e endereço.
- Nome da mãe, nome do pai, profissão e RG separado não são exigidos no formulário, validação de abertura de conta, contrato ou pagamento.
- Campos históricos legados permanecem no banco para não destruir dados.
- Validações essenciais de CPF, telefone, e-mail, nascimento e endereço foram preservadas.

### Vendedores, equipes e atribuição

- Inclusão de equipe/grupo, gestor e último acesso do vendedor.
- Cadastro manual de vendedor e administrador pelo DEV; ADMIN só pode criar vendedor/cliente.
- Convites protegidos por token hash, validade, uso único, revogação e reemissão que invalida o link anterior.
- Token hash não é retornado nas respostas da equipe.
- Geração de link individual por vendedor permanece baseada em token assinado, sem expor ID manipulável.
- A atribuição já existente continua persistindo do acesso ao cadastro, reserva, contrato e pagamento sem permitir sobrescrita pelo cliente.
- Escopo de vendedor e invisibilidade de DEV continuam validados no backend.

### Contratos e Ficha 360

- Contratos administrativos passaram a usar a existência real do documento versionado como fonte de verdade, inclusive para versões antigas sem URL legada.
- Lista, reserva e Ficha 360 mostram vendedor e, quando existentes, saída, ônibus, identificação, poltrona, ponto e situação do embarque.
- Novos snapshots contratuais registram a alocação operacional vigente.
- Contratos assinados/validados já persistidos permanecem imutáveis; nenhuma versão antiga é regenerada.
- Status técnicos foram traduzidos para linguagem simples nas interfaces alteradas.
- A inconsistência “cadastro aprovado sem evidência” continua bloqueando boleto e é apresentada como necessidade de nova aprovação, sem inventar data histórica.

### Transporte, lugares e embarque

- Cadastro de saídas operacionais vinculadas a lotes.
- Cadastro dos transportes da saída, identificação, placa, condutor, responsável e capacidade.
- Geração automática do mapa físico de lugares.
- Alocação única por reserva e por lugar, protegida por índices parciais, transação e advisory locks.
- Mover, liberar, bloquear e desbloquear lugar preservando histórico.
- Pontos e horários de embarque.
- Check-in de passageiro.
- Manifesto em JSON e CSV.
- Dashboard com saídas, frota, capacidade, ocupação, vagas realmente livres e embarcados.
- Vagas livres descontam ocupações, bloqueios e reservas temporárias ainda válidas.
- Alerta de divergência entre capacidade física da frota e inventário comercial do lote.
- Histórico operacional append-only com ator, estado anterior e posterior.

### Fotos e publicação

- Remoção do campo visual de URL de foto nas telas administrativas de evento e conteúdo.
- Seleção pelo Explorer/file picker e envio real de JPG, PNG ou WEBP.
- Limite de 10 MB, validação de extensão, MIME e assinatura binária.
- Armazenamento protegido e entrega pública por endpoint controlado, sem revelar o caminho físico.
- Limpeza do arquivo quando a persistência no banco falha e remoção segura de uploads administrados pelo sistema.
- URLs históricas continuam sendo exibidas para compatibilidade, sem regravar ou apagar dados antigos.

### Dashboard e navegação

- Dashboard passou a usar documentos contratuais versionados e métricas financeiras/operacionais reais.
- Filtro por viagem/evento.
- Métricas de contratado, recebido, a receber, vencido, contratos por etapa, frota, ocupação, check-in e alertas.
- Menu preserva módulos existentes e inclui `Transporte e lugares`; nomes visuais foram simplificados.
- Tipagem de ícones permanece baseada em `LucideIcon`.

### Refatoração visual baseada nos mockups

- Design system administrativo centralizado em tokens e classes reutilizáveis, sem alterar a identidade pública já consolidada.
- Sidebar mais compacta, indicação ativa coral, identificação clara do perfil e menu móvel preservado.
- Dashboard reorganizado em indicadores financeiros, ocupação, contratos, reservas e pendências reais.
- Viagens e pacotes, clientes, CRM, Ficha 360, contratos, equipe, financeiro e relatórios receberam a mesma hierarquia visual.
- Checkout ganhou indicação de etapas e resumo mais claro; a área do cliente passou a usar cabeçalho leve e métricas legíveis.
- Upload de fotos continua por seletor de arquivo do dispositivo, com estilo alinhado ao restante do painel.
- Tabelas continuam roláveis no mobile; grids e ações empilham nos pontos de quebra existentes.

### Parcelamento e pagamentos preservados

- A regra já existente calcula no backend as parcelas máximas por boleto/cartão usando prazo final, data da viagem, meses de calendário, juros, taxas e configuração do pacote.
- O backend recalcula a simulação, valida a condição aceita e rejeita quantidade manipulada.
- Vencimentos e condições aceitas são registrados no snapshot do contrato.
- Idempotência de pagamento, parcela e boleto manual foi preservada.

## 4. Migration

Arquivo: `drizzle/0013_operacao_onibus_equipe.sql`.

- Somente `ADD COLUMN`, `CREATE TABLE`, `CREATE INDEX` e FKs compatíveis.
- Não contém `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` ou `DELETE` em massa.
- Usa `IF NOT EXISTS` e tratamento de constraint já existente.
- Preserva clientes, usuários, reservas, contratos, pagamentos, boletos e inventário comercial.
- A aplicação já executa migrations Drizzle no startup; antes do deploy deve existir backup verificável do PostgreSQL.

## 5. Arquivos alterados

- `apps/web/src/App.tsx`
- `apps/web/src/index.css`
- `apps/web/src/components/admin/AdminModal.tsx` (novo)
- `apps/web/src/components/admin/DataVisuals.tsx` (novo)
- `apps/web/src/layouts/AdminLayout.tsx`
- `apps/web/src/pages/admin/Boletos.tsx`
- `apps/web/src/pages/admin/ClienteFicha.tsx`
- `apps/web/src/pages/admin/Clientes.tsx`
- `apps/web/src/pages/admin/Comissoes.tsx`
- `apps/web/src/pages/admin/Conteudo.tsx`
- `apps/web/src/pages/admin/Contratos.tsx`
- `apps/web/src/pages/admin/Dashboard.tsx`
- `apps/web/src/pages/admin/EquipeAcessos.tsx`
- `apps/web/src/pages/admin/Eventos.tsx`
- `apps/web/src/pages/admin/Jornada.tsx`
- `apps/web/src/pages/admin/MinhaContaAdmin.tsx` (novo)
- `apps/web/src/pages/admin/OperacaoOnibus.tsx` (novo)
- `apps/web/src/pages/admin/Pagamentos.tsx`
- `apps/web/src/pages/admin/Relatorios.tsx`
- `apps/web/src/pages/admin/Reservas.tsx`
- `apps/web/src/pages/admin/Vendas.tsx`
- `apps/web/src/pages/cliente/Checkout.tsx`
- `apps/web/src/pages/cliente/MinhaConta.tsx`
- `drizzle/0013_operacao_onibus_equipe.sql` (novo)
- `drizzle/meta/_journal.json`
- `packages/contract-engine/contratoModeloPadrao.ts`
- `server/db/schema.ts`
- `server/index.ts`
- `server/routes/admin.ts`
- `server/routes/auth.ts`
- `server/routes/cliente.ts`
- `server/routes/eventos.ts`
- `server/routes/operacao.ts` (novo)
- `server/services/contratoService.ts`
- `server/services/operacaoOnibusService.ts` (novo)
- `tests/contratoHtml.spec.ts`
- `tests/operacaoOnibus.spec.ts` (novo)
- `tests/criticalRoutes.spec.ts` (novo)

## 6. Validação automatizada

Linha de base antes da implementação:

- `npm ci`: aprovado.
- `apps/mobile npm ci`: aprovado.
- Testes: 7 arquivos e 46 testes aprovados.
- Typecheck servidor: aprovado.
- Lint/typecheck web: aprovado.
- Build completo e build mobile: aprovados.

Resultado final:

- `npm run typecheck:server`: aprovado.
- `npm run lint`: aprovado.
- `npm test -- --run`: 9 arquivos e 52 testes aprovados.
- `npm run build`: aprovado (`build:server`, `build:seed`, `build:web`).
- `npm --prefix apps/mobile run build`: aprovado.
- `npm run test:a11y`: aprovado para estrutura, foco e metadados verificáveis no build.
- `git diff --check`: aprovado.
- Testes cobrem autenticação segura, DEV invisível para ADMIN, IDOR entre clientes, contratos/PDF, referência assinada de vendedor, parcelamento dinâmico, configuração de gateway, mapa de 44 poltronas, limites de capacidade e caráter não destrutivo da migration.

## 7. Deploy Coolify

O log anexado mostra que o build de frontend/backend terminou com sucesso e a falha ocorreu depois, em `exporting layers`, quando o container auxiliar do Coolify deixou de existir (`exit code 255`). Isso caracteriza falha do executor/Docker do host, não erro TypeScript ou de aplicação. O build local equivalente está verde nesta entrega.

No Coolify:

1. manter o Dockerfile do repositório;
2. garantir espaço livre e saúde do daemon Docker antes do redeploy;
3. configurar volume persistente no diretório indicado por `STORAGE_PATH` para PDFs, documentos e fotos;
4. realizar backup do PostgreSQL;
5. implantar o novo commit/ZIP e acompanhar a aplicação automática da migration `0013`;
6. confirmar `/api/health` antes de trocar o tráfego.

A migration não exige execução manual no fluxo atual: o `Dockerfile` inclui a pasta `drizzle` na imagem e `initializeDatabase()` executa `migrate()` antes de abrir a porta HTTP. Se qualquer migration falhar, o processo encerra e o healthcheck não libera a versão. Ainda assim, o backup do PostgreSQL antes do deploy permanece obrigatório como medida operacional.

## 8. Validação manual recomendada

1. Entrar como ADMIN e confirmar que nenhum DEV aparece em equipe, busca, ID direto ou exportação.
2. Criar vendedor manualmente, criar convite, revogar/reemitir e testar link antigo e novo.
3. Abrir link do vendedor em sessão limpa, cadastrar cliente, reservar e confirmar vendedor no contrato/relatório.
4. Criar saída, cadastrar dois transportes, pontos de embarque e comparar capacidade física com vagas do lote.
5. Alocar passageiro, tentar dupla alocação, mover, bloquear, confirmar check-in e baixar manifesto CSV.
6. Gerar novo contrato após alocação e verificar transporte/lugar; confirmar que contrato já validado não muda.
7. Em Viagens e pacotes, anexar JPG/PNG/WEBP pelo seletor e confirmar site público; tentar formato inválido e arquivo maior que 10 MB.
8. Simular boleto/cartão em início, meio e fim da oferta; tentar alterar parcelas no request e confirmar rejeição do backend.
9. Validar visualmente as telas em 320, 360, 390, 430, 768 e desktop com dados reais do ambiente de homologação.
10. Entrar como DEV, abrir **Minha conta**, alterar nome/telefone, trocar o e-mail de login e alterar a senha informando a senha atual.

## 9. Segunda passagem visual e de navegação

- Dashboard alinhado aos mockups com evolução de vendas, funil comercial e ocupação por veículo usando exclusivamente dados reais do backend.
- Relatórios com visualizações de ocupação, faturamento e itens vendidos; tabelas detalhadas permanecem disponíveis sob demanda.
- Cadastros de clientes, usuários, convites, saídas, veículos e pontos de embarque passaram a abrir em modal, deixando as páginas limpas.
- A navegação ganhou rota protegida `admin/minha-conta`, acesso no menu e no cartão do usuário.
- O próprio DEV pode atualizar dados pessoais, e-mail usado no login e senha.
- Alterações de login e senha exigem a senha atual, renovam a sessão corrente, revogam as anteriores e registram auditoria sem armazenar senhas.
- Foi adicionado fallback interno para rotas administrativas inexistentes, evitando telas vazias e preservando o contexto do painel.

## 10. Limitações reais

- Não foi aplicada migration nem executado teste E2E contra o banco de produção, pois nenhuma credencial de produção foi usada nesta tarefa. A migration foi verificada estaticamente e toda a aplicação compilou.
- Fotos e documentos exigem volume persistente no Coolify. Sem volume, um novo container perde arquivos locais mesmo que o banco preserve os metadados.
- O provedor Cora atualmente integrado processa PIX/boleto. A regra comercial de cartão é calculada e validada, mas cartão não é oferecido até existir um adquirente compatível; nenhum pagamento fictício foi criado.
- A alocação de transporte/lugar entra em novos contratos gerados depois da atribuição. Documentos assinados antigos não são alterados, por integridade jurídica.
- A validação visual autenticada com dados de produção deve ser repetida após o deploy; nesta entrega foram validados TypeScript, Tailwind, grids responsivos e os builds web/mobile, sem usar credenciais reais.

## 11. Commit sugerido

Mensagem:

`feat: finalizar operação, conta DEV e interface visual do sistema`

Resumo:

- adiciona transportes, lugares, embarques, check-in e manifesto;
- completa equipe e convites sem expor DEV ou hashes;
- troca URL de foto por upload validado;
- integra operação a dashboard, reservas, cliente e contratos;
- aplica o padrão visual dos mockups nas telas administrativas e do cliente;
- adiciona gráficos reais, formulários em modal e edição segura da conta DEV;
- preserva cadastro mínimo, vendas atribuídas, pagamentos e contratos imutáveis.
