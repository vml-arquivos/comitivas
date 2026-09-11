# Auditoria de testes, scripts e documentação

**Repositório:** `/home/ubuntu/comitivas`
**Área auditada:** `package.json`, testes, scripts, documentação e relatórios relacionados a cobertura, comandos, claims, produção e domínio.
**Data da inspeção:** 5 de setembro de 2026.
**Critério operacional:** zero regressão, preservação de dados e nenhuma promoção de produção durante a auditoria.

## 1. Conclusão executiva

A suíte unitária local está funcionando: `npm test -- --run` terminou com **5 arquivos e 25 testes aprovados**. O typecheck do servidor também passou. Esses resultados comprovam apenas os cenários unitários presentes em `tests/`; não comprovam o fluxo HTTP completo, a persistência PostgreSQL, a integração Cora, a acessibilidade real, o aplicativo mobile, o envio de e-mail ou o estado do domínio publicado.

A cobertura efetiva é incompleta e não é mensurada. Não há configuração de cobertura, limiar, relatório `coverage/`/LCOV ou CI versionado. Há 38 arquivos TypeScript em `server`/`packages` e 32 arquivos TypeScript/TSX em `apps/web/src`, enquanto os testes importam diretamente apenas alguns serviços e componentes de contrato. Essa contagem não é uma porcentagem de cobertura; é evidência de que não existe base suficiente para afirmar cobertura ampla.

Há um comando de lint declarado no workspace web, mas ele falhou com `eslint: not found` e código 127. O `eslint` não está em `package.json` nem no lockfile como dependência executável. Esse é o achado técnico mais diretamente quebrado na área de comandos.

Os gates de integração e Cora foram executados de forma segura e ficaram bloqueados: `test:integration` terminou com código 2 sem `DATABASE_URL`, e `test:cora:stage` terminou com código 2 sem configuração mTLS Stage. O script Cora, mesmo com as variáveis presentes, não realiza um ensaio: ele emite `CORA_STAGE_BLOCKED` e encerra com código 2 incondicionalmente. Portanto, o nome sugere um teste executável, mas o arquivo atualmente funciona somente como bloqueador/preflight.

O E2E não foi executado. A razão é de preservação de dados: o script faz vários `POST` que criam evento, lote, pacotes, cliente, reservas, aceita contratos e registra intenções de pagamento; não há rotina de limpeza. O roteiro também diverge do script atual em valores, parcelas e método de pagamento. Executá-lo contra produção seria uma regressão operacional previsível.

A documentação mais nova é coerente ao declarar que o código é Cora-only em produção, que as credenciais mTLS estão ausentes e que a versão saudável antiga deve ser preservada. Entretanto, documentos históricos ainda contêm instruções operacionais de Mercado Pago/Asaas, domínios antigos e claims de prontidão/fluxo completo que entram em conflito com o código e com os gates atuais. Eles estão parcialmente marcados como históricos, mas permanecem facilmente localizáveis e podem induzir uma operação incorreta.

## 2. Método, limites e comandos executados

A inspeção foi somente de leitura, com buscas no repositório, leitura de arquivos, execução de testes locais e limpeza dos artefatos de build gerados/alterados para devolver a árvore ao estado anterior. Não foram executados migrations, seeds, servidores, E2E, chamadas HTTP externas, chamadas Cora, envio de e-mail, cobrança, redeploy ou comandos de alteração de banco.

| Comando | Resultado observado | Classificação da evidência |
|---|---|---|
| `npm test -- --run` | PASS; 5 arquivos, 25 testes | Fato reproduzido localmente |
| `npm run typecheck:server` | PASS; `tsc --noEmit` sem erros | Fato reproduzido localmente |
| `npm run test:a11y` | PASS estático | Fato limitado ao shell HTML; não é auditoria axe/manual |
| `npm run test:integration` | Código 2; `DATABASE_URL` ausente | Fato; PostgreSQL não foi validado nesta sessão |
| `npm run test:cora:stage` | Código 2; variáveis mTLS/Stage ausentes | Fato; nenhuma chamada Cora foi feita |
| `npm run lint --workspace apps/web` | Código 127; `eslint` não encontrado | Fato; comando declarado está quebrado no checkout atual |
| `npm run test:e2e` | Não executado | Decisão de segurança; o script escreve dados e não limpa |
| `npm run db:migrate` / `seed:*` | Não executados | Decisão de segurança; alterariam banco |
| `npm run build` | Não tratado como resultado desta auditoria | Não foi usado para declarar prontidão; build gera artefatos `dist` |

