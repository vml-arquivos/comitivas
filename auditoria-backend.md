# Auditoria Backend e cadeia comercial

**Repositório auditado:** `/home/ubuntu/comitivas`
**Escopo:** `server/index.ts`, `server/routes`, `server/services`, `server/types`, com consulta de `server/db/schema.ts`, scripts de migração e testes apenas para validar o comportamento do escopo solicitado.
**Data da inspeção:** 2026-09-05
**Modo:** somente leitura e comandos não destrutivos.

## 1. Conclusão executiva

A área possui uma base funcional relevante para autenticação, RBAC por papéis, CRM de leads, montagem de pacotes, adicionais, cupons, reserva de inventário, contratos com snapshot e hash, OTP, geração de voucher e integração Cora com idempotência e reconciliação. O `typecheck` do servidor, o build do servidor e a suíte unitária existente passaram: 25 testes em 5 arquivos.

A conclusão, entretanto, não é de prontidão operacional sem ressalvas. Há riscos de **regressão financeira, de autorização e de confiabilidade operacional** que devem ser tratados antes de mudanças de produção. Os achados prioritários são: (a) vendedor consegue consultar a jornada de qualquer `usuario_id`, sem filtro de carteira; (b) usuário não autenticado consegue alterar a intenção de qualquer lead conhecendo o `lead_id`; (c) troca de papel de usuário não incrementa `session_version`, permitindo que um token administrativo anterior continue com o papel antigo até expirar; (d) follow-up é registrado como enviado sem chamar o provedor de e-mail; (e) o webhook Cora não possui worker de reprocessamento para os eventos armazenados como pendentes; (f) a configuração de pagamento cai silenciosamente para defaults quando a leitura do banco falha; e (g) há risco de cobrança externa sem registro local se a persistência posterior falhar.

A cadeia de **comissões de promotores/vendedores não está implementada**: há atribuição de leads, links de rastreio, carteira, ranking e conversão, mas não há tabela, serviço, regra, cálculo, fechamento, estorno ou endpoint de comissão. O voucher existe como PDF condicionado a `cliente_confirmado`, porém não há um ciclo completo de voucher com entidade própria, código verificável, check-in, invalidação ou auditoria de uso.

As classificações abaixo distinguem fatos observados no código de inferências de risco. Recomendações são deliberadamente conservadoras e priorizam preservar reservas, pagamentos, contratos, snapshots e ledger já existentes.

## 2. Método, limites e evidências

Foram inspecionados os arquivos do escopo e o schema Drizzle. Foram executados somente comandos de leitura, compilação e testes. Não foram executados servidor, migrações, seeds, scripts de integração contra banco, chamadas Cora, comandos de escrita SQL ou alterações em código.

Verificações executadas:

| Verificação | Resultado |
|---|---|
| `npm run typecheck:server` | Passou sem erros TypeScript |
| `npm run build:server` | Passou; bundle gerado em `dist/index.js` |
| `npm test -- --run` | Passou: 5 arquivos e 25 testes |
| Inspeção de `git diff` no escopo `server/index.ts`, `server/routes`, `server/services`, `server/types` | Nenhuma alteração observada |
| Banco de dados | Não conectado nem alterado durante a auditoria |
| Teste real de Cora, SMTP, WhatsApp ou webhook | Não executado; dependências externas e credenciais não foram exercitadas |

**Caveat do workspace compartilhado:** ao final havia alterações em artefatos de `apps/web/dist` fora do escopo Backend, observadas no `git status`. Elas não foram revertidas para preservar trabalho de terceiros e não foram produzidas por alteração de arquivos `server/*` nesta auditoria. O relatório não atribui essas alterações ao backend.

## 3. Mapa da cadeia auditada

