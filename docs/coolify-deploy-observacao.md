
## Redeploy iniciado

- A ação de redeploy foi confirmada pelo usuário e iniciada em 22/08/2026 às 16:19:05.
- Deployment ID: `zecfrro2u58lzotv2i3zkw7o`.
- O Coolify confirmou `git ls-remote` para `refs/heads/main` retornando `fe6e2bb20e91d205cd9aab5207cc13ea32ce88e0`.
- O log confirmou importação do commit `fe6e2bb20e91d205cd9aab5207cc13ea32ce88e0` e a mensagem `feat: evoluir comitivas para cora e contratos 2026`.
- O deployment estava em andamento durante a última leitura. O build Docker já havia iniciado e o Dockerfile copiado para o builder incluía build server/web, migrations Drizzle, Chromium para PDFs, porta 3000 e healthcheck `/api/health`.
- O estado anterior da aplicação ainda aparecia como Running/healthy enquanto a nova imagem era construída; isso não foi tratado como confirmação de conclusão.


A leitura seguinte mostrou o build Docker na etapa `RUN npm run build`, com `build:server` concluído e `build:seed` concluído; o frontend `build:web` estava iniciando. O deployment ainda não havia terminado nem apresentado falha.


O polling seguinte confirmou que o build avançou para a instalação das dependências de produção, incluindo pacotes do Chromium/Puppeteer. O status do deployment continuava `In Progress`, sem mensagem de erro no log exibido.


O deployment continuou em `In Progress`; o log avançou pela instalação e configuração de 178 pacotes nativos do Chromium/Puppeteer. Não houve erro exibido, mas o container novo ainda não havia sido criado nem marcado como saudável.


No polling de 16:20:43, o deployment ainda permanecia em `In Progress`, sem falha exibida, e o log permanecia na etapa de instalação/configuração dos pacotes nativos do Chromium. A aplicação anterior continuava marcada como healthy durante a construção da nova imagem.


No polling de 16:20:59, o Coolify ainda indicava `Deployment is In Progress`. O último trecho visível permanecia na instalação dos pacotes nativos do Chromium; não havia mensagem final de sucesso ou erro. Não foi acionado cancelamento nem outro redeploy.


O build Docker terminou com sucesso (`DONE 72.0s`). O Coolify iniciou o rolling update, criou o novo container `sas04ljxfacvwa3zlmig28zw-1619040205026`, marcou-o como `Created`, `Starting` e `Started`. O status geral ainda aparecia como `Deployment is In Progress` no último polling; a etapa seguinte é confirmar healthcheck e término do deployment.


O deployment terminou como **Failed**. O novo container foi criado e iniciado, mas o Coolify marcou o healthcheck como `unhealthy` após aguardar o período configurado. O log registra `New container started`, `Custom healthcheck found in Dockerfile`, `Waiting for healthcheck to pass on the new container`, seguido de `docker inspect ... .State.Health.Status` retornando `unhealthy`. O container antigo permaneceu marcado como Running/healthy, com contagem de reinícios elevada durante a tentativa.


A inspeção das variáveis de produção identificou a causa da falha e o bloqueio para uma correção segura. O ambiente contém `PAYMENT_GATEWAY`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY` e `ALLOW_MOCK_PAYMENT_IN_PROD`; não contém as variáveis Cora exigidas pelo novo runtime (`CORA_CLIENT_ID`, certificado mTLS, private key, endpoints e webhook HTTPS). O container novo abortou explicitamente com `PAYMENT_GATEWAY=mock não é permitido em produção`. Não foram lidos nem expostos valores secretos.

Conclusão operacional: não é seguro trocar apenas `PAYMENT_GATEWAY` para `cora`, pois a aplicação então falhará ao iniciar por ausência das credenciais mTLS/Client Credentials e da URL HTTPS do webhook. Também não é aceitável contornar o bloqueio usando mock em produção. É necessário cadastrar primeiro os segredos reais da Cora no Coolify e então redeployar.


Após a solicitação de configuração, a inspeção dos nomes das variáveis do Coolify ainda retornou somente `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`, `WEB_URL`, `API_URL` e `PAYMENT_GATEWAY` entre as variáveis relevantes; nenhuma variável `CORA_*` foi cadastrada. O valor do gateway não foi lido na interface para evitar qualquer acesso desnecessário a campos protegidos, mas o deployment anterior registrou explicitamente `PAYMENT_GATEWAY=mock`.


## Estado preservado após a preparação

A verificação final no Coolify confirmou a aplicação como `Running` e `(healthy)` no container anterior, ainda associada ao commit `7fbd82f3407ac79cd88eb466bde99af6d6516e8e`. O commit `fe6e2bb` permanece publicado no GitHub, acompanhado da documentação de prontidão, mas não foi redeployado novamente porque as variáveis e os certificados Cora ainda não existem. Nenhuma configuração de produção foi alterada nesta etapa.


## Auditoria de segurança de variáveis — 22/08/2026

A configuração de produção mostrou `JWT_SECRET` e `SMTP_PASS` disponíveis em build-time e runtime; `SMTP_HOST`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY` e `ALLOW_MOCK_PAYMENT_IN_PROD` também estavam marcados para build-time. `DATABASE_URL` estava somente em runtime. As três variáveis legadas foram confirmadas por nome, sem leitura de valores. Nenhuma variável `CORA_*` foi encontrada. A aplicação permanece `Running/healthy` no commit anterior, e nenhuma alteração foi feita antes da confirmação operacional.


