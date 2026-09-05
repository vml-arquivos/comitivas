# Auditoria de Segurança, Cora e Deploy

**Repositório:** `/home/ubuntu/comitivas`
**Escopo:** middleware, autenticação, autorização, rate limit, CORS, Helmet, arquivos gerados/uploads, webhook, segredos, gateway ativo, Dockerfile, Compose, env e documentação Coolify.
**Data da inspeção:** 5 de setembro de 2026.
**Método:** inspeção somente leitura do código-fonte, manifests, documentos, histórico e estado local; execução de testes unitários selecionados e verificação TypeScript sem emissão de arquivos. Não foram feitas alterações de código, migrations, consultas de produção, deploys ou comandos destrutivos.

## 1. Conclusão executiva

O código atual apresenta uma base de segurança significativamente mais consistente que os documentos históricos de deploy. O caminho ativo é **Express + frontend no mesmo container + Banco Cora**, com JWT, bcrypt, sessão revogável por `session_version`, cookies `HttpOnly`, Helmet, allowlist de CORS, limites de requisição, mTLS para Cora, idempotência de cobrança e deduplicação de webhook.

Há, porém, dois riscos de autorização que devem ser tratados antes de uma promoção sem regressão: um vendedor autenticado pode consultar a jornada de qualquer `usuario_id` em `GET /api/jornada/cliente/:usuario_id`, porque a rota exige o papel correto mas não restringe a carteira do vendedor; e o endpoint público `PATCH /api/publico/leads/:lead_id/intencao` altera um lead sem autenticação ou prova de posse do identificador. O primeiro expõe dados pessoais e reservas entre carteiras. O segundo permite adulteração de intenção de lead por quem obtiver ou tentar um ID válido.

Também existe risco operacional relevante no caminho de produção: o `docker-compose.yml` é claramente de desenvolvimento, publica PostgreSQL e a aplicação em portas do host, contém credenciais de desenvolvimento em texto e define `NODE_ENV=development`; os arquivos Coolify históricos ainda instruem Mercado Pago, domínios antigos e criação de novo serviço. Esses arquivos estão marcados como arquivados em parte, mas continuam versionados e são facilmente confundidos com instruções atuais. A autoridade operacional mais segura é o código atual, `.env.example` atualizado e `docs/operacao/deploy-coolify.md`, não os blocos antigos.

**Classificação geral:** base funcional com falhas de autorização de alta prioridade, controles de webhook dependentes de configuração, persistência local de documentos dependente de volume externo e documentação de deploy legada/duplicada.

## 2. Fatos, inferências e limites

Neste relatório, **fato** significa comportamento diretamente observado em arquivo, teste ou comando local. **Inferência** significa consequência provável que depende de uma configuração externa, da topologia do Coolify/Cloudflare ou de dados não disponíveis no repositório. O estado real de variáveis no Coolify, certificados mTLS, firewall, volume persistente, backups, regras do Traefik e banco de produção **não foi confirmado**; os documentos locais são evidência do que foi registrado, não prova do estado atual do ambiente remoto.

A auditoria não abriu valores de segredos reais. O repositório não contém, no momento da inspeção, arquivos locais `.pem`, `.key`, `.crt`, `.p12` ou `.env` de runtime; contém `.env.example` e `.env.teste`, ambos versionados. O relatório não executou conexão com banco nem chamadas à Cora.

## 3. Inventário resumido por classificação

