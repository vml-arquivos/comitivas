# Deploy Coolify - Comitiva Prime

**Data:** 23 de julho de 2026  
**Domínios:** comitivas.permupay.com.br | apicomitivas.permupay.com.br  
**Status:** Pronto para deploy

---

## 1. Pré-Requisitos

- [ ] Acesso ao Coolify
- [ ] Repositório GitHub conectado: `vml-arquivos/comitivas`
- [ ] PostgreSQL temporário (fornecido)
- [ ] Redis temporário (fornecido)
- [ ] Conta Mailtrap (gratuita)

---

## 2. Variáveis de Ambiente (Bloco Único)

**Arquivo:** `COOLIFY_ENV_BLOCO.txt`

Copie e cole TUDO no Coolify:

```
DATABASE_URL=postgresql://postgres:8eLcYsrs7mbFExkW2WJUfONPaz1CSNfTh2M89U6QSO9te8zoqZO4rOVzEBGCGnGl@vnviiqwmxeq52p65ytvviqlj:5432/postgres
REDIS_URL=redis://default:SEWhFeP4N70sSJl6edfv4j1AwonD9uitFflyD3QoVxMMX5upphQvHZPwGOzKhn6r@artf87ais0vxumeet4nao0gr:6379/0
JWT_SECRET=DoUvDEjvPc8BMrVK+X6aioM+9/4rTIL5ro9H/8qENok=
NODE_ENV=production
PORT=3000
API_URL=https://apicomitivas.permupay.com.br
WEB_URL=https://comitivas.permupay.com.br
MOBILE_URL=comitiva://
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=seu_usuario_mailtrap@mailtrap.io
SMTP_PASS=sua_senha_mailtrap_aqui
SMTP_FROM=noreply@comitivas.permupay.com.br
STORAGE_TYPE=local
STORAGE_PATH=/app/uploads
FOLLOWUP_CHECK_INTERVAL_MINUTOS=5
LOG_LEVEL=info
PAYMENT_GATEWAY=mock
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_PUBLIC_KEY=
```

---

## 3. Passo a Passo de Deploy

### Passo 1: Acessar Coolify

1. Abra seu painel Coolify
2. Faça login com suas credenciais

### Passo 2: Criar Novo Serviço

1. Clique em **"New Service"** ou **"New Application"**
2. Selecione **"Docker Compose"** ou **"Node.js"**
3. Conecte o repositório GitHub:
   - Repositório: `vml-arquivos/comitivas`
   - Branch: `main`
4. Clique em **"Create"**

### Passo 3: Configurar Variáveis de Ambiente

1. Vá para **Settings** > **Environment Variables**
2. Copie e cole TUDO do bloco acima
3. **Edite:**
   - `SMTP_USER` = seu email Mailtrap
   - `SMTP_PASS` = sua senha Mailtrap
4. Clique em **"Save"**

### Passo 4: Configurar Domínios

1. Vá para **Settings** > **Domains**
2. Adicione domínio: `comitivas.permupay.com.br`
3. Adicione domínio: `apicomitivas.permupay.com.br`
4. Clique em **"Save"**

### Passo 5: Configurar Build

1. Vá para **Build** > **Build Command**
2. Deixe como: `npm install && npm run build`
3. Clique em **"Save"**

### Passo 6: Configurar Inicialização

1. Vá para **Start** > **Start Command**
2. Deixe como: `npm start`
3. Clique em **"Save"**

### Passo 7: Fazer Deploy

1. Clique em **"Deploy"** ou **"Redeploy"**
2. Aguarde a compilação (5-10 minutos)
3. Verifique os logs em **"Logs"**

### Passo 8: Validar Deploy

Após o deploy, verifique:

**Home (Landing Page):**
```
https://comitivas.permupay.com.br
```

**Health Check (API):**
```
https://apicomitivas.permupay.com.br/api/health
```

Deve retornar:
```json
{"status":"ok","timestamp":"2026-07-23T..."}
```

---

## 4. Validação Pós-Deploy

### 4.1 Verificar Migrations

As migrations devem rodar automaticamente. Verifique nos logs:

```
[DB] Conectado ao PostgreSQL
[DB] Schema sincronizado
```

### 4.2 Testar Fluxo Completo

1. **Cadastro:** `https://comitivas.permupay.com.br/cadastro`
2. **Login:** `https://comitivas.permupay.com.br/login`
3. **Eventos:** `https://comitivas.permupay.com.br/eventos`
4. **Admin:** `https://comitivas.permupay.com.br/admin`

### 4.3 Verificar E-mail

1. Acesse Mailtrap
2. Verifique se recebeu e-mail de teste

### 4.4 Verificar Banco de Dados

Conecte ao PostgreSQL e verifique:

```sql
SELECT * FROM usuarios LIMIT 1;
SELECT * FROM eventos LIMIT 1;
SELECT * FROM reservas LIMIT 1;
```

---

## 5. Troubleshooting

### Erro: "Build failed"

**Solução:**
1. Verifique os logs em "Logs"
2. Procure por erros de compilação
3. Verifique se `package.json` está correto
4. Tente fazer "Redeploy"

### Erro: "ECONNREFUSED" ao conectar PostgreSQL

**Solução:**
1. Verifique se `DATABASE_URL` está correto
2. Verifique se firewall permite conexão
3. Teste a conexão manualmente

### Erro: "SMTP connection refused"

**Solução:**
1. Verifique `SMTP_USER` e `SMTP_PASS` no Mailtrap
2. Regenere as credenciais no Mailtrap
3. Atualize as variáveis no Coolify

### Erro: "Invalid JWT secret"

**Solução:**
1. Regenere: `openssl rand -base64 32`
2. Atualize `JWT_SECRET` no Coolify
3. Faça "Redeploy"

---

## 6. Monitoramento

### Logs em Tempo Real

1. Vá para **"Logs"**
2. Procure por erros ou avisos
3. Verifique se o servidor está rodando

### Métricas

1. Vá para **"Metrics"** (se disponível)
2. Monitore CPU, memória, rede

### Health Check

Teste periodicamente:
```bash
curl https://apicomitivas.permupay.com.br/api/health
```

---

## 7. Após Testes: Revogação de Credenciais

**IMPORTANTE:** Após terminar os testes:

1. **Revogue credenciais PostgreSQL**
   - Contate o provedor ou use painel de controle

2. **Revogue credenciais Redis**
   - Contate o provedor ou use painel de controle

3. **Gere novo JWT_SECRET**
   ```bash
   openssl rand -base64 32
   ```

4. **Delete o serviço no Coolify**
   - Vá para Settings > Delete Service

5. **Não use mais estas credenciais**

---

## 8. Próximos Passos para Produção

Quando estiver pronto para produção:

1. **Domínio:** Registre `comitivas.com.br` (sem permupay)
2. **Banco de dados:** Use um banco de produção
3. **Redis:** Use um Redis de produção
4. **JWT_SECRET:** Gere um novo
5. **SMTP:** Use um serviço de produção
6. **Pagamento:** Mude `PAYMENT_GATEWAY=mercadopago` com credenciais reais
7. **SSL/TLS:** Já configurado automaticamente pelo Coolify

---

## 9. Suporte

- **Documentação Coolify:** https://coolify.io/docs
- **Repositório:** https://github.com/vml-arquivos/comitivas
- **Guia de Deploy:** GUIA_DEPLOY_PRODUCAO.md

---

**Status:** Pronto para deploy  
**Data:** 23 de julho de 2026
