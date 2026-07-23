# Guia de Deploy em Produção - Comitiva

**Data:** 23 de julho de 2026  
**Versão:** 1.0  
**Status:** Pronto para produção com PostgreSQL e migrations automáticas

---

## 1. Variáveis de Ambiente Obrigatórias

### 1.1 Banco de Dados PostgreSQL

```env
# Formato: postgresql://usuario:senha@host:porta/banco
DATABASE_URL=postgresql://comitiva_user:SENHA_SEGURA@seu-postgres.com:5432/comitiva
```

**Onde obter:**
- Se usando Heroku PostgreSQL: copie a URL de `Config Vars`
- Se usando AWS RDS: construa a URL com credenciais do RDS
- Se usando Supabase: copie a `Connection String` (PostgreSQL)
- Se usando DigitalOcean Managed Database: copie a connection string

### 1.2 Segurança - JWT

```env
# Gerar com: openssl rand -base64 32
JWT_SECRET=CHAVE_ALEATORIA_DE_32_CARACTERES_BASE64
```

**Comando para gerar:**
```bash
openssl rand -base64 32
```

### 1.3 Servidor

```env
NODE_ENV=production
PORT=3000
API_URL=https://seu-dominio.com  # URL pública da API
WEB_URL=https://seu-dominio.com  # URL do frontend web
MOBILE_URL=comitiva://            # Scheme do app mobile
```

### 1.4 Gateway de Pagamento - Mercado Pago

```env
PAYMENT_GATEWAY=mercadopago
MERCADOPAGO_ACCESS_TOKEN=APP_USR-XXXXXXXXXXXXXXXXXXXXX
MERCADOPAGO_PUBLIC_KEY=APP_USR-XXXXXXXXXXXXXXXXXXXXX
```

**Onde obter:**
1. Acesse https://www.mercadopago.com.br/developers
2. Faça login com sua conta
3. Vá para "Suas Integrações" > "Credenciais"
4. Copie as credenciais de **PRODUÇÃO** (começam com `APP_USR-`)

**⚠️ IMPORTANTE:** Use credenciais de PRODUÇÃO, não sandbox!

### 1.5 E-mail - SMTP

```env
SMTP_HOST=smtp.seuservidor.com
SMTP_PORT=587
SMTP_USER=seu_usuario@seuservidor.com
SMTP_PASS=sua_senha_de_app
SMTP_FROM=noreply@seu-dominio.com
```

**Opções recomendadas:**
- **Gmail:** `smtp.gmail.com:587` (usar senha de app)
- **SendGrid:** `smtp.sendgrid.net:587`
- **AWS SES:** `email-smtp.REGIAO.amazonaws.com:587`
- **Mailgun:** `smtp.mailgun.org:587`

### 1.6 Armazenamento de Arquivos (Opcional)

**Opção A: Local (padrão)**
```env
STORAGE_TYPE=local
STORAGE_PATH=/var/app/uploads
```

**Opção B: AWS S3**
```env
STORAGE_TYPE=s3
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_BUCKET_NAME=seu-bucket-comitiva
```

### 1.7 Follow-up Automático

```env
# Intervalo em minutos para verificar leads abandonados
FOLLOWUP_CHECK_INTERVAL_MINUTOS=5
```

### 1.8 Logging

```env
LOG_LEVEL=info  # Pode ser: debug, info, warn, error
```

---

## 2. Arquivo `.env` Completo para Produção

```env
# ===== BANCO DE DADOS =====
DATABASE_URL=postgresql://comitiva_user:SENHA@seu-postgres.com:5432/comitiva

# ===== SEGURANÇA =====
JWT_SECRET=CHAVE_ALEATORIA_GERADA_COM_OPENSSL
NODE_ENV=production

# ===== SERVIDOR =====
PORT=3000
API_URL=https://api.seu-dominio.com
WEB_URL=https://seu-dominio.com
MOBILE_URL=comitiva://

# ===== MERCADO PAGO (PRODUÇÃO) =====
PAYMENT_GATEWAY=mercadopago
MERCADOPAGO_ACCESS_TOKEN=APP_USR-XXXXXXXXXXXXXXXXXXXXX
MERCADOPAGO_PUBLIC_KEY=APP_USR-XXXXXXXXXXXXXXXXXXXXX

# ===== SMTP =====
SMTP_HOST=smtp.seuservidor.com
SMTP_PORT=587
SMTP_USER=seu_usuario@seuservidor.com
SMTP_PASS=sua_senha_de_app
SMTP_FROM=noreply@seu-dominio.com

# ===== ARMAZENAMENTO =====
STORAGE_TYPE=local
STORAGE_PATH=/var/app/uploads

# ===== FOLLOW-UP =====
FOLLOWUP_CHECK_INTERVAL_MINUTOS=5

# ===== LOGGING =====
LOG_LEVEL=info
```