## Correção de exposição de segredos e gateway — 22/08/2026

Após autorização explícita, foram feitas no Coolify as seguintes correções sem redeploy: `JWT_SECRET` foi substituído por um novo valor forte, sem registrar o valor; `JWT_SECRET`, `SMTP_HOST` e `SMTP_PASS` foram retirados de build-time e mantidos em runtime; `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY`, `ALLOW_MOCK_PAYMENT_IN_PROD` e a configuração explícita `PAYMENT_GATEWAY=mock` foram removidos. Nenhum segredo Cora foi criado. `DATABASE_URL` não foi alterada. O container antigo permaneceu como produção ativa durante a operação.


A página de variáveis do Coolify exibiu `The latest configuration has not been applied` com 3 alterações pendentes. A primeira tentativa programática de remoção não confirmou os modais; após recarregar, os nomes legados e `PAYMENT_GATEWAY` ainda estavam presentes. Nenhuma remoção foi considerada concluída até a confirmação nominal exigida pela plataforma.


Durante a confirmação, a interface do Coolify manteve quatro modais de exclusão sobrepostos em estado visual `Processing...`; nenhuma exclusão foi considerada válida. Os modais estão sendo fechados com `Cancel` antes de repetir o procedimento individualmente, para impedir que uma confirmação seja associada à variável errada.


Três modais de exclusão sobrepostos foram cancelados sem confirmar ações destrutivas. A remoção dos nomes legados e de `PAYMENT_GATEWAY` ainda precisa ser concluída pelo modal nominal individual do Coolify; não será tratada como concluída até a validação após recarregamento.


O modal individual de exclusão de `PAYMENT_GATEWAY` foi aberto de forma controlada e ainda não foi confirmado; a operação permanece pendente até a validação nominal do campo exigido pelo Coolify.


O modal individual de `PAYMENT_GATEWAY` foi preenchido com o nome exigido pelo Coolify. O botão de exclusão ficou habilitado; a interface rotula o botão como `Permanently Delete Processing...`, portanto a confirmação será acionada pelo botão habilitado que contém `Permanently Delete`.


A exclusão de `PAYMENT_GATEWAY` foi persistida e o modal encerrou. As entradas `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY` e `ALLOW_MOCK_PAYMENT_IN_PROD` ainda aparecem e serão removidas uma a uma com a confirmação nominal requerida.


As exclusões nominais foram concluídas no Coolify: `PAYMENT_GATEWAY`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY` e `ALLOW_MOCK_PAYMENT_IN_PROD` foram removidas individualmente após confirmação do nome. Nenhum valor secreto foi exibido ou registrado.


## Auditoria de configuração e terminal — 22/08/2026

A aplicação em produção permanece `Running/healthy` no commit anterior. O Coolify mostrou sete alterações de configuração não aplicadas, que exigem rebuild/redeploy para surtirem efeito. Os valores não secretos atuais incluem `NODE_ENV=production`, `PORT=3000`, `WEB_URL=https://excursaodascomitiivas.com.br` e `API_URL=https://api.excursaodascomitiivas.com.br`; a API do frontend usa caminho relativo `/api`, portanto a configuração canônica deve apontar para `https://excursaodascomitivas.com.br` no mesmo host.

