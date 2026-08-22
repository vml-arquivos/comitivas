# Relatório final de continuidade operacional e segurança

**Sistema:** Excursão das Comitivas 2026
**Repositório oficial:** [`vml-arquivos/comitivas`](https://github.com/vml-arquivos/comitivas)
**Data:** 22 de agosto de 2026, GMT-3
**Responsável pelo relatório:** Manus AI

> **SISTEMA CORRIGIDO E SEGURO — NOVO DEPLOY BLOQUEADO SOMENTE POR CREDENCIAIS EXTERNAS CORA.**

A continuidade foi concluída preservando a produção saudável, sem apagar dados válidos, sem alterar as migrations históricas `0000`–`0006`, sem inserir segredos no Git e sem executar cobrança real. O banco foi respaldado antes da mudança, a migration `0007` foi aplicada pelo migrator nativo do Drizzle e o estado pós-migration foi verificado no PostgreSQL real. O novo container não foi promovido porque a conta Banco Cora ainda não forneceu as credenciais e os arquivos mTLS necessários.

## Decisão operacional

| Item | Estado final | Evidência objetiva |
|---|---|---|
| Produção atual | **Preservada** | Container `sas04ljxfacvwa3zlmig28zw-072158264529`, commit `7fbd82f`, `Running/healthy` |
| Novo deploy | **Não executado** | Bloqueado por credenciais externas Cora ausentes; não houve promoção cega |
| Código publicado | **Concluído** | `origin/main` em `443b52a52d41eb4fbf77e373be5e3e8f5dafbf45` |
| Gateway produtivo | **Cora-only no código** | Mock e gateways legados são rejeitados em produção pelo adaptador |
| Banco | **Migration 0007 aplicada e validada** | Histórico Drizzle `8`, 10 tabelas, 132 colunas, 9 índices, regras `2026.1` íntegros |
| Coolify | **Configuração preparada, não aplicada ao container** | 11 mudanças pendentes; nenhum redeploy após as correções |
| Bloqueador restante | **Externo e único** | Client ID, certificado e private key mTLS da Cora ainda não existem/configurados |

## Banco de dados e backup

O backup foi realizado antes da alteração no banco saudável, dentro do volume persistente de uploads. O arquivo não foi incluído no repositório nem no relatório; somente seus metadados operacionais são registrados abaixo.

| Campo | Valor |
|---|---|
| Arquivo | `pre-migration-20260822T174913Z.sql.gz` |
| Local | Volume persistente `/app/uploads/backups` do container saudável |
| Tamanho | `7.287` bytes |
| SHA-256 | `b034f91fb22113aa828c6ca24115d487e744d7f483d94ffcc2ab4665495f29f6` |
| Banco antes da migration | 7 registros em `drizzle.__drizzle_migrations`; estruturas da 0007 ausentes |
| Banco depois da migration | 8 registros em `drizzle.__drizzle_migrations`; verificação integral aprovada |

O SQL oficial da `0007_evolucao_comitivas.sql` foi baixado por HTTPS a partir do commit publicado e comparado ao arquivo local. O artefato tinha `9.032` bytes e SHA-256 coincidente com o arquivo local. O journal oficial tinha `1.291` bytes e também foi validado antes da execução. O migrator PostgreSQL nativo concluiu com `drizzle_migration_complete`, registrando o histórico de maneira compatível com o Drizzle; nenhum arquivo base64 parcial foi decodificado ou executado.

A verificação pós-migration retornou `connection=ok` e `validation=ok`. Foram confirmadas as 10 tabelas novas da evolução, as 132 colunas esperadas, os 9 índices esperados, a versão de regras `2026.1` e a correspondência do hash SHA-256 do conteúdo das regras.

## Código, segurança e Git

A implementação permanece **Cora-only em produção**. O adaptador rejeita `PAYMENT_GATEWAY=mock`, `mercadopago`, `asaas` e demais gateways legados em produção; o mock continua restrito a testes locais técnicos e não representa cobrança financeira. A integração Cora usa Client ID, certificado e chave privada mTLS no backend, token bearer temporário, idempotência, consulta da invoice após webhook e sem envio de segredo ao frontend. Não foi inventada integração de cartão nem adicionada a variável `CORA_CLIENT_SECRET`.

As correções publicadas incluem a atualização do journal da migration 0007, o verificador abrangente de banco, CORS para o domínio oficial, branding exclusivo da Excursão das Comitivas nos PDFs, neutralização de guias ativos que sugeriam gateways legados, atualização do roteiro E2E e correções de canonical, Open Graph, Twitter, robots e sitemap. Uma regressão unitária específica garante que marcas históricas ou desconhecidas sempre resultem em branding Comitivas.

| Controle | Resultado |
|---|---|
| Segredos em Git | **Nenhum valor secreto adicionado** |
| `JWT_SECRET` | Rotacionado no Coolify sem registrar o valor; runtime-only |
| `DATABASE_URL`, SMTP e demais segredos | Mantidos fora do build; nenhum valor reproduzido |
| `OTP_PEPPER` | Criado com CSPRNG forte, runtime-only, build-time=false; valor não registrado |
| Arquivos mTLS | Não existem no repositório nem foram inventados |
| Artefatos proibidos | Nenhum `.env`, certificado, chave privada, dump ou `dist` gerado ficou no commit |
| Dependências | React Router atualizado para `7.18.2`; nanoid para `3.3.18`; PostCSS para `8.5.26`; audit final com zero vulnerabilidades |

O commit funcional principal foi `6ff6491c3ed100a2ccd8fb3e5af99f34e1bfe2ba`. O ajuste documental final foi publicado em `443b52a52d41eb4fbf77e373be5e3e8f5dafbf45`, confirmado tanto localmente quanto em `origin/main`. O workspace ficou limpo.

## Coolify e domínio

A aplicação Coolify é `comitivas`, no ambiente `production`, com application ID `sas04ljxfacvwa3zlmig28zw`. O deployment anterior `zecfrro2u58lzotv2i3zkw7o` foi diagnosticado corretamente: o build foi concluído, mas o processo novo abortou porque ainda havia `PAYMENT_GATEWAY=mock`; o healthcheck falhou como consequência e o rollback automático preservou a versão antiga saudável.

A configuração nominal do Coolify foi corrigida sem redeploy. Foram removidas as entradas de configuração de `PAYMENT_GATEWAY`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY` e `ALLOW_MOCK_PAYMENT_IN_PROD`; as URLs foram alinhadas ao domínio oficial; o campo **Domains** agora contém somente `https://excursaodascomitivas.com.br`; e `OTP_PEPPER` está disponível apenas em runtime. A plataforma mostra 11 alterações pendentes porque ainda não houve aplicação dessas mudanças ao container.

Essa distinção é essencial: o **container que atende produção continua sendo a versão antiga saudável**, enquanto as correções estão publicadas no Git e preparadas no armazenamento de configuração. Não se deve interpretar a existência do OTP_PEPPER ou a remoção do mock no Coolify como se já estivessem ativos no processo antigo; isso só ocorrerá em um deploy Cora-ready.

## Banco Cora, OTP e comunicações

A prontidão Cora está documentada em [`docs/cora-deploy-readiness.md`](./cora-deploy-readiness.md). Para liberar o futuro deploy, a operação deve configurar no ambiente `production` do Coolify, sempre como runtime-only, os seguintes elementos oficiais: `PAYMENT_GATEWAY=cora`, `CORA_ENV`, `CORA_CLIENT_ID`, `CORA_CERT_PATH`, `CORA_PRIVATE_KEY_PATH`, `CORA_TOKEN_URL`, `CORA_API_BASE_URL`, `CORA_WEBHOOK_PUBLIC_URL` e, se necessário, `CORA_HTTP_TIMEOUT_MS`. O certificado e a chave devem ser montados como secret files; os paths precisam existir e ser legíveis dentro do container.

A conta Cora ainda não emitiu ou disponibilizou o Client ID de Stage, o certificado mTLS e a private key mTLS. Portanto, não foi feito teste de token, criação de invoice, webhook ou cobrança. O SMTP possui variáveis nominais, mas não foi enviada mensagem real por ausência de destinatário autorizado; o WhatsApp também não foi validado porque não há credenciais/template contratados. Nenhuma integração foi simulada como se fosse real.

## QA local e validação de build

A bateria direcionada e a suíte integral passaram com **25 testes em 5 arquivos**. A cobertura executada incluiu autenticação, regras do adaptador Cora-only, contrato HTML, serviço de contratos, snapshots/validações e branding seguro do PDF. O teste de configuração local registrou apenas o aviso esperado de Cora não configurada; não houve chamada externa.

| Verificação | Resultado |
|---|---:|
| `npm ci --ignore-scripts` | PASS |
| `npm run typecheck:server` | PASS |
| `npm run build` — servidor, seed e frontend | PASS |
| `npm test -- --run` | PASS — 25/25 testes |
| `npm audit` | PASS — 0 vulnerabilidades |
| `git diff --check` | PASS |
| Regressão de branding Comitivas | PASS — 2 testes dedicados |

## Site público e SEO

A auditoria HTTP passiva do baseline antigo encontrou `200` no domínio oficial para `/`, `/api/health`, `/regras`, `/galeria`, `/robots.txt` e `/sitemap.xml`. O health público retornou `{"status":"ok"}`. O host `www.excursaodascomitivas.com.br` retornou `530`, e `api.excursaodascomitivas.com.br` retornou `503`; por isso nenhum dos dois foi adicionado ao campo Domains. O typo `api.excursaodascomitiivas.com.br` não resolve.

O baseline ao vivo ainda entregava robots e sitemap com o host legado `comitivas.permupay.com.br`, porque o novo frontend não foi redeployado. Essa falha foi corrigida no código publicado: o JSON-LD, canonical, Open Graph, Twitter, robots e sitemap agora apontam para `https://excursaodascomitivas.com.br`. A confirmação definitiva desses metadados no site ao vivo depende do futuro deploy Cora-ready.

## Critérios para liberar o próximo deploy

O redeploy somente deve ser executado quando a conta Cora fornecer os artefatos reais e a operação os cadastrar com segurança. A sequência recomendada é cadastrar os secret files mTLS, preencher as variáveis runtime-only, confirmar `PAYMENT_GATEWAY=cora`, testar de forma não destrutiva o token de Stage e então executar o rolling deploy no Coolify.

Depois do início do novo container, a aprovação exige simultaneamente healthcheck `/api/health` com `200`, container `healthy`, navegação da home e das rotas públicas, login e recuperação de senha, preparação do contrato, confirmação das regras e validação do webhook Cora. Qualquer falha de startup ou healthcheck deve manter o container antigo e acionar rollback; não se deve habilitar mock ou ignorar o fail-fast.

> **Bloqueio atual:** não há credenciais externas Cora/mTLS disponíveis. Não há ação segura adicional de produção a executar até que a conta Banco Cora forneça o conjunto oficial.

## Referências

[1]: https://github.com/vml-arquivos/comitivas/commit/443b52a52d41eb4fbf77e373be5e3e8f5dafbf45 "Commit final de documentação e continuidade"

[2]: https://github.com/vml-arquivos/comitivas/commit/6ff6491c3ed100a2ccd8fb3e5af99f34e1bfe2ba "Commit de segurança, SEO, dependências e QA"

[3]: https://developers.cora.com.br/docs/client-credentials-int-direta "Banco Cora — Client Credentials da Integração Direta"

[4]: https://developers.cora.com.br/reference/cria%C3%A7%C3%A3o-de-endpoints "Banco Cora — Criação de endpoints e webhooks"

[5]: https://developers.cora.com.br/reference/emiss%C3%A3o-de-boleto-registrado "Banco Cora — Emissão de boleto registrado"

[6]: https://coolifysaas.permupay.com.br/project/lyq3uw72o6rlmug5imj4xx2b/environment/lxrpok90hbk082p4j34jvlc2/application/sas04ljxfacvwa3zlmig28zw "Coolify — Aplicação comitivas"

[7]: https://coolifysaas.permupay.com.br/project/lyq3uw72o6rlmug5imj4xx2b/environment/lxrpok90hbk082p4j34jvlc2/application/sas04ljxfacvwa3zlmig28zw/environment-variables "Coolify — Variáveis de ambiente da aplicação"
