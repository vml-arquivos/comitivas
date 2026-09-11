# Auditoria Técnica Consolidada

**Repositório:** `/home/ubuntu/comitivas`
**Data da consolidação:** 5 de setembro de 2026
**Modo:** consolidação de auditorias estáticas, resultados de comandos não destrutivos e resultados JSON fornecidos.
**Objetivo:** registrar o que está funcionando, o que está incompleto, o que está errado, o que é legado/duplicado e o que está ausente, sem inventar funcionalidades, e propor uma sequência segura de implementação com migrations forward-only e testes.

> **Conclusão executiva.** O repositório tem uma base funcional relevante no caminho web/backend: autenticação, autorização nominal, pricing transacional, holds de inventário, contratos com snapshots e OTP, emissão protegida de voucher em PDF, integração Cora com controles importantes, outbox contratual, migrations registradas e build web/server localmente aprovados. Isso não equivale a prontidão operacional ou financeira.
>
> Os bloqueios mais urgentes são de autorização, integridade monetária, transição de estados financeiros, configuração de produção e entrega mobile. Um vendedor pode consultar a jornada de cliente fora da própria carteira; uma rota pública pode alterar a intenção de qualquer lead pelo ID; alterações administrativas de papel não revogam tokens anteriores; follow-up pode ser marcado como enviado sem envio de e-mail; configurações de pagamento podem cair silenciosamente em defaults; uma cobrança Cora pode existir sem persistência local durável; webhooks podem ser processados concorrentemente; e o checkout web pode mostrar o desconto PIX duas vezes. O mobile não compila no estado auditado.
>
> A inspeção do banco foi somente estática. A conexão de leitura ao banco configurado falhou. Portanto, não se afirma que a base implantada contém todas as migrations, índices, constraints, backfills ou dados esperados. **Nenhuma migration, alteração de código, seed, cobrança, chamada Cora, deploy ou alteração de banco foi executada nesta consolidação.**

## 1. Escopo, método e regra de classificação

Foram consolidados os relatórios de backend e cadeia comercial, banco e migrations, frontend web/mobile, segurança/Cora/deploy e testes/documentação. Também foram considerados os resultados JSON fornecidos para essas áreas. Os relatórios registram inspeção do código, SQL, manifests, scripts, documentação, testes locais e typecheck, sem alteração deliberada de código ou banco.

As categorias abaixo descrevem o estado observado, não uma promessa de produto:

| Categoria | Significado neste documento |
|---|---|
| **Funcionando** | O caminho foi observado no código ou passou em uma verificação local indicada. Não significa que tenha sido validado contra o banco, Cora, SMTP, Coolify ou dispositivo real. |
| **Incompleto** | Existe uma parte implementada, mas faltam controles, cenários, integração, cobertura ou decisão operacional para declarar o fluxo completo. |
| **Errado/quebrado** | O comportamento observado contradiz a regra esperada, falha em build/teste, permite uma operação indevida ou cria divergência material. |
| **Legado/duplicado** | Há outra fonte ou implementação concorrente, ou o artefato descreve uma geração anterior. O histórico deve ser preservado até inventário; não se recomenda apagar em lote. |
| **Ausente** | Não foi encontrada implementação, proteção, teste ou evidência para a capacidade descrita. “Não encontrado” não significa que exista uma impossibilidade externa não auditada. |

A palavra **P0** indica bloqueio antes de promoção/publicação ou risco de exposição, configuração insegura ou perda de integridade. **P1** indica correção prioritária antes de ampliar operação financeira ou comercial. **P2** indica dívida importante após estabilização dos bloqueios. **P3** indica endurecimento ou limpeza posterior.

## 2. Funcionando

### 2.1 Backend e cadeia comercial

A autenticação nominal está implementada com bcrypt, JWT, cookie HTTP e Bearer, verificação de usuário ativo, reset de senha com token armazenado por hash, expiração, uso único e rate limit. O middleware consulta `session_version`, o que fornece uma base para revogação por versão quando a versão é incrementada corretamente.

O RBAC básico distingue `cliente`, `vendedor` e `admin`. As principais rotas de reserva, pagamentos, contratos, downloads e voucher verificam propriedade da reserva ou permitem acesso administrativo. O router administrativo possui autenticação global e exige papel administrativo nas operações sensíveis. Esse padrão reduz IDOR nas rotas auditadas, embora não resolva o vazamento específico da jornada de cliente classificado como errado.

O cálculo de pacote, adicionais e cupom recarrega dados do banco, valida o vínculo com lote/evento, usa `Decimal`, limita o desconto ao subtotal e registra o preço. A criação de reserva usa transação, `FOR UPDATE` no lote, decremento condicional de vagas, hold de aproximadamente 30 minutos, consumo transacional de cupom e `precos_ledger`. A liberação de holds expirados usa lock e `SKIP LOCKED`, devolve vagas de forma limitada e preserva o histórico da reserva.

O fluxo de contrato cria snapshot canonizado e versionado, hashes do snapshot e do PDF, versões de conteúdo legal, eventos, PDF e OTP com expiração, limite de tentativas, cooldown, HMAC/pepper e uso único. A confirmação persiste documento, validação, hashes e notificação em transação. O arquivo criado é removido quando a transação falha após a geração.

A integração Cora possui mTLS, validação de configuração, PIX/boleto no caminho de checkout, parcelas, consulta, idempotência nominal, HMAC configurável e deduplicação nominal de webhook. O adapter grava chave de idempotência, gateway, resposta e valores em centavos. Esses controles reduzem duplicidade no caminho normal, mas não fecham todos os casos concorrentes e de falha entre gateway e banco.

A `NotificationOutboxService` possui claim, retry exponencial e idempotência para notificações contratuais. O typecheck do servidor, o build do servidor e a suíte Vitest observada passaram: **25 testes em 5 arquivos**. Esses resultados validam apenas os cenários cobertos, não o fluxo completo de produção.

### 2.2 Banco e migrations

