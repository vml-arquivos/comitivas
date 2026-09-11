# Aplicativos Android e iOS — Excursão das Comitivas

A experiência mobile reutiliza o mesmo frontend e o mesmo backend de produção. Não existe regra de preço, contrato ou pagamento duplicada no aplicativo.

## Distribuição imediata pelo site

A versão recomendada para distribuição direta é a PWA do frontend web em `/aplicativo`. No Android o navegador oferece instalação; no iPhone/iPad o Safari permite **Adicionar à Tela de Início** e **Abrir como App da Web**.

## Pacotes nativos para lojas

O diretório `apps/mobile` usa Capacitor como shell nativo e importa a aplicação web atual. Para gerar os projetos nativos em uma máquina com as SDKs instaladas:

```bash
cd apps/mobile
npm ci
npm run build
npm run cap:add:android
npm run cap:add:ios
npm run cap:sync
```

Depois use Android Studio para assinar AAB/APK e Xcode para assinar o app iOS. O pacote iOS destinado ao público geral deve ser distribuído pelos canais Apple aplicáveis (App Store/TestFlight); não trate um `.ipa` hospedado no site como mecanismo geral de instalação.

## Regras de segurança

- API, preços, disponibilidade, contrato e pagamentos continuam autoritativos no servidor.
- Nada sensível é embutido no bundle mobile.
- Operações transacionais exigem internet.
- O aplicativo usa o mesmo login e a mesma Ficha 360º do site.
