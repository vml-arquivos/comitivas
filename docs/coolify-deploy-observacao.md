
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

A primeira validação do arquivo remoto detectou que o artefato parcial preexistente não havia sido removido antes da montagem; a decodificação produziu apenas 1.872 bytes e SHA-256 divergente. Nenhum DDL foi executado. O arquivo temporário e o SQL decodificado serão removidos, e a migration será remontada do zero antes de nova validação.
