# Relatório técnico de execução — Excursão das Comitivas 2026

**Autor:** Manus AI  
**Repositório:** `vml-arquivos/comitivas`  
**Data:** 22 de agosto de 2026

## Resultado executivo

A tarefa descrita no conteúdo colado foi executada diretamente no repositório selecionado, preservando as migrations históricas `0000`–`0006` e os documentos-fonte originais. A implementação evolui o sistema para uma jornada completa de venda com contrato oficial 2026, validação eletrônica por OTP, cobrança produtiva exclusiva pelo Banco Cora, trilha de evidências, recuperação de senha, administração de descontos, galeria acessível, vídeos sob demanda e metadados SEO.

O sistema voltou a compilar e a suíte existente foi alinhada aos requisitos oficiais. A validação executável passou em **tipagem do servidor, build integral, build do frontend, 23 testes unitários e `git diff --check`**. A validação estrutural que depende de PostgreSQL não pôde ser executada porque o ambiente desta sessão não fornece `DATABASE_URL`; isso foi tratado como uma pendência de operação, não como uma simulação de sucesso.

## Entregas implementadas

| Área | Entrega | Arquivos principais |
|---|---|---|
| Banco de dados | Migration nova `0007_evolucao_comitivas.sql` com contratos versionados, regras, OTP, reset de senha, idempotência, parcelas, webhooks, descontos, vídeos e metadados de fotos | `drizzle/0007_evolucao_comitivas.sql`, `server/db/schema.ts` |
| Pagamentos | Provedor Banco Cora com mTLS, Client Credentials, cache de token, retry controlado de 401, Pix, boleto, boleto com Pix, carnê, consulta, cancelamento e `Idempotency-Key` | `server/services/coraPaymentProvider.ts`, `server/services/paymentGatewayAdapter.ts`, `server/routes/pagamentos.ts` |
| Segurança financeira | Total autoritativo vindo da reserva, bloqueio de cartão nas rotas produtivas, deduplicação de webhook, consulta mTLS antes de confirmar `PAID`, reserva de vaga com lock transacional e registro de idempotência | `server/routes/pagamentos.ts`, `server/services/paymentGatewayAdapter.ts` |
| Contratos | Templates oficiais 2026 com dados condicionais de hospedagem, transporte somente quando contratado, serviços, valores, descontos, vencimentos, regras de convivência e hash SHA-256 do snapshot/PDF | `server/services/contratoService.ts`, `server/routes/contratos.ts` |
| Validação eletrônica | OTP por e-mail/WhatsApp, CSPRNG, hash HMAC, expiração, cooldown, 5 tentativas, uso único, aceite separado do contrato e das regras, navegador/SO/IP/timezone e geolocalização opcional | `server/services/otpService.ts`, `server/services/notificationProvider.ts` |
| Recuperação de senha | Token aleatório de 32 bytes, somente hash persistido, expiração de 30 minutos, uso único e resposta neutra contra enumeração de contas | `server/routes/auth.ts`, `apps/web/src/pages/Login.tsx`, `apps/web/src/pages/PasswordReset.tsx` |
| Reserva e preço | Validação server-side de lote/evento/pacote/adicionais, cupom compatível com evento, limite de uso dentro de transação e total calculado pelo backend | `server/services/pacoteService.ts` |
| Administração | Gateway Cora-only, CRUD de fotos/vídeos, desconto com motivo e auditoria, e geração de contrato que agora aguarda validação do cliente | `server/routes/admin.ts`, `apps/web/src/pages/admin/Configuracoes.tsx` |
| Experiência pública | Página oficial de regras, link de navegação, galeria com `alt_text`, canonical `excursaodascomitivas.com.br` e checkout responsivo com iframe somente após ação do cliente | `apps/web/src/pages/publico/Regras.tsx`, `apps/web/src/pages/publico/Galeria.tsx`, `apps/web/src/pages/publico/Home.tsx`, `apps/web/src/pages/cliente/Checkout.tsx` |

## Regras de segurança aplicadas

O código produtivo não possui seleção de Mercado Pago ou Asaas. `PAYMENT_GATEWAY=mock` é aceito somente fora de produção, como apoio a testes locais, e não representa uma operação financeira real. Em produção, o adaptador exige `PAYMENT_GATEWAY=cora`, `CORA_CLIENT_ID`, certificado mTLS, private key e webhook público HTTPS.