| Domínio | Implementação encontrada | Classificação geral |
|---|---|---|
| Autenticação | cadastro, login, logout, JWT, cookie, reset de senha, refresh e verificação de usuário ativo | Funcionando com lacunas de sessão/RBAC |
| RBAC | `cliente`, `vendedor`, `admin`; `requireRole`; escopo parcial de carteira | Parcial; há quebra de escopo em jornada e invalidação incompleta de papel |
| Eventos e lotes | leitura pública, CRUD administrativo, validações básicas e soft-disable de evento | Funcionando de forma básica; validação de entrada e preservação precisam reforço |
| Pacotes e adicionais | cálculo por banco, Decimal, vínculo ao lote, ledger e hold | Funcionando no caminho principal |
| Cupons | percentual/fixo, validade, limite e consumo transacional | Funcionando no caminho principal; regras administrativas são incompletas |
| Reservas e pricing | criação transacional, preço em centavos, `precosLedger`, hold de 30 minutos | Funcionando com riscos de consistência e legado de modelo |
| Promotores, links e leads | link, atribuição, carteira, kanban, intenção e ranking | Parcial; comissão ausente e autorização de jornada incorreta |
| Contratos | snapshot versionado, hash, PDF, eventos, OTP e validação única | Funcionando e relativamente robusto |
| Pagamentos Cora | mTLS, PIX/boleto, idempotência local, parcelas, consulta e webhook HMAC | Parcial; há riscos financeiros e de reprocessamento |
| OTP | hash, expiração, limite de tentativas, single-use e trilha de eventos | Funcionando no desenho observado |
| Voucher | PDF para proprietário/admin somente após `cliente_confirmado` | Parcial; ciclo operacional do voucher está ausente |
| Notificações/follow-up | outbox com retry; scheduler de holds e follow-up | Outbox funcionando; follow-up legado/simulado e webhook sem worker |

## 4. O que está funcionando

### 4.1 Autenticação e fundamentos de segurança

**Fato:** `server/index.ts` aplica Helmet, limite de corpo JSON, CORS com allowlist, `credentials: true`, rate limits separados para autenticação, OTP e webhook, além de capturar `rawBody` para assinatura de webhook.[1] `AuthService` exige `JWT_SECRET` em produção, usa bcrypt e valida JWT. O middleware consulta no banco se o usuário está ativo e compara `session_version` quando presente.[2]

**Fato:** cadastro normaliza e-mail, CPF e telefone, usa hash de senha e grava usuário e lead em uma única transação. Login diferencia credencial inválida de usuário desativado sem revelar se o e-mail existe. Reset de senha grava apenas o hash do token, exige expiração, uso único e incrementa `session_version`.[3]

**Avaliação:** o caminho nominal de autenticação está implementado e possui testes unitários aprovados. A existência de cookie HTTP e bearer token atende clientes diferentes, mas a política de exposição do token no corpo da resposta deve ser mantida sob revisão no frontend.

### 4.2 RBAC nominal e ownership em áreas críticas

**Fato:** o router administrativo autentica todas as rotas, permite `dashboard` a admin/vendedor e aplica `requireRole("admin")` às demais rotas administrativas.[4] Cupons, criação/edição de eventos, lotes e pacotes exigem admin. Rotas de reserva, status de pagamento, contrato, download e voucher conferem o `usuario_id` da reserva ou permitem admin.[5]

**Fato:** listagem de reservas do cliente usa `where(reservas.usuario_id = req.usuario.id)`. O detalhe de reserva, status de pagamento, visualização contratual e voucher rejeitam acesso de outro cliente. Esse padrão reduz risco direto de IDOR nos endpoints verificados.

**Avaliação:** o RBAC por papel é claro e centralizado, mas não constitui autorização de carteira completa. Os desvios são tratados em “Errado/quebrado”.

### 4.3 Pricing, pacotes, adicionais, cupons e hold

**Fato:** `PacoteService.calcularValorPacote` recarrega lote, evento, pacote e adicionais no banco; valida que pacote e adicionais pertencem ao lote e estão ativos; usa `Decimal`; aplica cupom do mesmo evento, validade e limite; limita o desconto ao subtotal.[6]

**Fato:** `reservarPacote` usa transação, bloqueia o lote com `FOR UPDATE`, decrementa vagas com condição `vagas_disponíveis > 0`, incrementa uso do cupom sob condição de limite e cria hold de inventário de 30 minutos. Também registra linhas em `precosLedger`, incluindo pacote, adicionais e desconto de cupom.[7]

**Fato:** o scheduler chama `InventoryService.liberarExpirados`, que bloqueia holds expirados, libera vagas, reduz uso do cupom e marca a reserva como `abandonado`/`expirado`. Isso é uma proteção importante para não deixar estoque permanentemente retido.[8]

**Avaliação:** o caminho transacional de estoque e preço é uma das partes mais maduras do backend. Não se deve substituir esse fluxo por updates diretos ou recalcular uma reserva histórica a partir do preço atual.