O journal do Drizzle contém nove entradas correspondentes às migrations `0000`–`0008`, em ordem, sem arquivos SQL órfãos observados. As migrations recentes usam predominantemente operações forward-only e idempotentes, como `IF NOT EXISTS`; a `0008` não contém `DELETE` nem `TRUNCATE`.

O modelo de banco possui estruturas para usuários, eventos, lotes, pacotes, adicionais, cupons, reservas, pagamentos, parcelas, contratos, evidências, OTP, eventos contratuais, consentimentos, ledger de preços, holds, outbox, sessões, tokens de reset, idempotência, webhooks e descontos administrativos. Há chaves, índices e unicidades importantes para reserva, contrato, parcela, gateway, webhook, hold e outbox.

A reserva, o hold, o consumo de cupom e o ledger de preços são gravados no mesmo fluxo transacional observado. A criação de contrato e a confirmação OTP também agrupam alterações relevantes e notificações em transação. A migration de centavos faz backfill conservador para campos nulos e a migration de estado de checkout preserva o fluxo novo sem reescrever toda a história.

O conteúdo runtime das Regras de Convivência 2026.1 coincide com o hash declarado na migration auditada. Isso é uma evidência positiva para essa versão legal específica, não uma validação geral de todas as versões ou do banco implantado.

### 2.3 Frontend web e segurança HTTP

O web passou `npx tsc --noEmit` e `npm run build`. Há páginas públicas, autenticação, configurador, checkout, contrato/OTP, confirmação, reservas, downloads e seções administrativas. As chamadas frontend auditadas possuem handlers correspondentes no servidor.

O configurador envia itens e cupom para cálculo/reserva no servidor, preserva a intenção e valida o destino de retorno. O checkout mantém chave de idempotência persistente por reserva. O servidor permanece como autoridade para cálculo da reserva e valor enviado ao gateway, embora a apresentação PIX tenha um erro de duplicação tratado adiante.

O web possui proteção de rota por perfil, proteção server-side para contratos e voucher, HTML básico com `lang`, viewport, título, descrição, JSON-LD, robots, sitemap e Helmet em páginas públicas. Componentes de entrada usam labels e estados ARIA em pontos auditados. Isso é uma base de acessibilidade e SEO, não uma aprovação completa.

O bootstrap HTTP aplica Helmet, CSP, desabilitação de `x-powered-by`, CORS com allowlist, limite de corpo de 1 MB, preservação de `rawBody`, rate limits para autenticação/OTP/webhook e confiança explícita em proxies configurados. O Dockerfile usa build multi-stage, `npm ci`, runtime separado e healthcheck HTTP. A imagem ainda precisa de endurecimento e readiness reais.

### 2.4 Testes e gates seguros

`npm test -- --run` passou com 5 arquivos e 25 testes. `npm run typecheck:server` passou sem emitir JavaScript. O gate de acessibilidade passou apenas pela verificação estática de `root`, viewport e charset. O gate de integração bloqueou sem `DATABASE_URL`, evitando simular PostgreSQL. O preflight Cora bloqueou sem as variáveis mTLS/Stage.

Esses bloqueios são preferíveis a falsos passes. O E2E não foi executado porque cria dados e não possui cleanup garantido. A decisão de não executar E2E contra produção foi correta e deve ser mantida como regra de release.

## 3. Incompleto

### 3.1 Domínio comercial, financeiro e operacional

| ID | Lacuna | Estado observado e risco |
|---|---|---|
| I-01 | **Comissões de promotores/vendedores** | Existem origem de lead, links, carteira e ranking, mas não há regra versionada, ledger, fechamento, pagamento, estorno, relatório financeiro ou idempotência. A atribuição comercial não constitui obrigação financeira auditável. |
| I-02 | **Ciclo operacional de voucher** | Existe PDF condicionado a `cliente_confirmado`, protegido por proprietário/admin. Faltam entidade ou ledger de emissão, código independente, validação/check-in, revogação, reemissão e auditoria de uso. |
| I-03 | **Retry de webhook Cora** | `proxima_tentativa`, erro e tentativas são gravados, mas não foi encontrada rotina efetiva que busque e reprocesse a fila. O metadado de retry sozinho não recupera um pagamento. |
| I-04 | **Validação uniforme na borda** | Eventos, lotes, pacotes, adicionais e cupons não têm política uniforme para datas inválidas, valores finitos/não negativos, percentuais, vencimentos, expirações e exclusividade de descontos. |
| I-05 | **Métodos financeiros desalinhados** | Tipos citam crédito/débito e o provider conhece `boleto_pix`/`carne`, enquanto o checkout ativo aceita PIX/boleto. O conjunto suportado precisa ser formalizado antes de ativar ou remover métodos. |
| I-06 | **Cancelamento, estorno e refund** | O provider possui capacidade técnica de cancelamento, mas não há fluxo de negócio completo com autorização, ledger de reversão, política de reserva, reconciliação e preservação de evidências. |
| I-07 | **Políticas avançadas de cupom** | Há validade, limite e contador global, mas não foram encontradas regras completas por cliente/reserva, período, produto mínimo, combinação de cupons ou histórico de tentativas. |

A implementação de comissão não deve alterar reservas ou pagamentos históricos. A recomendação é definir primeiro a regra e depois criar lançamentos append-only por reserva/pagamento, com versão da regra, base em centavos, estado, vendedor, estorno e chave idempotente.

### 3.2 Banco, integridade e operação financeira

A conexão ao banco real falhou, portanto não foi possível confirmar migrations aplicadas, índices, constraints, contagens, órfãos, dados históricos ou divergências de valores. A FK `reservas_inventario_hold_fk` foi criada como `NOT VALID` sem `VALIDATE CONSTRAINT` observado. Essa escolha pode preservar bases históricas, mas deixa a integridade formal pendente.

Os campos de centavos permanecem anuláveis e sem checks de não negatividade ou paridade com o decimal. O backfill cobre campos nulos, mas não reconstrói `precos_ledger`, holds, documentos novos ou hashes para reservas antigas. Isso cria dois regimes históricos legítimos apenas se forem documentados e tratados de forma diferente nos relatórios.

