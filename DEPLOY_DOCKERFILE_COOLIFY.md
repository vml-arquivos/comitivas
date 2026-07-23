# Deploy por Dockerfile no Coolify - Guia Rápido

**Data:** 23 de julho de 2026  
**Repositório:** vml-arquivos/comitivas (público)  
**Método:** Dockerfile (na raiz)  
**Status:** Pronto para deploy

---

## 1. Pré-Requisitos

- [ ] Acesso ao Coolify (https://seu-coolify.com:8000)
- [ ] Conta Mailtrap (para SMTP)
- [ ] Domínios: comitivas.permupay.com.br, apicomitivas.permupay.com.br

---

## 2. Arquivo de Variáveis

**Arquivo:** `COOLIFY_VARIAVEIS_FINAIS.txt`

Contém todas as 20 variáveis prontas para copiar e colar.

**Variáveis que você DEVE editar:**
- `SMTP_USER` = seu email Mailtrap
- `SMTP_PASS` = sua senha Mailtrap

**Todas as outras:** deixe como está

---

## 3. Passo a Passo (5 minutos)

### Passo 1: Acessar Coolify

```
https://seu-coolify.com:8000
```

Faça login com suas credenciais.

### Passo 2: Criar Novo Serviço

1. Clique em **"New Service"** ou **"New Application"**
2. Selecione **"Docker"**
3. Selecione **"Dockerfile"**
4. Conecte o repositório GitHub:
   - Repositório: `vml-arquivos/comitivas`
   - Branch: `main`
5. Clique em **"Create"** ou **"Next"**

### Passo 3: Configurar Aplicação

**Settings > General:**
- Nome: `comitiva-prime-test`
- Descrição: `Comitiva Prime - Teste`

**Settings > Build:**
- Build Command: `npm install && npm run build`
- Start Command: `npm start`

### Passo 4: Configurar Portas (SEM CONFLITOS)

**Settings > Ports:**
- Container Port: `3000`
- **NÃO marque "Expose port"** ← Importante!

Deixe Traefik gerenciar (automático).

### Passo 5: Configurar Domínios

**Settings > Domains:**
1. Clique em **"Add Domain"**
2. Digite: `comitivas.permupay.com.br`
3. Clique em **"Add"**
4. Repita para: `apicomitivas.permupay.com.br`
5. Clique em **"Save"**

Traefik gerará SSL/TLS automaticamente.

### Passo 6: Colar Variáveis

**Settings > Environment Variables:**

1. Abra o arquivo `COOLIFY_VARIAVEIS_FINAIS.txt`
2. Copie TUDO (todas as 20 linhas)
3. Cole no campo de variáveis do Coolify
4. **Edite:**
   - `SMTP_USER` = seu email Mailtrap
   - `SMTP_PASS` = sua senha Mailtrap
5. Clique em **"Save"**

### Passo 7: Fazer Deploy

1. Clique em **"Deploy"** ou **"Redeploy"**
2. Aguarde 5-10 minutos (compilação)
3. Verifique os logs em **"Logs"**

### Passo 8: Validar

Após o deploy, teste:

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

## 4. O Que Acontece Automaticamente

### Build (Dockerfile)

```dockerfile
# 1. Instala dependências
npm ci

# 2. Compila código
npm run build

# 3. Copia assets
COPY packages ./packages
COPY apps/web/src/assets ./apps/web/src/assets

# 4. Cria diretório de uploads
mkdir -p uploads
```

### Inicialização (npm start)

```bash
# 1. Inicia servidor Node.js
node dist/index.js

# 2. Conecta ao PostgreSQL
[DB] Conectado ao PostgreSQL

# 3. Executa migrations (automático)
[DB] Schema sincronizado

# 4. Inicia job de follow-up
[Scheduler] Follow-up iniciado

# 5. Servidor pronto
[Server] Escutando na porta 3000
```

### Migrations Automáticas

- Executam ao iniciar (sem comando manual)
- Drizzle ORM sincroniza schema
- Cria tabelas se não existirem
- Seguro (idempotente)

---

## 5. Verificar Após Deploy

### Logs em Tempo Real

No Coolify, vá para **"Logs"** e procure por:

```
[DB] Conectado ao PostgreSQL
[DB] Schema sincronizado
[Scheduler] Follow-up iniciado
[Server] Escutando na porta 3000
```

Se ver essas mensagens, está funcionando!

### Testar Fluxo Completo

1. **Home:** https://comitivas.permupay.com.br
2. **Cadastro:** Clique em "Cadastro"
3. **Login:** Use as credenciais criadas
4. **Eventos:** Clique em "Excursões"
5. **Admin:** Vá para `/admin` (se admin)

### Verificar E-mail

1. Acesse Mailtrap
2. Verifique se recebeu e-mail de teste

---

## 6. Troubleshooting

### Erro: "Build failed"

**Causa:** Erro na compilação

**Solução:**
1. Verifique logs em Coolify
2. Procure por erro específico
3. Verifique `package.json` e `tsconfig.json`
4. Tente "Redeploy"

### Erro: "Port 3000 already in use"

**Causa:** Você marcou "Expose port"

**Solução:**
1. Vá para Settings > Ports
2. Desmarque "Expose port"
3. Clique em "Save"
4. Faça "Redeploy"

### Erro: "Cannot connect to domain"

**Causa:** Traefik ainda não roteou

**Solução:**
1. Aguarde 2-3 minutos
2. Verifique domínios em Settings > Domains
3. Tente "Redeploy"

### Erro: "ECONNREFUSED" ao conectar PostgreSQL

**Causa:** DATABASE_URL incorreta

**Solução:**
1. Verifique DATABASE_URL em variáveis
2. Teste a conexão manualmente
3. Verifique firewall

### Erro: "SMTP connection refused"

**Causa:** SMTP_USER ou SMTP_PASS incorretos

**Solução:**
1. Verifique credenciais no Mailtrap
2. Regenere credenciais se necessário
3. Atualize variáveis no Coolify
4. Faça "Redeploy"

---

## 7. Monitoramento

### Métricas

No Coolify, monitore:
- CPU e memória
- Uptime
- Status do build
- Logs de erro

### Health Check

Teste periodicamente:
```bash
curl https://apicomitivas.permupay.com.br/api/health
```

### Logs

Verifique regularmente em **"Logs"** para:
- Erros de conexão
- Falhas de SMTP
- Problemas de banco de dados

---

## 8. Após Testes: Revogação

**IMPORTANTE:** Após terminar os testes:

1. **Revogue credenciais PostgreSQL**
   - Contate o provedor

2. **Revogue credenciais Redis**
   - Contate o provedor

3. **Gere novo JWT_SECRET**
   ```bash
   openssl rand -base64 32
   ```

4. **Delete o serviço no Coolify**
   - Settings > Delete Service

5. **Não use mais estas credenciais**

---

## 9. Próximos Passos para Produção

Quando estiver pronto para produção:

1. **Domínio:** Registre `comitivas.com.br` (sem permupay)
2. **Banco de dados:** Use um banco de produção (maior, com backups)
3. **Redis:** Use um Redis de produção
4. **JWT_SECRET:** Gere um novo
5. **SMTP:** Use um serviço de produção (SendGrid, AWS SES)
6. **Pagamento:** Mude `PAYMENT_GATEWAY=mercadopago` com credenciais reais
7. **SSL/TLS:** Já configurado automaticamente pelo Coolify + Traefik

---

## 10. Checklist Final

- [ ] Repositório GitHub conectado
- [ ] Dockerfile validado
- [ ] Variáveis copiadas e coladas
- [ ] SMTP_USER e SMTP_PASS editados
- [ ] Portas configuradas (3000 interno, sem expose)
- [ ] Domínios adicionados
- [ ] Build realizado com sucesso
- [ ] Migrations executadas
- [ ] Health check respondendo
- [ ] Fluxo completo testado

---

**Status:** Pronto para deploy  
**Repositório:** https://github.com/vml-arquivos/comitivas  
**Arquivo de variáveis:** COOLIFY_VARIAVEIS_FINAIS.txt