### 4.4 Contratos, snapshot, OTP e integridade documental

**Fato:** o serviço cria snapshot versionado da venda, calcula hash SHA-256, invalida versões pendentes anteriores, registra evento de preparação e persiste o cronograma de pagamento na reserva.[9]

**Fato:** OTP procura o desafio mais recente não utilizado, exige status de envio, verifica expiração, conta tentativas e compara hash do código. A confirmação ocorre em transação, atualiza o contrato condicionalmente para impedir dupla validação, marca o OTP como usado, grava PDF com modo `0600`, registra hash do PDF, aceites, canal, IP, user agent e evento de assinatura.[10]

**Avaliação:** o mecanismo de contrato preserva evidência e evita sobrescrever o documento validado. O endpoint antigo `/contratos/aceitar/:reserva_id` está explicitamente convertido em compatibilidade para apenas preparar uma versão aguardando OTP, o que evita aceite silencioso sem segundo fator.

### 4.5 Pagamentos Cora e idempotência nominal

**Fato:** a integração Cora usa certificado/chave mTLS, valida caminhos dos certificados, aceita somente valores a partir de R$ 5,00, suporta cobrança PIX/boleto e carnê no provider, e utiliza chave de idempotência nas chamadas.[11]

**Fato:** `PaymentGatewayAdapter` persiste `idempotency_key`, `gateway_id`, resposta bruta, valores em centavos e parcelas. Conflito de chave recupera o pagamento existente, o que reduz duplicidade em reenvios do cliente.[12]

**Fato:** o webhook verifica HMAC em produção, armazena o payload, usa `evento_id` único para deduplicação, consulta a Cora antes de reconhecer evento pago e reconcilia parcelas em transação.[13]

**Avaliação:** existe uma base correta de integração financeira. Os problemas indicados adiante estão na transição entre estados, nos casos de falha e na cobertura operacional, não na ausência total de controles.

### 4.6 Testes e build

**Fato:** os testes existentes cobrem autenticação, layout/PDF de contrato, HTML contratual, serviço contratual e configuração do gateway. Todos os 25 testes passaram. O servidor também passou no typecheck e no build.

**Inferência:** isso demonstra consistência sintática e cobertura unitária dos módulos testados, mas não demonstra que o fluxo completo de reserva, Cora, webhook, SMTP, concorrência PostgreSQL ou escopo de vendedor esteja correto em runtime. Não há teste automatizado suficiente para os achados de autorização listados abaixo.

## 5. Incompleto

### I-01 — Comissão de promotores/vendedores ausente do ciclo financeiro — prioridade P1

**Fato:** existem `leads_origem.vendedor_id`, geração de link, carteira, ranking e status `cliente_confirmado`, mas não há tabela de comissões, percentual/regra, evento de apuração, valor devido, pagamento ao vendedor, estorno ou endpoint de relatório/fechamento. A busca por `comiss`/`commission` no backend não encontrou implementação de domínio.

**Inferência:** a aplicação acompanha atribuição comercial, mas não consegue transformar conversão em obrigação financeira auditável. Qualquer comissão calculada fora do backend não terá vínculo transacional com pagamento, cancelamento ou reembolso.

**Ação segura:** antes de criar novas regras, especificar uma tabela append-only de lançamentos por reserva/pagamento, com versão da regra, base em centavos, status, vendedor, estorno e idempotência. Não alterar reservas históricas para introduzir a comissão.

### I-02 — Voucher sem ciclo operacional completo — prioridade P1

**Fato:** `/contratos/voucher/:reserva_id` gera PDF somente para o proprietário/admin e quando `reservas.status === "cliente_confirmado"`.[14] Não há tabela de voucher, código independente, endpoint de validação no embarque, check-in, revogação, reemissão ou registro de uso.

**Inferência:** o PDF serve como documento de embarque, mas a equipe não consegue validar de modo transacional se o voucher foi usado ou invalidado. O ID da reserva é usado diretamente como código exibido.

**Ação segura:** manter o PDF e adicionar uma entidade/ledger de emissão e uso sem mudar o documento já emitido; criar validação idempotente e trilha de auditoria.

### I-03 — Webhook Cora armazenado para retry, mas sem processador de retry — prioridade P1

**Fato:** falhas gravam `ultimo_erro` e `proxima_tentativa` em `webhook_eventos`, mas o scheduler observado só libera inventário, processa outbox de notificações e executa follow-ups. Não há chamada a um `WebhookService` ou rotina que busque eventos com `proxima_tentativa <= agora`.