| Área | Classificação | Evidência principal | Avaliação |
| --- | --- | --- | --- |
| Middleware de segurança | **Funcionando** | `server/index.ts:42-78` | Helmet, `x-powered-by` desativado, body limit de 1 MB, CORS com allowlist e credenciais. |
| JWT e sessão | **Funcionando, com incompletude** | `server/services/authService.ts:7-43`; `server/routes/auth.ts:14-21`; `server/middleware/authMiddleware.ts:22-47` | JWT obrigatório em produção, bcrypt, cookie seguro e revogação por versão; token também é devolvido no JSON e não há CSRF explícito. |
| Autorização | **Incompleta/errada em uma rota** | `server/routes/admin.ts:53-115`; `server/routes/jornada.ts:215-275` | Admin tem guard global e vendedor tem escopo no dashboard, mas a consulta de jornada por usuário não restringe vendedor à própria carteira. |
| Rate limit | **Funcionando, incompleto para escala** | `server/index.ts:30-40` e montagens nas linhas 85-109 | Login/auth, OTP e webhook têm limites; store é local em memória e não há limite dedicado para leads públicos. |
| CORS/proxy | **Funcionando, dependente de configuração** | `server/index.ts:30-31,63-78`; `docs/seguranca/proxy-ip-cloudflare-coolify.md` | Não confia em `trust proxy=true`; a lista real de proxies precisa ser configurada e validada. |
| Helmet/CSP | **Funcionando** | `server/index.ts:43-60` | CSP explícita, frame ancestors none, objetos bloqueados e `x-powered-by` removido. `unsafe-inline` permanece em estilos. |
| Uploads/arquivos | **Parcialmente funcionando** | `server/services/otpService.ts:160-176`; `server/routes/contratos.ts:260-263` | Não há upload HTTP genérico; PDFs são criados com modo 0600 e download verifica contenção de caminho. Persistência depende de armazenamento externo. |
| Webhook Cora | **Incompleto e sensível a configuração** | `server/routes/pagamentos.ts:32-40,180-220` | HMAC, raw body, deduplicação e consulta mTLS existem; em produção a ausência de segredo rejeita eventos, mas fora de produção o webhook aceita sem assinatura. |
| Gateway ativo | **Funcionando no código atual** | `server/services/paymentGatewayAdapter.ts:71-109`; `server/services/coraPaymentProvider.ts:97-176` | Produção aceita somente Cora; Mercado Pago aparece apenas em documentação/env legado. |
| Segredos | **Incompleto/errado em artefatos de deploy** | `.env.example`; `.env.teste`; `docker-compose.yml:22-28`; `server/db/index.ts:254-273` | Não há credencial real detectada, mas há segredo JWT e senha DB de desenvolvimento em Compose e admin de teste com senha conhecida quando habilitado. |
| Dockerfile | **Funcionando, incompleto para endurecimento** | `Dockerfile:1-70` | Multi-stage, `npm ci`, healthcheck e runtime separado; executa como root, não declara filesystem read-only e o healthcheck é liveness, não readiness do DB. |
| Compose | **Errado para produção/legado para Coolify** | `docker-compose.yml:3-39` | Publica DB e app, usa credenciais fixas e `NODE_ENV=development`; deve ser tratado apenas como ambiente local isolado. |
| Documentos Coolify | **Legado/duplicado, com guia atual separado** | `COOLIFY_*.txt`, `COOLIFY_SEM_CONFLITOS.md`, `CORRECAO_DEPLOY_COOLIFY_2026-07-25.md`, `docs/operacao/deploy-coolify.md` | Há instruções antigas de Mercado Pago, domínios `permupay` e criação de serviço novo em conflito com Cora-only e preservação do recurso existente. |

## 4. Funcionando

### 4.1 Middleware HTTP, Helmet e CORS

O bootstrap desativa `x-powered-by` e aplica Helmet antes das rotas. A CSP define `default-src 'self'`, restringe `frame-ancestors` a `'none'`, bloqueia objetos, limita scripts ao próprio site e permite somente o frame do YouTube sem cookies. A política permite `style-src 'unsafe-inline'`, que reduz o endurecimento de CSP, mas não é uma ausência do middleware. O `crossOriginEmbedderPolicy` foi desativado explicitamente, aparentemente para compatibilidade com a aplicação.

O parser JSON e o parser URL-encoded limitam corpos a 1 MB. O parser JSON preserva `rawBody`, necessário para o HMAC do webhook. O CORS aceita apenas a origem oficial em produção, `localhost:5173` fora de produção e valores adicionais explicitamente informados em `WEB_URL`; credenciais estão habilitadas. Requisições sem `Origin` são aceitas para healthcheck, curl e comunicação servidor-servidor. Esse comportamento é fato; a adequação da lista final depende do domínio efetivamente usado no Coolify.

