# Configuração dos Domínios Oficiais no Cloudflare Free

**Data:** 24 de julho de 2026  
**Domínios:** excursaodascomitivas.com.br (site) e api.excursaodascomitivas.com.br (API)  
**Status:** Pronto para configuração

---

## O que você já fez (correto!)

✅ Você já redirecionou os nameservers do seu registrador para o Cloudflare.  
✅ O Cloudflare já está gerenciando o domínio `excursaodascomitivas.com.br`.

---

## O que você precisa fazer agora no Cloudflare

### Passo 1: Verificar os registros DNS atuais

No painel do Cloudflare, você verá algo assim (como no seu print):

| Nome | Tipo | Conteúdo | Status |
|------|------|----------|--------|
| `api.excursaodascomitivas.com.br` | A | `167.71.23.46` | Com proxy |
| `excursaodascomitivas.com.br` | A | `167.71.23.46` | Com proxy |

**O que significa:**
- **Tipo A:** Aponta o domínio para um endereço IP (seu servidor no Coolify).
- **Com proxy:** O Cloudflare fica entre o visitante e seu servidor (recomendado para segurança e cache).

---

### Passo 2: Atualizar o IP do servidor

Se o IP do seu servidor no Coolify mudou, você precisa atualizar:

1. Clique em **Editar** no registro `api.excursaodascomitivas.com.br`.
2. Mude o **Conteúdo** para o IP correto do seu servidor Coolify.
3. Clique em **Salvar**.
4. Repita para o registro `excursaodascomitivas.com.br`.

**Como encontrar o IP correto do Coolify:**
- Acesse seu painel Coolify.
- Vá até a aplicação `comitivas`.
- Procure por **Server IP** ou **IP Address** nas configurações.

---

### Passo 3: Configurar o certificado SSL/TLS (já vem automático)

O Cloudflare Free já fornece SSL/TLS automático. Você não precisa fazer nada!

**Para verificar:**
1. No painel Cloudflare, vá em **SSL/TLS**.
2. Confirme que o modo está em **Flexible** ou **Full**.
3. Pronto! Seu site terá `https://` automático.

---

### Passo 4: Configurar redirecionamento de `www` (opcional, mas recomendado)

Se quiser que `www.excursaodascomitivas.com.br` também funcione:

1. Clique em **Adicionar registro**.
2. Preencha assim:
   - **Nome:** `www`
   - **Tipo:** `CNAME`
   - **Conteúdo:** `excursaodascomitivas.com.br`
   - **TTL:** `Auto`
3. Clique em **Salvar**.

---

### Passo 5: Configurar email (se necessário)

Se você quer receber e-mails em `contato@excursaodascomitivas.com.br`, adicione um registro MX:

1. Clique em **Adicionar registro**.
2. Preencha assim:
   - **Nome:** `@` (deixe vazio ou coloque o domínio raiz)
   - **Tipo:** `MX`
   - **Conteúdo:** `mail.seu-provedor-de-email.com` (depende do seu provedor)
   - **Prioridade:** `10`
3. Clique em **Salvar**.

**Nota:** Você só precisa fazer isso se tiver um serviço de e-mail contratado (como Google Workspace, Mailtrap, etc.).

---

## Configuração no Coolify

### Atualizar as variáveis de ambiente

No seu painel Coolify, atualize as variáveis para os domínios oficiais:

```env
NODE_ENV=production
WEB_URL=https://excursaodascomitivas.com.br
API_URL=https://api.excursaodascomitivas.com.br
```

**Como fazer:**
1. Acesse o painel Coolify.
2. Vá até a aplicação `comitivas`.
3. Clique em **Settings** > **Environment Variables**.
4. Atualize `WEB_URL` e `API_URL`.
5. Clique em **Save**.
6. Clique em **Redeploy** para aplicar as mudanças.

---

## Migrations no Coolify: Você precisa fazer algo?

### ✅ NÃO, você NÃO precisa executar migrations manualmente via SSH!

**Por quê?**

O Coolify (e o Docker) já executa as migrations automaticamente quando você faz o deploy. Aqui está o que acontece:

1. Você clica em **Redeploy** no Coolify.
2. O Coolify puxa o código mais recente do GitHub (`main`).
3. O Docker constrói a imagem (build).
4. O container inicia.
5. **Automaticamente**, o arquivo `server/index.ts` executa as migrations do Drizzle.
6. O servidor fica online com o banco de dados atualizado.

**Você pode verificar que funcionou:**
1. No painel Coolify, vá em **Logs**.
2. Procure por mensagens como:
   - `[DB] Conectado ao PostgreSQL`
   - `[DB] Schema sincronizado`
   - `[DB] Migrations aplicadas`

Se você vir essas mensagens, as migrations foram executadas com sucesso!

---

### ⚠️ Quando você PRECISARIA fazer manualmente (casos raros):

Se o deploy falhar e o container não iniciar, aí sim você precisaria conectar via SSH e executar:

```bash
# Conectar ao container
docker exec -it comitivas-app bash

# Executar migrations manualmente
npm run migrate
```

**Mas isso é raro!** Na maioria dos casos, o Coolify cuida de tudo automaticamente.

---

## Checklist final

- [ ] Domínio `excursaodascomitivas.com.br` apontando para o IP correto no Cloudflare.
- [ ] Domínio `api.excursaodascomitivas.com.br` apontando para o IP correto no Cloudflare.
- [ ] SSL/TLS ativado no Cloudflare (deve estar automático).
- [ ] Variáveis `WEB_URL` e `API_URL` atualizadas no Coolify.
- [ ] Redeploy executado no Coolify.
- [ ] Logs verificados para confirmar que as migrations rodaram.
- [ ] Teste: Acesse `https://excursaodascomitivas.com.br` e confirme que a landing page carrega.

---

## Testando após o deploy

Abra seu navegador e teste:

**Site público:**
```
https://excursaodascomitivas.com.br
```

**API (health check):**
```
https://api.excursaodascomitivas.com.br/api/health
```

Deve retornar algo assim:
```json
{"status":"ok","timestamp":"2026-07-24T23:38:23.584Z"}
```

---

## Dúvidas comuns

**P: Preciso esperar quanto tempo para o Cloudflare propagar?**  
R: Geralmente 5 a 30 minutos. Se não funcionar em 1 hora, verifique se o IP está correto.

**P: Por que o site está lento?**  
R: Pode ser o cache do Cloudflare. Vá em **Caching** > **Purge Cache** > **Purge Everything**.

**P: Posso usar `www.excursaodascomitivas.com.br`?**  
R: Sim, adicione um registro CNAME (veja Passo 4 acima).

**P: E se eu quiser mudar o IP do servidor depois?**  
R: Volte ao Cloudflare e edite os registros A. Pronto!

---

**Você está pronto! Qualquer dúvida, é só chamar.** 🚀