A inspeção DNS/HTTPS confirmou o domínio principal oficial respondendo 200, o `www` respondendo 530, o subdomínio correto de API resolvendo mas respondendo 503 e o subdomínio digitado `api.excursaodascomitiivas.com.br` sem resolução. O terminal do container saudável foi conectado, mas a primeira entrada automatizada foi duplicada pelo componente interativo e gerou erro de sintaxe; nenhum comando de banco ou backup foi executado por esse caminho.


Após a confirmação DNS, `WEB_URL` e `API_URL` foram corrigidos no Coolify para `https://excursaodascomitivas.com.br`, coerentes com o cliente HTTP relativo `/api`. A configuração ficou salva como alteração pendente; nenhum redeploy foi executado nesta etapa. O domínio principal não foi derrubado, e o subdomínio typo não foi mantido como URL de aplicação.


A auditoria de armazenamento do Coolify confirmou um volume nomeado persistente (`sas04ljxfacvwa3zlmig28zw-comitiva-uploads`) montado em `/app/uploads`, sem host path manual exposto. Esse volume será usado para um dump temporário protegido e verificável, se o cliente PostgreSQL puder ser instalado no container; nenhum backup foi executado ainda.


O terminal do container saudável foi reconectado. O container confirma `DATABASE_URL` presente, `pg_dump` ausente e `/api/health` respondendo 200. O volume persistente `/app/uploads` está disponível para armazenar o dump com permissão restrita; nenhum valor de conexão será impresso.


O comando de backup foi iniciado no container saudável: instala o cliente PostgreSQL temporário, cria `/app/uploads/backups` com permissão 700 e gera um dump SQL comprimido com `pg_dump --no-owner --no-privileges`, seguido de tamanho, hash SHA-256 e inspeção da tabela de migrations. A conclusão ainda está em andamento; nenhuma migration foi aplicada.


Backup pré-migration concluído no volume persistente: `pre-migration-20260822T174913Z.sql.gz`, tamanho 7.287 bytes, SHA-256 `b034f91fb22113aa828c6ca24115d487e744d7f483d94ffcc2ab4665495f29f6`. O `pg_dump` foi executado sem owner/privilégios e sem imprimir a conexão. A consulta confirmou `migration_table=absent`, portanto o banco ainda não tem o histórico Drizzle; a migration 0007 não foi aplicada.


A inspeção correta do banco confirmou `drizzle.__drizzle_migrations` presente com `migration_count=7`, correspondendo às migrations 0000–0006, e as tabelas-base `usuarios`, `eventos`, `lotes`, `pacotes`, `reservas`, `pagamentos`, `fotos_evento` e `configuracoes_pagamento` presentes. A consulta anterior ao schema `public` havia sido insuficiente; o verificador local foi corrigido para usar o schema `drizzle`. A migration 0007 ainda precisa ser aplicada após o backup já concluído.


O banco de produção está pronto para a atualização: o backup pré-migration foi verificado, `drizzle.__drizzle_migrations` tem sete registros (0000–0006) e a migration 0007 será aplicada de forma idempotente no container atual. Como a imagem saudável anterior não contém o novo arquivo SQL, a aplicação será transportada ao terminal por blocos codificados, sem expor conteúdo de banco ou credenciais.


Os blocos 00, 01 e 02 da migration 0007 foram transportados ao arquivo temporário `/tmp/comitivas-0007.b64` no terminal do container saudável. Nenhum DDL foi executado durante o transporte; faltam os blocos finais e a validação de integridade antes da aplicação.


Os blocos 00–03 da migration 0007 foram montados no terminal do container saudável. O arquivo remoto ainda será completado com o bloco final e comparado por comprimento/hash antes de qualquer execução SQL.

A primeira validação do arquivo remoto detectou que o artefato parcial preexistente não havia sido removido antes da montagem; a decodificação produziu apenas 1.872 bytes e SHA-256 divergente. Nenhum DDL foi executado. O arquivo temporário e o SQL decodificado foram removidos.

O commit `c7a6785` foi publicado em `main` com o journal 0007 e as correções auditadas. O terminal do container saudável foi limpo antes de um novo download HTTPS do SQL oficial fixado nesse commit; o banco continua sem a 0007 e a aplicação antiga permanece saudável.

