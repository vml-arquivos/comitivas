# Teste com Subdomínios - Comitiva Prime

**Objetivo:** Validar o sistema em ambiente de teste antes de produção, usando 2 subdomínios apenas.

---

## 1. Subdomínios Necessários (2 apenas)

Para testar o sistema completo, você precisa de **apenas 2 subdomínios**:

| Subdomínio | Função | Porta |
|-----------|--------|-------|
| `comitivaprime-test.com.br` | Site público + Sistema logado (frontend) | 80/443 |
| `api-test.comitivaprime-test.com.br` | API backend (Node.js) | 3000 |

---

## 2. Configuração de DNS

Adicione estes registros no seu registrador de domínios (GoDaddy, Namecheap, etc):

```dns
comitivaprime-test.com.br          A    SEU_IP_SERVIDOR
api-test.comitivaprime-test.com.br A    SEU_IP_SERVIDOR
```

**Exemplo (GoDaddy):**
1. Vá para "Gerenciar DNS"
2. Adicione novo registro:
   - **Nome:** `comitivaprime-test.com.br`
   - **Tipo:** A
   - **Valor:** `123.456.789.012` (seu IP)
3. Repita para `api-test.comitivaprime-test.com.br`

**Propagação:** Leva 5-30 minutos. Verifique com:
```bash
nslookup comitivaprime-test.com.br
nslookup api-test.comitivaprime-test.com.br
```

---

## 3. Variáveis de Ambiente para Teste

Use o arquivo `.env.teste` fornecido. Copie para `.env`:

```bash
cp .env.teste .env
```

Edite as variáveis críticas:

```env
# Banco de dados (use Supabase ou Railway)
DATABASE_URL=postgresql://user:pass@seu-postgres.com:5432/comitiva_teste

# JWT (gere novo)
JWT_SECRET=$(openssl rand -base64 32)

# URLs dos subdomínios
API_URL=https://api-test.comitivaprime-test.com.br
WEB_URL=https://comitivaprime-test.com.br

# SMTP (use Mailtrap)
SMTP_HOST=smtp.mailtrap.io
SMTP_USER=seu_usuario@mailtrap.io
SMTP_PASS=sua_senha

# Pagamento (DESABILITADO para teste)
PAYMENT_GATEWAY=mock
```

---

## 4. Variáveis Mínimas para Teste

Você precisa preencher **apenas estas 8 variáveis**:

| Variável | Valor de Teste | Onde Obter |
|----------|---|---|
| `DATABASE_URL` | `postgresql://...` | Supabase ou Railway |
| `JWT_SECRET` | `openssl rand -base64 32` | Gere com comando |
| `API_URL` | `https://api-test.comitivaprime-test.com.br` | Seu subdomínio |
| `WEB_URL` | `https://comitivaprime-test.com.br` | Seu subdomínio |
| `SMTP_HOST` | `smtp.mailtrap.io` | Mailtrap |
| `SMTP_USER` | `seu_usuario@mailtrap.io` | Mailtrap |
| `SMTP_PASS` | `sua_senha_mailtrap` | Mailtrap |
| `PAYMENT_GATEWAY` | `mock` | Deixe como "mock" |

**Todas as outras variáveis têm valores padrão seguros.**

---

## 5. Passo a Passo de Teste

### 5.1 Preparar Banco de Dados

**Opção A: Supabase (Recomendado)**
1. Acesse https://supabase.com
2. Crie um novo projeto
3. Vá para "Database" > "Connection Strings"
4. Copie a string PostgreSQL
5. Cole em `DATABASE_URL`

**Opção B: Railway**
1. Acesse https://railway.app
2. Crie um novo projeto PostgreSQL
3. Copie a connection string
4. Cole em `DATABASE_URL`

### 5.2 Preparar SMTP

1. Acesse https://mailtrap.io
2. Crie uma conta gratuita
3. Vá para "SMTP Settings"
4. Copie:
   - `SMTP_HOST`
   - `SMTP_USER`
   - `SMTP_PASS`

### 5.3 Gerar JWT Secret