**Inferência:** após uma falha transitória, o registro fica com metadados de retry, mas não há evidência de que seja processado automaticamente. Isso pode deixar pagamento confirmado na Cora sem confirmação local e sem liberar a próxima etapa.

**Ação segura:** implementar worker idempotente que reutilize o payload armazenado, preserve `tentativas`, mantenha deduplicação e nunca reconcilie valor apenas com base no payload sem consulta/autenticação no gateway.

### I-04 — Validação de entrada não é sistemática — prioridade P1

**Fato:** as rotas usam `req.body` diretamente. Há validações pontuais, mas eventos aceitam datas convertidas sem verificar `Invalid Date` ou ordem; pacotes e cupons não validam uniformemente valores finitos, positivos, limites e exclusividade entre desconto percentual/fixo. Não há schema runtime comum nos arquivos auditados.

**Inferência:** dados inválidos podem chegar ao banco ou retornar 500 em vez de erro de negócio estável. Em pricing, isso é risco de preço incorreto e de divergência entre frontend e backend.

**Ação segura:** adicionar validação de entrada somente na borda, com mensagens compatíveis, sem reprocessar ou normalizar silenciosamente registros antigos.

### I-05 — Canais e métodos financeiros declarados não coincidem com o checkout — prioridade P1

**Fato:** tipos compartilhados aceitam `credito` e `debito`; `ReservaData` também menciona crédito. O adapter/provider conhece `boleto_pix` e `carne`. Porém as rotas de contrato e pagamento aceitam somente `pix` e `boleto` e retornam que o checkout Cora oferece apenas esses dois métodos.

**Inferência:** parte do modelo é de uma arquitetura anterior ou de uma expansão não concluída. Consumidores que seguem os tipos podem enviar métodos que sempre falham no endpoint.

**Ação segura:** documentar formalmente o conjunto suportado e separar tipos “legados” dos tipos de produção antes de remover campos ou migrar dados.

### I-06 — Outbox de notificação não cobre todo o legado de follow-up — prioridade P1

**Fato:** há um `NotificationOutboxService` com claim concorrente, retry exponencial e envio via `EmailService`. Entretanto o `FollowupScheduler` usa outro caminho (`enviarFollowup`) que registra diretamente em `emails_enviados`.

**Inferência:** existem dois mecanismos de notificação com semânticas diferentes. O novo outbox é idempotente/reprocessável; o follow-up legado não é. A duplicidade de caminhos aumenta risco de comportamento divergente.

**Ação segura:** manter registros existentes e migrar apenas o produtor de novos follow-ups para o outbox, com chave idempotente derivada de `reserva_id` e etapa.

## 6. Errado ou quebrado

### B-01 — Vendedor consegue consultar a jornada de qualquer cliente — prioridade P1, confidencialidade/RBAC

**Fato:** `GET /api/jornada/cliente/:usuario_id` exige apenas `requireRole("admin", "vendedor")`, depois busca lead e reservas pelo `usuario_id` recebido. Não há condição `leads_origem.vendedor_id = req.usuario.id` para vendedor.[15]

**Impacto:** um vendedor autenticado que conheça ou enumere um `usuario_id` pode ver nome, e-mail, origem, status e valores de reservas de outra carteira. Isso contradiz o escopo aplicado no kanban e no dashboard.

**Correção segura:** para vendedor, resolver primeiro a carteira por `leads_origem.vendedor_id` e rejeitar se o cliente não estiver atribuído; admin mantém acesso amplo. Criar teste de matriz admin/vendedor/cliente antes de alterar a rota.

### B-02 — Endpoint público altera intenção de qualquer lead pelo ID — prioridade P1, integridade comercial

**Fato:** `PATCH /api/publico/leads/:lead_id/intencao` não usa autenticação e atualiza `lote_id`, `pacote_id` e `status` apenas pelo ID do lead. Ele valida a combinação lote/pacote, mas não prova posse do lead, sessão, token de captação ou vínculo com o navegador.[16]

**Impacto:** o ID pode ser alterado por terceiros, causando perda de atribuição de produto/etapa e adulteração do CRM. O endpoint não expõe dados pessoais na resposta, mas ainda modifica dados comerciais.

