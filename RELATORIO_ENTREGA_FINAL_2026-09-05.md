# Relatório de entrega — Excursão das Comitivas

**Data:** 5 de setembro de 2026
**Repositório:** `vml-arquivos/comitivas`
**Regra aplicada:** preservação de funcionalidades, migrations forward-only e zero regressão intencional.

## 1. Estado encontrado

O repositório contém um monólito Node.js 22 com API Express, frontend React/Vite, PostgreSQL com Drizzle, geração de contratos em PDF, autenticação JWT/bcrypt, CRM de leads, eventos, lotes, pacotes, adicionais, cupons, reservas, holds de inventário, contratos versionados, OTP, evidências, pagamentos Cora e outbox de notificações. O frontend web estava compilável e a suíte unitária original tinha 25 testes aprovados.

A auditoria identificou que a base existente funcionava em várias áreas, mas ainda não poderia ser considerada pronta para operação integral conforme a missão. Os principais gaps estavam em isolamento de carteira, posse de leads públicos, revogação efetiva de sessões administrativas, segurança do administrador de teste, tratamento fail-closed de configuração financeira, follow-up marcado como enviado sem entrega, divergência visual de desconto PIX, build mobile e documentação operacional conflitante.

A conexão com um PostgreSQL real não estava disponível durante a execução. Portanto, contagens, constraints efetivas, dados históricos e migrations aplicadas no ambiente remoto não foram declarados como validados.

## 2. Problemas encontrados

| Prioridade | Problema | Evidência |
| --- | --- | --- |
| P0 | Vendedor podia consultar a jornada de cliente de outra carteira por manipulação de `usuario_id`. | Rota `GET /api/jornada/cliente/:usuario_id` filtrava somente o cliente. |
| P0 | Lead público podia ter intenção alterada por qualquer pessoa que conhecesse o ID. | Rota `PATCH /api/publico/leads/:lead_id/intencao` não exigia prova de posse. |
| P0 | Administrador de teste com credencial fixa não era bloqueado no código para produção. | `ENABLE_TEST_ADMIN=true` era aceito sem guard de `NODE_ENV`. |
| P1 | Alteração administrativa de papel ou senha não invalidava JWTs existentes. | `session_version` não era incrementado na edição administrativa. |
| P1 | Follow-up era registrado como enviado sem chamar SMTP. | `FollowupScheduler` gravava diretamente em `emails_enviados`. |
| P1 | Falha de leitura da configuração financeira podia aplicar defaults no ambiente produtivo. | `ConfiguracaoService` retornava defaults em qualquer ambiente. |
| P1 | `PAID_OUT` era aceito na consulta de status, mas não no processamento do webhook ou adapter de confirmação. | Tratamentos tinham critérios inconsistentes. |
| P1 | A tela de checkout aplicava novamente o desconto PIX depois que o contrato já congelava o total final. | `Checkout.tsx` calculava percentual sobre `valor_total` já descontado. |
| P1 | Preparação administrativa de contrato não atualizava `valor_total_centavos`. | Rota administrativa alterava somente o valor decimal. |
| P1 | Mobile não compilava. | Alias de UI, declarações Vite, dependência instalada e entrada Vite estavam incompletos. |
| P2 | Lint declarado não existia nas dependências. | `npm run lint --workspace apps/web` terminava com código 127. |
| P2 | Documentação histórica ainda apresentava gateways e domínios incompatíveis com Cora-only. | Guias antigos citavam Mercado Pago, Asaas, Permupay e hosts históricos. |

## 3. Correções realizadas

Foram aplicadas correções incrementais, sem remover tabelas, migrations, contratos ou dados históricos. A jornada de vendedor agora aplica o filtro de `vendedor_id` no banco e retorna erro quando o cliente não pertence à carteira consultante. A captura pública de lead agora devolve um JWT de intenção assinado, com validade de 30 minutos e propósito restrito; atualização de intenção, cadastro e criação autenticada de reserva validam esse token quando o `lead_id` é informado.

Alterações administrativas de papel, senha e status agora incrementam `session_version`, invalidando tokens anteriores. O administrador de teste é bloqueado com erro explícito em produção. A configuração financeira permanece tolerante em desenvolvimento, mas bloqueia preparação contratual em produção quando sua fonte de verdade está indisponível.