A tabela de eventos contratuais tem colunas de encadeamento, mas vários eventos calculam hash sem buscar e preencher `hash_anterior`. Assim, há hashes de eventos individuais, mas não uma cadeia uniforme comprovada. É necessário decidir se o requisito é hash independente por evento ou cadeia append-only antes de mudar o modelo.

A outbox possui estado `processando`, mas não foi encontrada lease/expiração explícita para recuperar um worker que morra após o claim. O mesmo risco aparece no retry de webhook. A chamada externa da Cora e a persistência local também não são uma transação distribuída; falta uma estratégia completa de intenção local e reconciliação por chave.

O verificador de migrations confirma nomes, contagem e alguns hashes, mas não confirma definição de índices, unicidade/parcialidade, FKs, `NOT VALID`, checks, nulabilidade ou invariantes de dados. A verificação de schema precisa ser ampliada depois de existir uma base autorizada para consulta.

### 3.3 Segurança, deploy e armazenamento

O rate limit está em memória e não coordena réplicas ou reinícios. Também não há limite dedicado para captura/alteração pública de leads. Não há proteção CSRF explícita; o fluxo depende principalmente de `SameSite=Lax`, CORS e autenticação. O login mantém JWT no corpo JSON além do cookie HTTP, o que é uma duplicidade de canal que não deve ser removida sem inventário dos consumidores.

A coerência entre `CORA_ENV`, hosts Stage/produção e caminho exato do webhook não é validada integralmente. O HMAC depende de segredo, header e encoding que precisam ser confirmados com o contrato real da Cora. Fora de produção, a ausência de segredo pode aceitar webhook sem assinatura, o que é perigoso se `NODE_ENV` estiver incorreto em um serviço público.

O backend usa filesystem local para PDFs. `STORAGE_TYPE` é documentada, mas não foi encontrada implementação de object storage. A sobrevivência dos PDFs depende de volume persistente, backup e restauração externos não confirmados. O healthcheck atual demonstra liveness HTTP, não readiness do banco.

O container não declara usuário não-root, filesystem read-only ou redução de capabilities. O Compose contém configuração de desenvolvimento e deve permanecer limitado a fixture local. A existência do Dockerfile multi-stage não comprova configuração segura no Coolify real.

### 3.4 Frontend web/mobile

O mobile não possui paridade funcional comprovada com o web. Faltam páginas públicas, legais, redefinição de senha, dados cadastrais, contratos, clientes, configurações, eventos admin e relatórios. O root mobile começa em `Eventos`, enquanto o web começa em `Home`.

O mobile não possui pipeline root reprodutível, lockfile próprio ou projetos Android/iOS versionados encontrados na inspeção. O Capacitor aponta para `http://localhost:5173` com `cleartext=true`, sem configuração evidenciada por ambiente. `Confirmacao.tsx` recebe instruções de pagamento de `location.state`, mas o polling não reidrata QR/link/documento a partir do endpoint de status após refresh ou deep link.

O web carece de canonical, Open Graph e Twitter Cards. O `AdminLayout` esconde a sidebar abaixo de `md` sem menu ou drawer. Ações iconográficas administrativas dependem de `title` em pontos auditados, sem nome acessível robusto. A mensagem de dados cadastrais promete continuidade com campos vazios, enquanto o checkout impede a preparação contratual quando faltam dados.

### 3.5 Testes, qualidade e documentação

Não há cobertura configurada, relatório LCOV, thresholds ou comando `test:coverage`. Os 25 testes aprovados não representam cobertura do produto. A integração atual delega ao verificador de schema e não exercita rotas, autorização, transações ou persistência ponta a ponta.

O E2E cria dados, contratos e PDFs sem cleanup garantido e precisa de banco isolado, namespace e proteção contra hosts produtivos. A acessibilidade é apenas uma checagem de shell HTML. Não há matriz completa de typecheck/build/teste do mobile.

Não há CI versionado com gate agregado para `npm ci`, lint, typecheck server/web/mobile, testes, build, cobertura e auditoria. O release não possui relatório padronizado que diferencie `PASS`, `BLOCKED` e `NOT RUN` com data, commit, ambiente e evidência.

O preflight Cora Stage não possui caminho de sucesso: mesmo com variáveis presentes, ele termina bloqueado e não executa ensaio mTLS. A documentação E2E diverge do script em valores, parcelas e método; a documentação histórica ainda contém instruções de Mercado Pago/Asaas e domínios antigos.

## 4. Errado ou quebrado

### 4.1 P0/P1 de autorização e segurança

1. **Escopo de vendedor quebrado em `GET /api/jornada/cliente/:usuario_id` — P0/P1.** A rota exige vendedor/admin, mas não filtra `vendedor_id` pela carteira quando o papel é vendedor. Um vendedor que conheça o ID pode consultar PII, origem, status, reservas e valores de outra carteira. A correção deve manter acesso amplo de admin e exigir atribuição ao vendedor; deve haver teste de admin, vendedor proprietário, vendedor não proprietário e cliente.

2. **Intenção de lead mutável por ID público — P1.** `PATCH /api/publico/leads/:lead_id/intencao` não exige autenticação, token de posse ou rate limit específico. Conhecer um ID permite alterar lote, pacote e status do lead. O fluxo pré-login pode ser preservado com token de intenção assinado, curto e limitado ao lead, ou por sessão autenticada.

3. **Alteração de papel/senha administrativa não incrementa `session_version` — P1.** O middleware compara a versão, mas o caminho administrativo não a incrementa uniformemente quando o papel ou a senha é alterado. Um JWT anterior pode conservar privilégio até expirar. O incremento deve ocorrer na mesma transação da mudança de privilégio.

