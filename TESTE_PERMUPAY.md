# Teste Comitiva Prime - Domínios PermUPay

**Data:** 23 de julho de 2026  
**Domínios:** comitivas.permupay.com.br | apicomitivas.permupay.com.br  
**Status:** Temporário - Revogue após testes

---

## 1. Subdomínios Configurados

| Subdomínio | Função | Status |
|-----------|--------|--------|
| `comitivas.permupay.com.br` | Site público + Sistema logado | ✅ Pronto |
| `apicomitivas.permupay.com.br` | API backend (Node.js) | ✅ Pronto |

---

## 2. Credenciais Temporárias Fornecidas

### PostgreSQL
```
Host: vnviiqwmxeq52p65ytvviqlj
Port: 5432
User: postgres
Password: 8eLcYsrs7mbFExkW2WJUfONPaz1CSNfTh2M89U6QSO9te8zoqZO4rOVzEBGCGnGl
Database: postgres
```

**Connection String:**
```
postgresql://USUARIO:SENHA@HOST:5432/BANCO
```

---

## 3. Tokens Gerados para Teste

### JWT_SECRET (32 bytes, base64)
```
DoUvDEjvPc8BMrVK+X6aioM+9/4rTIL5ro9H/8qENok=
```

**Como foi gerado:**
```bash
openssl rand -base64 32
```

---

## 4. Arquivo de Configuração Local

**Arquivo:** `.env.local`

Este arquivo contém todas as credenciais temporárias. **NÃO FAÇA COMMIT DESTE ARQUIVO.**

```bash
# Copie para .env para usar localmente
cp .env.local .env
```

---

## 5. Variáveis Necessárias

| Variável | Valor | Origem |
|----------|-------|--------|
| `DATABASE_URL` | Acima (PostgreSQL) | Fornecido |
| `JWT_SECRET` | Acima (gerado) | Gerado |
| `API_URL` | `https://apicomitivas.permupay.com.br` | Domínio |
| `WEB_URL` | `https://comitivas.permupay.com.br` | Domínio |
| `SMTP_HOST` | `smtp.mailtrap.io` | Mailtrap |
| `SMTP_USER` | Seu Mailtrap user | Você preenche |
| `SMTP_PASS` | Sua Mailtrap password | Você preenche |
| `PAYMENT_GATEWAY` | `mock` | Sem pagamento |

---

## 6. Passo a Passo de Teste

### 6.1 Preparar Ambiente Local

```bash
# 1. Copiar configuração
cp .env.local .env

# 2. Editar SMTP_USER e SMTP_PASS com suas credenciais Mailtrap
nano .env

# 3. Instalar dependências
npm install

# 4. Iniciar servidor
npm run dev
```

### 6.2 Acessar o Sistema

**Home (Landing Page):**
```
https://comitivas.permupay.com.br
```

**Cadastro:**
```
https://comitivas.permupay.com.br/cadastro
```

**Login:**
```
https://comitivas.permupay.com.br/login
```

**Painel Admin:**
```
https://comitivas.permupay.com.br/admin
```

### 6.3 Testar Fluxo Completo

1. **Cadastre um usuário**
   - Acesse `/cadastro`
   - Preencha nome, e-mail, senha
   - Clique em "Cadastrar"

2. **Faça login**
   - Use as credenciais criadas
   - Verifique se foi redirecionado para `/eventos`

3. **Crie um evento (admin)**
   - Acesse `/admin`
   - Clique em "Criar Evento"
   - Preencha: nome, data, local, descrição
   - Clique em "Salvar"

4. **Monte um pacote**
   - Acesse `/eventos`
   - Clique no evento criado
   - Configure o pacote (itens, quantidade)
   - Clique em "Continuar"

5. **Vá ao checkout**
   - Revise os dados
   - Clique em "Finalizar Reserva"
   - Aceite os termos
   - Clique em "Confirmar"

6. **Verifique o e-mail**
   - Acesse Mailtrap
   - Verifique se recebeu e-mail de confirmação