O scheduler de follow-up passou a utilizar a outbox idempotente e só o processador de notificações pode marcar entrega. O processamento reconhece `PAID_OUT` como estado confirmado tanto no webhook quanto no adapter Cora. A tela de checkout deixa de reaplicar desconto quando a condição de pagamento já foi congelada. O fluxo administrativo de contrato mantém decimal e centavos sincronizados.

O app mobile recebeu `index.html` na raiz Vite, lockfile próprio, aliases corrigidos, declaração Vite compartilhada, navegação declarativa e remoção do endpoint `localhost`/`cleartext` da configuração Capacitor de produção. O gate `lint` passou a usar o typecheck web reproduzível, e o comando foi exposto no manifesto raiz.

O README foi alinhado ao estado real. Foi criada uma fonte única operacional para domínio, Cora, variáveis, volume, Coolify, smoke tests e documentos legados.

## 4. Novas funcionalidades e proteções

A entrega adiciona o fluxo de tokens de posse de lead, revogação administrativa de sessões, rate limit específico para intenção pública, fail-closed financeiro em produção, enfileiramento idempotente de follow-up, suporte consistente a `PAID_OUT`, build mobile reproduzível e documentação operacional unificada. Também adiciona testes unitários para geração e validação do token de intenção.

As comissões completas, entidade operacional independente de voucher/check-in, reconciliação financeira completa e alguns fluxos de reembolso continuam identificados como pendências de produto. Não foram simulados nem declarados como implementados.

## 5. Alterações no banco

Não foram executadas alterações no banco real. Não houve `DELETE`, `TRUNCATE`, limpeza de legado ou recalculação de valores históricos. O código somente passou a usar campos e constraints já existentes, incluindo `session_version`, outbox e valores em centavos.

## 6. Migrations criadas

Nenhuma migration nova foi criada nesta entrega. A decisão preserva o escopo incremental e evita alterar o schema sem backup, conexão confirmada e validação de dados históricos.

## 7. Testes executados

| Comando | Resultado | Observação |
| --- | --- | --- |
| `npm ci` | PASS | Dependências raiz instaladas sem erro. |
| `npm run lint` | PASS | Gate TypeScript do web. |
| `npm run typecheck:server` | PASS | TypeScript do servidor sem erros. |
| `npm run build` | PASS | Build de servidor, seed e web. |
| `npm test -- --run` | PASS | 5 arquivos e 26 testes aprovados. |
| `npm run test:a11y` | PASS | Gate estático; não substitui axe/manual. |
| `(cd apps/mobile && npm ci && npm run build)` | PASS | Typecheck e Vite mobile aprovados. |
| `npm run test:integration` | BLOCKED | `DATABASE_URL` não configurada; o script recusou simular PostgreSQL. |
| `npm run test:cora:stage` | BLOCKED | Credenciais/URLs mTLS de stage não disponíveis. |
| `npm run test:e2e` | NOT RUN / BLOCKED | Executado somente contra `127.0.0.1:9` para impedir acesso produtivo; falhou por host seguro inexistente. |
| `git diff --check` | PASS | Sem whitespace inválido. |

## 8. Resultado dos testes bloqueados

**Teste:** integração PostgreSQL.
**Motivo:** não havia `DATABASE_URL` disponível para um banco isolado.
**Impacto:** não foi possível validar constraints efetivas, contagens, migrations aplicadas, transações concorrentes ou dados históricos do ambiente.
**Como validar:** fornecer um PostgreSQL de homologação restaurável, executar `npm run db:migrate`, `npm run db:verify-contract-fields` e `npm run test:integration` sem apontar para produção.

**Teste:** Cora stage.
**Motivo:** não havia `CORA_CLIENT_ID`, certificado/chave mTLS, endpoints de stage e configuração de parcelas autorizados.
**Impacto:** nenhum pagamento real ou simulado foi declarado como confirmado.
**Como validar:** configurar secrets somente no ambiente seguro de stage, executar `npm run test:cora:stage`, validar webhook assinado, idempotência e reconciliação.

