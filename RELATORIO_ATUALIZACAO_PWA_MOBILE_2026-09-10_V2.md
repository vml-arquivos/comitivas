# RELATÓRIO — ATUALIZAÇÃO PWA MOBILE V2

Data base: 2026-09-10
Projeto: Excursão das Comitivas
Escopo desta atualização: refinamento do PWA/mobile com foco em navegação curta, visual de app e instalação.

## Atualizações aplicadas

### 1) Fluxo público mobile/PWA mais direto
- Ajustada a home pública para destacar dois caminhos principais:
  - **Ver excursões**
  - **Encontrar meu pacote / Ir para meu pacote**
- Redução de texto auxiliar excessivo na entrada do fluxo.

### 2) Página de excursões mais enxuta no celular
- Reorganizada a tela `Eventos.tsx`.
- No mobile, os **pacotes agora aparecem em carrossel lateral** por lote, evitando uma rolagem vertical longa.
- O topo da página ficou mais curto e objetivo.
- A excursão publicada continua clara, mas com menos repetição visual no celular.

### 3) Seleção de pacote mais fácil
- Reorganizada a tela `ConfiguradorPacote.tsx`.
- Quando o cliente escolhe um pacote, a tela passa a focar **somente no pacote selecionado**.
- Inclusão do botão **Ver outros pacotes** para reabrir a comparação apenas quando necessário.
- Mantido o resumo de reserva e o fluxo de checkout sem regressão funcional.

### 4) PWA com identidade mais consistente
- Atualizado o `manifest.webmanifest` para:
  - **name**: `Barretão 2027 | Excursão das Comitivas`
  - **short_name**: `Barretão 2027`
- Atualizados:
  - `application-name`
  - `apple-mobile-web-app-title`
  - título base do app
- Regenerados os ícones:
  - `app-icon-192.png`
  - `app-icon-512.png`
  - `app-icon-maskable-512.png`
  - `apple-touch-icon.png`
- Objetivo: deixar o ícone maior, mais consistente e com melhor identidade entre Android e iPhone.

### 5) Cache do PWA renovado
- Atualizado `sw.js` de `comitivas-pwa-v2` para `comitivas-pwa-v3`.
- Isso ajuda o navegador a buscar a nova versão do manifest, dos ícones e dos ajustes visuais.

### 6) Tela de instalação ajustada
- Atualizado o conteúdo de `Aplicativo.tsx` com linguagem mais curta e humana.
- Quando o app já estiver instalado, a tela informa isso com clareza.
- No Android, o texto agora reforça que o ícone instalado será o **Barretão 2027**.
- No iPhone, a tela explica de forma direta a limitação real do Safari.

## Observação técnica importante sobre iPhone/iOS
A instalação automática completa **não pode ser forçada por um site** no iPhone.
A Apple exige que o usuário use o fluxo do Safari:
1. Abrir no Safari
2. Tocar em **Compartilhar**
3. Escolher **Adicionar à Tela de Início**

Ou seja:
- **Android**: o botão pode abrir o fluxo de instalação do PWA.
- **iPhone/iOS**: é possível orientar e facilitar, mas **não existe instalação totalmente automática via web** por limitação da plataforma.

## Arquivos principais alterados
- `apps/web/src/pages/Eventos.tsx`
- `apps/web/src/pages/cliente/ConfiguradorPacote.tsx`
- `apps/web/src/pages/publico/Home.tsx`
- `apps/web/src/pages/publico/Aplicativo.tsx`
- `apps/web/public/manifest.webmanifest`
- `apps/web/public/sw.js`
- `apps/web/index.html`
- `apps/web/public/app-icon-192.png`
- `apps/web/public/app-icon-512.png`
- `apps/web/public/app-icon-maskable-512.png`
- `apps/web/public/apple-touch-icon.png`

## Validação executada
- Validação sintática dos arquivos TSX alterados com `typescript.transpileModule`.
- Sem erros de transpile nos arquivos atualizados.