4. **Admin de teste pode ser habilitado em produção — P0.** `ENABLE_TEST_ADMIN=true` cria usuário e senha conhecidos sem bloqueio explícito por `NODE_ENV=production`. A correção deve impedir o caminho no código em produção e confirmar que o usuário/variável não existem no ambiente real; não se deve apagar usuário sem procedimento autorizado.

5. **Fallback de segredo e webhook fora de perfil seguro — P0 de configuração.** Há fallback de `JWT_SECRET` para segredo de desenvolvimento e aceitação de webhook sem HMAC fora de produção. Um serviço público configurado com `NODE_ENV` incorreto pode ficar exposto. O boot deve falhar fechado para perfis públicos sem configuração segura, preservando um modo local/teste explicitamente delimitado.

### 4.2 P1 de integridade e finanças

6. **Desconto PIX exibido duas vezes no checkout web — P0/P1 financeiro.** O servidor persiste `reserva.valor_total` já descontado ao aceitar o contrato e envia esse valor ao gateway. Depois, `Checkout.tsx` subtrai novamente o percentual na apresentação. O gateway tende a receber o valor persistido uma vez, mas a interface pode mostrar um valor menor que o cobrado. Deve existir uma fonte autoritativa única para subtotal, desconto e total final; reservas existentes não devem ser recalculadas sem reconciliação.

7. **Atualizações administrativas deixam decimal e centavos divergentes — P1.** Há caminhos que atualizam `reservas.valor_total` sem atualizar `valor_total_centavos`. Isso pode fazer cálculos, reconciliações e auditorias usarem representações diferentes. Todos os caminhos de alteração devem atualizar os campos em uma transação ou definir formalmente um único campo autoritativo antes de adicionar checks.

8. **Cora pode ser chamada antes de persistência local durável — P1.** A cobrança externa ocorre antes de o pagamento local, a idempotência e as parcelas estarem confirmados. Falha posterior pode produzir cobrança externa órfã. É necessária intenção local, chave estável, estado de criação e reconciliação por chave; uma repetição não deve criar cobrança nova sem consultar a anterior.

9. **Webhook não garante processamento único concorrente — P1.** A implementação consulta o evento, processa e marca ao final. Requisições simultâneas podem executar efeitos duplicados apesar da unicidade de `evento_id`. Deve haver claim/lock/lease transacional e efeitos idempotentes.

10. **Estados Cora não estão centralizados — P1.** A consulta aceita `PAID` e `PAID_OUT`, enquanto o webhook exige `PAID` em um caminho. Tipos desconhecidos podem ser marcados como processados sem ação ou alerta. O mapeamento deve ser centralizado; estado desconhecido deve permanecer classificável e reprocessável.

11. **Configuração de pagamento falha aberta para defaults — P1.** `ConfiguracaoService` captura indisponibilidade/tabela ausente e pode aplicar defaults de pagamento. Uma falha de infraestrutura pode congelar condição incorreta no contrato. Deve diferenciar configuração inexistente em bootstrap de banco indisponível e falhar fechado no segundo caso.

12. **Follow-up é marcado como enviado sem chamar e-mail — P1.** `FollowupScheduler.enviarFollowup` apenas registra `enviado_em` e faz log, sem chamar `EmailService`. O CRM pode indicar envio que não aconteceu e impedir nova tentativa. O produtor deve migrar para a outbox; o status de enviado só deve ser persistido após confirmação do provider.

13. **Follow-up concorre sem claim/constraint — P2.** Duas instâncias podem consultar a ausência e inserir o mesmo follow-up. Deve-se usar chave idempotente e claim transacional, sem adicionar constraint antes de auditar duplicados históricos.

14. **“Última reserva” sem `orderBy` — P2.** A jornada do vendedor usa `limit(1)` sem ordenar. O status exibido não é determinístico. A ordenação por uma coluna de negócio definida deve ser adicionada sem reescrever histórico.

15. **Cupons têm normalização e updates ambíguos — P2.** A duplicidade é consultada antes de normalizar maiúsculas; updates truthy não distinguem zero/nulo; percentual e fixo podem coexistir e a precedência não é formalizada. Deve-se validar e normalizar na borda, preservando dados anteriores.

16. **JSONB de itens pode ser armazenado como string — P2.** O fluxo grava `JSON.stringify` em coluna `jsonb` e leitores aceitam string/array. Antes de corrigir, deve-se consultar uma cópia/base autorizada; para registros novos, persistir JSON nativo e não reescrever reservas antigas sem comparação de snapshot/hash.

### 4.3 P1/P2 de schema e fonte de verdade

17. **`schema.ts`, DDL e SQL divergem — P1.** O ORM declara enums PostgreSQL, enquanto DDL/migrations efetivos usam `VARCHAR`. Índices únicos em SQL aparecem como índices comuns no schema Drizzle. Isso cria risco de drift em instalação, geração ou revisão. Deve-se escolher a fonte de verdade e alinhar por migration forward-only, sem `push` destrutivo.

18. **A cadeia de hash declarada não é uniforme — P1.** Colunas de `hash_anterior` existem, mas vários eventos não buscam o último hash. Deve-se decidir entre hash independente ou cadeia real antes de mudar o significado dos eventos existentes.

19. **A FK do hold não está validada integralmente — P1.** A constraint `NOT VALID` preserva a possibilidade de dados históricos órfãos, mas não garante integridade total. Não se deve validá-la cegamente antes de medir órfãos.

### 4.4 Frontend, mobile e qualidade quebrados

20. **Build mobile falha com 26 erros — P0 para publicação mobile.** Foram observados módulo Capacitor ausente, alias `@ui` não resolvido, assets web sem resolução/tipagem, `ImportMeta.env` ausente e parâmetros implicitamente `any`. O mobile não deve ser publicado nem tratado como fallback até possuir instalação e build limpos.

21. **Guard mobile navega durante renderização — P2.** `ProtectedRoute` chama `navigate` no corpo do componente, ao contrário do `Navigate` declarativo do web. Isso pode gerar warnings ou loops em restauração de estado.