### 4.2 Autenticação e sessão

`AuthService` usa bcrypt para senhas e JWT com expiração de sete dias. Em produção, a ausência de `JWT_SECRET` interrompe a inicialização por erro. O middleware valida o token por Bearer ou cookie, consulta o usuário no banco, exige usuário ativo e compara `session_version`, permitindo revogar sessões ao incrementar a versão.

O cookie `auth_token` usa `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=604800` e `Secure` em produção. O fluxo de recuperação cria token aleatório de 32 bytes, armazena apenas SHA-256, expira em 30 minutos, marca o token como usado dentro de transação e incrementa `session_version` ao redefinir a senha. Esses são controles positivos observados no código.

O login, cadastro, refresh e recuperação passam pela montagem de `/api/auth` com o rate limit de autenticação. A verificação unitária executada passou: **6 testes em 2 arquivos**, cobrindo exigência de `JWT_SECRET` em produção e validação de configuração do gateway.

### 4.3 Autorização predominante

As rotas de contratos são montadas sob `authMiddleware`; operações de contrato, estado, validação, download, voucher e visualização verificam o proprietário da reserva ou o papel `admin`. O download de PDF resolve o caminho configurado e rejeita arquivo fora de `STORAGE_PATH`, mitigando traversal por manipulação do valor persistido.

O router administrativo aplica `authMiddleware` globalmente e permite o dashboard para `admin` e `vendedor`. Para o dashboard, vendedor é filtrado por `leads_origem.vendedor_id`; as demais rotas passam por `requireRole('admin')`. Cupons também têm guard global de admin. A maior parte do padrão de autorização por proprietário/admin está consistente.

### 4.4 Rate limit e proxy

Há três limitadores em memória: autenticação, OTP e webhook. Em produção, os limites são respectivamente 20 requisições por 15 minutos, 10 por 15 minutos e 120 por minuto. Eles usam headers padrão draft-7 e não usam headers legados.

O Express não usa `trust proxy=true`. Ele usa uma função que só confia em IPs presentes em `TRUSTED_PROXY_IPS`, com loopback como default. Essa escolha evita confiar cegamente em `X-Forwarded-For`; os documentos de segurança também registram a necessidade de preencher somente os hops sob controle e bloquear acesso direto à origem.

### 4.5 Gateway Cora, mTLS e idempotência

O adapter atual aceita `cora` ou `mock`, mas rejeita `mock` em produção. O gateway padrão efetivo é Cora quando não há override, e o fluxo produtivo chama `validarConfiguracaoSegura({ strict: true })` antes de emitir cobrança. Mercado Pago e Asaas não possuem caminho ativo no adapter atual.

O cliente Cora valida `CORA_CLIENT_ID`, `CORA_CERT_PATH` e `CORA_PRIVATE_KEY_PATH`, verifica acesso de leitura aos certificados, usa `https.Agent` com certificado e chave mTLS e `rejectUnauthorized: true`. O access token é obtido por client credentials e mantido em memória com renovação antecipada. As requisições usam timeout configurável, Authorization Bearer e `Idempotency-Key` quando fornecida.

A criação de cobrança confere o valor solicitado com o valor autoritativo da reserva usando `Decimal`, registra chave idempotente, usa `onConflictDoNothing` e grava resposta local. O webhook consulta a cobrança remotamente antes de reconciliar estado pago, possui registro único por `evento_id`, conta tentativas e trata duplicatas já processadas. Isso reduz risco de confirmação financeira baseada apenas no payload recebido.

### 4.6 Arquivos contratuais

Não foi encontrada rota multipart ou upload genérico. Os arquivos observados são PDFs gerados pelo próprio sistema após validação OTP. O PDF é salvo com `mode: 0o600`, o caminho é armazenado e o endpoint de download exige autenticação e proprietário/admin. Portanto, a superfície de upload de arquivos arbitrários está ausente no código auditado.

### 4.7 Integridade básica do build