O terminal foi reconectado com sucesso ao container antigo/saudável às 18:03:46; a tentativa anterior de download não tinha sido executada porque a sessão estava desconectada. Nenhum comando de banco foi executado.

Na segunda tentativa, a interface não exibiu saída do comando HTTPS e desconectou o terminal imediatamente após o Enter. Como não há evidência de conclusão, a operação será repetida após reconexão com um comando de diagnóstico não destrutivo; não houve execução de DDL.

O terminal foi reconectado novamente às 18:04:32 no mesmo container antigo/saudável. O banco permanece sem a 0007; será executado primeiro um comando curto de diagnóstico para validar a sessão.

O diagnóstico `echo terminal_session_ok` foi executado com sucesso na sessão reconectada. Isso confirma que a desconexão anterior era da sessão interativa, não do container ou do banco; o download oficial pode ser tentado novamente sem DDL.

A tentativa controlada de download via HTTPS não prosseguiu porque o container saudável não possui `curl`. O comando removeu o temporário antes da tentativa; nenhum SQL foi baixado, nenhum DDL foi executado e o banco segue intacto.

A inspeção de ferramentas confirmou `/usr/bin/wget` disponível no container. O download oficial será feito com `wget`, seguido de comprimento e SHA-256; nenhum segredo ou string de conexão será impresso.

O download HTTPS fixado no commit `c7a6785` foi concluído com sucesso usando `wget`: o arquivo remoto tem 9.032 bytes e SHA-256 `595beac28dd72f95cbd7f63c8952fc9b49732eb427f96e499cbea9518a97120a`, exatamente igual ao artefato local. O SQL está apenas em `/tmp` e ainda não foi executado.

O journal oficial baixado do commit `c7a6785` também foi validado: 1.291 bytes e SHA-256 `4dd8a131c468d0d515a6b2e7e728de4bf04c512c6233a672bf7e8730cffbe019`, coincidente com o arquivo local. Os artefatos SQL e journal estão completos no container, e nenhuma migration foi aplicada ainda.

A inspeção da pasta ativa `/app/drizzle` confirmou sete arquivos SQL (0000–0006), journal anterior com SHA-256 divergente do novo e ausência de `0007_evolucao_comitivas.sql`. Os arquivos oficiais validados permanecem separados em `/tmp`, prontos para serem estagiados temporariamente antes da execução do migrator.

O staging foi concluído no container saudável: `0007_evolucao_comitivas.sql` ativo tem SHA-256 `595beac28dd72f95cbd7f63c8952fc9b49732eb427f96e499cbea9518a97120a`, o journal ativo tem SHA-256 `4dd8a131c468d0d515a6b2e7e728de4bf04c512c6233a672bf7e8730cffbe019`, e o pacote `drizzle-orm`/`pg` necessário está presente. O journal anterior foi preservado em `/tmp`; nenhum SQL foi executado ainda.

O primeiro transporte do script temporário do migrator foi truncado pela entrada interativa e gerou `/tmp/run-drizzle-migrator.mjs` com 375 bytes, menor que o payload esperado. O script não foi executado; será removido e retransmitido em blocos curtos antes de qualquer conexão com o banco.

A retransmissão em blocos também foi interrompida após o primeiro segmento de 80 caracteres; o arquivo remoto `/tmp/run-drizzle-migrator.b64` permanece parcial. Ele será removido antes de uma remontagem correta em segmentos curtos, sem executar o script.

A verificação confirmou que a imagem antiga não contém `tsx` nem `scripts/aplicar-migrations.ts`. O migrator nativo será executado por um script ESM temporário mínimo, retransmitido em segmentos curtos e validado por tamanho antes da execução; nenhum código será incorporado à imagem ou ao Git.

Os segmentos 1 e 2 do payload base64 foram montados no arquivo remoto `/tmp/run-drizzle-migrator.b64`; o payload permanece incompleto, não foi decodificado nem executado. Os segmentos restantes serão anexados um a um e o tamanho final será validado antes de qualquer conexão com o banco.

O segmento 3 também foi anexado com sucesso. O payload continua incompleto e não foi decodificado ou executado.

O segmento 4 foi anexado com sucesso. Os segmentos 1–4 estão no payload remoto; ele ainda não foi decodificado ou executado.