22. **Mobile reutiliza superfície web sem dependências declaradas — P1/P2.** Importações de layouts/páginas web dependem de Helmet, assets e pacote UI não completamente declarados no mobile, sem provider correspondente. É necessário decidir pacote compartilhado neutro ou declarar/configurar toda a superfície.

23. **Lint declarado não executa — P1.** `npm run lint --workspace apps/web` termina com código 127 porque `eslint` não está instalado/declarado. Um gate oferecido, mas inexequível, não pode ser usado como evidência de qualidade.

24. **`test:cora:stage` não possui caminho de sucesso — P1.** O script funciona como bloqueador/preflight, não como teste Cora. Não se deve converter bloqueio em PASS apenas alterando exit code; deve-se renomear o preflight ou implementar ensaio Stage autorizado e não destrutivo.

25. **Documentação E2E contradiz o script — P1.** Valores, parcelas e métodos descritos não correspondem ao executável; a documentação cita cartão, enquanto o script aceita PIX/boleto. O roteiro não comprova explicitamente todos os campos persistidos alegados.

26. **Compose é inseguro se tratado como produção — P0 operacional.** Publica PostgreSQL/app, contém credenciais/segredo de desenvolvimento e define `NODE_ENV=development`. Deve ser fixture local, não fonte de Coolify ou mecanismo de redeploy.

## 5. Legado ou duplicado

| Grupo | Evidência consolidada | Tratamento seguro |
|---|---|---|
| **DDL bootstrap, migrations e schema** | `server/db/index.ts`, migrations Drizzle e `server/db/schema.ts` são três superfícies de schema. | Escolher fonte canônica, manter migrations históricas imutáveis e alinhar somente por migrations novas/aditivas. Não apagar o DDL sem confirmar instalações que dependem dele. |
| **Contrato antigo e evidência nova** | `reservas.contrato_pdf_url`, `aceite_timestamp`, `aceite_ip` e campos relacionados coexistem com `contratos_documentos`, `contrato_validacoes` e eventos. | Preservar colunas e documentos antigos; definir qual fonte é autoritativa para cada período antes de remover leituras. |
| **Notificações duplicadas** | `emails_enviados`/`FollowupScheduler` e `notificacoes_outbox`/`NotificationOutboxService` têm retry e idempotência diferentes. | Migrar produtores novos para outbox com chave idempotente; preservar histórico legado e marcar semântica. |
| **Sessões e reset preparados** | A tabela `sessoes` não apareceu em uso operacional; `password_reset_tokens` aparece no schema/migration, mas o fluxo observado não foi encontrado. | Não remover sem inventário de consumidores. Tratar sessão persistida como estrutura não efetiva até prova de uso. |
| **Tipos e métodos financeiros** | `server/types/index.ts` e interfaces do adapter não coincidem com o checkout; `credito`/`debito`, `boleto_pix` e `carne` não são todos métodos ativos. | Separar tipos de compatibilidade dos contratos ativos e documentar o conjunto suportado. |
| **Preço legado** | `preco_versao` tem default legado e o fluxo novo grava `2026.1`. | Preservar o campo como evidência histórica e criar catálogo explícito para versões futuras. |
| **Endpoint de aceite compatível** | `/contratos/aceitar/:reserva_id` prepara versão aguardando OTP; não é aceite final. | Manter enquanto houver consumidor antigo, mas documentar o endpoint OTP como caminho canônico. |
| **Provider Cora preparado** | O provider conhece métodos não expostos pelas rotas atuais. | Não ativar sem alinhar contrato, parcelas, webhook, snapshot, preço e testes de reconciliação. |
| **Mobile paralelo** | Stack, rotas, aliases, CSS e dependências divergem do web; mobile não está no workspace root. | Decidir se é produto suportado, protótipo ou legado antes de investir em paridade. Não anunciar suporte sem build. |
| **Dist e assets de marca** | `apps/web/dist` versionado contém domínio/bundles antigos; logos existem em `apps/web` e `packages/brand`; CSS mobile parece de shell antiga. | Inventariar publicação e consumidores de PDF/contract-engine antes de remover ou deixar de versionar. Sempre publicar build reproduzido da fonte. |
| **Deploy/documentação** | Guias Coolify/Docker/produção se sobrepõem e alguns citam Mercado Pago/Asaas, domínios `permupay` ou subdomínio antigo. | Manter históricos, marcá-los como `LEGADO`, criar índice de autoridade e apontar para um único runbook atual. |
| **Variáveis de ambiente antigas** | `MERCADOPAGO_*` e `STORAGE_TYPE` permanecem em templates/documentos sem caminho produtivo confirmado. | Remover apenas de templates ativos depois de confirmar consumidores externos; não apagar evidência histórica. |

## 6. Ausente

A lista abaixo reúne capacidades ou evidências que não foram encontradas, sem convertê-las em funcionalidades implícitas:

