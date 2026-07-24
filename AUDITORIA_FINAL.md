# Auditoria Final — Excursão das Comitivas

**Data da revisão:** 24 de julho de 2026
**Escopo:** contratos digitais, checkout, pagamentos em modo de teste, dependências, autenticação e superfície HTTP.
**Repositório:** `vml-arquivos/comitivas`

## Resumo executivo

A revisão confirmou o funcionamento do fluxo de reserva com dados persistidos, contrato digital e emissão de PDF para as três modalidades de hospedagem. A auditoria também eliminou vulnerabilidades altas conhecidas das dependências de produção, tornou o segredo JWT obrigatório em produção, adicionou cabeçalhos de segurança e proteção contra tentativas excessivas de autenticação, e passou a conferir o status da Asaas diretamente no provedor antes de confirmar uma reserva localmente.

> A validação foi executada em uma base PostgreSQL isolada e com `PAYMENT_GATEWAY=mock`. Esse modo registra a intenção de pagamento, mas não cria cobrança externa, QR Code artificial ou link de pagamento fictício.

| Área | Resultado | Evidência |
| --- | --- | --- |
| Build de backend e frontend | Aprovado | `npm run build` concluído com TypeScript e Vite 8.1.5 |
| Testes unitários | Aprovado | 8 testes aprovados com Vitest 4.1.10 |
| Teste E2E | Aprovado | Três reservas, três contratos PDF e três condições financeiras validadas |
| PDF contratual | Aprovado | PDFs A4 gerados com contratada, cliente e marcador correto de hospedagem |
| Segurança HTTP | Aprovado | Headers Helmet, ausência de `X-Powered-By` e limite de autenticação ativos |
| Auditoria de produção | Aprovado com ressalva contextual | Dependências de produção de alta severidade foram atualizadas; alerta RSC do React Router não se aplica à SPA atual |

## Fluxo E2E validado

O script `scripts/e2e-fluxo-completo.mts` cria evento, lote e pacotes reais através da API administrativa; cadastra um cliente com dados contratuais completos; cria reservas; registra o aceite; emite contratos e cria a intenção de pagamento de teste. Os artefatos PDF são gravados fora do repositório, no diretório temporário configurado.

| Modalidade | Pagamento | Parcelas | Total persistido | Validação do contrato |
| --- | --- | ---: | ---: | --- |
| Camping | PIX | 1 | R$ 950,00 | Desconto de R$ 50,00 e apenas `CAMPING` marcado |
| Quarto com ventilador | Boleto | 3 | R$ 1.400,00 | Parcelamento registrado e apenas a modalidade correspondente marcada |
| Quarto com ar-condicionado | Cartão de crédito | 10 | R$ 1.800,00 | Parcelamento registrado e apenas a modalidade correspondente marcada |

A inspeção por `pdftotext` confirmou, nos três documentos, a identificação da **Excursão das Comitivas**, da contratada **HENRIQUE SANTOS CUNHA**, o CNPJ **39.763.571/0001-13**, o titular da reserva e os marcadores corretos de hospedagem. A tela de checkout também foi revisada para que uma reserva com contrato já emitido reutilize os valores persistidos e não aplique novamente o desconto PIX.

## Proteções implementadas

| Controle | Implementação | Efeito esperado |
| --- | --- | --- |
| Segredo JWT | `JWT_SECRET` obrigatório quando `NODE_ENV=production` | O processo não inicia com uma chave padrão insegura |
| Cabeçalhos HTTP | `helmet` com `X-Content-Type-Options`, `X-Frame-Options`, HSTS e políticas de origem | Reduz vetores de clickjacking, MIME sniffing e exposição de referência |
| Limite de autenticação | `express-rate-limit` em `/api/auth` | Reduz risco de força bruta em login e cadastro |
| Limite de payload | JSON e URL encoded limitados a 1 MB | Reduz abuso por corpos de requisição desproporcionais |
| Webhook Asaas | Confirmação autenticada no provedor antes do update local | O corpo do webhook não é tratado como fonte de verdade |
| Configuração de exemplo | `.env.example` e `.env.teste` usam placeholders explícitos | Evita a reutilização acidental de senhas ou chaves de amostra |

A resposta do endpoint de saúde foi verificada com os seguintes cabeçalhos ativos: `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy` e `Cross-Origin-Resource-Policy`.

## Dependências e auditoria

Foram atualizados `drizzle-orm`, `nodemailer`, `puppeteer-core`, `node-cron`, `react-router-dom`, `vite`, `@vitejs/plugin-react`, `vitest` e `esbuild`. As atualizações foram seguidas por build, testes unitários e execução E2E completos.

O `npm audit` não aponta mais vulnerabilidades altas originadas por Drizzle, Nodemailer, Puppeteer, node-cron, Vite, Vitest ou esbuild. O relatório do npm ainda relaciona uma vulnerabilidade de alta severidade do React Router ao **modo React Server Components** em versões `>= 7.12.0 < 8.3.0`. A aplicação auditada é uma SPA com `BrowserRouter`, sem `react-router-dom/server`, `ServerRouter`, `HydratedRouter`, `createCallServer` ou outro uso de RSC. O alerta foi mantido documentado, em vez de forçar o downgrade sugerido pelo npm para 7.11.0, porque o downgrade reintroduziria avisos de segurança previamente corrigidos. O roteador deve ser reavaliado quando uma versão corrigida compatível for disponibilizada.

## Verificações de código e segredos

A varredura dos arquivos rastreados não encontrou chaves privadas, tokens de provedores, padrões típicos de credenciais ou chamadas de execução dinâmica. Os únicos arquivos de ambiente rastreados são modelos documentados (`.env.example` e `.env.teste`), agora sem segredos reutilizáveis.

## Requisitos para produção

A aplicação exige uma base PostgreSQL acessível, um `JWT_SECRET` forte e URLs públicas coerentes. Pagamentos e e-mails reais continuam dependentes das credenciais dos respectivos provedores, que não foram criadas nem simuladas nesta auditoria.

```env
NODE_ENV=production
DATABASE_URL=postgresql://USUARIO:SENHA@HOST:5432/BANCO
JWT_SECRET=GERE_COM_OPENSSL_RAND_BASE64_32
WEB_URL=https://comitivas.permupay.com.br
API_URL=https://comitivas.permupay.com.br
STORAGE_PATH=/app/uploads
PAYMENT_GATEWAY=mercadopago
MERCADOPAGO_ACCESS_TOKEN=CONFIGURE_NO_AMBIENTE_DE_PRODUCAO
SMTP_HOST=CONFIGURE_NO_AMBIENTE_DE_PRODUCAO
SMTP_PORT=587
SMTP_USER=CONFIGURE_NO_AMBIENTE_DE_PRODUCAO
SMTP_PASS=CONFIGURE_NO_AMBIENTE_DE_PRODUCAO
SMTP_FROM=CONFIGURE_NO_AMBIENTE_DE_PRODUCAO
```

## Conclusão

O build, os testes unitários e o E2E foram aprovados após as alterações. O projeto está preparado para publicação, desde que as variáveis de produção sejam configuradas no ambiente de deploy e que o fluxo com os provedores reais de pagamento e e-mail seja validado com credenciais controladas. Nenhum pagamento externo foi disparado durante esta auditoria.
