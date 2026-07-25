# Correção do deploy no Coolify — 25/07/2026

## Diagnóstico confirmado

O Docker build foi concluído. O contêiner novo iniciou, mas encerrou antes do
healthcheck porque recebeu `PAYMENT_GATEWAY=mock` com `NODE_ENV=production`.
Essa combinação é bloqueada deliberadamente para impedir pagamentos simulados
em produção.

O log também mostrou:

- `MERCADOPAGO_ACCESS_TOKEN` sem valor;
- URL da API sem os dois-pontos do protocolo e com o domínio digitado
  incorretamente;
- `JWT_SECRET` exposto como argumento de build.

Nenhum seed ou comando de banco deve ser executado para corrigir este
incidente. O contêiner anterior foi mantido pelo rollback do Coolify.

## Alterações obrigatórias no Coolify

Na aplicação, abra **Environment Variables** e remova entradas duplicadas ou
antigas. Cadastre os valores abaixo:

```env
NODE_ENV=production
WEB_URL=https://excursaodascomitivas.com.br
API_URL=https://api.excursaodascomitivas.com.br
PAYMENT_GATEWAY=mercadopago
MERCADOPAGO_ACCESS_TOKEN=COLE_AQUI_O_ACCESS_TOKEN_REAL_DE_PRODUCAO
MERCADOPAGO_PUBLIC_KEY=COLE_AQUI_A_PUBLIC_KEY_REAL
JWT_SECRET=COLE_AQUI_UM_NOVO_SEGREDO_FORTE
VITE_WHATSAPP_NUMERO=5561994459086
```

Não faça o redeploy enquanto algum valor começar com `COLE_AQUI_`.

Marque como disponíveis apenas em **Runtime**:

- `JWT_SECRET`
- `DATABASE_URL`
- `SMTP_PASS`
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_PUBLIC_KEY`
- `PAYMENT_GATEWAY`
- `API_URL`
- `WEB_URL`

Marque `VITE_WHATSAPP_NUMERO` também como variável de **Build**, pois o Vite
incorpora esse número ao frontend.

## Domínios da aplicação

Substitua o endereço incorreto pelos dois domínios:

```text
https://excursaodascomitivas.com.br
https://api.excursaodascomitivas.com.br
```

Não mantenha em nenhum campo a versão incorreta que apareceu no log.

## Rotação do JWT

O valor anterior apareceu no log anexado. Gere outro segredo fora do chat:

```bash
openssl rand -base64 48
```

Cole o resultado somente no campo `JWT_SECRET` do Coolify e desmarque a opção
de disponibilizá-lo durante o build.

## Redeploy e validação

1. Salve as variáveis.
2. Acione **Redeploy** ou **Force Redeploy**.
3. Não execute novamente `npm run seed:barretos-2026:prod`.
4. Confirme nos logs:

```text
[DB] Conexão estabelecida com sucesso
[DB] Migrations Drizzle aplicadas com sucesso
[SERVER] Comitiva rodando
```

5. Valide:

```bash
curl -fsS https://api.excursaodascomitivas.com.br/api/health
```

6. Depois do healthcheck, faça uma cobrança real de valor controlado e confirme
o recebimento do webhook antes de abrir as vendas.
