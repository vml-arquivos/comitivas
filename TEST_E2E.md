# Testes End-to-End — Excursão das Comitivas

## Objetivo

Este roteiro valida o fluxo real de contratação da plataforma, desde a criação administrativa de uma excursão até a geração e o download de contratos PDF. O cenário automatizado utiliza três pacotes de hospedagem e registra condições de pagamento distintas, garantindo que a modalidade, os dados do cliente e os valores persistidos estejam coerentes em cada contrato.

| Etapa | Validação executada | Resultado esperado |
| --- | --- | --- |
| Administração | Criação de evento, lote e três pacotes publicados | Camping, quarto com ventilador e quarto com ar-condicionado aparecem na API pública |
| Cadastro | Cadastro de cliente com dados contratuais completos | Cliente autenticado com CPF, RG, nascimento, endereço e demais campos persistidos |
| Reserva | Criação de uma reserva por modalidade | A reserva mantém o `pacote_id` e retorna a modalidade selecionada |
| Aceite | Aceite digital com forma de pagamento e parcelas | Valor, desconto, parcelas e IP são registrados antes do PDF |
| Contrato | Visualização e download de PDF | Documento exibe dados da contratada, cliente, itens, condição e checkbox correto |
| Pagamento de teste | Criação de intenção com `PAYMENT_GATEWAY=mock` | Registro pendente sem QR Code ou link de cobrança artificial |

## Pré-requisitos

O teste exige Node.js 22 ou superior, PostgreSQL 16 ou superior e uma instância da aplicação disponível. As migrations são executadas automaticamente no bootstrap; ainda assim, a aplicação precisa iniciar com uma `DATABASE_URL` válida.

> O modo `PAYMENT_GATEWAY=mock` é adequado para validação técnica. Ele registra a intenção de pagamento no banco, mas não envia cobranças nem gera códigos ou links fictícios.
>
> **Este valor é exclusivamente para testes locais isolados. Em produção, o único gateway permitido é `PAYMENT_GATEWAY=cora`, com credenciais e certificados mTLS oficiais configurados no Coolify; nunca execute este roteiro local contra a produção.**

## Execução automatizada

Compile a aplicação antes de iniciar o servidor de teste:

```bash
npm run build
```

Em outro terminal, inicialize o servidor com uma base isolada e o gateway de teste:

```bash
DATABASE_URL="postgresql://USUARIO:SENHA@HOST:5432/BANCO" \
PAYMENT_GATEWAY="mock" \
STORAGE_PATH="/tmp/comitiva-e2e-uploads" \
PORT="3001" \
WEB_URL="http://localhost:3001" \
API_URL="http://localhost:3001" \
node dist/index.js
```

Com a API disponível, execute o cenário:

```bash
E2E_BASE_URL="http://127.0.0.1:3001" \
E2E_OUTPUT_DIR="/tmp/comitiva-e2e-artifacts" \
npm run test:e2e
```

O script `scripts/e2e-fluxo-completo.mts` cria dados isolados e produz três PDFs temporários no diretório configurado.

| Modalidade | Forma de pagamento | Parcelas | Valor de validação | Resultado contratual esperado |
| --- | --- | ---: | ---: | --- |
| Camping | PIX | 1 | R$ 1.000,00 | Total de R$ 950,00 e desconto PIX de R$ 50,00 |
| Quarto com ventilador | Boleto | 3 | R$ 1.400,00 | Total de R$ 1.400,00 e três parcelas registradas |
| Quarto com ar-condicionado | Cartão de crédito | 10 | R$ 1.800,00 | Total de R$ 1.800,00 e dez parcelas registradas |

## Verificações manuais recomendadas

Após a execução automatizada, abra uma reserva criada no checkout e confirme que a modalidade e todos os dados contratuais aparecem antes do aceite. Para reservas que já possuem contrato emitido, a condição de pagamento deve permanecer bloqueada, o valor contratado deve ser reapresentado sem reaplicar desconto e o botão deve informar que o contrato já foi emitido.

Abra os três PDFs gerados e confirme que cada um contém o cabeçalho da **Excursão das Comitivas**, a identificação de **HENRIQUE SANTOS CUNHA**, o CNPJ **39.763.571/0001-13**, os dados completos do cliente e exatamente um marcador de hospedagem selecionado.

## Critérios de aprovação

A execução é aprovada quando todos os endpoints retornam sucesso, os três PDFs iniciam com a assinatura de arquivo `%PDF`, cada contrato marca apenas a modalidade correspondente e a base de dados registra `forma_pagamento`, `quantidade_parcelas`, `valor_parcela` e `desconto_pagamento` de acordo com o cenário. Nenhuma etapa deve depender de fallback de dados, QR Code fictício ou cobrança externa enquanto o gateway estiver em modo de teste.