O `git status --short` estava limpo após a restauração dos artefatos gerados; o único arquivo intencionalmente criado por esta entrega é este relatório.

## 3. Achados funcionando

### 3.1 Suíte unitária e typecheck

O script raiz `test` está corretamente ligado ao Vitest em `package.json`. A execução não interativa com `--run` aprovou `tests/authService.spec.ts`, `tests/brandedPdfLayout.spec.ts`, `tests/contratoHtml.spec.ts`, `tests/contratoService.spec.ts` e `tests/paymentGatewayConfig.spec.ts`, totalizando 25 testes.

Os testes cobrem regras de configuração segura de autenticação e gateway, geração/estrutura de contrato HTML, cálculo de condições e parcelas e branding do PDF. O teste de gateway confirma, entre outros casos, a rejeição de mock, Mercado Pago e Asaas em produção e a exigência de Client ID, arquivos mTLS e webhook HTTPS para Cora.

`npm run typecheck:server` executa `tsc --noEmit -p tsconfig.server.json` e passou sem produzir JavaScript. Isso é uma verificação útil de tipos do servidor, mas não substitui o typecheck/build do web e do mobile.

### 3.2 Gates seguros e verificadores

`test-integration` possui uma proteção correta: sem `DATABASE_URL`, aborta com código 2 e não tenta simular PostgreSQL. Com a variável presente, ele delega a `db:verify-contract-fields`, que, pela inspeção do script, usa consultas `SELECT` para verificar tabelas, colunas, índices, histórico Drizzle e hash das regras. A execução não ocorreu por falta de banco configurado.

`test-a11y` falha quando o shell publicado não existe ou quando faltam `root`, `viewport` ou `charset`. Ele imprime explicitamente que axe/manual ainda precisam ser executados no ambiente publicado. Como gate mínimo de presença de marcadores, o comportamento é seguro e honesto.

O script de seed de Barretos procura evento, lote e pacote existentes e, quando encontra um pacote, preserva os valores operacionais. Essa característica é favorável à preservação de dados, embora o seed não tenha sido executado nesta auditoria.

### 3.3 Documentos operacionais atuais

`docs/cora-deploy-readiness.md` e `docs/relatorio-final-continuidade-2026-08-22.md` fazem uma distinção operacional importante: o código novo pode estar no Git, mas o container saudável antigo continua sendo a versão de produção até que Cora forneça os artefatos mTLS e um deploy controlado seja validado. Os documentos também recomendam não usar mock em produção, manter segredos runtime-only, validar healthcheck e conservar rollback.

`docs/operacao/qa-local-2026-08-28.md` registra corretamente que os 25 testes passaram, mas que integração PostgreSQL e Cora Stage ficaram bloqueadas. O resultado atual dos testes unitários é consistente com esse registro histórico.

## 4. Achados incompletos

### 4.1 Cobertura sem medição

Não há script `test:coverage`, opção `--coverage` no script raiz, configuração `vitest.config.*`, relatório LCOV, diretório de cobertura versionado ou threshold. O lockfile menciona pacotes opcionais de cobertura transitivos do Vitest, mas isso não configura medição nem prova cobertura.

A suíte possui cinco arquivos e 25 testes. Ela não cobre diretamente as rotas Express, `server/db`, migrations em banco real, inventário/holds, outbox/notificações, scheduler de follow-up, OTP, e-mail, webhook/reconciliação Cora, relatórios, páginas web, mobile ou comandos de deploy. A ausência de importação/teste dessas áreas foi observada no conteúdo dos testes; não é uma afirmação de que cada linha esteja defeituosa.

**Inferência de risco:** um green unitário não detectaria regressões em contratos HTTP, permissões, transações, schema real, roteamento web, configuração mobile ou integração externa. Não se deve usar “25/25” como claim de cobertura do produto.

### 4.2 Integração, banco e E2E