O frontend nunca recebe certificado, chave privada, access token ou credencial de provedor. O webhook Cora usa o evento apenas como gatilho e consulta a invoice diretamente via mTLS antes de efetivar uma confirmação. O lock de reserva impede redução de vagas abaixo de zero e a confirmação é idempotente para eventos repetidos.

A geolocalização é opcional e só é enviada quando o cliente dá consentimento. Quando negada ou indisponível, a contratação continua com as demais evidências. Códigos OTP e tokens de recuperação não são persistidos em claro.

## Fidelidade documental

O contrato foi refeito a partir dos dois DOCX oficiais anexados e da arte de Regras de Convivência. A versão persistida é identificada como `2026.1-oficial`; as regras são identificadas como `2026.1`. O PDF registra o hash do snapshot individual, o hash do PDF e o protocolo da validação eletrônica.

A hospedagem varia exclusivamente pela modalidade registrada na reserva: **Camping**, **Quarto com ventilador compartilhado** ou **Quarto com climatizador compartilhado**. O transporte rodoviário interestadual só aparece quando a composição contratada contém item de transporte; sem esse item, o documento declara que o serviço não está incluído e mantém somente o translado interno chácara–Parque do Peão.

## Validações executadas

| Verificação | Resultado | Observação |
|---|---:|---|
| `npm run typecheck:server` | PASS | Tipagem do backend aprovada |
| `npm run build` | PASS | Server, seed e frontend compilados |
| `npm test -- --run` | PASS | 4 arquivos, 23 testes |
| `git diff --check` | PASS | Nenhum whitespace inválido no diff |
| Busca de Mercado Pago/Asaas em runtime | PASS | Nenhuma referência em `server`, `apps/web` ou `.env.example`; referências legadas aparecem somente no teste que comprova o bloqueio |
| `npm run db:verify-contract-fields` | PENDENTE DE AMBIENTE | O script exige `DATABASE_URL`; não há banco/credencial disponível nesta sessão |
| Teste live Cora | NÃO EXECUTADO | Não há Client ID, certificado e private key Cora fornecidos no ambiente |

## Configuração operacional para Stage e produção

A implantação deve configurar os segredos fora do repositório, conforme `.env.example`. Para Stage, usar credenciais e certificados Stage da Cora, `CORA_ENV=stage` e `CORA_WEBHOOK_PUBLIC_URL` HTTPS. Após homologação, trocar somente o conjunto de credenciais e URLs para produção, nunca reutilizar certificado Stage.

Também são necessários SMTP para OTP e recuperação de senha. O WhatsApp fica pronto para a WhatsApp Business Platform/BSP com template aprovado, token, `phone number ID` e nome do template. Enquanto um canal não estiver configurado, o sistema retorna indisponibilidade em vez de afirmar que enviou uma mensagem.

Antes de promover, executar a migration 0007 contra o PostgreSQL real e, em seguida, executar `npm run db:verify-contract-fields` com `DATABASE_URL` válido. O build não executa migrations automaticamente.

## Referências

[1]: https://developers.cora.com.br/ "Banco Cora — documentação de desenvolvedores"
[2]: https://developers.cora.com.br/docs/client-credentials-int-direta "Banco Cora — Client Credentials / Integração Direta"
[3]: https://developers.cora.com.br/reference/emiss%C3%A3o-de-boleto-registrado "Banco Cora — emissão de boleto registrado"
[4]: https://developers.cora.com.br/reference/qr-code-pix "Banco Cora — QR Code Pix"
[5]: https://developers.cora.com.br/reference/emiss%C3%A3o-de-boleto-parcelado "Banco Cora — boleto parcelado / carnê"
[6]: https://developers.cora.com.br/reference/cria%C3%A7%C3%A3o-de-endpoints "Banco Cora — criação de endpoints e webhooks"

As fontes documentais de negócio são os arquivos anexados `TRANSPORTEEXCMTV2026-papeltimbrado.docx`, `ContratoHOSPEDAGEMEXCMTV2026-papeltimbrado.docx` e `PHOTO-2026-08-10-12-36-43.jpg`. As anotações técnicas consolidadas das fontes Cora estão em `docs/cora-api-notes.md`.