O Dockerfile usa build multi-stage, `npm ci`, copia somente o artefato compilado e migrations para runtime, instala Chromium para geração de PDF e define healthcheck HTTP para `/api/health`. O `.dockerignore` exclui `.env`, uploads, `.git`, dependências e artefatos de build. O TypeScript server foi verificado com `npx tsc -p tsconfig.server.json --noEmit` sem erros.

## 5. Incompleto

### 5.1 Limitação de rate limit em múltiplas instâncias

O `express-rate-limit` usa o armazenamento padrão em memória. **Fato:** não há store Redis ou outro store compartilhado no código. **Inferência:** em mais de uma réplica ou após reinício, o limite não é global; isso permite distribuição de tentativas entre processos e perde contadores no restart. A documentação de proxy reconhece a topologia, mas não há mecanismo distribuído. Deve ser resolvido somente se houver escala horizontal ou exposição relevante, sem trocar o store durante um incidente sem validar impacto.

Também não há limite dedicado para `POST /api/publico/leads` ou `PATCH /api/publico/leads/:lead_id/intencao`. O corpo é limitado a 1 MB, mas um cliente pode automatizar gravações/atualizações. A falta é especialmente relevante porque o segundo endpoint não exige autenticação.

### 5.2 CSRF explícito ausente

A autenticação por cookie usa `SameSite=Lax` e CORS com allowlist, mas não há token CSRF nem verificação uniforme de `Origin`/`Referer` nas operações mutáveis. **Fato:** a defesa explícita de CSRF não aparece no código. **Inferência:** o risco é reduzido para POST cross-site em navegadores modernos pelo `SameSite=Lax`, mas não é zero em cenários same-site, subdomínios sob o mesmo registrable domain, clientes que adotem Bearer ou mudanças futuras de cookie. O primeiro passo de correção deve preservar o Bearer/mobile e acrescentar proteção testada às rotas que dependem de cookie.

### 5.3 Dois canais de sessão

O login devolve o JWT no corpo JSON e também o grava em cookie `HttpOnly`. **Fato:** `server/routes/auth.ts:405-414` retorna `token` e define cookie. **Inferência:** o frontend pode usar Bearer e cookie, mas manter o token acessível a JavaScript aumenta o impacto de XSS se o cliente o guardar em storage. É uma duplicidade de canal que deve ser tratada como compatibilidade legada, não removida sem inventariar o cliente web e o app móvel.

### 5.4 Configuração Cora não verifica coerência de ambiente

`CORA_ENV` escolhe defaults de URL, mas as URLs são sobrescrevíveis por `CORA_TOKEN_URL`, `CORA_API_BASE_URL` e `CORA_INSTALLMENTS_API_BASE_URL`. A validação confirma presença dos caminhos e legibilidade de certificados, porém não verifica se URLs stage acompanham `CORA_ENV=stage`, se URLs de produção acompanham `CORA_ENV=production` ou se o host de webhook corresponde ao recurso publicado. **Fato:** a validação não faz essa correlação. **Inferência:** um conjunto misto pode mandar credenciais/certificados para ambiente incorreto ou fazer smoke test contra endpoint errado. A mudança deve ser feita com matriz stage/produção e teste de configuração, não por troca ampla de env em produção.

A validação em produção exige apenas que `CORA_WEBHOOK_PUBLIC_URL` comece com `https://`; os documentos exigem o endpoint específico `/api/pagamentos/webhook/cora`. O código não valida o path exato.

### 5.5 HMAC do webhook depende de segredo e convenção não confirmada

O sistema calcula HMAC-SHA256 sobre o raw body e aceita headers `x-cora-signature`, `x-webhook-signature` ou `x-signature` em hexadecimal. **Fato:** a verificação existe e usa comparação em tempo constante. Em produção, sem `CORA_WEBHOOK_HMAC_SECRET`, o webhook é rejeitado; fora de produção, sem segredo, é aceito.

**Limite/inferência:** os documentos internos registram que a documentação Cora consultada não apresentou HMAC como header padrão. Não foi feita chamada externa nesta auditoria. Portanto, é necessário confirmar no contrato real da conta Cora se o header, encoding hexadecimal e algoritmo correspondem ao emissor. Se a Cora não assinar com esse formato, eventos legítimos falharão; se o deploy público estiver com `NODE_ENV` incorreto, o modo sem segredo aceitará eventos não autenticados.