`test:integration` não é uma suíte de integração: é um wrapper que apenas chama o verificador de schema. Ele não exercita rotas, autenticação, transações, contratos ou persistência de ponta a ponta. Nesta execução, ficou bloqueado porque `DATABASE_URL` não estava configurada.

O E2E cobre, em princípio, uma sequência valiosa: cria evento/lote/pacotes, cadastra cliente, valida CRM/dashboard, cria reservas das três modalidades, aceita contratos, cria intenções pendentes e verifica HTML/PDF. Porém, o script usa chamadas `POST` e não possui `finally`, exclusões ou transação de rollback. Cria também PDFs no diretório de saída. O roteiro é, portanto, um teste destrutivo para dados de aplicação, apesar de não criar cobrança externa quando o mock é usado.

Para respeitar zero regressão, o E2E precisa de banco efêmero/isolado, credenciais de teste explicitamente habilitadas, namespace de dados e limpeza garantida ou restauração transacional antes de ser incorporado a um gate.

### 4.3 Acessibilidade

O gate atual lê somente `apps/web/dist/index.html` e procura três padrões: `id="root"`, viewport e charset. Não inspeciona DOM renderizado, navegação por teclado, foco, contraste, nomes acessíveis, formulários, rotas, mensagens de erro ou páginas autenticadas. O próprio script admite que axe/manual ainda são necessários.

O resultado `A11Y_STATIC_PASS` deve ser documentado como “shell mínimo aprovado”, não como acessibilidade aprovada.

### 4.4 Web, mobile e build

O `build` raiz compõe servidor, seed e web. O workspace raiz declara somente `apps/web`; `apps/mobile` tem seu próprio `package.json` e scripts Capacitor, mas não existe script raiz para typecheck/build/teste mobile e não há testes mobile versionados. A claim de suporte iOS/Android no README não é acompanhada por um gate que construa ou valide esses alvos.

O workspace web declara um script `lint`, mas o root não o expõe como gate agregado. Também não há CI versionado em `.github` para chamar lint, typecheck, testes, build ou auditoria de dependências. A execução do lint falhou antes de analisar o código porque o executável `eslint` não está instalado/declarado.

### 4.5 Claims de prontidão

O README chama o produto de completo e marca “fluxo completo testável de ponta a ponta”, mas os gates atuais de banco e Cora estão bloqueados, e o E2E não é seguro contra produção. O README também marca “nenhum placeholder, mock, TODO ou dado fictício no código”, enquanto o próprio fluxo E2E utiliza usuário de teste, modo mock e dados de cenário. A interpretação segura é limitar a frase ao código produtivo fora dos fixtures/scripts de teste; hoje ela não está redigida com essa ressalva.

O `docs/operacao/qa-local-2026-08-28.md` é mais preciso que os claims genéricos: registra 25/25, build e typecheck históricos, mas também registra os bloqueios de integração e Cora. Recomenda-se fazer esse documento ou um novo relatório de release ser a fonte única para resultados datados.

## 5. Achados errados/quebrados

### 5.1 Lint declarado, mas não executável

**Fato:** `apps/web/package.json` declara `lint` como `eslint . --ext ts,tsx ...`, porém `npm run lint --workspace apps/web` terminou com `sh: 1: eslint: not found`, código 127. Não há `eslint` nas dependências do package raiz ou do workspace web, e não existe configuração CI que compense isso.

**Impacto:** o repositório oferece um comando que não pode ser usado para aprovar uma mudança. Não é seguro declarar que lint passou ou que a qualidade está fechada.

### 5.2 Gate Cora Stage sem caminho de sucesso

**Fato:** `scripts/test-cora-stage.mjs` verifica nomes de variáveis e `CORA_ENV=stage`, mas, quando não há faltantes, imprime que o ensaio real exige credenciais e reserva autorizada e executa `process.exit(2)`. Assim, o script não chama o endpoint de token nem testa certificado, invoice, idempotência, webhook ou cancelamento; ele retorna bloqueio mesmo em configuração completa.

**Impacto:** como comando chamado `test:cora:stage`, ele não pode passar. Se a intenção é apenas um guard, deve ser nomeado como preflight/blocked-check; se a intenção é teste, falta implementar um ensaio seguro, explicitamente não destrutivo e autorizado.

### 5.3 Roteiro E2E contradiz o script executável

