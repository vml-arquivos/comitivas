# Redeploy de produção — Barretos 2026 / versão 18 corrigida

## O que esta versão preserva

O comando `npm run seed:barretos-2026:prod` já foi executado em produção.
O evento real tem id `smgzb5apn8pg3mn5ijsxt93v`. A migration `0005` procura o
evento e os lotes pelos identificadores naturais já cadastrados, mantém esses
ids e apenas completa itinerário, datas e disponibilidade. Ela não cria um
segundo evento e não redefine preço/capacidade em todo boot.

Não é necessário rodar o seed novamente após este redeploy. Se ele for
executado por engano, o script reaproveita evento/lotes/pacotes existentes e
preserva os valores operacionais definidos no painel.

## Antes do redeploy

1. Faça um backup/snapshot do PostgreSQL pelo Coolify.
2. Confirme as variáveis:
   - `NODE_ENV=production`
   - `DATABASE_URL` do PostgreSQL de produção
   - `JWT_SECRET` forte e permanente
   - `WEB_URL` e `API_URL` com HTTPS e sem barra final
   - `PAYMENT_GATEWAY=mercadopago`
   - `MERCADOPAGO_ACCESS_TOKEN` real
   - `VITE_WHATSAPP_NUMERO` como build variable, no formato DDI + DDD + número
3. Configure armazenamento persistente para `/app/uploads`. Os PDFs de
   contrato ficam nesse diretório e não podem desaparecer num novo container.
4. Não adicione variáveis nem serviços de Redis: o projeto não usa Redis.

### Correção do incidente de 25/07/2026

O build do commit `c10ad54747fc39529790bf3f42b3b739705d99ef`
terminou com sucesso, mas o contêiner recebeu `PAYMENT_GATEWAY=mock` no
ambiente de execução e foi encerrado pela proteção de produção. Antes de
acionar outro redeploy:

1. Exclua qualquer entrada duplicada de `PAYMENT_GATEWAY` no Coolify.
2. Cadastre `PAYMENT_GATEWAY=mercadopago` como variável de execução.
3. Preencha `MERCADOPAGO_ACCESS_TOKEN` com o Access Token real de produção.
4. Configure:
   - `WEB_URL=https://excursaodascomitivas.com.br`
   - `API_URL=https://api.excursaodascomitivas.com.br`
5. Corrija os domínios da aplicação para:
   - `https://excursaodascomitivas.com.br`
   - `https://api.excursaodascomitivas.com.br`
6. Somente `VITE_WHATSAPP_NUMERO` precisa estar disponível durante o build.
   Segredos como `JWT_SECRET`, `SMTP_PASS` e `MERCADOPAGO_ACCESS_TOKEN` devem
   ficar disponíveis apenas durante a execução.
7. Como o `JWT_SECRET` apareceu no log do deploy, gere outro segredo e
   substitua o valor antes do próximo deploy.

Não desative a validação do gateway: ela impediu que uma produção configurada
como teste simulasse pagamentos.

## Redeploy

1. Suba estes arquivos para a branch usada pelo Coolify.
2. Acione **Redeploy**.
3. Não rode `npm run db:migrate` dentro da imagem final. O servidor executa as
   migrations Drizzle automaticamente antes de começar a atender requisições.
4. Nos logs, confirme:

```text
[DB] Conexão estabelecida com sucesso
[DB] Migrations Drizzle aplicadas com sucesso
[SERVER] Comitiva rodando
```

## Conferência no banco

Execute no terminal do PostgreSQL:

```sql
SELECT id, nome, data_inicio, data_fim
FROM eventos
WHERE nome = 'Excursão das Comitivas — Festa do Peão de Barretos 2026';
```

Resultado esperado: uma linha, com id `smgzb5apn8pg3mn5ijsxt93v`.

```sql
SELECT
  id,
  nome,
  data_inicio,
  data_fim,
  data_embarque,
  data_retorno,
  local_embarque,
  local_hospedagem
FROM lotes
WHERE evento_id = 'smgzb5apn8pg3mn5ijsxt93v'
ORDER BY data_inicio;
```

Resultado esperado: dois lotes, ambos com embarque, retorno e locais
preenchidos.

```sql
SELECT l.nome, p.modalidade_hospedagem, p.disponibilidade
FROM pacotes p
JOIN lotes l ON l.id = p.lote_id
WHERE l.evento_id = 'smgzb5apn8pg3mn5ijsxt93v'
ORDER BY l.data_inicio, p.modalidade_hospedagem;
```

No segundo fim de semana, `quarto_ventilador` deve estar `esgotado` e
`quarto_ar_condicionado` deve estar `ultimas_vagas`.

```sql
SELECT COUNT(*) AS clientes_sem_card_no_crm
FROM usuarios u
WHERE u.tipo = 'cliente'
  AND NOT EXISTS (
    SELECT 1 FROM leads_origem l WHERE l.usuario_id = u.id
  );
```

Resultado esperado: `0`.

## Teste funcional obrigatório

1. Abra uma janela anônima e crie uma conta de cliente com CPF válido.
2. Confirme que a conta aparece imediatamente em **Admin → Jornada do Cliente**.
3. Confirme no dashboard:
   - clientes cadastrados;
   - contatos no CRM;
   - cadastros sem reserva.
4. No CRM, salve uma observação e um horário de próximo contato.
5. Monte uma reserva e confirme que o pacote aparece no card do CRM.
6. Gere o contrato e confira:
   - fim de semana correto;
   - embarque Brasília/Goiânia;
   - hospedagem/modalidade;
   - inclusões;
   - condição de pagamento.
7. Faça uma cobrança real de valor controlado em cada meio que será liberado
   comercialmente. O token do gateway e as regras da conta Mercado Pago não
   podem ser homologados apenas por build automatizado.
8. Após aprovação, confirme que:
   - reserva mudou para `cliente_confirmado`;
   - uma única vaga foi consumida, mesmo se o webhook for reenviado;
   - voucher foi liberado.

Não abra vendas antes de validar a primeira cobrança real e o webhook no
domínio definitivo.