1. Ledger e ciclo completo de comissão: regra versionada, apuração, fechamento, pagamento, estorno, relatório e idempotência.
2. Ledger/código independente e ciclo de voucher: emissão, validação/check-in, revogação, reemissão e auditoria de uso.
3. Worker idempotente efetivo para consumir retries de webhook Cora.
4. Fluxos autorizados de refund/reversal e cancelamento de reserva com política, reconciliação e preservação de pagamentos.
5. Permissões finas por carteira, evento, operação financeira e desconto.
6. Uso efetivo da tabela `sessoes` em login, logout ou refresh, se a sessão persistida for requisito do produto.
7. Checks de estados, valores não negativos, percentuais, vencimentos, expirações e paridade entre DECIMAL e centavos.
8. Constraints compostas que confirmem a mesma reserva entre pagamento/parcela, contrato/validação, OTP/contrato, hold/reserva e idempotência/pagamento.
9. Proteção de imutabilidade no banco para snapshots, validações, hashes e eventos append-only.
10. Auditoria append-only abrangente de pagamentos, holds, vagas, cupons, reconciliações, reembolsos e alterações de configuração.
11. Reconciliação formal de reservas históricas sem ledger/hold/documento/hash novo. Não se deve inferir fatos comerciais ausentes.
12. Lease/timeout de recuperação para itens `processando` de outbox e webhooks.
13. Verificador de migrations que confira definições, não apenas nomes, incluindo unicidade, parcialidade, FKs, `NOT VALID`, checks, nulabilidade e invariantes.
14. Bloqueio de `ENABLE_TEST_ADMIN` em produção no código.
15. Token de posse/assinatura expirável e rate limit dedicado para intenção pública de lead.
16. Store distribuído de rate limit para operação em múltiplas réplicas, se essa topologia for adotada.
17. CSRF explícito para operações autenticadas por cookie.
18. Validação de coerência de `CORA_ENV`, hosts, certificados e path oficial do webhook.
19. Object storage ou declaração operacional inequívoca de filesystem/volume persistente, com backup restaurável de PDFs.
20. Endpoint readiness separado do liveness HTTP.
21. Endurecimento explícito do container com non-root, filesystem read-only e capabilities reduzidas.
22. Definição suportada do produto mobile, configuração de API por ambiente, lockfile, pipeline e alvos nativos reproduzíveis.
23. Cobertura medida, thresholds, CI versionado e `test:ci` não interativo com `PASS/BLOCKED/NOT RUN`.
24. Banco efêmero, fixtures, teardown e testes HTTP de autenticação, RBAC, reserva, contrato, webhook, outbox e concorrência.
25. E2E isolado, com cleanup/finally, dry-run, namespace e recusa explícita de host produtivo.
26. Teste Cora Stage real, autorizado e não destrutivo, separado de emissão de invoice/cobrança.
27. Acessibilidade de navegador com axe ou equivalente, teclado, foco, contraste e rotas autenticadas.
28. Navegação administrativa responsiva, canonical/OG/Twitter no público e reidratação segura do pagamento na confirmação.
29. Fonte única de verdade para domínio, API, gateway e runbook de produção.
30. Evidência local verificável do volume, backup/restauração, firewall, proxy, certificados e commit efetivamente publicado.

## 7. Ordem segura de implementação

A ordem abaixo prioriza primeiro redução de risco sem alterar dados. Cada etapa deve ser liberada somente depois dos testes da etapa anterior. Nenhuma etapa autoriza alterar migrations históricas, executar `drizzle-kit push`, apagar dados ou recriar volume.

### Fase 0 — Congelamento, evidência e pré-condições de segurança

1. Manter a versão saudável atualmente publicada até que os bloqueios de configuração Cora e deploy sejam resolvidos. Não promover o mobile, não executar o E2E atual contra produção e não usar o Compose como produção.
2. Obter snapshot/backup verificável do banco e do volume de PDFs, com restauração testada em ambiente separado. Registrar data, commit, ambiente e contagens.
3. Executar somente leitura contra o banco real autorizado: migrations presentes, índices e unicidades, FKs, constraints, `NOT VALID`, estados inválidos, órfãos de holds, duplicatas de follow-up/webhook, nulos e divergências decimal/centavos.
4. Registrar somas em centavos e contagens de reservas, pagamentos, parcelas, holds, cupons, contratos, documentos, eventos e notificações antes de qualquer mudança.
5. Confirmar fora do Git, sem imprimir segredos, `NODE_ENV=production`, `ENABLE_TEST_ADMIN=false`, `JWT_SECRET`, `OTP_PEPPER`, mTLS, HMAC, URLs Cora, path do webhook, volume persistente e política de backup.

**Critério de saída:** backup restaurável, inventário do banco real, divergências conhecidas e decisão operacional sobre o domínio/API. Se algum item falhar, o trabalho fica em `BLOCKED`; não se compensa a falta de evidência com defaults.

### Fase 1 — Correções de autorização, segurança e apresentação sem migration

1. Corrigir o escopo de carteira em `jornada/cliente`, preservando o acesso de admin e retornando o comportamento escolhido de não proprietário de forma consistente.
2. Proteger a intenção pública de lead com token de intenção assinado/expirável ou sessão apropriada, mais rate limit específico. Não confiar somente em `lead_id`.
3. Incrementar `session_version` em alteração de papel, senha administrativa e mudanças equivalentes de privilégio.
4. Bloquear `ENABLE_TEST_ADMIN` em produção no código e manter a confirmação do ambiente como gate de deploy.
5. Fazer configuração de pagamento falhar fechado quando o banco/configuração estiver indisponível; defaults somente em bootstrap explicitamente controlado.
6. Corrigir a fonte de verdade do total PIX no frontend e no contrato: exibir o total retornado pelo servidor, sem subtrair novamente percentual sobre `valor_total` já descontado.
7. Corrigir os caminhos administrativos que alteram valores para manter decimal e centavos em paridade, sem backfill automático antes da auditoria da Fase 0.
8. Migrar novos follow-ups ao outbox e só gravar sucesso após confirmação do provider. Preservar registros históricos marcados como enviados e produzir relatório de inconsistências em vez de apagá-los.
9. Centralizar mapeamento de `PAID`, `PAID_OUT` e estados desconhecidos; não descartar evento desconhecido como processado sem alerta.
10. Corrigir a ordenação da última reserva e a validação/normalização de cupons sem modificar registros antigos em lote.

**Testes mínimos:** matriz admin/vendedor proprietário/vendedor fora da carteira/cliente; token de lead válido, expirado, de outro lead e reutilizado; JWT após rebaixamento/troca de senha; configuração ausente versus banco indisponível; checkout PIX, boleto, aceite, refresh, troca de método e retry idempotente; decimal/centavos nos endpoints administrativos; follow-up com provider sucesso/falha; webhook PAID/PAID_OUT/desconhecido.

### Fase 2 — Migrations forward-only de integridade e recuperação

As migrations desta fase devem ser **aditivas, revisáveis e forward-only**. Devem conservar nomes e dados existentes, usar transações quando seguro, criar novos índices sem bloquear desnecessariamente e não declarar `NOT NULL`/`UNIQUE` antes de medir e tratar exceções.