---

## 3. Migrations Automáticas

A aplicação executa migrations automaticamente ao iniciar. Não é necessário rodar comandos manuais.

### 3.1 Como Funciona

1. **Na inicialização:** `server/db/index.ts` chama `initializeDatabase()`
2. **Drizzle ORM:** Sincroniza o schema automaticamente com o banco
3. **Segurança:** Cria tabelas apenas se não existirem
4. **Logs:** Exibe mensagens de sucesso ou erro no console

### 3.2 Verificar Migrations

Após o deploy, verifique os logs:

```bash
# Se usando Docker
docker logs CONTAINER_ID | grep -i "database\|migration"

# Se usando Heroku
heroku logs --tail

# Se usando outro provedor, verifique os logs da aplicação
```

Procure por mensagens como:
- ✅ `[DB] Conectado ao PostgreSQL`
- ✅ `[DB] Schema sincronizado`

---

## 4. Checklist de Deploy

### Antes do Deploy

- [ ] PostgreSQL provisionado e acessível
- [ ] Todas as 8 variáveis obrigatórias configuradas
- [ ] Credenciais de Mercado Pago de PRODUÇÃO (não sandbox)
- [ ] SMTP testado (envie um e-mail de teste)
- [ ] JWT_SECRET gerado com `openssl rand -base64 32`
- [ ] Domínio configurado com SSL/TLS
- [ ] Webhook do Mercado Pago configurado: `https://seu-dominio.com/api/pagamentos/webhook/mercadopago`

### Durante o Deploy

- [ ] Aplicação sobe sem erros
- [ ] Logs mostram `[DB] Conectado ao PostgreSQL`
- [ ] Migrations executam com sucesso
- [ ] Health check retorna 200: `GET /api/health`

### Após o Deploy

- [ ] Testar cadastro de usuário
- [ ] Testar login
- [ ] Testar criação de evento (admin)
- [ ] Testar fluxo de pagamento (sandbox do Mercado Pago)
- [ ] Verificar se e-mail foi disparado
- [ ] Verificar se status da reserva mudou para `cliente_confirmado`

---

## 5. Provedores Recomendados

### PostgreSQL

| Provedor | Plano Gratuito | Link |
|----------|---|---|
| Heroku PostgreSQL | Descontinuado | - |
| Supabase | 500 MB | https://supabase.com |
| Railway | $5/mês | https://railway.app |
| Render | Gratuito | https://render.com |
| DigitalOcean | $15/mês | https://www.digitalocean.com |
| AWS RDS | 12 meses grátis | https://aws.amazon.com/rds |

**Recomendação:** Supabase (mais fácil) ou Railway (mais barato)

### Hospedagem da Aplicação

| Provedor | Plano Gratuito | Link |
|----------|---|---|
| Render | Gratuito | https://render.com |
| Railway | $5/mês | https://railway.app |
| DigitalOcean App Platform | $12/mês | https://www.digitalocean.com/products/app-platform |
| Heroku | Descontinuado | - |
| AWS Elastic Beanstalk | 12 meses grátis | https://aws.amazon.com/elasticbeanstalk |

**Recomendação:** Railway (mais simples) ou Render (mais barato)

### SMTP

| Provedor | Plano Gratuito | Link |
|----------|---|---|
| Mailtrap | 500 e-mails/mês | https://mailtrap.io |
| SendGrid | 100 e-mails/dia | https://sendgrid.com |
| Mailgun | 1.000 e-mails/mês | https://www.mailgun.com |
| AWS SES | 62.000 e-mails/mês | https://aws.amazon.com/ses |
| Gmail | Ilimitado | https://mail.google.com |

**Recomendação:** SendGrid (mais confiável) ou Gmail (mais simples)

---

## 6. Passo a Passo de Deploy (Exemplo: Railway + Supabase)