### 5.6 Persistência de PDFs e variável `STORAGE_TYPE`

`STORAGE_PATH` é usado para criar e ler PDFs, mas `STORAGE_TYPE` não aparece como decisão de backend. Não existe implementação S3/object storage apesar de `.env.example` e documentos mencionarem armazenamento. **Fato:** o armazenamento é local ao filesystem do processo. **Inferência:** em Coolify, os PDFs só sobrevivem a redeploy/recriação se houver volume persistente corretamente montado; isso não pode ser provado pelos arquivos locais. A preservação de dados exige confirmar volume, permissões, backup e restauração antes de qualquer migração.

### 5.7 Endurecimento do container

O Dockerfile não declara `USER` não-root, não define `read_only`, não limita capabilities e não especifica uma política de filesystem temporário. Também não há endpoint de readiness que valide banco; `/api/health` retorna `status: ok` diretamente. **Fato:** o healthcheck prova apenas que o processo HTTP responde. **Inferência:** o Coolify pode considerar saudável uma aplicação que não esteja pronta para transações, enquanto o boot real falha na inicialização do banco; isso deve ser tratado sem fazer o healthcheck depender de operação destrutiva.

## 6. Errado ou quebrado

### 6.1 Falha de autorização por carteira em `GET /api/jornada/cliente/:usuario_id` — alta prioridade

Em `server/routes/jornada.ts:215-275`, a rota exige `authMiddleware` e `requireRole('admin', 'vendedor')`, mas consulta `leads_origem`, `reservas` e `usuarios` apenas pelo `usuario_id` informado. Não há condição `vendedor_id = req.usuario.id` para vendedor. A resposta inclui nome, e-mail, data de criação, origem, status, contagem e reservas com valores.

**Fato:** vendedor autenticado que conheça um `usuario_id` pode consultar dados de outro cliente. **Classificação:** autorização errada/broken. **Impacto:** exposição de dados pessoais, reservas e valores entre carteiras. **Prioridade:** P0 antes de produção. A correção deve ser mínima: admin mantém consulta ampla; vendedor deve exigir lead atribuído a ele, retornar 404/403 indistinguível conforme padrão adotado e preservar a resposta atual para o caso autorizado.

### 6.2 Endpoint público de intenção de lead sem prova de posse — média/alta prioridade

Em `server/routes/publico.ts:194-224`, `PATCH /leads/:lead_id/intencao` não possui autenticação, rate limit específico ou token de posse. Valida lote/pacote e atualiza qualquer registro cujo ID coincida. A resposta não devolve dados pessoais, mas altera status, lote e pacote do lead.

**Fato:** a mutação é pública. **Inferência:** CUID2 reduz adivinhação casual, mas não substitui autorização; vazamento de ID em URL, logs, analytics ou cliente permite adulteração. **Classificação:** autorização incompleta/errada. **Prioridade:** P1. Para evitar regressão no funil, preservar o fluxo pré-login com um token de intenção assinado e limitado ao lead, ou mover a alteração para uma sessão autenticada; adicionar rate limit e testes de autorização.

### 6.3 Admin de teste com credencial conhecida se habilitado em produção — alta prioridade

`server/db/index.ts:254-273` cria `admin@comitivas.test` com senha fixa `Comitiva@2026!Teste` quando `ENABLE_TEST_ADMIN=true`. A condição não exige `NODE_ENV` diferente de produção. O `.env.example` documenta `ENABLE_TEST_ADMIN=false`, e o runbook manda confirmar esse valor, mas a proteção não é imposta pelo código.

**Fato:** bastaria uma variável de produção incorreta para criar um administrador conhecido. **Classificação:** broken-by-misconfiguration / guard ausente. **Prioridade:** P0. A correção segura é impedir explicitamente o caminho quando `NODE_ENV=production`, além de verificar ausência de usuário de teste no ambiente real sem apagar dados.