1. Criar, se a auditoria confirmar necessidade, colunas aditivas para claim/lease/worker de webhook e outbox, com estados explícitos de processamento, horário de claim, expiração do lease e erro. Não apagar payload, tentativas ou hash existentes.
2. Criar o mecanismo local de intenção de cobrança antes da chamada Cora, com chave idempotente única e estados que permitam reconciliação. A implementação deve consultar a intenção/cobrança existente antes de repetir chamada externa.
3. Auditar divergências decimal/centavos e corrigir somente com regra autorizada e evidência. Depois, adicionar checks como `NOT VALID` quando necessário, validar em lote controlado e só então considerar nulabilidade mais forte. Não preencher fatos financeiros inferidos.
4. Medir órfãos de `reservas_inventario_hold_fk`. Se a contagem for zero, validar a constraint em uma migration posterior; se houver órfãos, preservar dados, registrar exceções e decidir tratamento antes de validar.
5. Alinhar `schema.ts`, DDL de bootstrap e migrations sobre enums, índices únicos e constraints. Se a decisão for alterar o banco, criar migration explícita após inventário de valores; se a decisão for manter `VARCHAR`, alinhar o ORM e documentar enforcement na aplicação.
6. Adicionar constraints novas apenas depois de verificar duplicatas históricas. Para unicidade futura, preferir índice/constraint compatível com o estado real e uma janela de saneamento auditada; não apagar duplicatas automaticamente.
7. Expandir `verificar-migration.mjs` para conferir definições reais de índices, unicidade/parcialidade, FKs, `NOT VALID`, checks, nulabilidade, contagens e invariantes de dados.
8. Se a cadeia de hashes for requisito, implementar uma forma centralizada de obter o último hash sob lock e aplicar somente a eventos novos. Não reescrever eventos anteriores para aparentar uma cadeia que não existia.

**Testes de banco:** executar migrations em PostgreSQL efêmero; verificar reexecução segura; duas reservas concorrentes no mesmo lote; cupom no limite; dois webhooks iguais e dois webhooks concorrentes; lease recuperado após morte do worker; cobrança aceita com falha de persistência local e reconciliação; checks de centavos; validação de FK após medição de órfãos; preservação de contagens e somas.

### Fase 3 — Worker, reconciliação e fechamento financeiro

1. Implementar worker de webhook com claim/lease, backoff, limite de tentativas, consulta Cora autenticada, classificação de estados e idempotência dos efeitos locais.
2. Implementar reconciliação periódica por `idempotency_key`/`gateway_id` para localizar cobrança externa sem pagamento local. A reconciliação deve criar a representação local correta sem emitir cobrança duplicada.
3. Definir autorização, política e ledger para cancelamento, reversão, reembolso e cancelamento de reserva. Nenhum cancelamento deve apenas alterar status sem registrar sua causa e efeito financeiro.
4. Especificar comissão com regra versionada e criar uma tabela/ledger append-only para lançamentos futuros, vinculada a reserva/pagamento e com estorno. Não apurar retroativamente sem fonte comercial explícita.
5. Especificar voucher operacional sem substituir PDFs existentes: emissão, código independente, validação idempotente, check-in, revogação, reemissão e eventos de auditoria. O PDF já emitido deve continuar acessível conforme suas regras atuais.

**Testes de domínio:** pagamento confirmado por consulta e por webhook; duplicata/replay; timeout Cora; falha local após cobrança; cancelamento autorizado/não autorizado; estorno parcial/total conforme política aprovada; comissão criada uma vez, estornada uma vez e não duplicada; voucher emitido, validado uma vez, repetido, revogado e reemitido.

### Fase 4 — Frontend, mobile, CI e observabilidade de release

1. Reidratar QR/link/documento da confirmação a partir do endpoint de status, mantendo autorização por reserva, polling limitado e tratamento de status.
2. Decidir formalmente o destino do mobile. Se suportado, alinhar workspace, aliases, dependências, lockfile, configuração por ambiente, rotas, `ProtectedRoute`, Helmet provider e build Android/iOS. Se não suportado, marcar como legado/protótipo e impedir que seja confundido com release.
3. Corrigir ou remover o lint quebrado, declarar dependências/configuração compatíveis e adicionar o comando ao gate.
4. Criar CI versionado com instalação limpa, typecheck server/web/mobile conforme escopo, lint, unitários, build, cobertura, verificador de migrations e auditoria de dependências.
5. Criar `test:ci` não interativo e relatório de release que registre `PASS`, `BLOCKED` e `NOT RUN`; bloqueio de banco/Cora não pode ser resumido como sucesso.
6. Transformar o E2E em teste seguro: banco efêmero, fixtures, namespace, cleanup em `finally`, dry-run, recusa de hosts produtivos e nenhum método financeiro não suportado.
7. Adicionar a11y de navegador com axe/equivalente e roteiro manual para teclado, foco, contraste, formulários, checkout, admin e mensagens de erro.
8. Criar um runbook canônico de deploy/domínio/gateway e marcar documentos históricos com aviso inequívoco, preservando-os fora do caminho operacional. Confirmar canonical, CORS, webhook e API com uma única autoridade.

**Testes de saída:** build limpo web/server; build mobile se suportado; smoke passivo do domínio; E2E isolado com teardown; a11y em rotas públicas e autenticadas; deploy Stage com rollback e volume/PDF restaurável; Cora Stage real somente quando houver autorização, mTLS e ensaio não destrutivo.

### Fase 5 — Limpeza controlada de legado

Somente após as fases anteriores e um inventário de consumidores, decidir sobre remoção ou arquivamento de DDL bootstrap, tipos não usados, colunas contratuais antigas, tabela de sessões, `MERCADOPAGO_*`, `STORAGE_TYPE`, `dist` versionado, assets duplicados e CSS mobile antigo. A limpeza deve ser precedida por busca de referências, comparação de build e plano de rollback. Histórico de auditoria, documentos antigos e dados financeiros não devem ser apagados para “simplificar” o repositório.

