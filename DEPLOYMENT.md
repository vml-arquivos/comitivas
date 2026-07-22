# Guia de Deployment - Comitiva

## Pré-requisitos

- Docker e Docker Compose instalados
- PostgreSQL 16+ (se não usar Docker)
- Node.js 22+ (se não usar Docker)
- Credenciais de gateway de pagamento (Mercado Pago ou Asaas)
- Servidor SMTP configurado

## Variáveis de Ambiente

Crie um arquivo `.env` baseado em `.env.example` com as seguintes variáveis:

### Banco de Dados
```
DATABASE_URL=postgresql://user:password@localhost:5432/comitiva
```

### Autenticação
```
JWT_SECRET=sua_chave_secreta_muito_segura_aqui
```

### Servidor
```
NODE_ENV=production
PORT=3000
API_URL=https://seu-dominio.com
WEB_URL=https://seu-dominio.com
```

### Gateway de Pagamento (escolha um)

**Mercado Pago:**
```
PAYMENT_GATEWAY=mercadopago
MERCADOPAGO_ACCESS_TOKEN=seu_token_aqui
MERCADOPAGO_PUBLIC_KEY=sua_chave_publica_aqui
```

**Asaas:**
```
PAYMENT_GATEWAY=asaas
ASAAS_API_KEY=sua_chave_api_aqui
```

### SMTP
```
SMTP_HOST=smtp.seu-provedor.com
SMTP_PORT=587
SMTP_USER=seu_email@dominio.com
SMTP_PASS=sua_senha_app
SMTP_FROM=noreply@comitiva.com.br
```

### Armazenamento
```
STORAGE_TYPE=local
STORAGE_PATH=./uploads
```

## Deployment com Docker Compose (Desenvolvimento)

1. **Clonar o repositório:**
```bash
git clone https://github.com/vml-arquivos/comitivas.git
cd comitivas
```

2. **Configurar variáveis de ambiente:**
```bash
cp .env.example .env
# Editar .env com suas credenciais
nano .env
```

3. **Iniciar os serviços:**
```bash
docker-compose up -d
```

4. **Verificar logs:**
```bash
docker-compose logs -f app
```

5. **Parar os serviços:**
```bash
docker-compose down
```

## Deployment em Produção (Coolify)

### 1. Preparar o Servidor

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker e Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

### 2. Clonar Repositório

```bash
git clone https://github.com/vml-arquivos/comitivas.git /opt/comitiva
cd /opt/comitiva
```

### 3. Configurar Variáveis de Ambiente

```bash
sudo nano .env
# Preencher todas as variáveis necessárias
```

### 4. Configurar Coolify

No painel do Coolify:

1. Criar novo projeto
2. Conectar repositório GitHub (vml-arquivos/comitivas)
3. Configurar variáveis de ambiente
4. Configurar volume para `/uploads`
5. Expor porta 3000
6. Configurar domínio com SSL/TLS

### 5. Deploy

```bash
# Fazer build e deploy
docker-compose -f docker-compose.yml up -d

# Verificar status
docker-compose ps
docker-compose logs app
```

### 6. Backup do Banco de Dados

```bash
# Fazer backup
docker-compose exec postgres pg_dump -U comitiva comitiva > backup-$(date +%Y%m%d).sql

# Restaurar backup
docker-compose exec -T postgres psql -U comitiva comitiva < backup-20240722.sql
```

## Monitoramento

### Logs
```bash
# Ver logs em tempo real
docker-compose logs -f app

# Ver logs de um serviço específico
docker-compose logs postgres
```

### Health Check
```bash
# Verificar saúde da aplicação
curl http://localhost:3000/api/health
```

### Métricas
```bash
# Ver uso de recursos
docker stats
```

## Troubleshooting

### Erro de Conexão com Banco de Dados
```bash
# Verificar se PostgreSQL está rodando
docker-compose ps postgres

# Verificar logs do PostgreSQL
docker-compose logs postgres

# Reiniciar PostgreSQL
docker-compose restart postgres
```

### Erro de SMTP
- Verificar credenciais SMTP
- Verificar se porta SMTP está aberta (geralmente 587 ou 465)
- Testar conexão: `telnet smtp.seu-provedor.com 587`

### Erro de Gateway de Pagamento
- Verificar tokens/chaves de API
- Verificar se URLs de webhook estão corretas
- Verificar logs da aplicação para detalhes

## Atualizações

```bash
# Puxar últimas mudanças
git pull origin main

# Rebuildar imagem
docker-compose build --no-cache

# Reiniciar serviços
docker-compose up -d
```

## Segurança

1. **Sempre use HTTPS em produção**
2. **Mude JWT_SECRET para uma chave forte**
3. **Use variáveis de ambiente para credenciais**
4. **Configure firewall adequadamente**
5. **Faça backup regular do banco de dados**
6. **Monitore logs de segurança**

## Suporte

Para dúvidas ou problemas, abra uma issue no repositório GitHub.