**Correção segura:** usar token de intenção de uso único/curta duração emitido na captura, ou exigir autenticação e verificar usuário. Não confiar em `lead_id` fornecido pelo cliente.

### B-03 — Alteração de papel não revoga tokens administrativos existentes — prioridade P1, RBAC

**Fato:** o middleware compara `session_version`, mas `PATCH /api/admin/usuarios/:id/status` só altera `ativo`; a atualização administrativa de usuário pode alterar `tipo` e senha sem incrementar `session_version`.[17] Login e reset de senha criam tokens com a versão corrente, mas a alteração de papel não a incrementa.

**Impacto:** um usuário rebaixado de admin/vendedor pode continuar usando um JWT anterior com o papel antigo até sua expiração. Isso é uma falha real de revogação de privilégio, embora a desativação completa bloqueie o usuário pelo campo `ativo`.

**Correção segura:** incrementar `session_version` na mesma transação de qualquer mudança de papel, senha administrativa ou outra mudança de privilégio. Não invalidar sessões por limpeza destrutiva; a comparação de versão é suficiente.

### B-04 — Follow-up é marcado como enviado sem envio de e-mail — prioridade P1, comunicação falsa

**Fato:** `FollowupScheduler.enviarFollowup` contém o comentário “enviar e-mail (simulado aqui)”, apenas faz `console.log` e insere `emails_enviados` com `enviado_em` preenchido; não chama `EmailService`.[18]

**Impacto:** o CRM informa envio que não ocorreu, o cliente não recebe o lembrete e a verificação posterior não tenta novamente porque encontra o registro. Isso é comportamento incorreto, não apenas uma limitação de configuração SMTP.

**Correção segura:** encaminhar follow-ups ao outbox existente; só gravar `enviado_em` após confirmação do provider. Registros históricos falsamente marcados devem ser preservados e identificados por uma migração/auditoria separada, não apagados.

### B-05 — Fallback silencioso de configuração pode aplicar pricing incorreto — prioridade P1, financeiro

**Fato:** `ConfiguracaoService.obterConfiguracoesPagamento` captura qualquer erro de leitura e retorna defaults (`PIX 5%`, crédito 10 parcelas, boleto 20 meses), permitindo que checkout/contrato continuem mesmo com tabela indisponível ou banco em falha.[19]

**Impacto:** um erro de infraestrutura ou migração pode produzir condição de pagamento diferente da configuração operacional vigente. Como o valor é congelado no contrato, a divergência pode se tornar evidência contratual.

**Correção segura:** diferenciar “linha inexistente” de “banco indisponível”; defaults somente no bootstrap explicitamente controlado. Em indisponibilidade, falhar fechado e não preparar contrato/pagamento.

### B-06 — Risco de cobrança externa sem persistência local durável — prioridade P1, financeiro

**Fato:** a rota chama `PaymentGatewayAdapter.criarPagamento` antes de atualizar o estado da reserva; o adapter chama a Cora antes de inserir o registro local de `pagamentos`.[20] Se a Cora aceitar e a inserção local falhar, a resposta pode ser 502 apesar de existir cobrança externa.

**Inferência:** uma repetição pode depender de a Cora respeitar a mesma chave de idempotência; não há garantia local até a inserção posterior. O desenho não apresenta outbox de cobrança ou reconciliação por chave sem registro de pagamento.

**Correção segura:** persistir uma intenção de cobrança com chave única antes da chamada externa, usar estado `criacao_em_andamento`, retomar/reconciliar por chave e nunca criar nova cobrança automaticamente sem consultar a anterior.

### B-07 — Regras de webhook não são consistentes para todos os status — prioridade P1

**Fato:** a consulta de status considera `PAID` e `PAID_OUT`; o webhook só reconhece como pago quando o tipo contém `paid` e o status remoto é exatamente `PAID`.[21] Eventos sem recurso correspondente ou tipos desconhecidos são marcados como processados sem erro após a passagem pelo handler.

**Impacto:** um status final aceito pela consulta pode não ser aplicado no webhook. Eventos desconhecidos podem desaparecer da fila sem alerta acionável. A consequência possível é reserva não confirmada ou reconciliação atrasada.

**Correção segura:** centralizar mapeamento de status, manter estados desconhecidos como `recebido_nao_classificado`, não marcá-los como processados silenciosamente e gerar métrica/alerta. Reprocessamento deve ser idempotente.

