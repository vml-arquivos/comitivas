# Aplicativo Android e iOS — estratégia de produção

## Decisão

A distribuição imediata pelo próprio site usa uma PWA sobre o frontend oficial. Isso evita duplicar regras de negócio e mantém cliente, reserva, preço, contrato, validação e pagamento no mesmo backend.

URL pública de instalação: `https://excursaodascomitivas.com.br/aplicativo`.

## Android

No Chrome/Edge compatível, o evento de instalação é capturado e a página oferece o botão **Instalar aplicativo**. O app abre em modo standalone e recebe atualizações pelo mesmo deploy do site.

## iPhone/iPad

A instalação é feita no Safari em **Compartilhar → Adicionar à Tela de Início → Abrir como App da Web**. O sistema não promete instalação pública de um IPA diretamente do site.

## Segurança e cache

- `/api/*` nunca é interceptado pelo cache da PWA.
- navegação usa rede primeiro;
- assets estáticos podem ser cacheados;
- contratos, preços, pagamentos, sessão e disponibilidade continuam online e autoritativos no backend;
- existe somente uma página offline de continuidade.

## Capacitor

`apps/mobile` permanece como shell para futuros pacotes nativos Android/iOS, reutilizando a aplicação web atual. Use lojas oficiais para distribuição nativa ampla; a PWA é o canal de instalação direta pelo site.