**Teste:** E2E principal.
**Motivo:** não existe servidor de homologação com banco isolado e administrador de teste habilitado fora de produção.
**Impacto:** o fluxo completo admin → vendedor → lead → reserva → contrato → Cora → OTP → voucher não foi afirmado como aprovado.
**Como validar:** subir ambiente isolado, habilitar `ENABLE_TEST_ADMIN=true` somente nele, executar `E2E_BASE_URL=<stage-isolado> npm run test:e2e` e garantir teardown.

## 9. Commit realizado

Commit principal realizado:

```text
95d02e8 refactor: finalize commercial excursion platform
```

Commit documental de evidências:

```text
33ff396 docs: record release validation evidence
```

## 10. Push realizado

Push confirmado para `origin/main` no repositório GitHub autorizado `vml-arquivos/comitivas`. O branch local ficou alinhado com `origin/main` após a publicação da sequência de commits, que contém o commit principal `95d02e8`.

## 11. Deploy realizado

**Confirmado.** Após autenticação no painel, o redeploy foi acionado no Coolify. O deployment `apw6e6olgphniv7o29gweqv8` importou o commit `1475bdde0aafd5749800a82ad47169e8fc28456c`, criou o novo container, executou o healthcheck interno em `/api/health` com HTTP 200 e terminou com o estado `Deployment is Finished` e container saudável.

O build final produziu o bundle `index-DkXo0bn5.js`; o domínio passou a responder com `Last-Modified: Sat, 05 Sep 2026 23:11:43 GMT`, confirmando a troca do artefato antigo. O deployment usou o HEAD documental publicado após o commit principal; não foram alteradas variáveis de produção nem dados.

## 12. URL de produção

`https://excursaodascomitivas.com.br/`

## 13. Healthcheck

O smoke test passivo atual retornou:

```text
GET https://excursaodascomitivas.com.br/       HTTP 200
GET https://excursaodascomitivas.com.br/api/health HTTP 200
{"status":"ok","timestamp":"2026-09-05T23:15:03.168Z"}
```

Após o redeploy, o healthcheck externo retornou novamente HTTP 200 com status `ok`. A Home respondeu com a marca oficial e referências ao domínio canônico. Um `PATCH` não destrutivo para um lead fictício sem token retornou HTTP 401 com `Token de intenção inválido ou expirado`, confirmando a proteção implantada. Nenhuma rota autenticada, cobrança, OTP ou alteração de dados foi executada no ambiente público.

## 14. Variáveis necessárias

As variáveis de produção estão documentadas em [docs/operacao/FONTE_UNICA_OPERACIONAL.md](docs/operacao/FONTE_UNICA_OPERACIONAL.md). O conjunto mínimo inclui `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `OTP_PEPPER`, `PAYMENT_GATEWAY=cora`, `CORA_ENV`, `CORA_CLIENT_ID`, `CORA_CERT_PATH`, `CORA_PRIVATE_KEY_PATH`, `CORA_TOKEN_URL`, `CORA_API_BASE_URL`, `CORA_INSTALLMENTS_API_BASE_URL`, `CORA_WEBHOOK_PUBLIC_URL`, `CORA_WEBHOOK_HMAC_SECRET`, `STORAGE_PATH`, SMTP e `ENABLE_TEST_ADMIN=false`.

Nenhum valor secreto foi incluído no commit ou neste relatório.

## 15. Pendências externas

A publicação GitHub e o redeploy no Coolify foram concluídos. Permanecem externas a configuração Cora stage, o banco PostgreSQL de homologação, a validação E2E isolada, a auditoria de acessibilidade com navegador/axe, o backup/restauração verificável e a confirmação de volume persistente para PDFs.

A conclusão responsável desta entrega é: **código corrigido e validado localmente; commit publicado; redeploy Coolify concluído; produção pública saudável; validações financeiras e integração PostgreSQL de homologação permanecem pendentes por falta de credenciais/ambiente isolado**.

## Referências

[1]: ./AUDITORIA_TECNICA_CONSOLIDADA.md "Auditoria técnica consolidada do repositório"
[2]: ./docs/operacao/FONTE_UNICA_OPERACIONAL.md "Fonte única operacional"
[3]: ./docs/cora-deploy-readiness.md "Prontidão de deploy Cora"
