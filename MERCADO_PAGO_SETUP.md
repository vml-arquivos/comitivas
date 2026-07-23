# Configuração do Mercado Pago - Guia Completo

## 1. Obter Credenciais

### Passo 1: Criar Conta no Mercado Pago
1. Acesse https://www.mercadopago.com.br/developers
2. Faça login ou crie uma conta
3. Vá para "Suas Integrações" > "Credenciais"

### Passo 2: Copiar Credenciais de Teste (Sandbox)
No painel de desenvolvedores, você encontrará:
- **Access Token (Teste):** Comece com `TEST-`
- **Public Key (Teste):** Comece com `TEST-`

### Passo 3: Copiar Credenciais de Produção
Quando estiver pronto para produção:
- **Access Token (Produção):** Comece com `APP_USR-`
- **Public Key (Produção):** Comece com `APP_USR-`

## 2. Configurar Variáveis de Ambiente

### Arquivo `.env` (Desenvolvimento)
```env
PAYMENT_GATEWAY=mercadopago
MERCADOPAGO_ACCESS_TOKEN=TEST-1234567890abcdefghijklmnopqrst
MERCADOPAGO_PUBLIC_KEY=TEST-1234567890abcdefghijklmnopqrst
```

### Arquivo `.env` (Produção)
```env
PAYMENT_GATEWAY=mercadopago
MERCADOPAGO_ACCESS_TOKEN=APP_USR-1234567890abcdefghijklmnopqrst
MERCADOPAGO_PUBLIC_KEY=APP_USR-1234567890abcdefghijklmnopqrst
```

## 3. Fluxo de Pagamento

### Cliente
1. Cliente monta pacote e vai para checkout
2. Escolhe método: Pix, Crédito ou Débito
3. Clica em "Finalizar Reserva"
4. API chama `/api/pagamentos/criar` com dados reais

### Backend
1. `POST /api/pagamentos/criar` recebe dados da reserva
2. Chama Mercado Pago API com credenciais reais
3. Retorna QR Code (Pix) ou link de pagamento (crédito/débito)
4. **Dados são REAIS, não mockados**

### Confirmação
1. Cliente escaneia QR Code ou acessa link de pagamento
2. Mercado Pago processa pagamento
3. Webhook de confirmação atualiza status da reserva
4. E-mail de confirmação é disparado

## 4. Testar em Sandbox

### Cartões de Teste
- **Crédito aprovado:** 4111111111111111 (qualquer data/CVV)
- **Crédito recusado:** 4000000000000002
- **Débito:** 5425233010103403

### Dados de Teste
- **CPF:** 12345678901
- **Validade:** 12/25 (qualquer mês/ano futuro)
- **CVV:** 123 (qualquer 3 dígitos)

## 5. Webhook de Confirmação

### Configurar no Painel Mercado Pago
1. Vá para "Notificações" > "Webhooks"
2. Adicione URL: `https://seu-dominio.com/api/pagamentos/webhook`
3. Selecione eventos: `payment.created`, `payment.updated`

### Endpoint Backend
```
POST /api/pagamentos/webhook
```
Recebe notificações de status de pagamento e atualiza banco de dados.

## 6. Validar Integração

### Teste Completo
1. Criar evento via admin
2. Criar lote via admin
3. Cliente faz login
4. Cliente monta pacote
5. Cliente vai para checkout
6. Cliente escolhe Pix
7. API retorna QR Code **REAL** do Mercado Pago
8. Webhook confirma pagamento
9. Status atualizado para `cliente_confirmado`
10. E-mail enviado com contrato

## 7. Suporte

- **Documentação:** https://www.mercadopago.com.br/developers/pt/docs
- **API Reference:** https://www.mercadopago.com.br/developers/pt/reference
- **Status Page:** https://status.mercadopago.com
