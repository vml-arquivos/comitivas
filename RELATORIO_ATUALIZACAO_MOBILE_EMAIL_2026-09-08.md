# Atualização mobile + e-mail — 08/09/2026

Base: pacote final correspondente ao `main@107bce7262d0f90319fea7e97c3e955fbed31b1a`.

## Entrega mobile

- PWA instalável sem duplicar backend ou regras de negócio.
- Manifest Web App com identidade da Excursão das Comitivas.
- Ícones 192, 512 e maskable.
- Service worker sem cache de `/api/*`.
- Página `/aplicativo` com instalação Android e instruções iPhone/iPad.
- Link de aplicativo no menu desktop, menu móvel e rodapé.
- Tela offline segura e sem tentativa de operar contratos/pagamentos offline.
- `apps/mobile` atualizado como shell Capacitor que reutiliza o App web atual, evitando regressão por rotas antigas.
- App ID preparado: `br.com.excursaodascomitivas.app`.

## E-mail

A arquitetura SMTP já existente foi preservada. Cadastro, recuperação de senha e OTP usam envio imediato; pós-validação do contrato e follow-ups usam outbox/scheduler; quitação do boleto manual dispara confirmação de pagamento; boleto PDF continua sob envio administrativo controlado.

## Observação de distribuição iOS

Para instalação direta pelo site, a solução usada é Web App/PWA. Um pacote iOS nativo para público geral deverá seguir o canal Apple aplicável, enquanto Android nativo poderá ser empacotado posteriormente pelo Capacitor.
