# PROMPT ARQUITETADO PARA GPT PLUS: REVISÃO E EVOLUÇÃO PREMIUM - EXCURSÃO DAS COMITIVAS

---

## 🎯 OBJETIVO
Atuar como um **Engenheiro de Software Sênior Full Stack e Especialista em UX/Conversion**, analisando o repositório `vml-arquivos/comitivas` para corrigir falhas críticas, elevar o design para um nível "Premium" e implementar uma jornada de compra de alta conversão.

---

## 🛠️ STACK TECNOLÓGICO
- **Backend:** Node.js + Express (REST)
- **Frontend Web:** React + Vite + TypeScript + Tailwind CSS
- **Mobile:** React Native + Capacitor
- **Banco de Dados:** PostgreSQL + Drizzle ORM
- **Deployment:** Docker + Coolify

---

## 📋 REQUISITOS DE NEGÓCIO E TÉCNICOS

### 1. Jornada de Compra de Alta Conversão (Guest Checkout)
- **Navegação Livre:** O cliente deve navegar pelo site, ver os pacotes, modalidades (Camping, Ventilador, Ar) e detalhes SEM precisar de login.
- **Cadastro Tardio:** O pedido de cadastro/login deve ocorrer APENAS no momento final da compra (Checkout).
- **Persistência de Intenção:** Se o cliente selecionar um pacote e for para o cadastro, o sistema deve lembrar o que ele escolheu após o login/cadastro ser concluído.

### 2. Design e Experiência Premium
- **Interface Visual:** Revisar componentes, tipografia e espaçamentos para garantir um visual luxuoso e confiável.
- **Dados Premium:** Garantir que todos os dados exibidos (datas, valores, descrições) estejam formatados de forma impecável.
- **Feedback Visual:** Implementar estados de carregamento (skeletons), mensagens de erro amigáveis e confirmações de sucesso elegantes.

### 3. Captação de Leads e CRM (Esteira de Vendas)
- **Captura de Leads:** Implementar um mecanismo de captura de lead (Nome/WhatsApp) antes mesmo da compra. Ex: "Receber roteiro completo por WhatsApp" ou "Baixar Aplicativo".
- **Integração CRM:** Garantir que qualquer lead capturado ou reserva abandonada vá automaticamente para a "Jornada do Cliente" (CRM) na área administrativa para acompanhamento.
- **Call to Action (CTA):** Inserir botões estratégicos para download do App Mobile e contato direto com consultores.

### 4. Revisão Administrativa e do Cliente
- **Área do Cliente:** Melhorar a visualização de reservas, status de pagamento e acesso ao contrato/voucher.
- **Área Admin:** Refinar o Dashboard, gestão de lotes e a visualização da esteira de vendas (Kanban/CRM).

---

## 🚨 ANÁLISE DE ERROS CRÍTICOS
- Analisar `server/routes/`, `server/services/` e `apps/web/src/pages/` em busca de falhas de lógica.
- Corrigir qualquer erro de cadastro que impeça a conversão.
- Validar a segurança dos endpoints e a consistência das migrations.

---

## 📥 INSTRUÇÕES DE EXECUÇÃO PARA O GPT
1. **Analise o Repositório:** Leia a estrutura de pastas e arquivos principais.
2. **Identifique Lacunas:** Liste o que falta para atingir os requisitos acima.
3. **Escreva o Código de Correção:** Gere os arquivos completos (não apenas snippets) para substituir as versões atuais.
4. **Prepare para Produção:** Garanta que o código esteja pronto para `git push` e redeploy no Coolify.

---

## 📄 ARQUIVOS CHAVE PARA ANÁLISE
- `server/db/schema.ts` (Estrutura de dados)
- `apps/web/src/pages/publico/Home.tsx` (Landing Page)
- `apps/web/src/pages/cliente/Checkout.tsx` (Fluxo de compra)
- `server/routes/auth.ts` (Lógica de cadastro)
- `server/services/jornadaService.ts` (CRM/Leads)

---

**ENTREGA ESPERADA:** O código completo, testado e pronto para substituição, com um guia passo a passo das alterações realizadas.
