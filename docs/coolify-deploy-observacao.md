
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
