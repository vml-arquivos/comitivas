# RELATÓRIO FINAL DE REDEPLOY — PWA V3

Projeto: Excursão das Comitivas
Data: 2026-09-11
Base: `comitivas-producao-final-hospedagem-vendas-pwa-2026-09-10.zip`
Regra: zero regressão / não reintroduzir arquivos contaminantes de outros sistemas.

## Escopo concluído

### PWA instalado com navegação de aplicativo
- A home detecta `display-mode: standalone` e, quando o usuário está no PWA instalado, apresenta uma tela curta, própria de aplicativo.
- Atalhos principais:
  - Ver excursões
  - Minhas viagens
- Oferta principal aparece diretamente na home do app.
- O site no navegador continua preservado para SEO e apresentação institucional.

### Excursões e pacotes no mobile
- Tela de excursões encurtada.
- Removida repetição visual excessiva no mobile.
- Pacotes de cada lote apresentados em **carrossel lateral com snap** no celular.
- Desktop mantém grade responsiva.
- Filtros continuam funcionando.

### Pacote selecionado
- Ao abrir um pacote pela excursão, o configurador foca no pacote escolhido.
- Outros pacotes ficam recolhidos por padrão.
- Botão **Ver outros pacotes** reabre a comparação quando o cliente desejar.
- Resumo, cupom, adicionais e checkout foram preservados.

### Identidade de instalação
- Manifest atualizado para:
  - `name`: Barretão 2027 | Excursão das Comitivas
  - `short_name`: Barretão 2027
- `application-name` e `apple-mobile-web-app-title` atualizados.
- Ícones PWA regenerados com o logotipo maior:
  - app-icon-192.png
  - app-icon-512.png
  - app-icon-maskable-512.png
  - apple-touch-icon.png
- Service worker atualizado para cache `comitivas-pwa-v3`.

### Instalação Android / iOS
- Android: o botão usa `beforeinstallprompt` quando disponível e abre o diálogo nativo de instalação.
- Depois de instalado, o CTA de instalação deixa de ser exibido no modo standalone.
- iOS: instruções reduzidas e diretas.
- Limitação de plataforma preservada: Safari/iOS exige ação manual em Compartilhar > Adicionar à Tela de Início; um site não pode forçar instalação automática.

### Hospedagem
- Modal de quartos em lote compactado e reorganizado.
- Campos preservados:
  - Nome / identificação
  - Local da hospedagem
  - Quantidade de quartos
  - Vagas por quarto
  - Grupo feminino/masculino
  - Climatização
  - Pacote específico opcional
  - Observação opcional
- Botão **Incluir mais quartos** mantido.
- Rodapé de ações permanece visível durante a rolagem.
- Cadastro avulso, edição, remanejamento e liberação não foram removidos.

### Vendas
- Painel geral continua disponível para ADMIN/DEV.
- Venda interna continua disponível para ADMIN/DEV/VENDEDOR conforme permissões existentes.
- Navegação explícita dentro da tela:
  - Todas as vendas
  - Vendas internas
- Métricas, contratos, pagamentos, origem de venda, cancelamento e alteração preservados.

## Auditoria estrutural
Comparação contra o ZIP imediatamente anterior:
- 304 arquivos na base anterior.
- 305 arquivos na árvore final.
- 0 arquivos removidos.
- 1 arquivo novo: este relatório.
- 14 arquivos funcionais/visuais alterados.

A base continua sem reintroduzir os diretórios e módulos contaminantes identificados anteriormente.

## Validações executadas
- 132 arquivos TS/TSX/MTS analisados.
- 0 erros de sintaxe.
- 0 imports relativos ausentes, incluindo resolução NodeNext de imports `.js` para fontes TypeScript.
- `manifest.webmanifest`: JSON válido.
- `sw.js`: `node --check` aprovado.
- ZIP será validado com `unzip -t` após criação.

## Build completo neste ambiente
O `npm ci` não pôde ser finalizado neste sandbox porque o acesso ao registry npm não completa e o cache local não possui:

`@vitejs/plugin-react@6.0.4`

A tentativa offline retorna `ENOTCACHED` para o tarball oficial do pacote. Portanto, o relatório **não declara falsamente** que `npm run build` foi concluído aqui.

O ZIP não inclui `node_modules`. No Coolify, o Dockerfile continuará executando a instalação limpa pelas dependências e o build normal.

## Recomendação para redeploy
Usar o ZIP final desta entrega como fonte do próximo commit/deploy. Se o build do Coolify falhar, analisar o primeiro erro real do log; não misturar novamente o repositório com arquivos do sistema Destrava ou outros projetos.