### B-08 — Follow-up permite corrida entre instâncias e não usa janela de envio dedicada — prioridade P2

**Fato:** o scheduler consulta reservas e depois verifica se existe e-mail anterior, sem lock ou chave única em `emails_enviados`.[22] O schema não possui constraint única para `(reserva_id, tipo)`.

**Impacto:** duas instâncias ou duas execuções concorrentes podem enviar/registrar o mesmo follow-up. O impacto é duplicidade de comunicação e histórico inconsistente.

**Correção segura:** usar outbox com chave idempotente e claim transacional. Não adicionar constraint destrutiva antes de auditar duplicados existentes.

### B-09 — Última reserva do vendedor é obtida sem ordenação — prioridade P2

**Fato:** em `/jornada/vendedor/clientes`, a consulta de reservas filtra pelo cliente e usa `.limit(1)` sem `orderBy`. O retorno chamado de “última reserva” não é determinístico.[23]

**Impacto:** o CRM pode exibir status antigo e ranking/atendimento podem tomar decisão sobre a reserva errada.

**Correção segura:** ordenar por `atualizado_em` ou `criado_em` descendente, explicitando a regra de negócio; não modificar dados anteriores.

### B-10 — Entrada administrativa de cupons pode gerar erro ou regra ambígua — prioridade P2

**Fato:** criação verifica existência comparando o código recebido antes de `toUpperCase`, embora grave o código em maiúsculo. Atualização usa operadores truthy, portanto não consegue limpar alguns valores para zero/nulo; também não impede que percentual e fixo coexistam. A precedência de cálculo usa percentual quando ambos existem.[24]

**Impacto:** duplicata em caixa diferente pode retornar 500 em vez de 409, e alterações administrativas podem manter desconto antigo ou aplicar uma regra diferente da pretendida.

**Correção segura:** normalizar antes de consultar, validar exatamente uma modalidade de desconto, aceitar explicitamente `null`/zero conforme regra e criar testes de contrato de API.

### B-11 — JSONB de itens da reserva é gravado como string — prioridade P2, integridade de dados

**Fato:** `reservarPacote` persiste `itens_selecionados: JSON.stringify(calculo.itens_selecionados)` em uma coluna `jsonb`; o serviço contratual possui lógica defensiva para fazer parse quando o valor chega como string.[25]

**Inferência:** dependendo da serialização do driver, o banco pode armazenar um JSONB string em vez de um array JSON. O fato de o leitor aceitar ambos indica compatibilidade criada para esta inconsistência.

**Correção segura:** confirmar o tipo real em uma cópia/consulta somente leitura antes de corrigir; para novos registros, persistir o objeto/array nativo. Não reescrever reservas antigas sem snapshot e hash de comparação.

## 7. Legado ou duplicado

### L-01 — Tipos compartilhados não são o contrato efetivo das rotas — prioridade P2

`server/types/index.ts` contém `ReservaData`, `PagamentoData`, `ContratoData`, `EmailData` e `PagamentoGatewayResponse`, mas quase nenhum desses tipos é usado pelas rotas; o adapter possui sua própria interface de pagamento. Os tipos aceitam `credito`/`debito` enquanto o checkout ativo aceita apenas PIX/boleto. Isso é legado/duplicação e aumenta risco de consumidores implementarem um contrato inexistente.

### L-02 — Prefixo `preco_versao` mistura legado e produção — prioridade P2

O schema define default `legado-2026.1`, enquanto a reserva criada pelo novo serviço grava `2026.1` e o ledger usa metadado `preco_versao: "2026.1"`. O campo deve ser tratado como parte da evidência histórica; não renomear nem reprocessar sem preservar valores antigos. Recomenda-se definir um catálogo formal de versões futuras e marcar explicitamente o formato antigo como compatibilidade.

### L-03 — Endpoint `/contratos/aceitar` é compatibilidade, não aceite direto — prioridade P2

O próprio código declara que o endpoint antigo apenas prepara versão aguardando OTP. A existência não é, por si, um defeito, mas frontend e documentação não devem tratá-lo como aceite concluído. A rota nova de OTP deve ser o caminho canônico; manter o endpoint apenas enquanto clientes antigos forem identificados.

### L-04 — Dois caminhos de notificação coexistem — prioridade P1

`NotificationOutboxService` implementa retry e idempotência, enquanto `FollowupScheduler` grava e-mail diretamente. É uma duplicação funcional com semântica incompatível. A consolidação deve ser feita por migração de produtores, não por deleção de histórico.