O segmento 5 também foi anexado. Os segmentos 1–5 estão no payload remoto, ainda sem decodificação ou execução; os três segmentos finais serão anexados e o tamanho será conferido.

O segmento 6 foi anexado com sucesso. Os segmentos 1–6 estão no payload remoto; ele continua sem decodificação ou execução.

O segmento 7 foi anexado com sucesso. Falta apenas o segmento final; o payload ainda não foi decodificado ou executado.

O segmento 8 foi anexado com sucesso. Os oito segmentos estão no payload remoto; ainda falta decodificar e validar o script completo antes de executá-lo.

A sessão caiu imediatamente após o comando de decodificação/verificação sintática, sem exibir resultado. Como não há evidência de conclusão, não se presume que o script tenha sido decodificado ou executado; o terminal será reconectado para verificar apenas a existência/tamanho dos temporários.

O terminal foi reconectado às 18:15:04 no mesmo container saudável, sem saída residual. Nenhuma execução do migrator é presumida; a próxima ação será apenas uma inspeção curta do payload remoto.

A inspeção encontrou 616 bytes no payload base64 remoto, porém SHA-256 divergente do payload local, indicando erro de transcrição em um segmento. O payload será removido e reconstruído com os oito segmentos copiados exatamente do arquivo local; não será decodificado nem executado enquanto o hash não coincidir.

O payload divergente foi removido e a reconstrução linha a linha começou com a primeira linha do script (80 bytes). Nenhum código foi executado e o banco não foi acessado nessa etapa.

As linhas 2–4 foram adicionadas com sucesso; o script temporário reconstruído tem 216 bytes. Ele permanece inerte até a montagem integral e a validação independente.

As linhas 5–6 foram adicionadas com sucesso, elevando o script temporário a 316 bytes. O arquivo continua inerte e ainda não abriu conexão com o banco.

As linhas 7–9 foram adicionadas com sucesso; o script tem 426 bytes e contém a chamada do migrator, mas ainda não foi executado.

As linhas finais foram adicionadas com sucesso. O script remoto completo tem 460 bytes e SHA-256 `518b2ca596849e2941f151e5d0395e74262422402e7ba1bbbccd48f5517d2c98`, coincidente com o payload local. Ele permanece não executado.

A checagem `node --check` passou (`migrator_script_syntax_ok`). O script está íntegro e sintaticamente válido; a aplicação da 0007 será iniciada agora pelo migrator nativo, com `DATABASE_URL` mantida somente no ambiente do processo.

O comando `test -n "$DATABASE_URL"; node /tmp/run-drizzle-migrator.mjs` foi iniciado no container saudável, sem exibir a conexão. A sessão permanece em execução; nenhum resultado de migration será presumido até o processo terminar.

O migrator nativo concluiu com a mensagem `drizzle_migration_complete`. A migration 0007 foi aplicada pelo mecanismo Drizzle com o journal atualizado e registro transacional; a conexão não foi exibida.

O verificador publicado foi baixado por HTTPS e conferido antes da execução: 6.290 bytes, SHA-256 `1d88cefe4825df4ad398e33624de5e5e0fc5596322ee6c3a4e39f5e71f97da68`, coincidente com o arquivo do commit `c7a6785`. Ele está pronto para validar o estado pós-migration.

A validação pós-migration passou integralmente: `connection=ok`, `validation=ok`, migration `0007`, `migrationHistory=8`, 10 tabelas, 132 colunas, 9 índices, seed `2026.1` presente e hash das regras íntegro. O bookkeeping Drizzle ficou consistente.

Após a validação do banco, o ambiente `production` foi reaberto no Coolify sem redeploy. A listagem da aplicação ainda mostra `https://excursaodascomitivas.com.br,https://api.excursaodascomitiivas.com.br`; o subdomínio com typo permanece pendente de correção no campo Domains.

O campo Domains foi corrigido e salvo no Coolify para `https://excursaodascomitivas.com.br` apenas. O Coolify confirmou `Application settings updated!` e regenerou os rótulos de roteamento, removendo o router do subdomínio typo. O número de alterações pendentes subiu para 11; nenhuma delas foi aplicada ao container em execução.