### 6.1 Provisionar PostgreSQL no Supabase

1. Acesse https://supabase.com
2. Crie uma conta e um novo projeto
3. Vá para "Database" > "Connection string"
4. Copie a string de conexão (formato: `postgresql://...`)
5. Substitua `[YOUR-PASSWORD]` pela senha do banco

### 6.2 Deploy no Railway

1. Acesse https://railway.app
2. Conecte sua conta GitHub
3. Clique em "New Project" > "Deploy from GitHub"
4. Selecione o repositório `vml-arquivos/comitivas`
5. Railway detectará automaticamente que é Node.js
6. Adicione as variáveis de ambiente:
   - `DATABASE_URL` (do Supabase)
   - `JWT_SECRET` (gerado com openssl)
   - `MERCADOPAGO_ACCESS_TOKEN`
   - `MERCADOPAGO_PUBLIC_KEY`
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
   - `API_URL` (seu domínio Railway)
   - `NODE_ENV=production`
7. Clique em "Deploy"

### 6.3 Configurar Domínio

1. Em Railway, vá para "Settings" > "Domains"
2. Adicione seu domínio customizado
3. Configure DNS no seu registrador
4. Aguarde propagação (5-30 minutos)

### 6.4 Testar Deploy

```bash
# Health check
curl https://seu-dominio.com/api/health

# Deve retornar:
# {"status":"ok","timestamp":"2026-07-23T..."}
```

---

## 7. Troubleshooting

### Erro: "ECONNREFUSED" ao conectar no banco

**Causa:** PostgreSQL não está acessível  
**Solução:**
1. Verifique se `DATABASE_URL` está correto
2. Verifique se firewall permite conexão na porta 5432
3. Teste conexão: `psql DATABASE_URL`

### Erro: "Invalid JWT secret"

**Causa:** `JWT_SECRET` não foi configurado  
**Solução:** Gere com `openssl rand -base64 32` e configure

### Erro: "SMTP connection refused"

**Causa:** Credenciais SMTP incorretas  
**Solução:**
1. Verifique `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
2. Teste com: `telnet SMTP_HOST SMTP_PORT`
3. Verifique se seu IP está na whitelist do provedor

### Erro: "Webhook 404"

**Causa:** URL do webhook não está registrada corretamente  
**Solução:**
1. Verifique se a URL é: `https://seu-dominio.com/api/pagamentos/webhook/mercadopago`
2. Configure no painel Mercado Pago: "Notificações" > "Webhooks"
3. Teste com: `curl -X POST https://seu-dominio.com/api/pagamentos/webhook/mercadopago`

---

## 8. Monitoramento em Produção

### Logs

Monitore regularmente:
```bash
# Procure por erros
grep "ERROR" /var/log/app.log

# Procure por falhas de webhook
grep "webhook" /var/log/app.log

# Procure por falhas de SMTP
grep "SMTP" /var/log/app.log
```

### Métricas Recomendadas

- Uptime da aplicação
- Taxa de erro HTTP 5xx
- Tempo de resposta das rotas
- Número de e-mails disparados
- Número de pagamentos processados
- Taxa de conversão de reservas

### Alertas Recomendados

- Aplicação down
- Erro de banco de dados
- Taxa de erro > 1%
- Webhook falhando
- SMTP falhando

---

## 9. Backup e Recuperação

### Backup Automático

A maioria dos provedores PostgreSQL oferece backup automático:
- **Supabase:** Backup diário, retenção de 7 dias
- **Railway:** Backup automático
- **AWS RDS:** Backup automático, retenção configurável

### Backup Manual

```bash
# Fazer dump do banco
pg_dump DATABASE_URL > backup.sql

# Restaurar
psql DATABASE_URL < backup.sql
```

---

## 10. Escalabilidade Futura

Quando a aplicação crescer:

1. **Banco de Dados:** Considere read replicas
2. **Cache:** Adicione Redis para sessões e cache
3. **CDN:** Distribua assets estáticos via CloudFlare
4. **Filas:** Use Bull.js para processamento assíncrono
5. **Monitoramento:** Implemente APM (New Relic, DataDog)

---

**Preparado por:** Manus AI  
**Repositório:** https://github.com/vml-arquivos/comitivas  
**Suporte:** Consulte DEPLOYMENT.md para mais detalhes