### 6.4 Compose não é seguro como caminho de produção

`docker-compose.yml:3-39` publica `5432:5432` e `3000:3000`, usa `comitiva_password`, `dev_secret_key_change_in_production`, `NODE_ENV=development`, monta `./server` e `./uploads` e não define secrets/healthcheck para a aplicação. O gateway aparece como `cora`, mas não há certificados, cliente ou webhook configurados.

**Fato:** este Compose não representa um ambiente produtivo seguro. **Classificação:** errado se usado em produção; aceitável apenas como fixture local deliberada. **Prioridade:** P0 operacional. Não deve ser usado como base de Coolify sem isolamento de portas, credenciais reais via secret manager, volume persistente e `NODE_ENV=production`. A correção deve preservar o banco existente e não recriar volume.

### 6.5 Risco de configuração pública com `NODE_ENV` não produtivo

O webhook aceita ausência de HMAC quando `NODE_ENV !== 'production'`, e o JWT usa `dev-secret-change-in-production` fora de produção se `JWT_SECRET` não existir. **Fato:** ambos os fallbacks existem no código. **Inferência:** se o serviço público for implantado com `NODE_ENV=development` ou sem `JWT_SECRET`, a superfície fica vulnerável a falsificação de webhook e token. **Prioridade:** P0 de configuração. O boot de um domínio público deve falhar fechado quando não estiver em um perfil explicitamente local/teste; isso deve ser introduzido com cuidado para não quebrar QA local.

## 7. Legado e duplicado

### 7.1 Documentos de Mercado Pago e domínios antigos

`COOLIFY_ENV_BLOCO.txt`, `COOLIFY_VARIAVEIS_FINAIS.txt` e `COOLIFY_SEM_CONFLITOS.md` instruem `PAYMENT_GATEWAY=mercadopago`, variáveis `MERCADOPAGO_*`, domínios `comitivas.permupay.com.br`/`apicomitivas.permupay.com.br` e criação de novo serviço. `CORRECAO_DEPLOY_COOLIFY_2026-07-25.md` repete a instrução Mercado Pago. Esses textos registram datas de julho de 2026 e alguns dizem explicitamente “arquivado para auditoria; não executar”, mas continuam no repositório.

O código atual rejeita Mercado Pago no adapter produtivo e usa Cora. Os documentos devem ser movidos para uma área histórica claramente separada, ou receber aviso visual inequívoco no nome e no topo. Não devem permanecer como “variáveis finais” sem um prefixo `LEGADO`.

### 7.2 Duplicidade de runbooks

Há sobreposição entre `DEPLOYMENT.md`, `DEPLOY_COOLIFY.md`, `DEPLOY_DOCKERFILE_COOLIFY.md`, `GUIA_DEPLOY_PRODUCAO.md`, `REDEPLOY_PRODUCAO_V18.md`, `docs/coolify-deploy-observacao.md`, `docs/operacao/coolify-inspecao-2026-08-28.md`, `docs/operacao/coolify-variaveis-audit-2026-08-28.md` e `docs/operacao/deploy-coolify.md`. O documento operacional mais coerente com o código é o último, pois exige recurso existente, backup, `ENABLE_TEST_ADMIN=false`, secrets runtime-only, volume persistente, healthcheck e rollback.

A duplicidade cria risco de execução da instrução errada. O objetivo não deve ser apagar em lote: preservar os registros históricos, marcar status e apontar um único runbook canônico.

### 7.3 Variáveis sem uso ativo ou com função diferente

`STORAGE_TYPE` é documentada, mas não conduz implementação de armazenamento. `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_PUBLIC_KEY` aparecem em env/docs, mas não têm caminho produtivo no código atual. A presença residual não prova vazamento de segredo, mas aumenta erro operacional e deve ser removida apenas de templates ativos após confirmar consumidores externos.

## 8. Ausente