A tela de variáveis foi auditada nominalmente sem ler valores: há 17 variáveis nomeadas e duas linhas vazias de edição. O valor de nenhuma variável secreta foi retornado ou reproduzido. A flag de cada linha será confirmada pela associação visual/DOM correta antes de adicionar o OTP_PEPPER runtime-only.

Um clique usando índice dinâmico abriu a seção Tags em vez do botão de adicionar variável; não houve alteração de variável, segredo, domínio ou deploy. A tela correta será aberta pelo URL direto de Environment Variables.

A página correta foi aberta, uma nova variável foi adicionada e o modal New Environment Variable está aberto. Os campos foram identificados por IDs e comprimentos apenas; nenhum valor secreto foi retornado. O OTP_PEPPER será gerado com `crypto.getRandomValues`, gravado sem impressão e configurado com build-time desativado e runtime ativado.

A associação correta das linhas existentes confirmou o padrão de segurança esperado: as variáveis nomeadas estão com build-time desativado e runtime ativado. O modal novo permanece aberto; os controles específicos dele serão ajustados sem retornar qualquer valor secreto.

O modal recebeu `OTP_PEPPER` e um valor CSPRNG de 64 caracteres hexadecimais, com build-time=false e runtime=true; o valor não foi impresso. A primeira tentativa de Save não fechou o modal, portanto a gravação ainda não será presumida e será confirmada pelo DOM.

A segunda tentativa acionou exatamente um botão Save do modal e foi aceita pelo Coolify. O valor continua não exposto; a presença nominal e as flags serão verificadas após a atualização da lista.

A confirmação DOM posterior mostrou `modalPresent=false` e `otpSavedNominally=true`; o OTP_PEPPER está persistido nominalmente. Nenhum valor foi lido ou retornado. A associação final das flags da linha persistida será registrada em seguida.

A verificação final confirmou `OTP_PEPPER` presente, `buildtime=false`, `runtime=true`. O conjunto tem 18 variáveis nomeadas e `allNamedRuntimeOnly=true`; nenhum segredo foi lido, exposto ou escrito no repositório. O Coolify continua com 11 alterações pendentes e sem redeploy.

O QA local direcionado passou com 25 testes em 5 arquivos: autenticação (2), branding seguro do PDF (2), contrato HTML (2), configuração do gateway Cora-only (4) e serviço de contratos (15). A suíte integral também passou com os mesmos 25 testes. O teste Cora em desenvolvimento registrou apenas o aviso esperado de ausência de mTLS; não houve chamada externa, cobrança, SMTP ou WhatsApp real.

Após o QA, `npm run typecheck:server` passou e `npm run build` passou para servidor, seed e frontend. Os arquivos dist versionados modificados pelo build foram restaurados ao HEAD; o diff não contém dist, dumps, `.env`, certificados ou chaves.

A auditoria HTTP passiva do baseline antigo encontrou `200` no domínio oficial para `/`, `/api/health`, `/regras`, `/galeria`, `/robots.txt` e `/sitemap.xml`; o health retornou `{"status":"ok"}`. `www.excursaodascomitivas.com.br` retornou 530 e `api.excursaodascomitivas.com.br` retornou 503, portanto nenhum deles foi adicionado ao campo Domains. O host typo não resolve. O robots e o sitemap antigos ainda apontavam para `comitivas.permupay.com.br`; essa falha de SEO foi corrigida no frontend, junto dos canonical/Open Graph/Twitter de Eventos, História e Avaliações. A correção aguarda o futuro redeploy Cora-ready.

O audit de dependências encontrou inicialmente uma vulnerabilidade alta em React Router 7.18.1 e uma cadeia de desenvolvimento com nanoid/PostCSS. Foram aplicadas somente atualizações não-forçadas: `react-router-dom`/`react-router` para 7.18.2, `nanoid` para 3.3.18 e `postcss` para 8.5.26. A instalação limpa, typecheck, build, suíte integral de 25 testes e `npm audit` final passaram; o audit reportou zero vulnerabilidades.

O commit final `6ff6491c3ed100a2ccd8fb3e5af99f34e1bfe2ba` foi confirmado em `origin/main`; o workspace local ficou limpo. O Coolify ainda aponta o container saudável antigo no commit `7fbd82f`, com 11 alterações de configuração pendentes e sem redeploy. A promoção continua bloqueada pela ausência das credenciais e arquivos mTLS oficiais da Cora.