`TEST_E2E.md` descreve camping de R$ 1.000 com total R$ 950, boleto de R$ 1.400 em 3 parcelas e cartão de R$ 1.800 em 10 parcelas. O script atual usa camping de R$ 1.900 com PIX em 1 parcela e total R$ 1.805, quarto ventilador de R$ 2.200 com boleto em 2 parcelas e quarto ar-condicionado de R$ 2.600 com boleto em 12 parcelas. O tipo do script aceita apenas `pix` ou `boleto`; não aceita cartão.

A documentação também afirma que parcelas e IP são registrados como critério de aprovação, mas o script mostrado não faz uma asserção explícita desses campos persistidos; ele verifica principalmente resposta contratual, HTML, marcadores e assinatura `%PDF`.

**Impacto:** um operador que siga a documentação não reproduzirá o cenário que o código executa. Isso pode gerar falsos negativos, falsa aprovação ou, pior, execução do cenário errado em ambiente não isolado.

### 5.4 Documentos de produção com instruções incompatíveis

`RELATORIO_FINAL.md` afirma, em seu fluxo e seção de credenciais, Mercado Pago/Asaas e “100% pronta para produção”. No estado atual, os testes confirmam que Mercado Pago e Asaas são rejeitados em produção e a documentação vigente define Cora como gateway único. `RESUMO_TESTE.txt` também recomenda `PAYMENT_GATEWAY=mercadopago`, subdomínios `comitivaprime-test.com.br` e mudança de produção para Mercado Pago.

`GUIA_DEPLOY_PRODUCAO.md` está explicitamente marcado como histórico e “não usar para produção”, o que reduz o risco, mas ainda contém blocos copiáveis de Mercado Pago, webhook antigo e comandos de deploy. `TESTE_SUBDOMIOS.md`, `DEPLOYMENT.md` e documentos Coolify mais antigos também mantêm instruções operacionais anteriores. Um rótulo histórico não impede erro humano quando o arquivo continua aparecendo nas buscas ou sendo aberto por um operador.

## 6. Achados legado/duplicado

| Grupo | Evidência | Risco operacional |
|---|---|---|
| Gateway legado | `RELATORIO_FINAL.md`, `GUIA_DEPLOY_PRODUCAO.md`, `RESUMO_TESTE.txt`, `TESTE_SUBDOMIOS.md`, `MERCADO_PAGO_SETUP.md` citam Mercado Pago/Asaas | Configurar um gateway que o adaptador atual rejeita em produção |
| Domínio legado | `RESUMO_TESTE.txt` usa `comitivaprime-test.com.br`; documentos Coolify antigos usam `comitivas.permupay.com.br`/`apicomitivas.permupay.com.br` | Testar ou publicar host que não é a autoridade atual |
| API separada antiga | `CONFIGURACAO_CLOUDFLARE_DOMINIO_OFICIAL.md` orienta `api.excursaodascomitivas.com.br`; README e inspeção Coolify mais recente registram o domínio raiz | Divergência entre `API_URL`, CORS, webhook e campo Domains |
| Deploy duplicado | Há vários guias de Coolify/Docker/produção com procedimentos parcialmente sobrepostos | Operação seguir checklist antigo e ignorar rollback/segredos runtime-only |
| Resultados históricos | `RELATORIO_FINAL.md` é de julho; continuidade/QA são datados de agosto | Números e estado de produção serem interpretados como atuais |

A duplicação não é, por si só, defeito de código. Ela se torna defeito operacional porque não há um índice de autoridade, uma convenção de arquivamento fora do caminho principal ou uma validação automática que proíba as variáveis/domínios obsoletos.

## 7. Achados ausentes

