# Auditoria de Banco e Migrations — Comitivas

**Data da inspeção:** 2026-09-05
**Área auditada:** `server/db`, SQL em `drizzle/` e scripts relacionados a banco, migrations e seed.
**Objetivo:** avaliar tabelas, relações, constraints, índices, snapshots, centavos, holds, idempotência, contrato, evidências, OTP, auditoria, dados históricos e migrations forward-only, priorizando preservação de dados e zero regressão.

## 1. Conclusão executiva

A base possui uma fundação operacional relevante: há nove migrations registradas em sequência, tabelas para contratos, evidências, OTP, pagamentos, parcelas, webhooks, holds, ledger de preços e outbox, além de transações explícitas em partes críticas do checkout. O typecheck do servidor passou sem erros. A migration `0008` faz backfills conservadores para centavos e estado de checkout, e o journal do Drizzle corresponde exatamente aos nove arquivos SQL presentes.

Os riscos prioritários não estão na ausência total de estruturas, mas na **divergência entre fontes de verdade**, na **integridade que está apenas no código**, em alguns **campos monetários duplicados sem garantia de paridade**, e em **idempotência concorrente incompleta**. O caso mais concreto de regressão de dados é que rotas administrativas atualizam `reservas.valor_total` sem atualizar `reservas.valor_total_centavos`. O caso mais concreto de idempotência é o webhook: duas requisições simultâneas podem passar pela leitura inicial antes de uma delas observar o evento como processado e ambas executarem a lógica de negócio.

A inspeção foi estática. A tentativa de conexão somente leitura ao banco configurado falhou; portanto, este relatório não afirma que o banco implantado contém as nove migrations, os índices ou os dados esperados. Antes de qualquer alteração, recomenda-se snapshot/backup verificável e uma validação de metadados em ambiente autorizado.

### Resumo por classificação

| Classificação | Síntese |
|---|---|
| **Funcionando** | Journal completo; migrations majoritariamente idempotentes; transação de reserva com lock; hold e ledger gravados juntos; snapshots contratuais com hash; OTP com segredo derivado por HMAC; outbox contratual com chave idempotente; typecheck aprovado. |
| **Incompleto** | Verificação não alcança constraints e dados reais; FK do hold é criada `NOT VALID`; centavos continuam anuláveis e sem regra de paridade; backfill histórico é parcial; cadeia de hashes de eventos não é aplicada a todos os eventos; caminho de pagamento externo não é transacional com a persistência local. |
| **Errado** | Atualizações administrativas deixam `valor_total_centavos` potencialmente obsoleto; `schema.ts` declara enums e índices únicos que não correspondem ao DDL/migration efetivo; webhook registra unicidade da linha, mas não garante processamento único sob concorrência. |
| **Legado/duplicado** | `ensureSchema()` mantém um segundo DDL inicial; colunas antigas de contrato e `emails_enviados` convivem com o novo modelo; `sessoes` e `password_reset_tokens` são definidos, mas não têm uso operacional encontrado. |
| **Ausente** | Checks monetários e de estados; constraints compostas que garantam que pagamento/parcela, contrato/validação e hold/reserva apontem para a mesma entidade; imutabilidade no banco para snapshots/evidências; auditoria abrangente de pagamentos, holds e mudanças administrativas; reconciliação formal de dados históricos legados. |

## 2. Escopo, método e limitações

Foram inspecionados `server/db/schema.ts`, `server/db/index.ts`, `drizzle/0000` a `drizzle/0008`, `drizzle/meta/_journal.json`, `scripts/aplicar-migrations.ts`, `scripts/verificar-migration.mjs`, `scripts/seed-barretos-2026.ts` e os serviços/rotas que gravam ou leem as estruturas auditadas. A leitura operacional incluiu, entre outros, `pacoteService`, `inventoryService`, `paymentGatewayAdapter`, `pagamentos`, `contratoService`, `otpService`, `notificationOutboxService` e `followupScheduler`.

