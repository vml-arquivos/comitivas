# RELATÓRIO — VALIDAÇÃO DOCUMENTAL FLEXÍVEL NO CHECKOUT

Data: 13/09/2026
Base recebida: `comitivas-main (17).zip`
Escopo: flexibilização documental sem liberar indevidamente cobrança/boleto.

## Objetivo implementado

O cliente pode concluir a contratação após preencher os dados essenciais e confirmar o e-mail. O documento de identificação pode ser enviado pela câmera do celular ou por arquivo. A conferência documental continua em segundo plano e, por padrão, não bloqueia a leitura nem a assinatura eletrônica do contrato.

A validação por código já existente foi preservada. O cliente pode receber o OTP por e-mail ou WhatsApp; quando usa WhatsApp, o próprio código confirma a posse do celular cadastrado naquele ato.

## Separação de responsabilidades preservada

- Dados essenciais: continuam obrigatórios para o contrato.
- E-mail confirmado: continua obrigatório para o contrato/OTP.
- Documento: upload e OCR continuam disponíveis; análise é assíncrona.
- Divergência explícita de CPF: continua sendo inconsistência forte/rejeição automática.
- OCR incerto, foto não detectada, nome/data com leitura imperfeita ou baixa confiança: seguem para `analise_manual`.
- Aprovação administrativa do cadastro: não bloqueia a assinatura do contrato por padrão.
- Cobrança/boleto: continuam bloqueados até aprovação administrativa completa e aprovação administrativa do contrato. Nenhum gate financeiro foi removido.

## Configurações

Novos gates explícitos:

```env
DOCUMENT_IDENTITY_REQUIRED_FOR_CONTRACT=false
DOCUMENT_VALIDATION_BLOCK_CONTRACT=false
CONTRACT_REQUIRES_CADASTRO_APPROVAL=false
DOCUMENT_VALIDATION_MODE=assistido
```

`DOCUMENT_VALIDATION_BLOCK_CONTRACT=true` reativa o modo estrito em ambiente que realmente necessite esperar documento aprovado antes da assinatura.

`CONTRACT_REQUIRES_CADASTRO_APPROVAL=true` reativa o modo estrito que exige aprovação administrativa antes da assinatura.

As regras financeiras permanecem no backend e não dependem dessas duas flexibilizações.

## Arquivos de código alterados

- `.env.example`
- `server/routes/cliente.ts`
- `server/routes/contratos.ts`
- `server/services/identityDocumentService.ts`
- `apps/web/src/pages/cliente/Checkout.tsx`
- `tests/identityDocumentService.spec.ts`
- `tests/checkoutCupomContrato.spec.ts`
- `tests/documentalFlexivelCheckout.spec.ts` (novo)

## Validações executadas neste ambiente

- conferência de escopo/diff contra a base recebida;
- 17 verificações estáticas de regressão/gates;
- transpile sintático TypeScript/TSX dos 7 arquivos TS/TSX alterados: OK;
- `git diff --no-index --check`: sem erros de whitespace;
- confirmação de que `server/routes/pagamentos.ts` continua exigindo `cadastroAprovadoComEvidencia(cliente)` e `contrato.aprovado_admin_em`.

## Limitação da validação local

O ambiente desta execução não possui acesso DNS ao `registry.npmjs.org`. Por isso `npm ci` não conseguiu obter as dependências e o build/teste completo do repositório não pôde ser executado aqui. O pacote inclui o código completo e os testes atualizados; antes do push/deploy, execute em uma máquina/CI com acesso ao registry:

```bash
npm ci
npm run typecheck:server
npm test -- --run
npm run build
```

Para validação operacional completa, use também o `VALIDAR_ANTES_DO_DEPLOY.sh` já existente no repositório, em homologação com banco/serviços configurados.