1. **Medição de cobertura:** falta configuração Vitest/V8 ou Istanbul, comando de cobertura, thresholds por pacote, relatório persistível e publicação de evidência.
2. **Pipeline de CI:** falta workflow versionado para `npm ci`, typecheck server/web/mobile, lint, unit tests, build, gates estáticos e `npm audit` sem transformar bloqueios externos em falso PASS.
3. **Teste de integração isolado:** falta um banco temporário/efêmero, fixture controlado, execução de migrations em ambiente descartável, testes de rotas e teardown garantido.
4. **E2E seguro:** falta limpeza/finally, modo dry-run, proteção contra URL de produção e verificação que recuse hosts/domínios produtivos.
5. **Teste de rotas e autorização:** faltam casos para autenticação, papéis admin/cliente, reservas, contratos, pagamentos, webhooks, idempotência, inventário e erros HTTP.
6. **Teste Cora Stage real e seguro:** falta um fluxo de token mTLS não destrutivo e autorizado, separado de emissão de invoice; o script atual somente bloqueia.
7. **Acessibilidade real:** falta axe ou equivalente em navegador e roteiro manual reproduzível para rotas públicas, login, checkout, admin e mensagens de erro.
8. **Validação web/mobile:** faltam testes de componentes/páginas, build mobile e verificação dos alvos Capacitor Android/iOS.
9. **Gate de lint funcional:** faltam `eslint`/configuração compatíveis ou remoção explícita do comando para não oferecer um gate falso.
10. **Fonte única de produção/domínio:** falta um índice no README que marque, por data, qual documento é vigente e aponte os históricos para arquivamento; falta também um smoke script passivo que valide o domínio oficial sem criar dados.
11. **Teste de preservação/rollback:** falta uma verificação automatizada e não destrutiva de backup, healthcheck, rollback de aplicação e não alteração de migrations históricas antes da promoção.
12. **Script CI explícito:** falta `test:ci`; o script `test` executa `vitest` sem `--run`, enquanto a execução automatizada depende de uma flag adicional.

## 8. Produção, domínio e preservação de dados

Os documentos de continuidade e readiness registram que a produção deve permanecer no container antigo saudável até a configuração oficial de Cora e a validação do novo container. Esse é o procedimento de menor risco e deve prevalecer sobre os documentos históricos de “pronto para produção”. Não foi feita requisição ao domínio, Coolify, banco ou Cora nesta auditoria; portanto, o estado publicado atual não foi independentemente revalidado aqui.

O código e o frontend contêm referências ao domínio oficial `https://excursaodascomitivas.com.br` para canonical, sitemap, robots e metadados. O README define `API_URL` no domínio raiz, enquanto o documento Cloudflare de julho instrui uma API em subdomínio. A inspeção Coolify de agosto registra somente o domínio raiz no campo Domains e relata os hosts alternativos como problemáticos. Essa divergência deve ser resolvida por uma única decisão operacional antes de qualquer alteração de DNS, CORS ou webhook.

Não há base segura para interpretar “domínio configurado”, “produção saudável” ou “Cora pronta” apenas pela existência de documentação. O relatório atual deve citar sempre: commit, data, ambiente, endpoint observado, código HTTP, healthcheck, configuração nominal e se a observação foi feita antes ou depois do último deploy.

## 9. Prioridades recomendadas

1. **P0 — Não executar E2E contra produção.** Manter a regra operacional de não usar `test:e2e` sem banco isolado e sem cleanup. Não fazer redeploy enquanto as credenciais e arquivos mTLS Cora oficiais não existirem e não forem conferidos.
2. **P0 — Tratar Cora como bloqueio real.** Preservar o container saudável anterior, não habilitar mock em produção e não converter o bloqueio Stage em PASS por alteração de exit code.
3. **P1 — Corrigir o gate de lint.** Declarar `eslint` e sua configuração compatível, ou remover o script; depois adicionar o comando ao gate CI.
4. **P1 — Alinhar `TEST_E2E.md` ao script atual.** Preferencialmente revisar o script para aceitar parâmetros e executar somente em banco efêmero; atualizar valores, métodos e parcelas; incluir teardown e proteção contra domínio de produção.
5. **P1 — Separar preflight Cora de teste Cora.** Renomear o bloqueador atual ou implementar um ensaio mTLS Stage autorizado, sem cobrança real, com critérios explícitos e logs sem segredos.
6. **P1 — Arquivar/neutralizar instruções legadas.** Retirar do caminho operacional documentos de Mercado Pago/Asaas e subdomínios antigos, mantendo-os em área histórica com aviso no primeiro parágrafo e link para a fonte vigente.
7. **P1 — Definir a autoridade de domínio.** Registrar se a API usa o domínio raiz ou subdomínio, atualizar README, `.env.example`, Coolify, CORS, webhook, sitemap e checklists de forma consistente.
8. **P2 — Implantar cobertura e CI.** Medir cobertura por pacote, estabelecer thresholds graduais e adicionar testes de rotas, banco, autorização, pagamentos, acessibilidade e mobile.
9. **P2 — Criar `test:ci` e relatório de release.** O comando deve ser não interativo e separar PASS, BLOCKED e NOT RUN, com data/commit e ambiente. Nenhum BLOCKED deve ser resumido como prontidão total.

