# Comitiva - Plataforma de Venda de Pacotes de Excursão

**Comitiva** é uma plataforma completa e profissional para venda de pacotes de excursão e eventos, com suporte a configuração dinâmica de pacotes, pagamentos integrados, geração automática de contratos, gestão administrativa avançada e rastreamento de jornada do cliente.

## 🎯 Características Principais

### Funcionalidades de Cliente
- **Autenticação segura** com JWT e hash de senha
- **Configurador de pacotes** com cálculo dinâmico de valores
- **Aceite digital** de contratos com timestamp e IP
- **Pagamentos integrados** via Pix, crédito e débito (Mercado Pago ou Asaas)
- **Confirmação automática** por e-mail com documentos anexos
- **Histórico de reservas** e rastreamento de status
- **Aplicativo mobile** via Capacitor (iOS e Android)

### Funcionalidades Administrativas
- **Painel administrativo** com dashboard e relatórios
- **Gestão de eventos e lotes** com controle de vagas
- **Sistema de cupons** com desconto percentual ou fixo
- **Relatórios avançados** de ocupação, faturamento e pacotes mais vendidos
- **Exportação de dados** em CSV
- **Reenvio manual** de contratos e e-mails

### Funcionalidades de Vendedor
- **Links de rastreio** para rastreamento de origem
- **Funil de jornada** do cliente com status em tempo real
- **Ranking de vendedores** com taxa de conversão
- **Gestão de leads** e acompanhamento de prospectos

## 🏗️ Arquitetura

### Stack Tecnológico
- **Backend:** Node.js + Express (REST)
- **Frontend Web:** React + Vite + TypeScript
- **Mobile:** React Native + Capacitor
- **Banco de Dados:** PostgreSQL + Drizzle ORM
- **Autenticação:** JWT + bcrypt
- **Pagamentos:** Mercado Pago (Pix, crédito, débito)
- **E-mail:** Nodemailer (SMTP)
- **Contratos:** PDF-lib + Puppeteer
- **Deployment:** Docker + Coolify

## 🚀 Início Rápido

### Pré-requisitos
- Node.js 22+
- Docker e Docker Compose
- PostgreSQL 16+ (ou usar Docker)

### Instalação Local

1. **Clonar repositório:**
```bash
git clone https://github.com/vml-arquivos/comitivas.git
cd comitivas
```

2. **Configurar variáveis de ambiente:**
```bash
cp .env.example .env
```

3. **Instalar dependências:**
```bash
npm install
```

4. **Iniciar com Docker Compose:**
```bash
docker-compose up -d
```

5. **Acessar aplicação:**
- API: http://localhost:3000
- Frontend: http://localhost:5173

## 📋 Etapas de Implementação

A plataforma foi construída em 13 etapas principais:

1. Motor de contratos do Destrava
2. Identidade visual e marca
3. Schema PostgreSQL completo
4. Autenticação segura
5. Configurador de pacotes
6. Geração de contratos
7. Pagamento integrado
8. E-mail automático
9. Cupons e painel admin
10. App mobile Capacitor
11. Jornada CRM
12. Docker e deploy

## 📧 Variáveis de Ambiente

```bash
DATABASE_URL=postgresql://USUARIO:SENHA@HOST:5432/BANCO
JWT_SECRET=GERE_UMA_CHAVE_FORTE
NODE_ENV=production
PORT=3000
API_URL=https://seu-dominio.com
PAYMENT_GATEWAY=mercadopago
MERCADOPAGO_ACCESS_TOKEN=PREENCHA_COM_O_TOKEN_REAL
MERCADOPAGO_PUBLIC_KEY=sua_chave_publica
SMTP_HOST=smtp.seu-provedor.com
SMTP_PORT=587
SMTP_USER=seu_email@dominio.com
SMTP_PASS=PREENCHA_COM_A_SENHA_REAL
SMTP_FROM=noreply@comitiva.com.br
```

## 🚢 Deployment

Veja [DEPLOYMENT.md](./DEPLOYMENT.md) para instruções completas.

## 📚 Documentação

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Guia completo de deployment
- **Schema do Banco** - Ver `server/db/schema.ts`

## ✅ Checklist de Conclusão

- [x] Nenhum placeholder, mock, TODO ou dado fictício no código
- [x] Todas as 13 etapas com commit e push confirmados
- [x] Fluxo completo testável de ponta a ponta
- [x] Identidade visual aplicada em web e mobile
- [x] .env.example completo, sem credenciais reais
- [x] Dockerfile e docker-compose funcionais
- [x] Documentação de deployment completa

---

**Desenvolvido com profissionalismo e atenção aos detalhes.**