## 8. Gates de release e preservação de dados

Antes de cada migration ou mudança financeira, o release deve registrar:

| Gate | Evidência mínima |
|---|---|
| Backup | Snapshot do banco e volume de PDFs, com restauração testada fora da produção. |
| Schema | Journal, migration nova, verificação de definições e ausência de operação destrutiva não aprovada. |
| Dados | Contagens, somas em centavos, órfãos, duplicatas e nulos antes/depois. |
| Segurança | `NODE_ENV`, secrets runtime-only, `ENABLE_TEST_ADMIN=false`, Cora/mTLS/HMAC, CORS, domínio e proxy confirmados. |
| Testes | Unitários, integração PostgreSQL, concorrência, autorização e build correspondentes ao escopo; `BLOCKED` não é `PASS`. |
| Financeiro | Idempotência, timeout, duplicata, PAID/PAID_OUT, reconciliação e cancelamento testados em ambiente isolado. |
| Deploy | Imagem reproduzida do commit, readiness, volume persistente, rollback e smoke passivo. |
| Auditoria | Novos eventos/lançamentos append-only; nenhum snapshot, pagamento, webhook, contrato ou histórico apagado. |

Não se deve alterar migrations históricas, executar `push` destrutivo, recalcular reservas antigas pelo preço atual, inventar ledger retroativo, remover registros “falsamente enviados” ou recriar volumes para resolver um problema de deploy. Qualquer exceção deve ser aprovada com backup, plano de rollback e reconciliação explícita.

## 9. Síntese final por classificação

| Classificação | Síntese consolidada |
|---|---|
| **Funcionando** | Auth nominal, bcrypt/JWT/cookie, RBAC básico e ownership em rotas principais; pricing Decimal; reserva transacional com hold, cupom e ledger; contrato/snapshot/hash/OTP/PDF; base Cora mTLS/idempotência/webhook; outbox contratual; journal/migrations 0000–0008; web/server typecheck/build; 25 testes unitários. |
| **Incompleto** | Comissão, voucher operacional, retry efetivo de webhook, validação uniforme, paridade monetária no banco, histórico completo, cadeia de hash, reconciliação externa-local, rate limit distribuído/CSRF, persistência de PDF, readiness/container, mobile, cobertura/CI/E2E/a11y e autoridade documental. |
| **Errado/quebrado** | Isolamento de carteira, mutação pública de lead, revogação após troca de papel, admin de teste em produção, fallback financeiro, follow-up falsamente enviado, Cora antes de persistir local, webhook concorrente/status, decimal versus centavos, checkout PIX, build mobile, lint, preflight Cora e Compose quando tratados como produção. |
| **Legado/duplicado** | DDL/schema/migrations concorrentes; contrato antigo versus evidência nova; e-mails/outbox; sessões/tipos/métodos não efetivos; mobile paralelo; dist/assets/CSS duplicados; documentos, gateways, domínios, variáveis e runbooks históricos. |
| **Ausente** | Ledgers de comissão/voucher/refund, worker/lease/reconciliação, checks e constraints de domínio, imutabilidade/auditoria ampla, permissões finas, sessão persistida efetiva, token de lead, guard de admin teste, object storage/readiness/hardening, mobile reproduzível, CI/cobertura/testes de integração/E2E/a11y e fonte única de produção. |

## Referências

[1]: file:///home/ubuntu/comitivas/auditoria-backend.md "Auditoria de backend e cadeia comercial"

[2]: file:///home/ubuntu/comitivas/auditoria-database.md "Auditoria de banco e migrations"

[3]: file:///home/ubuntu/comitivas/auditoria-frontend.md "Auditoria de frontend web e mobile"

[4]: file:///home/ubuntu/comitivas/auditoria-security-deploy.md "Auditoria de segurança, Cora e deploy"

[5]: file:///home/ubuntu/comitivas/auditoria-tests-docs.md "Auditoria de testes, scripts e documentação"

[6]: file:///home/ubuntu/comitivas/server/routes/jornada.ts "Rotas de jornada e carteira"

[7]: file:///home/ubuntu/comitivas/server/routes/publico.ts "Rotas públicas de leads"

[8]: file:///home/ubuntu/comitivas/server/routes/admin.ts "Rotas administrativas"

[9]: file:///home/ubuntu/comitivas/server/routes/pagamentos.ts "Rotas de pagamento e webhook"

[10]: file:///home/ubuntu/comitivas/server/services/followupScheduler.ts "Scheduler de follow-up"

[11]: file:///home/ubuntu/comitivas/server/db/schema.ts "Schema Drizzle"

[12]: file:///home/ubuntu/comitivas/server/db/index.ts "Bootstrap e inicialização do banco"

[13]: file:///home/ubuntu/comitivas/drizzle/meta/_journal.json "Journal do Drizzle"

[14]: file:///home/ubuntu/comitivas/scripts/verificar-migration.mjs "Verificador de migrations"

[15]: file:///home/ubuntu/comitivas/apps/web/src/pages/Checkout.tsx "Checkout web"

[16]: file:///home/ubuntu/comitivas/apps/mobile/src/App.tsx "Aplicação mobile e guards"

[17]: file:///home/ubuntu/comitivas/package.json "Scripts e dependências do projeto"

[18]: file:///home/ubuntu/comitivas/scripts/e2e-fluxo-completo.mts "Cenário E2E"

[19]: file:///home/ubuntu/comitivas/TEST_E2E.md "Roteiro E2E documentado"

[20]: file:///home/ubuntu/comitivas/docs/operacao/deploy-coolify.md "Runbook operacional de deploy"

[21]: file:///home/ubuntu/comitivas/docker-compose.yml "Compose local"

> As referências locais documentam o material auditado. Elas não comprovam, por si só, o estado atual do banco, do Coolify, dos certificados, do volume, do domínio publicado ou do commit em produção. Essa comprovação depende dos gates de release e de uma consulta autorizada e somente leitura ao ambiente real.