7. **Verifique o banco**
   - Conecte ao PostgreSQL
   - Verifique status da reserva: `SELECT * FROM reservas WHERE id = 'SEU_ID';`
   - Status deve ser: `aguardando_pagamento`

---

## 7. Teste de Webhook (Sem Pagamento Real)

Como estamos usando `PAYMENT_GATEWAY=mock`, o webhook não é acionado automaticamente. Para testar manualmente:

> **⚠️ Este valor é apenas para testes locais. Em produção, use `PAYMENT_GATEWAY=mercadopago` com o Access Token real.**

```bash
curl -X POST https://apicomitivas.permupay.com.br/api/pagamentos/webhook/mercadopago \
  -H "Content-Type: application/json" \
  -d '{
    "id": 123456789,
    "status": "approved",
    "external_reference": "RESERVA_ID_AQUI"
  }'
```

**Resultado esperado:**
- Status HTTP 200
- Reserva muda para `cliente_confirmado`
- E-mail de confirmação final é disparado

---

## 8. Teste de Avaliações

### 8.1 Criar Avaliação (Cliente)

1. Faça login como cliente
2. Acesse `/minhas-reservas`
3. Clique em "Deixar Avaliação"
4. Preencha: nota (1-5), comentário
5. Clique em "Enviar"

### 8.2 Aprovar Avaliação (Admin)

1. Faça login como admin
2. Acesse `/admin/moderacao`
3. Clique em "Aprovar" na avaliação

### 8.3 Verificar no Público

1. Acesse `https://comitivas.permupay.com.br/avaliacoes`
2. A avaliação deve aparecer no mural

---

## 9. Checklist de Teste

- [ ] Banco PostgreSQL conectado
- [ ] Migrations executadas automaticamente
- [ ] Cadastro de usuário funcionando
- [ ] Login funcionando
- [ ] Criação de evento (admin) funcionando
- [ ] Montagem de pacote funcionando
- [ ] Checkout funcionando
- [ ] E-mail recebido no Mailtrap
- [ ] Status da reserva em `aguardando_pagamento`
- [ ] Webhook testado manualmente
- [ ] Avaliação criada e aprovada aparece no público
- [ ] Home exibe prova social corretamente
- [ ] Página de História carrega eventos

---

## 10. Após Testes: Revogação de Credenciais

**IMPORTANTE:** Após terminar os testes, revogue as credenciais:

```bash
# 1. Revogue credenciais PostgreSQL
# (Contate o provedor ou use painel de controle)

# 2. Gere novo JWT_SECRET
openssl rand -base64 32

# 3. NÃO FAÇA COMMIT do .env.local
# (Já está em .gitignore)

# 4. Delete .env.local localmente
rm .env.local
```

---

## 11. Próximos Passos para Produção

Quando estiver pronto para produção:

1. **Domínio:** Registre `comitivas.com.br` (sem permupay)
2. **Banco de dados:** Use um banco de produção (maior, com backups)
3. **JWT_SECRET:** Gere um novo
4. **SMTP:** Use um serviço de produção (SendGrid, AWS SES)
5. **Pagamento:** Mude `PAYMENT_GATEWAY=mercadopago` com credenciais reais
6. **SSL/TLS:** Configure certificados (Let's Encrypt)

---

## 12. Suporte e Troubleshooting

### Erro: "ECONNREFUSED" ao conectar PostgreSQL

**Solução:**
1. Verifique se DATABASE_URL está correto
2. Verifique se firewall permite conexão
3. Teste: `psql DATABASE_URL`

### Erro: "Invalid JWT secret"

**Solução:**
1. Regenere com `openssl rand -base64 32`
2. Cole em JWT_SECRET

### Erro: "SMTP connection refused"

**Solução:**
1. Verifique SMTP_USER e SMTP_PASS no Mailtrap
2. Teste: `telnet smtp.mailtrap.io 587`

---

**Arquivo de configuração:** `.env.local`  
**Repositório:** https://github.com/vml-arquivos/comitivas  
**Status:** Pronto para teste