1. **Controle de escopo de vendedor na rota de jornada por usuário.** O guard de papel existe, mas falta a regra de pertencimento da carteira.
2. **Token de posse/anti-abuso para intenção pública de lead.** O endpoint precisa preservar o funil pré-login sem aceitar mutação arbitrária por ID.
3. **Bloqueio de `ENABLE_TEST_ADMIN` em produção.** A documentação recomenda false, mas a aplicação não impõe o ambiente.
4. **Store distribuído de rate limit.** Não há Redis ou equivalente; a necessidade depende de múltiplas réplicas, mas o componente está ausente.
5. **Rate limit específico para captura e intenção de leads.** O limitador de autenticação não cobre essas rotas públicas.
6. **CSRF explícito para fluxos autenticados por cookie.** A proteção atual depende principalmente de SameSite e CORS.
7. **Validação de coerência entre `CORA_ENV`, hosts stage/produção e path exato do webhook.** Há validação de presença/HTTPS, não de conjunto consistente.
8. **Implementação de object storage apesar da configuração documentada.** O backend usa filesystem local; não há S3/provider nem política de retenção.
9. **Readiness separado de liveness.** O healthcheck não verifica banco, migrations prontas ou dependências necessárias.
10. **Endurecimento explícito do container.** Não há usuário não-root, filesystem read-only ou redução de capabilities.
11. **Fonte única de verdade para Coolify.** Existem vários guias ativos/históricos com gateways, domínios e procedimentos divergentes.
12. **Prova local de configuração remota.** Não há no repositório evidência verificável do volume Coolify, secrets mTLS, IPs reais do proxy, firewall, backup atual ou commit efetivamente publicado.

## 9. Prioridades de correção com zero regressão

| Prioridade | Ação | Motivo e salvaguarda |
| --- | --- | --- |
| **P0** | Corrigir o escopo de vendedor em `jornada/cliente` e adicionar testes de admin, vendedor proprietário, vendedor não proprietário e cliente. | Fecha exposição de PII sem alterar dados. Testar antes de publicar; não fazer migration. |
| **P0** | Impedir `ENABLE_TEST_ADMIN=true` em produção e confirmar `false` no Coolify. | Elimina administrador com senha conhecida. Apenas bloquear criação futura; não apagar usuário existente sem procedimento autorizado. |
| **P0** | Confirmar `NODE_ENV=production`, `JWT_SECRET`, `OTP_PEPPER`, mTLS e HMAC no recurso real; não promover se ausentes. | Mantém boot e webhook em modo fechado. Não imprimir nem copiar segredos para Git/logs. |
| **P0** | Não usar `docker-compose.yml` nem os blocos Mercado Pago como configuração de produção. | Evita exposição de PostgreSQL, credenciais fixas, gateway errado e perda de dados. Preservar recurso/volume existente. |
| **P1** | Proteger `PATCH /api/publico/leads/:lead_id/intencao` com token de intenção assinado/expirável ou sessão apropriada e rate limit. | Reduz adulteração sem remover o fluxo pré-login; validar com testes E2E do checkout. |
| **P1** | Confirmar contrato real de assinatura do webhook Cora, header e encoding; testar duplicata, replay, evento desconhecido, consulta indisponível e resposta 500. | Evita aceitar evento falso ou rejeitar evento legítimo. Não mudar algoritmo sem evidência da Cora. |
| **P1** | Validar coerência de `CORA_ENV` com todos os hosts e exigir path oficial do webhook. | Reduz risco stage/produção cruzado. Fazer primeiro em testes de configuração. |
| **P1** | Confirmar volume persistente, backup e restauração dos PDFs antes de redeploy/migration. | Preserva documentos e dados existentes; nenhum comando destrutivo deve ser usado como teste. |
| **P2** | Definir estratégia para rate limit distribuído se houver mais de uma réplica e limites específicos para leads. | Evita bypass por escala e abuso de endpoints públicos. Medir antes para não bloquear usuários legítimos. |
| **P2** | Consolidar documentação em um runbook canônico e marcar todos os históricos como legado. | Reduz erro humano; não remover registros de auditoria. |
| **P2** | Criar readiness separado de `/api/health` e endurecer container após validar Coolify. | Melhora operação sem quebrar o healthcheck atual de forma abrupta. |
| **P3** | Decidir formalmente se haverá object storage; se não houver, remover `STORAGE_TYPE` dos templates ativos e documentar volume local. | Evita falsa sensação de redundância e configuração morta. |
| **P3** | Avaliar remoção gradual do JWT no corpo de login, mantendo compatibilidade móvel até inventário completo. | Reduz exposição XSS sem regressão de clientes existentes. |