Foram executados somente comandos não destrutivos. O comando `npx tsc --noEmit -p tsconfig.server.json` terminou com código 0. Uma verificação estática confirmou que os nove nomes de arquivos SQL estão presentes no journal, que os índices previstos pelo script de verificação são referenciados no SQL e que o conteúdo versionado das Regras de Convivência 2026.1 possui o mesmo SHA-256 indicado na migration `0007` (`5a5e5f...72acf`).

A conexão somente leitura tentou consultar `current_database`, tabelas públicas e índices, mas não foi estabelecida. Não houve `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `CREATE`, execução de migration, seed ou alteração deliberada de arquivo de aplicação. O estado Git inicial já continha alterações fora do escopo em `apps/web/dist` e `apps/web/dist/index.html`; elas não foram tocadas.

Neste documento, **Fato** significa algo diretamente observado no código, SQL, journal ou resultado de comando. **Inferência** significa o risco derivado da combinação desses fatos, sem confirmação do banco implantado.

## 3. Funcionando

### 3.1 Sequência e execução das migrations

**Fato.** Há nove migrations, de `0000` a `0008`, e nove entradas com índices `0` a `8` em `drizzle/meta/_journal.json`. Os `tag`s correspondem exatamente aos nomes dos arquivos SQL. `scripts/aplicar-migrations.ts` delega a inicialização a `initializeDatabase()`, que executa `migrate(db, { migrationsFolder })` após a verificação/criação do DDL inicial.

**Fato.** As migrations mais novas utilizam amplamente `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS` e `CREATE INDEX IF NOT EXISTS`. A `0008` documenta explicitamente o modelo forward-only e não contém `DELETE` nem `TRUNCATE`. A maior parte das operações é compatível com reexecução no mesmo banco, embora isso não elimine os riscos descritos nas seções de divergência e validação.

### 3.2 Tabelas, relações e índices básicos

**Fato.** O schema e as migrations cobrem as entidades centrais: usuários, eventos, lotes, pacotes, adicionais, cupons, reservas, pagamentos, e-mails, leads, documentos contratuais, versões de regras, validações, OTP, eventos contratuais, consentimentos, ledger de preços, holds, outbox, sessões, tokens de redefinição, idempotências de pagamento, parcelas, webhooks, descontos administrativos e vídeos.

**Fato.** Existem chaves primárias em todas as tabelas novas e várias chaves estrangeiras para preservar a existência de usuário, reserva, lote, contrato, pagamento e evento. Há unicidade para e-mail/CPF, código de cupom, versão contratual por reserva, protocolo de validação, hash de token, chave de idempotência, evento de webhook, sequência de parcela por reserva e chave da outbox.

**Fato.** Há índices de consulta para reserva, status, contrato, OTP, fila da outbox, expiração de hold, reconciliação de pagamentos, gateway, Cora e sessões. O script `verificar-migration.mjs` verifica a existência de 21 índices nomeados, além de tabelas e colunas.

### 3.3 Hold, reserva e ledger de preços

**Fato.** `PacoteService.reservarPacote` usa uma transação, trava a linha do lote com `FOR UPDATE`, decrementa `vagas_disponíveis` com predicado de disponibilidade, incrementa o uso de cupom, cria a reserva, cria um hold de 30 minutos e grava linhas em `precos_ledger` antes de confirmar a transação.

**Fato.** `inventario_holds.reserva_id` é único e `quantidade` possui `CHECK (quantidade > 0)`. `InventoryService.liberarExpirados` usa `FOR UPDATE ... SKIP LOCKED`, marca o hold como liberado, devolve vagas sem ultrapassar `vagas_totais`, reduz o uso do cupom e marca a reserva como expirada/abandonada.

**Inferência positiva.** Essa composição reduz o risco de duas reservas consumirem a mesma vaga dentro do fluxo normal e preserva, na mesma unidade transacional, o preço calculado e a reserva. O risco residual é a dependência de chamadas e invariantes fora do banco, tratada adiante.

### 3.4 Snapshot, contrato e evidências

**Fato.** `contratos_documentos` armazena `snapshot`, `conteudo_canonico`, `snapshot_sha256`, versão do template, versões e hash das regras, versão do aviso de privacidade, status e hashes do PDF. `ContratoService.prepararContrato` invalida versões pendentes, incrementa a versão por reserva, persiste o snapshot e atualiza o estado do checkout na mesma transação.

**Fato.** O snapshot é canonizado por ordenação recursiva de chaves antes do SHA-256. O conteúdo das Regras de Convivência é versionado em `regras_convivencia_versoes` e o SHA-256 declarado em `0007` corresponde ao conteúdo runtime versionado em `packages/legal-content/regras-2026.1.json`.

**Fato.** A confirmação OTP gera o PDF, calcula `pdf_sha256`, persiste o documento validado, marca o OTP como usado, atualiza a reserva, registra `contrato_validacoes`, enfileira uma notificação idempotente e cria um evento de contrato dentro de uma transação. Se a transação falha depois da criação do arquivo, o serviço remove o arquivo criado.

### 3.5 OTP e notificação contratual

**Fato.** O código OTP não é armazenado em claro. `OtpService` grava HMAC-SHA-256 com pepper, verifica com comparação em tempo constante, aplica expiração de dez minutos, cooldown de um minuto, limite de cinco tentativas e exige status de envio `enviado` antes da confirmação.

**Fato.** O serviço grava destino mascarado, provedor, message ID, horários de solicitação/envio/falha, erro do provedor e eventos de contrato. A notificação de contrato usa `notificacoes_outbox.chave_idempotente` com `ON CONFLICT DO NOTHING`, e o scheduler processa pendências com tentativas e backoff.

### 3.6 Centavos e idempotência de pagamentos: base existente

**Fato.** A migration `0008` cria `valor_total_centavos`, `valor_centavos` e `valor_pago_centavos` nas entidades de reserva, pagamento e parcela, e faz backfill de valores legados com `ROUND(valor * 100)`. O ledger já usa inteiros em centavos para unidade e total.

**Fato.** Há índice único parcial para `pagamentos.idempotency_key`, índice único parcial para `pagamentos.gateway_id`, índice único parcial para `pagamento_parcelas.cora_id`, tabela `pagamento_idempotencias` com `chave` única e tabela `webhook_eventos` com `evento_id` único. O adaptador verifica uma cobrança existente antes de chamar a Cora e usa `ON CONFLICT DO NOTHING` ao persistir a cobrança local.

**Inferência positiva.** Para chamadas sequenciais e para o caminho normal de uma única instância, esses elementos reduzem duplicidade de cobrança e repetição de efeitos locais. Eles não são suficientes para garantir idempotência concorrente em todos os caminhos, conforme a seção 5.

## 4. Incompleto

### 4.1 Não foi possível confirmar o banco implantado

**Fato.** A conexão somente leitura falhou antes de retornar metadados. O script `verificar-migration.mjs` existe, mas não foi executado com sucesso contra uma base acessível.

**Impacto.** Não é possível afirmar se o banco de produção/teste possui as nove migrations, a constraint do hold, os índices parciais, a tabela `drizzle.__drizzle_migrations`, o backfill ou registros históricos. Esse é um limite factual, não uma afirmação de ausência.

**Prioridade:** P0 operacional. Antes de qualquer migration ou correção, obter backup/snapshot verificável, executar verificação de metadados em conexão autorizada e registrar a saída.

### 4.2 FK do hold criada como `NOT VALID`

**Fato.** `0008` cria `reservas_inventario_hold_fk` com `FOREIGN KEY ... NOT VALID` e não há `VALIDATE CONSTRAINT` posterior. A coluna já pode conter referências inválidas em dados existentes sem que a constraint seja validada integralmente.

**Inferência.** O desenho evita bloquear imediatamente uma base histórica, mas deixa a integridade relacional formalmente incompleta. O código valida o hold em partes do fluxo, mas consultas e gravações fora desse fluxo não recebem a mesma garantia.

**Prioridade:** P1. Validar primeiro em modo somente leitura, quantificar órfãos e só então planejar validação forward-only, sem apagar nem reescrever dados automaticamente.

### 4.3 Centavos sem paridade obrigatória

**Fato.** Os campos centavos permanecem anuláveis em `reservas`, `pagamentos` e `pagamento_parcelas`. Não há `CHECK` de não negatividade nem `CHECK` que relacione `valor_centavos` ao decimal. O backfill ocorre apenas para linhas cujo campo está nulo no momento da migration.

**Fato.** O endpoint administrativo de desconto atualiza `reservas.valor_total` em `server/routes/admin.ts:720-725`, mas não atualiza `valor_total_centavos`. A geração administrativa de contrato também atualiza `valor_total` em `server/routes/admin.ts:847-857`, sem atualizar `valor_total_centavos`.

**Inferência.** Uma reserva pode ter total decimal novo e centavos antigos. Hoje alguns cálculos usam o decimal e outros usam centavos, portanto o erro pode aparecer apenas em reconciliação, auditoria ou integração posterior. Esse é o principal risco direto de regressão monetária encontrado.

**Prioridade:** P1. Definir uma regra de autoridade, atualizar os dois campos na mesma transação em todos os caminhos e auditar divergências antes de qualquer backfill adicional.

### 4.4 Histórico parcialmente migrado

**Fato.** `0005` faz backfill de clientes para `leads_origem`; `0008` faz backfill de centavos e `checkout_estado`. Não há migration que reconstrua `precos_ledger` para reservas antigas, crie holds retroativos, transforme contratos antigos em `contratos_documentos`/`contrato_validacoes` ou associe PDFs legados a hashes.

**Inferência.** Isso preserva dados antigos e evita inventar fatos comerciais, mas deixa dois regimes históricos: reservas com trilha nova e reservas apenas com colunas legadas. A ausência é aceitável somente se for explícita no contrato operacional e nos relatórios.

**Prioridade:** P1. Inventariar reservas históricas sem ledger, hold ou documento novo; não preencher valores inferidos sem fonte; registrar um estado de legado ou uma trilha de migração auditável.

### 4.5 Cadeia de hashes de auditoria não aplicada uniformemente

**Fato.** `contrato_eventos` tem `hash_anterior`, `hash_evento` e um índice por contrato/data. Porém, `ContratoService.marcarVisualizacao` é o principal caminho que busca o hash anterior e o grava. A preparação, solicitação OTP, falha de envio, envio OTP e assinatura concluída calculam `hash_evento` sem buscar o último evento e sem preencher `hash_anterior`.

**Inferência.** A tabela sugere uma cadeia encadeada, mas a implementação atual cria vários eventos com hash independente. O SHA-256 continua sendo evidência de cada payload conhecido, porém não prova uma sequência completa sem lacunas ou reordenação.

**Prioridade:** P1. Decidir se o requisito é hash por evento ou cadeia append-only; se for cadeia, centralizar a obtenção do último hash sob lock e testar concorrência. Não reescrever eventos históricos sem uma migração de evidência explicitamente versionada.

### 4.6 Idempotência externa e persistência local não são uma transação

**Fato.** `PaymentGatewayAdapter.criarPagamento` consulta o banco, chama a Cora, grava `pagamentos`, grava `pagamento_idempotencias` e depois grava parcelas. A chamada à Cora ocorre antes da transação que persiste as três estruturas locais; não há outbox de cobrança nem reconciliação explícita para o caso de a Cora aceitar e a persistência local falhar.

**Inferência.** A chave idempotente da Cora reduz a chance de cobrança dupla, mas pode deixar uma cobrança existente sem representação local até uma nova tentativa ou investigação manual. O problema é de recuperação, não de falta de chave.

**Prioridade:** P1. Manter a chave externa estável, registrar intenção local antes da chamada quando possível e criar procedimento de reconciliação por chave/gateway sem apagar registros.

### 4.7 Outbox nova e e-mail legado coexistem

**Fato.** Contrato validado usa `notificacoes_outbox`; follow-ups e partes do `EmailService` usam diretamente `emails_enviados`. O follow-up consulta se já existe registro e depois insere, mas `emails_enviados` não possui chave idempotente ou índice único por reserva/etapa.

**Inferência.** Em duas instâncias do scheduler, a consulta simultânea pode produzir dois follow-ups. Também há dois históricos de envio, com semânticas de retry diferentes.

**Prioridade:** P2. Consolidar gradualmente em outbox ou adicionar uma chave idempotente/constraint para o caminho legado, preservando os registros existentes.

## 5. Errado ou estruturalmente divergente

### 5.1 Atualização monetária administrativa quebra a paridade decimal/centavos

Este achado é classificado como **errado**, não apenas incompleto, porque o repositório já declara a existência dos centavos como representação operacional e, ao mesmo tempo, possui caminhos confirmados que alteram somente o decimal. A evidência está em `server/routes/admin.ts:721` e `server/routes/admin.ts:847-857`. O risco permanece mesmo que a base implantada ainda não tenha usado esses endpoints.

### 5.2 `schema.ts` e SQL discordam sobre enums

**Fato.** `server/db/schema.ts` declara `reserva_status`, `pagamento_status` e `usuario_tipo` com `pgEnum`. O DDL inicial de `server/db/index.ts` cria as colunas como `VARCHAR`, e as migrations `0005` mantêm/adicionam `status` como `VARCHAR(50)`. Não existe migration, no escopo, criando esses tipos Postgres ou convertendo as colunas para enum.

**Inferência.** Consultas Drizzle podem continuar funcionando porque os valores são enviados como strings, mas o schema TypeScript não descreve o tipo real do banco. Se alguém usar esse schema como base de geração/push ou esperar enforcement de enum no banco, haverá comportamento divergente. A fonte de verdade precisa ser escolhida e documentada.

**Prioridade:** P1 de governança de schema. Não converter tipos em produção sem inventário de valores; primeiro comparar os valores reais e definir migration forward-only segura.

### 5.3 Índices únicos no SQL são não únicos no schema Drizzle

**Fato.** A migration `0007` cria `contratos_documentos_reserva_versao_idx` como `CREATE UNIQUE INDEX`; `0008` cria `pagamento_parcelas_reserva_sequencia_idx` como único. Em `server/db/schema.ts:265-268` e `server/db/schema.ts:459`, ambos aparecem como `index(...)`, não como `uniqueIndex(...)`.

**Inferência.** O banco migrado pode estar protegido pelos índices SQL, mas o modelo ORM não representa essa proteção. Qualquer fluxo posterior baseado em geração de DDL, revisão automática ou nova instalação pode perder a unicidade.

**Prioridade:** P1 de fonte de verdade. Alinhar representação sem executar alteração automática em banco, e testar que a definição escolhida mantém os nomes e predicados existentes.

### 5.4 Webhook possui unicidade de registro, mas não processamento único concorrente

**Fato.** `server/routes/pagamentos.ts:189-214` primeiro consulta `webhook_eventos`, depois insere com `onConflictDoNothing` ou incrementa tentativas, executa a lógica da cobrança e só ao final marca `processado_em`. Duas requisições simultâneas podem observar `processado_em` nulo ou ausência da linha antes de uma delas concluir.

**Inferência.** A linha única evita duplicar o registro do evento, mas não impede duas execuções de atualização de pagamento, parcela, hold e reserva. A reconciliação é parcialmente idempotente, mas o contrato de idempotência não é garantido pelo banco nem por uma transação que reserve o evento.

**Prioridade:** P1. Adotar claim transacional do evento, lock apropriado ou estado de processamento com lease e reprocessamento seguro; preservar payload e tentativas já existentes.

## 6. Legado ou duplicado

### 6.1 Dois DDLs de inicialização

**Fato.** `server/db/index.ts:21-237` contém `CREATE_TABLES` e alterações incrementais para o núcleo antigo. Depois, `initializeDatabase()` chama `runDrizzleMigrations()`. O `schema.ts` é uma terceira representação declarativa.

**Inferência.** Há três superfícies para drift: DDL bootstrap, migrations SQL e schema Drizzle. O comentário de `index.ts` reconhece compatibilidades históricas, mas a manutenção continua exigindo alterações coordenadas. O DDL inicial não cria as tabelas novas de contrato, holds, ledger e outbox; elas dependem da migration.

**Risco de regressão.** Uma instalação parcial, uma falha entre `ensureSchema` e `migrate`, ou uma ferramenta que use somente uma das fontes pode gerar uma base estruturalmente diferente.

### 6.2 Colunas de contrato antigas e modelo de evidência novo

**Fato.** `reservas.contrato_pdf_url`, `aceite_timestamp` e `aceite_ip` continuam sendo lidos por rotas administrativas, download, listagens e e-mail. Em paralelo, `contratos_documentos` e `contrato_validacoes` guardam snapshot, hashes, protocolo e evidências.

**Inferência.** As colunas antigas devem ser tratadas como compatibilidade/legado, mas ainda influenciam a decisão de “contrato gerado”. Isso pode divergir de `contratos_documentos.status` e da validação OTP.

### 6.3 E-mails enviados e outbox

**Fato.** `emails_enviados` registra follow-ups e envios legados; `notificacoes_outbox` registra assinatura concluída e possui retries. São históricos diferentes para notificações semelhantes.

**Inferência.** Relatórios de envio podem ficar incompletos se consultarem apenas uma tabela. A preservação exige manter ambas durante a transição, com uma definição de quais tipos são authoritative.

### 6.4 Sessões persistidas e tokens de redefinição sem uso encontrado

**Fato.** `0007/0008` criam `sessoes` e `password_reset_tokens`. A autenticação efetiva consulta JWT e `usuarios.session_version` em `authMiddleware`; não foram encontradas inserções/consultas operacionais de `sessoes`. `password_reset_tokens` apareceu no schema, migration e verificador, mas não em fluxo de redefinição encontrado.

**Classificação.** Legado/duplicado para `sessoes`; estrutura preparada mas funcionalidade ausente para `password_reset_tokens`. Não remover tabelas sem inventário de consumidores externos.

## 7. Ausente ou fraco no nível do banco

### 7.1 Invariantes monetários e de domínio

Não foram encontradas constraints para garantir, no banco, que:

- valores monetários base, descontos, parcelas e totais sejam não negativos quando o domínio exige isso;
- `valor_total_centavos = ROUND(valor_total * 100)`;
- `valor_pago_centavos` não exceda o autorizado, salvo regra explícita de overpayment;
- percentuais estejam entre 0 e 100;
- datas de vencimento e expiração sejam coerentes;
- estados de reserva, pagamento, hold, OTP e contrato pertençam a conjuntos válidos.

A aplicação valida muitos desses pontos, mas dados importados, scripts, ferramentas administrativas e futuras rotas não terão a mesma proteção.

### 7.2 Consistência entre entidades relacionadas

As seguintes relações são garantidas por convenção de aplicação, mas não por constraints compostas:

- `pagamento_parcelas.reserva_id` deve ser a mesma reserva de `pagamentos.reserva_id`;
- `contrato_validacoes.reserva_id` deve ser a reserva de `contratos_documentos.reserva_id`;
- `otp_desafios.reserva_id` e `contrato_id` devem pertencer à mesma reserva;
- `inventario_holds.lote_id` deve ser o lote de `reservas.lote_id`;
- `pagamentos` e `pagamento_idempotencias` devem conservar a mesma reserva;
- uma versão validada deve continuar apontando para o snapshot e hashes que foram exibidos.

Não é recomendável introduzir constraints compostas sem primeiro medir inconsistências existentes; a ausência deve ser tratada como dívida de integridade, não como autorização para apagar ou corrigir silenciosamente dados.

### 7.3 Imutabilidade de evidências

`contratos_documentos.snapshot`, hashes, validações e eventos não possuem trigger de imutabilidade, política de privilégios ou constraint de formato hexadecimal. A aplicação não oferece rotas normais de edição do snapshot, o que é positivo, mas um usuário de banco ou script com acesso de escrita poderia alterar o conteúdo sem que o banco rejeitasse a operação. Os hashes permitem detecção posterior, não prevenção.

### 7.4 Auditoria fora do contrato

Há trilha para eventos contratuais e descontos administrativos, mas não foi encontrada tabela de auditoria append-only para mudanças de preço, hold, vaga, cupom, status de pagamento, reconciliação, reembolso ou alterações de configuração de pagamento. `atualizado_por` existe em `configuracoes_pagamento`, mas não há histórico de versões de cada mudança.

### 7.5 Verificador de migration com cobertura insuficiente

`scripts/verificar-migration.mjs` confirma tabelas, colunas, nomes de índices, contagem mínima de nove migrations e hash das regras. Ele não verifica definição de índice, se índices são realmente únicos/parciais, FKs e ações `ON DELETE`, constraints `CHECK`, constraints `NOT VALID`, nulabilidade, paridade de centavos, duplicidades históricas ou estados inválidos. Assim, um índice com mesmo nome e definição errada poderia passar.

### 7.6 Recuperação de workers

A outbox usa status `processando`, mas não há lease/timeout para recuperar uma mensagem cujo processo morreu depois de reivindicá-la. O mesmo risco existe para reprocessamento de webhooks em estado intermediário. O índice facilita busca, mas não substitui uma regra de recuperação.

## 8. Recomendações priorizadas para zero regressão

| Prioridade | Ação recomendada | Proteção de dados |
|---|---|---|
| **P0** | Obter snapshot/backup verificável e executar o verificador contra o banco real em modo somente leitura; registrar migrations, constraints, índices, contagens e órfãos. | Não alterar o banco sem conhecer o estado implantado. |
| **P1** | Corrigir a paridade de centavos em todos os caminhos administrativos e auditar divergências decimal/centavos antes de qualquer backfill. | Evita cobrança, reconciliação e auditoria com valores diferentes. |
| **P1** | Resolver o processamento concorrente de webhooks com claim/lock/lease transacional e reprocessamento determinístico. | Evita efeitos duplicados em pagamento, hold e reserva. |
| **P1** | Alinhar `schema.ts`, `server/db/index.ts` e SQL sobre enums, índices únicos e constraints, sem usar `push` destrutivo. | Reduz drift entre instalações novas e bases existentes. |
| **P1** | Validar a FK do hold somente após medir órfãos; documentar e preservar exceções históricas. | Fortalece integridade sem apagar reservas legadas. |
| **P1** | Definir e implementar uma cadeia de hashes realmente encadeada, ou renomear/documentar o mecanismo como hash independente por evento. | Evita falsa sensação de evidência auditável. |
| **P1** | Criar reconciliação por chave idempotente/gateway para cobranças aceitas externamente e não persistidas localmente. | Recupera pagamentos sem duplicar cobranças. |
| **P2** | Inventariar reservas históricas sem ledger, holds, documentos novos e hashes; não inferir valores comerciais ausentes. | Preserva a verdade histórica e torna o legado explícito. |
| **P2** | Consolidar outbox e e-mails legados gradualmente, adicionando chave idempotente ao follow-up antes de migrar consumidores. | Evita envios duplicados e perda de histórico. |
| **P2** | Expandir `verificar-migration.mjs` para definição de constraints, unicidade/parcialidade, FKs, `NOT VALID`, checks e invariantes de dados. | Detecta drift que a contagem de objetos não detecta. |
| **P3** | Adicionar relações Drizzle para as tabelas novas e revisar tabelas sem uso (`sessoes`, reset) após confirmar consumidores externos. | Melhora segurança de manutenção sem tocar nos dados atuais. |

## 9. Evidências de arquivos

As referências abaixo são caminhos locais do repositório inspecionado. Os números de linha correspondem ao estado lido durante esta auditoria.

| ID | Evidência |
|---|---|
| [1] | `server/db/schema.ts`: tabelas, tipos, relações e índices declarativos. |
| [2] | `server/db/index.ts:21-251`: DDL bootstrap duplicado e execução do migrator. |
| [3] | `drizzle/0007_evolucao_comitivas.sql`: contrato, OTP, idempotência, parcelas, webhook e tabelas auxiliares. |
| [4] | `drizzle/0008_contratacao_integridade_operacional.sql`: centavos, estado de checkout, holds, outbox e sessões. |
| [5] | `drizzle/meta/_journal.json`: sequência registrada de `0000` a `0008`. |
| [6] | `scripts/verificar-migration.mjs`: verificação de objetos, histórico e hash das regras. |
| [7] | `server/services/pacoteService.ts`: transação de reserva, vaga, cupom, hold e ledger. |
| [8] | `server/services/inventoryService.ts`: conversão e liberação de holds. |
| [9] | `server/services/contratoService.ts`: snapshot, canonicalização, PDF e eventos. |
| [10] | `server/services/otpService.ts`: hash, expiração, tentativas, validação e outbox. |
| [11] | `server/routes/pagamentos.ts`: idempotência de webhook, reconciliação e centavos. |
| [12] | `server/services/paymentGatewayAdapter.ts`: persistência local e chamada externa da Cora. |
| [13] | `server/routes/admin.ts:698-871`: desconto administrativo e geração administrativa de contrato. |
| [14] | `server/services/notificationOutboxService.ts` e `server/services/followupScheduler.ts`: filas nova e legada. |

## References

[1]: file:///home/ubuntu/comitivas/server/db/schema.ts "Schema Drizzle do banco"
[2]: file:///home/ubuntu/comitivas/server/db/index.ts "Bootstrap e inicialização do banco"
[3]: file:///home/ubuntu/comitivas/drizzle/0007_evolucao_comitivas.sql "Migration 0007"
[4]: file:///home/ubuntu/comitivas/drizzle/0008_contratacao_integridade_operacional.sql "Migration 0008"
[5]: file:///home/ubuntu/comitivas/drizzle/meta/_journal.json "Journal do Drizzle"
[6]: file:///home/ubuntu/comitivas/scripts/verificar-migration.mjs "Verificador de migration"
[7]: file:///home/ubuntu/comitivas/server/services/pacoteService.ts "Serviço de pacotes e reserva"
[8]: file:///home/ubuntu/comitivas/server/services/inventoryService.ts "Serviço de inventário"
[9]: file:///home/ubuntu/comitivas/server/services/contratoService.ts "Serviço contratual"
[10]: file:///home/ubuntu/comitivas/server/services/otpService.ts "Serviço OTP"
[11]: file:///home/ubuntu/comitivas/server/routes/pagamentos.ts "Rotas de pagamentos e webhook"
[12]: file:///home/ubuntu/comitivas/server/services/paymentGatewayAdapter.ts "Adaptador do gateway"
[13]: file:///home/ubuntu/comitivas/server/routes/admin.ts "Rotas administrativas"
[14]: file:///home/ubuntu/comitivas/server/services/notificationOutboxService.ts "Outbox de notificações"

**Nota de preservação:** nenhum código ou banco foi alterado por esta auditoria.

**Autor:** Manus AI

[1] [2] [3] [4] [5] [6] [7] [8] [9] [10] [11] [12] [13] [14]

> As referências `[1]`–`[14]` são arquivos locais; não constituem evidência de estado do banco implantado. A evidência do estado implantado depende de uma conexão autorizada e somente leitura.