## 10. Matriz final por classificação

| Classificação | Síntese |
|---|---|
| **Funcionando** | 25/25 unitários; typecheck server; gate HTML mínimo de acessibilidade; guard de integração sem `DATABASE_URL`; documentação Cora/readiness e preservação de produção em sua versão mais recente |
| **Incompleto** | cobertura não medida; integração não exercita rotas; E2E sem isolamento/cleanup; a11y somente estática; web/mobile sem matriz completa; ausência de CI e build mobile |
| **Errado/quebrado** | lint falha por `eslint` ausente; `test:cora:stage` não tem caminho de sucesso; `TEST_E2E.md` contradiz o script; claims históricos de Mercado Pago/Asaas contradizem o gateway atual |
| **Legado/duplicado** | guias e relatórios de MP/Asaas, subdomínios antigos, procedimentos Coolify/Docker sobrepostos e resultados datados sem índice de autoridade |
| **Ausente** | cobertura/thresholds, CI, `test:ci`, E2E seguro, testes de rotas/DB/webhook, Cora Stage não destrutivo, a11y de navegador, mobile build/test e smoke passivo de domínio |

## Referências locais

[1]: `./package.json` "Scripts e dependências do projeto"

[2]: `./tests/` "Suíte unitária Vitest"

[3]: `./scripts/test-integration.mjs` "Gate de integração e pré-condição DATABASE_URL"

[4]: `./scripts/test-cora-stage.mjs` "Gate/preflight Cora Stage"

[5]: `./scripts/test-a11y.mjs` "Gate estático de acessibilidade"

[6]: `./scripts/e2e-fluxo-completo.mts` "Cenário E2E com criação de dados"

[7]: `./TEST_E2E.md` "Roteiro E2E documentado"

[8]: `./docs/operacao/qa-local-2026-08-28.md` "Evidência histórica de QA local"

[9]: `./docs/cora-deploy-readiness.md` "Fonte operacional atual de prontidão Cora"

[10]: `./docs/relatorio-final-continuidade-2026-08-22.md` "Continuidade, produção preservada e bloqueio Cora"

[11]: `./RELATORIO_FINAL.md` "Relatório histórico com claims legados de gateway"

[12]: `./GUIA_DEPLOY_PRODUCAO.md` "Guia histórico de produção"

[13]: `./RESUMO_TESTE.txt` "Resumo histórico com domínios e gateway legados"

[14]: `./CONFIGURACAO_CLOUDFLARE_DOMINIO_OFICIAL.md` "Configuração histórica de domínio/API"

[15]: `./apps/web/package.json` "Scripts do workspace web, incluindo lint"

[16]: `./apps/mobile/package.json` "Scripts independentes do aplicativo mobile"

[17]: `./docker-compose.yml` "Composição local com PostgreSQL e aplicação"

[18]: `./docs/operacao/coolify-inspecao-2026-08-28.md` "Estado de Coolify registrado em agosto"

[19]: `./README.md` "Claims gerais e instruções públicas do projeto"

[20]: `./.gitignore` "Exclusões de coverage e artefatos"

[21]: `./apps/web/src/` "Código web com referências ao domínio oficial"

[22]: `./server/index.ts` "Bootstrap do servidor e origens web"

[23]: `./package-lock.json` "Lockfile e workspace raiz"

[24]: `./.github/` "Diretório CI; não há arquivos versionados na árvore auditada"

[25]: `./auditoria-tests-docs.md` "Este relatório"

> **Nota sobre fatos e inferências:** resultados de comandos e conteúdo de arquivos foram tratados como fatos. Riscos de operação, impacto de documentação conflitante e prioridade foram explicitamente tratados como inferências/recomendações. O estado atual de serviços externos não foi declarado como verificado porque esta auditoria não fez chamadas de produção, Coolify, PostgreSQL ou Cora.