## 10. Comandos e verificações executados

Foram usados apenas comandos de leitura e validações locais: inventário com `find`, `git ls-files`, `git status`, `git grep`/`grep`, leitura numerada de arquivos; `npm test -- --run tests/authService.spec.ts tests/paymentGatewayConfig.spec.ts`; e `npx tsc -p tsconfig.server.json --noEmit`. Os testes selecionados passaram com 6 testes em 2 arquivos. A checagem TypeScript terminou sem erro. Não houve `npm run db:migrate`, conexão com banco, chamada à Cora, build/deploy remoto, alteração de código ou alteração de banco.

## 11. Referências locais

As referências abaixo são arquivos do próprio repositório auditado; linhas citadas no texto correspondem ao estado lido durante a inspeção.

[1]: file:///home/ubuntu/comitivas/server/index.ts "Bootstrap HTTP, Helmet, CORS, proxy e rate limits"
[2]: file:///home/ubuntu/comitivas/server/middleware/authMiddleware.ts "Middleware JWT, usuário ativo, versão de sessão e papéis"
[3]: file:///home/ubuntu/comitivas/server/routes/auth.ts "Autenticação, cookies, login e recuperação de senha"
[4]: file:///home/ubuntu/comitivas/server/services/authService.ts "JWT e bcrypt"
[5]: file:///home/ubuntu/comitivas/server/routes/jornada.ts "Rotas de jornada e carteira de vendedor"
[6]: file:///home/ubuntu/comitivas/server/routes/publico.ts "Captura e atualização pública de leads"
[7]: file:///home/ubuntu/comitivas/server/routes/pagamentos.ts "Criação, webhook, HMAC e reconciliação Cora"
[8]: file:///home/ubuntu/comitivas/server/services/paymentGatewayAdapter.ts "Seleção de gateway, configuração segura e idempotência"
[9]: file:///home/ubuntu/comitivas/server/services/coraPaymentProvider.ts "mTLS, token e chamadas à Cora"
[10]: file:///home/ubuntu/comitivas/server/routes/contratos.ts "Autorização e download de PDFs"
[11]: file:///home/ubuntu/comitivas/server/services/otpService.ts "Geração e persistência de PDF após OTP"
[12]: file:///home/ubuntu/comitivas/server/db/index.ts "Schema inicial, migrations e admin de teste"
[13]: file:///home/ubuntu/comitivas/Dockerfile "Imagem multi-stage, runtime e healthcheck"
[14]: file:///home/ubuntu/comitivas/docker-compose.yml "Compose local com portas e credenciais de desenvolvimento"
[15]: file:///home/ubuntu/comitivas/.env.example "Template atual de variáveis"
[16]: file:///home/ubuntu/comitivas/docs/operacao/deploy-coolify.md "Runbook operacional atual de Coolify"
[17]: file:///home/ubuntu/comitivas/docs/seguranca/proxy-ip-cloudflare-coolify.md "Orientação de proxy e IP"
[18]: file:///home/ubuntu/comitivas/COOLIFY_ENV_BLOCO.txt "Bloco Coolify histórico"
[19]: file:///home/ubuntu/comitivas/COOLIFY_VARIAVEIS_FINAIS.txt "Variáveis Coolify históricas"
[20]: file:///home/ubuntu/comitivas/CORRECAO_DEPLOY_COOLIFY_2026-07-25.md "Correção histórica de deploy"

**Observação final:** este documento é uma auditoria estática do repositório. Ele não certifica a configuração remota do Coolify, a existência de backups restauráveis, a proteção do firewall, a presença de certificados ou o commit atualmente publicado. Qualquer correção deve começar por registrar o estado atual, confirmar backup e preservar o volume/banco existentes.