### L-05 — Provider Cora suporta mais métodos que o checkout público

`CoraPaymentProvider` implementa `boleto_pix` e `carne`, mas as rotas de contrato/pagamento rejeitam esses métodos. Isso pode ser código preparado para uma fase futura ou resquício de fluxo anterior. Antes de ativar qualquer método, é obrigatório alinhar contrato, snapshot, cronograma, webhook, parcelas e testes de reconciliação.

## 8. Ausente

1. **Comissões:** entidade financeira, regra versionada, cálculo, aprovação, pagamento, estorno, relatório e idempotência.
2. **Voucher operacional:** tabela/ledger de emissão, QR ou código independente, validação de embarque, check-in, invalidação, reemissão e auditoria de uso.
3. **Worker de reprocessamento de webhooks Cora:** a tabela possui campos de retry, mas não foi encontrada rotina que os consuma.
4. **Reembolso e reversão de pagamento:** existe `cancelarPagamento` no adapter/provider, mas não há rota de negócio, autorização, ledger de estorno ou reconciliação para cancelamento financeiro iniciado pela operação.
5. **Cancelamento/alteração de reserva pelo cliente:** há expiração automática do hold, mas não há fluxo explícito de cancelamento, política aplicada, liberação de pagamento ou estorno.
6. **Política de cupom por cliente/reserva:** não há limite por usuário, período, produto mínimo, combinação de cupons ou histórico de tentativas; há apenas contador global `uso_atual`.
7. **Permissões finas:** o RBAC tem três papéis e não possui permissões por evento, carteira, operação financeira, desconto ou leitura de dados sensíveis.
8. **Sessão persistida como fonte de verdade:** existe tabela `sessoes`, mas os fluxos observados usam JWT e `session_version`; não há criação/revogação de registros dessa tabela no login/logout/refresh.
9. **Validação de contrato contra alteração de preço/pagamento durante o checkout:** há snapshot e versão contratual, mas a superfície de configuração permite mudar regras globais; é necessário explicitar a política de congelamento e impedir que uma nova configuração altere documento já preparado.
10. **Testes de integração de autorização e concorrência:** faltam casos de vendedor fora da carteira, token após mudança de papel, dois holds concorrentes, cupom no limite, cobrança externa com falha local, webhook duplicado/PAID_OUT e follow-up em duas instâncias.

## 9. Prioridade de correção com preservação de dados

### P0/P1 — antes de ativar ou ampliar operação financeira

1. Corrigir autorização de `/jornada/cliente/:usuario_id` e proteger a intenção de lead com token/autenticação. Adicionar testes de isolamento entre carteiras.
2. Incrementar `session_version` em mudança de papel e senha administrativa, mantendo JWTs e dados existentes intactos.
3. Impedir que follow-up seja marcado como enviado sem provider confirmado; migrar o produtor para outbox idempotente.
4. Implementar worker de retry de webhook e status desconhecido, mantendo cada payload original e seus hashes/contadores.
5. Fazer o checkout falhar fechado quando o banco não puder ler a configuração de pagamento; defaults devem ser usados somente em bootstrap claramente identificado.
6. Projetar a intenção de cobrança local antes da chamada Cora e rotina de reconciliação por chave para evitar cobrança órfã.
7. Especificar e implementar comissões como ledger separado, sem alterar o valor histórico da reserva.

### P2 — depois de estabilizar pagamentos e autorização

8. Centralizar validação runtime de eventos, lotes, pacotes, adicionais, cupons e métodos de pagamento.
9. Corrigir ordenação da “última reserva”, normalização case-insensitive de cupons e inconsistência de JSONB para novos registros.
10. Formalizar versões de preço e separar tipos de compatibilidade dos contratos ativos.
11. Definir o ciclo de voucher e o fluxo de cancelamento/estorno antes de liberar operações de embarque em escala.
12. Expandir testes de integração com PostgreSQL temporário e mocks controlados de Cora/SMTP/WhatsApp.

### Guardrails de implantação

