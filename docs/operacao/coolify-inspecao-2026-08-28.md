# Inspeção do Coolify — 28/08/2026

Recurso existente: projeto `comitivas`, ambiente `production`, aplicação `comitivas`, ID `sas04ljxfacvwa3zlmig28zw`. O endereço informado pelo usuário resolve para o recurso esperado.

Estado observado: aplicação `Running` e `(healthy)`, com nove reinícios reportados, associada ao commit publicado `7fbd82f3407ac79cd88eb466bde99af6d6516e8e`. O Coolify informou 12 alterações de configuração ainda não aplicadas e rebuild necessário.

Configuração visível sem leitura de segredos: build pack Dockerfile, domínio `https://excursaodascomitivas.com.br`, base `/`, Dockerfile `/Dockerfile`, porta exposta `3000` e mapeamento `3000:3000`. O mesmo ambiente contém a base `comitivas-db` e um Redis.

A configuração de domínio e o estado saudável da aplicação foram observados sem iniciar redeploy ou alterar configurações. O próximo passo seguro é concluir a branch no Git, executar os testes e somente então disparar o redeploy controlado; a aplicação saudável anterior deve permanecer disponível em caso de falha do novo container.


## Fonte de deploy confirmada

Na seção **Git Source**, o recurso aponta para o repositório público `vml-arquivos/comitivas`, branch `main` e commit configurado como `HEAD`. O push final deve ser feito para `origin/main`; o Coolify acompanha o HEAD dessa branch. O commit atualmente publicado observado continua sendo `7fbd82f3407ac79cd88eb466bde99af6d6516e8e`, enquanto a configuração ainda sinaliza 12 alterações não aplicadas.
