# Deploy Coolify - Sem Conflitos de Porta

**Data:** 23 de julho de 2026  
**Ambiente:** VPS com Coolify + Traefik  
**Status:** Validado - Sem conflitos

---

## 1. Análise de Portas do VPS

Seu VPS tem a seguinte configuração:

| Porta | Serviço | Status |
|-------|---------|--------|
| **80/443** | Traefik (proxy reverso) | Em uso |
| **6001-6002** | Coolify Realtime | Em uso |
| **8000** | Coolify painel | Em uso |
| **3000** | Node.js (múltiplos) | Em uso |
| **3001** | Node.js | Em uso |
| **5432** | PostgreSQL | Em uso |

**Conclusão:** Não há conflito! O Traefik gerencia automaticamente o roteamento por domínio.

---

## 2. Como Funciona o Traefik

O Coolify usa **Traefik v3.6** como proxy reverso:

1. **Entrada pública:** 0.0.0.0:80 e 0.0.0.0:443 (Traefik)
2. **Roteamento:** Por domínio (Host header)
3. **Saída interna:** Cada serviço em porta diferente (3000, 3001, etc)

**Exemplo:**
```
Requisição: https://comitivas.permupay.com.br
    ↓
Traefik (porta 443)
    ↓
Detecta Host: comitivas.permupay.com.br
    ↓
Roteia para: localhost:3000 (seu serviço)
    ↓
Resposta
```

---

## 3. Configuração Correta no Coolify

### Passo 1: Não Exponha Porta 3000

**ERRADO:**
```yaml
ports:
  - "3000:3000"  # Não faça isso!
```

**CORRETO:**
```yaml
ports:
  - "3000"  # Apenas interna
```

Ou deixe sem `ports` (Coolify gerencia automaticamente).

### Passo 2: Deixe Traefik Gerenciar

No Coolify, configure:
- **Port:** 3000 (interna)
- **Domains:** comitivas.permupay.com.br, apicomitivas.permupay.com.br
- **SSL/TLS:** Automático (Let's Encrypt)

Traefik fará:
```
https://comitivas.permupay.com.br → localhost:3000
https://apicomitivas.permupay.com.br → localhost:3000
```

### Passo 3: Dockerfile (Já Correto)

Seu Dockerfile já está correto:

```dockerfile
EXPOSE 3000
```

Isso apenas **documenta** a porta interna, não expõe publicamente.

---

## 4. Passo a Passo de Deploy (Sem Conflitos)

### Passo 1: Acessar Coolify

```
https://seu-coolify.com:8000
```

### Passo 2: Criar Novo Serviço

1. Clique em **"New Service"**
2. Selecione **"Docker"** ou **"Node.js"**
3. Conecte repositório: `vml-arquivos/comitivas`
4. Branch: `main`

### Passo 3: Configurar Aplicação

**Settings > General:**
- Nome: `comitiva-prime-test`
- Descrição: `Comitiva Prime - Teste`

**Settings > Build:**
- Build Command: `npm install && npm run build`
- Start Command: `npm start`

### Passo 4: Configurar Portas (IMPORTANTE)

**Settings > Ports:**
- Container Port: `3000`
- **NÃO marque "Expose port"** (deixe Traefik gerenciar)

### Passo 5: Configurar Domínios

**Settings > Domains:**
1. Adicione: `comitivas.permupay.com.br`
2. Adicione: `apicomitivas.permupay.com.br`
3. Clique em "Save"

Traefik automaticamente:
- Gera certificado SSL/TLS
- Roteia ambos os domínios para porta 3000 interna
- Sem conflitos!

### Passo 6: Configurar Variáveis

**Settings > Environment Variables:**

Copie e cole:
```
DATABASE_URL=postgresql://USUARIO:SENHA@HOST:5432/BANCO
JWT_SECRET=GERE_UMA_CHAVE_FORTE
NODE_ENV=production
PORT=3000
API_URL=https://apicomitivas.permupay.com.br
WEB_URL=https://comitivas.permupay.com.br
MOBILE_URL=comitiva://
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=seu_usuario_mailtrap@mailtrap.io
SMTP_PASS=PREENCHA_COM_A_SENHA_REAL
SMTP_FROM=noreply@comitivas.permupay.com.br
STORAGE_TYPE=local
STORAGE_PATH=/app/uploads
FOLLOWUP_CHECK_INTERVAL_MINUTOS=5
LOG_LEVEL=info
PAYMENT_GATEWAY=mercadopago
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_PUBLIC_KEY=PREENCHA_COM_A_CHAVE_PUBLICA_REAL
```

### Passo 7: Fazer Deploy

1. Clique em **"Deploy"**
2. Aguarde compilação (5-10 minutos)
3. Verifique logs

### Passo 8: Validar

**Home:**
```
https://comitivas.permupay.com.br
```

**Health Check:**
```
https://apicomitivas.permupay.com.br/api/health
```

Deve retornar:
```json
{"status":"ok","timestamp":"..."}
```

---

## 5. Verificar Portas Após Deploy

Para confirmar que não há conflitos:

```bash
# SSH no VPS
ssh root@seu-vps

# Listar containers
docker ps

# Procurar por "comitiva"
docker ps | grep comitiva

# Deve mostrar algo como:
# abc123def456 ... 3000/tcp comitiva-prime-test-...
```

**Importante:** Não deve mostrar `0.0.0.0:3000->3000` (isso seria conflito).

---

## 6. Troubleshooting de Portas

### Erro: "Port 3000 already in use"

**Causa:** Você marcou "Expose port" no Coolify

**Solução:**
1. Vá para Settings > Ports
2. Desmarque "Expose port"
3. Clique em "Save"
4. Faça "Redeploy"

### Erro: "Cannot connect to domain"

**Causa:** Traefik não roteou corretamente

**Solução:**
1. Aguarde 2-3 minutos (propagação DNS)
2. Verifique domínios em Settings > Domains
3. Verifique se porta interna é 3000
4. Faça "Redeploy"

### Erro: "SSL certificate error"

**Causa:** Let's Encrypt ainda não gerou certificado

**Solução:**
1. Aguarde 5 minutos
2. Acesse novamente
3. Se persistir, clique em "Renew Certificate"

---

## 7. Arquitetura Final (Sem Conflitos)

```
┌─────────────────────────────────────────────┐
│         Internet (HTTPS)                    │
│  comitivas.permupay.com.br                  │
│  apicomitivas.permupay.com.br               │
└──────────────────┬──────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │  Traefik (80/443)   │
        │  (coolify-proxy)    │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │  Comitiva Prime     │
        │  (localhost:3000)   │
        │  (interno)          │
        └──────────┬──────────┘
                   │
             ┌─────▼─────┐
             │PostgreSQL │
             │  (5432)   │
             └───────────┘
```

**Sem conflitos de porta!**

---

## 8. Segurança

- ✅ Porta 3000 não exposta publicamente
- ✅ Traefik gerencia SSL/TLS
- ✅ Sem credenciais em repositório
- ✅ Variáveis seguras no Coolify

---

## 9. Próximos Passos

1. **Acessar Coolify:** https://seu-coolify.com:8000
2. **Criar serviço:** Siga os passos acima
3. **Fazer deploy:** Clique em "Deploy"
4. **Validar:** Acesse os domínios

---

**Status:** Pronto para deploy sem conflitos  
**Repositório:** https://github.com/vml-arquivos/comitivas