- Fazer backup e snapshot lógico antes de qualquer migração.
- Não apagar `precosLedger`, `contratosDocumentos`, `contratoValidacoes`, `webhookEventos`, `emails_enviados` ou pagamentos históricos.
- Preferir novas colunas/tabelas append-only e backfill verificável a updates destrutivos.
- Introduzir correções de autorização primeiro, pois não alteram dados financeiros.
- Para pagamentos, executar primeiro em modo stage com idempotência e cenários de timeout, resposta duplicada, `PAID_OUT`, cancelamento e falha de banco.
- Comparar contagem e soma em centavos de reservas, pagamentos, parcelas, holds e uso de cupons antes e depois de qualquer rollout.
- Não transformar um registro histórico de “enviado” em “não enviado” sem marcação de auditoria; corrigir o produtor para os próximos eventos e gerar relatório de inconsistências.

## 10. Referências de código

[1]: server/index.ts "Middleware, CORS, rate limits e montagem das rotas"
[2]: server/middleware/authMiddleware.ts "Validação de JWT, usuário ativo, session_version e requireRole"
[3]: server/routes/auth.ts "Cadastro, login, reset de senha e refresh"
[4]: server/routes/admin.ts "Escopo de dashboard e aplicação de RBAC administrativo"
[5]: server/routes/pacotes.ts "Ownership de reservas e listagens do cliente"
[6]: server/services/pacoteService.ts "Cálculo de pacote, adicionais e cupons"
[7]: server/services/pacoteService.ts "Reserva transacional, hold e precosLedger"
[8]: server/services/inventoryService.ts "Expiração de hold e liberação de estoque"
[9]: server/services/contratoService.ts "Snapshot, versões, hashes e preparação contratual"
[10]: server/services/otpService.ts "OTP, tentativas, expiração e validação de contrato"
[11]: server/services/coraPaymentProvider.ts "mTLS, cobrança Cora, PIX, boleto e carnê"
[12]: server/services/paymentGatewayAdapter.ts "Idempotência local e persistência de pagamento"
[13]: server/routes/pagamentos.ts "HMAC, deduplicação e webhook Cora"
[14]: server/routes/contratos.ts "Acesso e geração do voucher"
[15]: server/routes/jornada.ts "Carteira, jornada de cliente e ranking"
[16]: server/routes/publico.ts "Captura pública de leads e intenção"
[17]: server/routes/admin.ts "Alterações administrativas de usuário e status"
[18]: server/services/followupScheduler.ts "Follow-up legado marcado como enviado"
[19]: server/services/configuracaoService.ts "Fallback de configuração de pagamento"
[20]: server/routes/pagamentos.ts "Criação de cobrança e transição da reserva"
[21]: server/routes/pagamentos.ts "Consulta de status e processamento de webhook"
[22]: server/services/followupScheduler.ts "Consulta e registro de follow-up"
[23]: server/routes/jornada.ts "Consulta sem ordenação da última reserva"
[24]: server/routes/cupons.ts "Criação e atualização administrativa de cupons"
[25]: server/services/pacoteService.ts "Persistência de itens selecionados e ledger"

## 11. Resumo final por classificação

**Funcionando:** autenticação nominal, hash de senha, reset com token de uso único, verificação de usuário ativo, RBAC básico, ownership de reservas/contratos/voucher em rotas principais, cálculo Decimal, validação de pacote/adicional/cupom, lock de inventário, hold expirável, ledger de preço, snapshot/hash contratual, OTP com tentativas/expiração/single-use, Cora mTLS/idempotência nominal, deduplicação HMAC de webhook, outbox de notificação e testes/build/typecheck.

**Incompleto:** comissões, ciclo operacional do voucher, retry real de webhook, validação runtime uniforme, alinhamento de métodos financeiros, consolidação do outbox, política avançada de cupom e cobertura de integração/concorrência.

**Errado/quebrado:** escopo de jornada de vendedor, mutação pública de intenção de lead, revogação incompleta após alteração de papel, follow-up falsamente marcado como enviado, fallback silencioso de pricing, risco de cobrança sem persistência local, mapeamento incompleto de status de webhook, corrida de follow-up, “última reserva” sem ordenação, regras administrativas de cupom ambíguas e possível JSONB armazenado como string.

**Legado/duplicado:** tipos compartilhados não usados, `preco_versao` legado, endpoint de aceite compatível, dois caminhos de notificação e métodos Cora não expostos pelo checkout.

**Ausente:** comissão financeira, voucher verificável/check-in, worker de webhook, refund/reversal, cancelamento de reserva, permissões finas, sessão persistida efetiva e testes de integração dos riscos críticos.
