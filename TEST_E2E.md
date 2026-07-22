# Teste End-to-End (E2E) - Comitiva

## Objetivo
Validar o fluxo completo da plataforma desde o cadastro até a confirmação de pagamento.

## Pré-requisitos
- Node.js 22+
- PostgreSQL 16+ rodando
- Variáveis de ambiente configuradas em `.env`

## Passos para Executar

### 1. Iniciar o Backend
```bash
npm run dev:server
```

Verificar logs:
- `[SERVER] Comitiva rodando em http://localhost:3000`
- `[SERVER] Follow-up scheduler ativo (intervalo: 5 minutos)`
- Todas as rotas devem estar registradas

### 2. Iniciar o Frontend Web
```bash
npm run dev:web
```

Acessar: `http://localhost:5173`

### 3. Fluxo de Teste Completo

#### Etapa 1: Cadastro e Login
- Clicar em "Cadastrar"
- Preencher: Nome, E-mail, CPF, Telefone, Senha
- Submeter formulário
- Verificar se foi redirecionado para a página de eventos

**Resultado esperado:** Usuário cadastrado e autenticado com JWT

#### Etapa 2: Listagem de Eventos
- Página inicial deve mostrar pelo menos 1 evento
- Evento deve exibir: nome, descrição, data, local, valor base
- Botão "Montar Pacote" deve estar visível

**Resultado esperado:** Eventos carregados da API ou fallback mockado

#### Etapa 3: Configurador de Pacote
- Clicar em "Montar Pacote"
- Página deve exibir itens adicionais (Translado, Camarote, Hospedagem)
- Selecionar alguns itens
- Verificar se o valor total é recalculado em tempo real

**Resultado esperado:** Valor recalculado corretamente (valor base + adicionais)

#### Etapa 4: Checkout
- Clicar em "Continuar para Pagamento"
- Página de checkout deve exibir:
  - Contrato em texto (resumido)
  - Checkbox de aceite
  - Opções de pagamento (PIX, Crédito, Débito)
  - Valor total
- Marcar checkbox de aceite
- Selecionar método de pagamento
- Clicar em "Finalizar Reserva"

**Resultado esperado:** Redirecionado para página de confirmação

#### Etapa 5: Confirmação de Pagamento
- Página deve exibir status do pagamento
- Se PIX: mostrar QR Code (simulado)
- Botões: "Baixar Contrato PDF", "Ver Minhas Reservas"

**Resultado esperado:** Reserva criada e status atualizado

#### Etapa 6: Minhas Reservas
- Clicar em "Ver Minhas Reservas"
- Listar todas as reservas do usuário
- Cada reserva deve mostrar: ID, data, status, valor
- Botões de ação: Pagar, Contrato, Continuar

**Resultado esperado:** Reserva aparece na lista

#### Etapa 7: Painel Admin
- Fazer logout
- Fazer login com usuário admin (se existir)
- Clicar em "Painel Admin"
- Verificar:
  - Dashboard com métricas
  - Listagem de reservas
  - Jornada CRM com Kanban
  - Geração de link de vendedor

**Resultado esperado:** Painel carrega com dados

## Validações de Segurança

- [ ] Senhas não aparecem em logs ou console
- [ ] JWT é armazenado apenas em localStorage
- [ ] Rotas admin exigem autenticação e role correto
- [ ] Nenhuma credencial real commitada no repositório

## Validações de Qualidade de Código

- [ ] Nenhum placeholder, TODO, FIXME, XXX, HACK
- [ ] Nenhum dado fictício hardcoded (apenas fallbacks para teste)
- [ ] Nenhuma dependência tRPC ou Redis
- [ ] Todas as rotas registradas em server/index.ts
- [ ] Frontend consome dados reais da API

## Resultado Final

Se todos os passos passarem, o fluxo E2E está validado e a aplicação está pronta para produção.