```bash
openssl rand -base64 32
# Copie o resultado para JWT_SECRET
```

### 5.4 Iniciar o Servidor

```bash
# Instalar dependências
npm install

# Iniciar em desenvolvimento
npm run dev

# Ou iniciar em produção
npm run build
npm start
```

### 5.5 Testar o Fluxo Completo

1. **Acesse a Home:** `https://comitivaprime-test.com.br`
2. **Cadastre um usuário:** Clique em "Cadastro"
3. **Faça login:** Use as credenciais criadas
4. **Crie um evento (admin):** Vá para `/admin` e crie um evento de teste
5. **Monte um pacote:** Clique em "Excursões" e monte um pacote
6. **Vá ao checkout:** Clique em "Finalizar Reserva"
7. **Verifique o e-mail:** Mailtrap deve ter recebido o e-mail de confirmação
8. **Verifique o banco:** A reserva deve estar em `status = aguardando_pagamento`

---

## 6. Teste Específico: Webhook (Sem Pagamento Real)

O webhook está configurado para `/api/pagamentos/webhook/mercadopago`, mas como estamos usando `PAYMENT_GATEWAY=mock`, ele não será acionado automaticamente.

**Para testar manualmente:**

```bash
curl -X POST https://api-test.comitivaprime-test.com.br/api/pagamentos/webhook/mercadopago \
  -H "Content-Type: application/json" \
  -d '{
    "id": 123456789,
    "status": "approved",
    "external_reference": "RESERVA_ID_AQUI"
  }'
```

Verifique se o status da reserva mudou para `cliente_confirmado`.

---

## 7. Teste Específico: Avaliações

1. **Criar uma avaliação (como cliente):**
   - Faça login como cliente
   - Vá para "Minhas Reservas"
   - Clique em "Deixar Avaliação"
   - Preencha nota (1-5) e comentário
   - Clique em "Enviar"

2. **Aprovar a avaliação (como admin):**
   - Faça login como admin
   - Vá para "Admin" > "Moderação de Avaliações"
   - Clique em "Aprovar"

3. **Verificar na página pública:**
   - Acesse `https://comitivaprime-test.com.br/avaliacoes`
   - A avaliação deve aparecer

---

## 8. Checklist de Teste

- [ ] Banco de dados conectado (migrations rodaram automaticamente)
- [ ] Cadastro de usuário funcionando
- [ ] Login funcionando
- [ ] Criação de evento (admin) funcionando
- [ ] Montagem de pacote funcionando
- [ ] Checkout funcionando
- [ ] E-mail de confirmação recebido no Mailtrap
- [ ] Status da reserva mudou para `aguardando_pagamento`
- [ ] Webhook testado manualmente
- [ ] Avaliação criada e aprovada aparece na página pública
- [ ] Home exibe prova social corretamente (número de clientes)
- [ ] Página de História carrega eventos realizados

---

## 9. Após Testes: Revogação de Credenciais

**IMPORTANTE:** Após terminar os testes, revogue as credenciais:

1. **Mailtrap:** Delete a inbox de teste
2. **Supabase/Railway:** Delete o banco de dados de teste
3. **JWT_SECRET:** Gere um novo para produção
4. **Não faça commit** do `.env` com dados reais

---

## 10. Próximos Passos para Produção

Quando estiver pronto para produção:

1. **Domínio:** Registre `comitivaprime.com.br` (sem `-test`)
2. **Subdomínios:** Configure os mesmos 2 subdomínios
3. **Banco de dados:** Use um banco de produção (maior, com backups)
4. **SMTP:** Use um serviço de produção (SendGrid, AWS SES)
5. **Pagamento:** Mude `PAYMENT_GATEWAY=mercadopago` e preencha credenciais reais
6. **SSL/TLS:** Configure certificados (Let's Encrypt gratuito)

---

**Arquivo de configuração:** `.env.teste`  
**Repositório:** https://github.com/vml-arquivos/comitivas  
**Suporte:** Consulte GUIA_DEPLOY_PRODUCAO.md
