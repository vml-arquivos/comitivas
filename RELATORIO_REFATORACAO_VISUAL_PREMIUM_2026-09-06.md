# Refatoração visual premium — Excursão das Comitivas

Data: 06/09/2026
Base de referência: main `505831542b55f9c6bbb035ed0d25fb6ef071d0a0`

## Objetivo
Substituir a aparência visual densa/vermelha da Home por uma experiência editorial premium, preservando regras de negócio, APIs, Ficha 360º, contratos, pagamentos, reservas, CRM e banco de dados.

## Direção visual aplicada
- Fundo marfim `#F8F5EF` como base institucional.
- Azul profundo `#182D3B` para autoridade e legibilidade.
- Vinho `#851F32` como cor de marca e CTA, sem dominar a tela.
- Tipografia editorial serifada para títulos e sans-serif para interface.
- Mais respiro, hierarquia, cards discretos e sombras sofisticadas.
- Header claro com navegação refinada e CTA arredondado.
- Hero editorial dividido em conteúdo + fotografia, com card de oferta sobreposto.
- Galeria em bloco azul-marinho, formulário premium e footer institucional escuro.

## Integração funcional preservada
- Home continua consumindo `/publico/ofertas`.
- Oferta, preço e disponibilidade continuam autoritativos no backend.
- `ref` comercial continua preservado.
- Configurador e página de eventos continuam integrados ao mesmo fluxo.
- Rotas privadas continuam `noindex,nofollow`.
- Ficha 360º de clientes e rota `/admin/clientes/:clienteId` foram preservadas.
- Migration `0010_clientes_ficha_documentos_historico.sql` permanece intacta.

## Arquivos visuais atualizados
- `apps/web/src/pages/publico/Home.tsx`
- `apps/web/src/layouts/MainLayout.tsx`
- `apps/web/src/components/LeadCapture.tsx`
- `apps/web/src/pages/Eventos.tsx`
- `apps/web/src/pages/cliente/ConfiguradorPacote.tsx`
- `apps/web/src/index.css`
- `apps/web/tailwind.config.js`
- `apps/web/index.html`
- `apps/web/postcss.config.js`
- `apps/web/vite.config.ts`
- `apps/web/src/App.tsx` (merge preservando Ficha 360º + efeitos de rota/SEO)

## Validações executadas neste ambiente
- Parse/transpilação TypeScript dos arquivos TSX visuais: aprovado.
- Presença da Ficha 360º, schema de documentos/histórico e migration 0010: confirmada.
- Home consultando `/publico/ofertas`: confirmada.
- Hero premium `O destino é Barretos. A história é sua.`: confirmado.

O typecheck completo não foi declarado como aprovado porque o pacote local não contém `node_modules`; sem dependências instaladas, o TypeScript não consegue resolver React e demais módulos. Antes do deploy, executar `npm ci`, typecheck, testes e build no ambiente de CI/produção.
