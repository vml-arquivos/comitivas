# Auditoria de Frontend Web e Mobile — Excursão das Comitivas

**Repositório auditado:** `/home/ubuntu/comitivas`
**Escopo:** `apps/web`, `apps/mobile` e `packages` relacionados a páginas, rotas, API consumida pelo cliente, dashboards, checkout, contrato, voucher, SEO, acessibilidade, responsividade, tema e cálculos no cliente.
**Modo:** inspeção estática e comandos não destrutivos. Nenhum código-fonte ou banco foi alterado.
**Resultado do controle de integridade:** o `git status --short` estava limpo no início e permaneceu limpo ao final. O build web gerou artefatos temporários em `apps/web/dist`; eles foram restaurados ao estado versionado após a verificação.

## 1. Sumário executivo

O frontend web está em estado funcional para compilação e possui uma cobertura ampla de fluxos: páginas públicas, autenticação, configuração de pacote, criação de reserva, checkout, aceite eletrônico do contrato, pagamento, confirmação, downloads de contrato/voucher e painel administrativo. O `npx tsc --noEmit` de `apps/web` terminou com sucesso e `npm run build` de `apps/web` terminou com sucesso. As chamadas HTTP observadas no web possuem correspondentes nas rotas Express montadas pelo servidor, e os cálculos de pacote/reserva são enviados ao servidor antes da criação da reserva; isso é positivo para preservação financeira e de dados.

Há, entretanto, dois riscos de prioridade máxima. Primeiro, o aplicativo mobile não compila no estado auditado: `npx tsc --noEmit` e `npm run build` falham com 26 erros, incluindo módulo Capacitor ausente, alias de `@ui` incorreto, assets importados a partir do web sem declaração de tipos e parâmetros implicitamente `any`. Segundo, o checkout web exibe o desconto PIX duas vezes depois que o contrato é aceito: o servidor já atualiza o total da reserva com o desconto e a tela volta a subtrair o percentual sobre esse total atualizado. O gateway recebe o valor persistido pelo servidor, mas a interface pode mostrar ao cliente um total inferior ao que será cobrado; isso exige correção antes de liberar mudanças de checkout.

O mobile também é uma implementação paralela e incompleta do web, não uma aplicação com paridade de produto: reutiliza páginas do web, tem apenas parte das rotas, começa em `Eventos` em vez da Home atual e inclui um `server.url` Capacitor fixado em `http://localhost:5173`. O root `package.json` inclui apenas `apps/web` no workspace/build, e não há lockfile do mobile. Portanto, a existência de scripts `cap:*` não demonstra que exista um pacote mobile reproduzível ou pronto para distribuição.

## 2. Método, evidências e limites

Foram lidos os arquivos de entrada, roteamento, layouts, contexto de autenticação, páginas públicas, páginas de cliente, páginas administrativas, estilos, utilitários de checkout, pacotes compartilhados, configuração Capacitor/Vite/TypeScript, manifestos, lockfiles e rotas Express correspondentes. Foram executados somente comandos de leitura, TypeScript, build, `npm ci --dry-run` e restauração de artefatos gerados pelo próprio build. Não foram executados login real, pagamento, criação de reserva, alteração de configuração, migração, seed, webhook ou operação administrativa em banco.

Os resultados de compilação são fatos observados no checkout auditado. Conclusões sobre produção mobile, navegação em leitores de tela, viewport físico e comportamento de gateway são classificadas como **inferência** quando não puderam ser confirmadas em dispositivo ou ambiente publicado. A auditoria não substitui um teste E2E com dados sintéticos, um teste de acessibilidade em navegador nem uma homologação financeira com o gateway.

## 3. Matriz de verificação

| Área | Resultado observado | Classificação |
|---|---|---|
| Web TypeScript | `apps/web`: `npx tsc --noEmit` terminou com código 0 | Funcionando |
| Web build | `apps/web`: `npm run build` terminou com sucesso | Funcionando |
| Mobile TypeScript/build | `npx tsc --noEmit` e `npm run build` terminam com código 2 e 26 erros listados abaixo | Errado/quebrado |
| Rotas web | Rotas públicas, cliente e painel estão declaradas em `apps/web/src/App.tsx`, com guards por perfil | Funcionando, com pontos de UX |
| Rotas mobile | Subconjunto antigo: não inclui páginas públicas, perfil, redefinição e várias telas admin | Incompleto/legado |
| API web | Chamadas observadas correspondem a mounts e handlers em `server/routes` | Funcionando por inspeção estática |
| Cálculo de pacote | `/pacotes/calcular` e `/pacotes/reservar` recebem itens/cupom; total de reserva é decidido no servidor | Funcionando |
| Checkout/contrato | Fluxo de contrato, OTP, consentimentos, idempotência e pagamento está implementado | Funcionando com erro de exibição PIX |
| Voucher | UI pede voucher apenas após confirmação; servidor também exige `cliente_confirmado` | Funcionando e protegido |
| SEO | Meta básica, JSON-LD, robots, sitemap e Helmet em páginas públicas | Funcionando parcialmente |
| Acessibilidade | Labels/alt/foco existem em componentes e páginas principais, mas há botões somente com `title` e painel sem menu mobile | Incompleto |
| Responsividade | Web público usa breakpoints; admin fica sem navegação no viewport menor que `md` | Incompleto/quebrado em mobile web |
| Tema | Web possui tokens Tailwind e estilo global; mobile mantém CSS/tokenização paralelos | Incompleto/duplicado |
| Integridade do repositório | Git limpo após as verificações; nenhum banco ou código alterado | Funcionando |

## 4. O que está funcionando

### 4.1 Web compila e possui uma superfície de produto abrangente

**Fato:** `apps/web` passou no TypeScript e no build. O roteador em `apps/web/src/App.tsx` contém Home, História, Galeria, Avaliações, Regras, páginas legais, login, redefinição, cadastro, configurador, checkout, confirmação, reservas, dados cadastrais e as seções administrativas de dashboard, reservas, contratos, clientes, configurações, jornada, eventos, relatórios e cupons.

**Fato:** o `ProtectedRoute` web usa `Navigate` e preserva o destino por `redirect`, enquanto separa `admin`, `vendedor` e `cliente`. Isso reduz risco de acesso visual indevido e evita navegação imperativa durante a renderização nessa implementação web.

### 4.2 O web possui integração API coerente por inspeção

**Fato:** o cliente usa `axios` com `baseURL: '/api'` e `withCredentials: true` em `apps/web/src/contexts/AuthContext.tsx`. O servidor monta `/api/auth`, `/api/publico`, `/api/eventos`, `/api/lotes`, `/api/pacotes`, `/api/contratos`, `/api/pagamentos`, `/api/cupons`, `/api/jornada` e `/api/admin` em `server/index.ts`. As chamadas observadas — perfil, login/cadastro, ofertas, leads, pacotes, reservas, contratos, pagamentos, relatórios e operações administrativas — têm handlers correspondentes em `server/routes`.

**Fato:** o login do servidor define cookie HTTP de autenticação. O cliente passa o token retornado ao método `login`, mas esse método não o guarda em localStorage nem cria header Bearer; ele mantém a sessão por cookie e `withCredentials`. A ausência de uso do token não foi classificada como falha do web porque o servidor oferece explicitamente essa via por cookie. É, porém, uma decisão que deve ser documentada para não ser confundida com token bearer ausente.

### 4.3 Checkout preserva a decisão do cliente e delega o total ao servidor

**Fato:** `ConfiguradorPacote.tsx` carrega itens e pacotes do servidor, envia itens/cupom para `/pacotes/calcular`, salva a intenção em `localStorage` antes do redirecionamento para cadastro e cria a reserva por `/pacotes/reservar`. Após a reserva criada, limpa a intenção e navega para o checkout.

**Fato:** a intenção contém lote, pacote, quantidades e timestamp; o destino de retorno é validado por `destinoSeguro`, que rejeita URLs externas e valores iniciados por `//`. Isso é favorável à retomada sem perder a escolha e reduz risco de open redirect.

**Fato:** no fluxo de pagamento, o cliente cria uma chave persistente em `localStorage` por reserva e envia `idempotency_key` ao servidor. O servidor normaliza a chave, exige hold de inventário e envia ao gateway o valor persistido da reserva. Esse desenho é favorável a zero regressão e evita cobranças duplicadas em reenvio, desde que a chave continue sendo preservada.

### 4.4 Contrato, OTP, evidências e voucher estão implementados no web

**Fato:** o checkout carrega estado do contrato, permite preparar/aceitar contrato, exibe HTML em iframe, exige aceite do contrato e das regras, solicita OTP por e-mail ou WhatsApp, envia metadados do navegador/timezone e permite geolocalização opcional. As rotas correspondentes existem em `server/routes/contratos.ts`.

**Fato:** `Confirmacao.tsx` e `MinhasReservas.tsx` usam downloads de contrato e voucher. A rota de voucher no servidor valida usuário/admin e rejeita emissão quando o status não é `cliente_confirmado`. A proteção está duplicada em cliente e servidor, o que é adequado para dados e documentos.

### 4.5 SEO e fundamentos de acessibilidade existem

**Fato:** `apps/web/index.html` contém `lang="pt-BR"`, viewport, título, description, favicon, apple touch icon e JSON-LD Organization. Há `robots.txt` e `sitemap.xml` públicos. As páginas públicas principais usam `Helmet` para título/description, e páginas privadas/configurador usam `noindex` em parte dos casos.

**Fato:** o componente compartilhado `packages/ui/components/Input.tsx` gera id, associa `label` com `htmlFor`, usa `aria-invalid` e `aria-describedby` para erro. Imagens de conteúdo recebem `alt`; imagens decorativas observadas usam `alt=""` e, em pontos relevantes, `aria-hidden="true"`. Há classes responsivas `sm`, `md`, `lg` em grande parte do web e indicadores de foco em controles.

## 5. Achados incompletos

### I-01 — Paridade funcional mobile não entregue

**Fato:** `apps/mobile/src/App.tsx` expõe somente `/`, login, cadastro, pacote, checkout, confirmação, minhas reservas e admin dashboard/reservas/jornada/cupons. Não expõe História, Galeria, Avaliações, Regras, páginas legais, redefinição de senha, dados cadastrais, contratos, clientes, configurações, eventos administrativos ou relatórios, embora essas rotas existam no web.

**Fato:** a raiz mobile renderiza `Eventos`, enquanto a raiz web renderiza `Home`. O mobile exige `ProtectedRoute` para `/pacote/:loteId`, mas o web atual declara o configurador como público e pede autenticação somente na reserva.

**Impacto:** dois clientes do mesmo produto apresentam ofertas, navegação e regras diferentes. Um usuário mobile pode não conseguir completar dados contratuais, redefinir senha ou acessar documentos pelo caminho existente no web.

**Inferência:** se `apps/mobile` for considerado o aplicativo oficialmente suportado, a cobertura atual não atende ao escopo completo; se for somente um protótipo/legado, a documentação e o pipeline deveriam deixar isso explícito.

### I-02 — Mobile sem pipeline reprodutível

**Fato:** o root `package.json` possui workspace apenas para `apps/web` e o script root `build` executa `build:web`, não um build mobile. `apps/mobile` possui `package.json`, mas não possui lockfile próprio, e não há diretórios Android/iOS versionados no inventário auditado.

**Fato:** `apps/mobile/package.json` declara `@capacitor/app`, porém `npm ls` no mobile reportou árvore vazia e o TypeScript reportou `Cannot find module '@capacitor/app'`. O alias `@ui` em `apps/mobile/vite.config.ts` e `tsconfig.json` usa `../../../packages/ui`, que resolve para `/home/ubuntu/packages/ui`; o pacote real está em `/home/ubuntu/comitivas/packages/ui` e o caminho relativo correto a partir de `apps/mobile` seria outro.

**Impacto:** não há garantia de instalação limpa, build CI ou sincronização nativa do aplicativo mobile. Corrigir isso exige primeiro alinhar manifesto, lockfile, workspace e aliases; não é seguro remover ou substituir dependências sem uma matriz de compatibilidade.

### I-03 — Configuração Capacitor aponta para desenvolvimento local

**Fato:** `apps/mobile/capacitor.config.json` contém `server.url: "http://localhost:5173"` e `cleartext: true`.

**Inferência:** um binário distribuído com essa configuração tende a apontar para um servidor local inexistente, a menos que seja deliberadamente um pacote de live reload. A configuração não contém URL de API/servidor de produção nem separação explícita entre desenvolvimento e distribuição.

**Prioridade:** crítica para qualquer publicação mobile; deve ser tratada sem alterar dados ou endpoints de produção, usando ambientes e variáveis separados.

### I-04 — Estado de instrução de pagamento não é recuperado após refresh

**Fato:** `Confirmacao.tsx` recebe `pagamentoData` somente de `location.state?.pagamentoData`. O polling chama `/pagamentos/status/:reservaId`, mas atualiza apenas `status`; a resposta do servidor contém `qr_code`, `pix_copia_e_cola`, `url_pagamento`, `document_url` e outros dados que não são colocados no estado de pagamento da tela.

**Impacto:** após atualizar a página, abrir a URL diretamente ou perder o state de navegação, a tela pode continuar monitorando o status, mas não exibir novamente QR Code PIX ou link do gateway. O cliente pode ficar sem instrução de pagamento apesar de a cobrança existir.

### I-05 — Texto de dados contratuais contradiz a regra real do checkout

**Fato:** `DadosCadastrais.tsx` informa “Você pode continuar mesmo com algum campo em branco”, mas `Checkout.tsx` desabilita “Ler contrato completo” quando `dadosIncompletos.length > 0`.

**Impacto:** o usuário recebe uma promessa de continuidade que não corresponde ao comportamento observado. Isso pode gerar abandono e tentativas repetidas de salvar dados. O texto deve ser alinhado à regra, ou a regra deve ser revisada com cuidado jurídico/operacional antes de qualquer alteração.

### I-06 — SEO é básico, mas não completo

**Fato:** não foram encontrados `link rel="canonical"`, metatags Open Graph ou Twitter Cards no HTML base auditado. Login, cadastro, redefinição e várias páginas administrativas não possuem `Helmet` próprio; algumas são cobertas por `robots.txt`, mas não por metadados de página.

**Impacto:** compartilhamento social e consolidação de URLs podem ser inconsistentes. A ausência não bloqueia o checkout, mas reduz qualidade de indexação e compartilhamento. Qualquer inclusão deve respeitar as páginas privadas e não expor dados de cliente.

### I-07 — Navegação administrativa web não é acessível em telas menores

**Fato:** `AdminLayout.tsx` declara a sidebar como `hidden md:flex`. O header para telas menores mostra somente o texto “Painel Admin/Vendedor” e não possui botão, drawer ou outro mecanismo para exibir os links administrativos.

**Impacto:** no web mobile, a sidebar desaparece e não existe navegação visível para Dashboard, Reservas, Jornada etc. Links podem ser acessados apenas por URL direta ou por histórico. Este é um problema funcional e de acessibilidade, não apenas visual.

### I-08 — Controles iconográficos administrativos dependem de `title`

**Fato:** foram encontrados botões administrativos de excluir/baixar/editar com ícone e `title`, mas sem texto acessível ou `aria-label` explícito, por exemplo em `apps/web/src/pages/admin/Eventos.tsx` e `apps/web/src/pages/admin/Contratos.tsx`.

**Inferência:** `title` não é uma alternativa robusta para nome acessível em todos os leitores de tela e dispositivos touch. Deve ser validado com ferramenta automatizada e leitor de tela antes de declarar conformidade WCAG.

## 6. Achados errados/quebrados

### B-01 — Build mobile falha no checkout auditado

**Fato:** `apps/mobile` retornou código 2 no `npx tsc --noEmit` e no `npm run build`, com 26 erros. Os erros incluem:

- módulo `@capacitor/app` não resolvido;
- assets `icon.svg`, `logo.png`, `logo.webp`, `logo-branca.png` e `logo-branca.webp` importados pelas páginas web sem declaração/ resolução no projeto mobile;
- `ImportMeta.env` não reconhecido no mobile;
- `@ui/index` não resolvido em várias páginas;
- parâmetros de eventos implicitamente `any` em Login, Cupons e Jornada.

**Impacto:** o artefato mobile não é gerável de forma limpa no estado atual. Não deve ser publicado nem considerado uma rota de fallback para o web.

### B-02 — Desconto PIX é subtraído duas vezes na apresentação do checkout

**Fato:** o cliente calcula `resumo` em `Checkout.tsx` como `base - desconto`, onde `base = reserva.valor_total` e `desconto` é aplicado quando o método é PIX. No servidor, `ContratoService.calcularCondicaoPagamento` também calcula o desconto PIX, grava `valor_total` já reduzido na reserva durante `/contratos/aceitar/:reserva_id`, e `/pagamentos/criar` envia o `reserva.valor_total` persistido ao gateway.

**Sequência observável:** antes do aceite, a tela exibe o valor original menos desconto; após aceitar o contrato e recarregar os dados, `reserva.valor_total` já contém o desconto e a tela aplica o mesmo percentual novamente. O gateway, por sua vez, recebe o valor persistido uma única vez.

**Impacto:** divergência material entre “Total contratado” exibido e o valor cobrado. É o achado financeiro mais importante do web. A correção segura é fazer a apresentação consumir o total/condição retornado pelo servidor, ou distinguir claramente subtotal original de total final, sem recalcular sobre um campo já descontado. Não se deve alterar reservas existentes nem recalcular banco sem uma estratégia de migração e reconciliação.

### B-03 — Guard de rota mobile navega durante a renderização

**Fato:** em `apps/mobile/src/App.tsx`, `ProtectedRoute` chama `navigate('/login', { replace: true })` ou `navigate('/', { replace: true })` dentro do corpo do componente. A versão web usa `Navigate` declarativo.

**Impacto:** pode provocar avisos, renderizações intermediárias ou loops de navegação em React Router. Mesmo que pareça funcionar em uma navegação simples, é uma implementação frágil, especialmente em WebView e sob restauração de estado.

### B-04 — Mobile reutiliza dependências do web sem declarar a superfície necessária

**Fato:** o mobile importa diretamente `AuthContext`, layouts e páginas de `apps/web/src`, que por sua vez importam `react-helmet-async`, assets do web e `@ui/index`. O `apps/mobile/package.json` não declara `react-helmet-async` nem todas as dependências necessárias para essa árvore. Também não há um `HelmetProvider` no App mobile.

**Inferência:** mesmo após corrigir o alias e instalar Capacitor, o runtime mobile pode divergir por dependências transitivas/hoisting e pelo contexto de Helmet ausente. Reutilização deve ser feita depois de definir um pacote compartilhado neutro, ou o mobile deve declarar e configurar explicitamente todas as dependências.

## 7. Achados de legado/duplicação

### L-01 — Mobile é uma implementação paralela desatualizada

**Fato:** `apps/mobile/src/App.tsx` contém comentários de “reutilização de componentes web”, uma raiz diferente da web e somente parte do painel. O web usa `react-router-dom` declarado como `7.18.2` no manifesto atual, enquanto o lockfile do web registra `6.20.0`; o mobile declara `6.20.0` e Vite 5, enquanto o web atual usa Vite 8.1.5 e plugin React 6.0.4.

**Inferência:** há pelo menos duas gerações de stack convivendo. O mobile deve ser formalmente retomado e alinhado ou explicitamente retirado do produto suportado; manter ambos como se fossem equivalentes aumenta risco de regressão.

### L-02 — Artefatos `dist` versionados estão desalinhados da fonte atual

**Fato:** `apps/web/dist/index.html` versionado contém JSON-LD com `https://comitivas.permupay.com.br/` e bundles com hashes antigos, enquanto `apps/web/index.html` fonte usa `https://excursaodascomitivas.com.br/` e a entrada `src/main.tsx`. O Dockerfile recompila o web, mas `dist` também aparece versionado no repositório.

**Impacto:** se alguém servir `dist` sem rebuild, poderá publicar domínio, bundles e metadados antigos. Isso é risco de entrega, cache e SEO, embora o Dockerfile atual reduza o risco em um build completo.

### L-03 — Assets de marca duplicados

**Fato:** existem cópias de logo/icon em `apps/web/src/assets/brand` e `packages/brand/assets`. A aplicação web importa diretamente o primeiro grupo; o pacote `brand` mantém outro conjunto para o ecossistema de contratos/PDF.

**Classificação:** a duplicação física é fato; a conclusão de que é legado é inferência parcial. Antes de remover qualquer cópia, deve-se verificar o uso por `contract-engine`, PDFs e scripts, pois apagar uma logo pode quebrar documentos históricos ou futuros.

### L-04 — Estilos mobile aparentam pertencer a uma shell antiga

**Fato:** `apps/mobile/src/App.css` define `.app-container`, `.app-header`, `.welcome-section` e `.app-footer`, mas o App mobile monta `MainLayout` web e páginas Tailwind. `apps/mobile/src/index.css` também mantém tokens CSS próprios, separados dos tokens Tailwind do web.

**Inferência:** parte do CSS pode ser legado não utilizado pela shell atual. Não deve ser removido em lote; primeiro é necessário confirmar uso em build e eventual comportamento em Capacitor.

## 8. Achados ausentes

### M-01 — Falta uma definição suportada para o produto mobile

Não há evidência de um mobile completo, compilável e coberto pelo pipeline root. Falta decidir, com registro de produto, se o escopo é um PWA/Capacitor com paridade do web, um app nativo independente ou um protótipo não distribuível.

### M-02 — Falta configuração de endpoint de produção para o mobile

O mobile usa `baseURL: '/api'` herdado do web e `server.url` local. Falta um contrato de configuração por ambiente para desenvolvimento, homologação e produção, incluindo política de HTTPS, cookies/sessão e origem permitida. Essa configuração deve ser introduzida sem hardcode de credenciais e sem mudar dados existentes.

### M-03 — Falta lockfile/pipeline nativo do mobile

Não há lockfile próprio do mobile nem build mobile incluído no root. Também não foram encontrados projetos nativos Android/iOS versionados. Sem isso, scripts `cap:add:*`, `cap:sync` e `cap:build:*` não representam uma entrega repetível.

### M-04 — Faltam metadados canônicos e de compartilhamento no web

Faltam canonical, Open Graph e Twitter Cards no HTML base. Para páginas privadas, deve-se manter `noindex,nofollow` e evitar qualquer metadado que revele nomes, reservas ou IDs.

### M-05 — Falta navegação administrativa responsiva

O layout administrativo carece de menu móvel, drawer ou bottom navigation acessível. A ausência impede o uso completo do painel no web mobile.

### M-06 — Falta recuperação de cobrança no deep link da confirmação

A tela de confirmação precisa de uma fonte persistente/autoritativa para recuperar instruções da cobrança depois de refresh. A API já retorna dados suficientes em `/pagamentos/status/:reserva_id`; falta conectá-los ao estado da tela com tratamento de erro e sem expor informações de outra reserva.

## 9. Prioridades de correção com zero regressão

1. **P0 — Bloquear publicação do mobile até o build ser reprodutível.** Corrigir em branch isolada o alias de `@ui`, a instalação/lockfile de Capacitor e os tipos/assets; incluir o mobile no pipeline somente depois de um build limpo. Não rodar migração, seed ou alteração de banco como parte dessa correção.
2. **P0 — Corrigir a divergência financeira do desconto PIX.** Definir uma única fonte de verdade para subtotal, desconto e total final; cobrir pelo menos PIX, boleto, troca de método, reload após aceite e retry idempotente. Preservar reservas existentes e fazer qualquer correção de dados somente com plano explícito de reconciliação.
3. **P1 — Recuperar instruções de pagamento na confirmação.** Usar a resposta de status do servidor para reidratar QR/link/documento após refresh, mantendo o polling limitado, o controle de acesso e a chave idempotente.
4. **P1 — Criar navegação responsiva do AdminLayout.** O menu móvel deve ter foco, nome acessível, fechamento por Escape e não alterar permissões; reutilizar os mesmos `navItems` filtrados por papel.
5. **P1 — Reconciliar manifestos e lockfiles.** Comparar `apps/web/package.json`, `apps/web/package-lock.json`, lock raiz e `apps/mobile/package.json`; escolher uma estratégia de workspace e regenerar lockfile em mudança revisada. Não atualizar versões indiscriminadamente.
6. **P1 — Decidir o destino do mobile.** Se for suportado, alinhar rotas com o web, configurar API por ambiente e gerar Android/iOS em CI. Se for legado, remover sua pretensão de paridade da documentação e impedir que seja confundido com release oficial; a remoção deve ser planejada e não feita nesta auditoria.
7. **P2 — Corrigir a cópia de dados contratuais e fortalecer a11y.** Alinhar a mensagem com a regra efetiva, adicionar `aria-label` a ações iconográficas e validar com axe/leitor de tela.
8. **P2 — Completar SEO público.** Adicionar canonical/OG/Twitter por página pública, revisar domínio único e manter rotas privadas fora de indexação.
9. **P2 — Tratar `localStorage` de intenção.** Considerar expiração/limpeza de intenções antigas e schema/versionamento, sem apagar automaticamente uma intenção recente que possa representar uma venda em andamento.
10. **P2 — Limpar legado somente após inventário de deploy.** Decidir se `dist` deve ser versionado e qual conjunto de assets de marca é autoritativo; não deletar arquivos antes de verificar uso pelo motor de contrato/PDF e pelo processo de publicação.

## 10. Conclusão

O web é o caminho atualmente mais confiável: compila, possui cobertura funcional ampla e usa o servidor como autoridade para reserva, contrato e cobrança. O principal defeito web é a divergência visual do total PIX após a aceitação do contrato, com potencial impacto direto na confiança do cliente e na conciliação financeira. O mobile, no estado auditado, deve ser tratado como incompleto/quebrado e não como uma versão equivalente: não compila, não está no pipeline root, possui aliases/dependências incoerentes, rotas faltantes e configuração local de Capacitor.

A recomendação é preservar o estado atual e corrigir primeiro somente os pontos que afetam valor exibido, instruções de pagamento e build/distribuição. Qualquer alteração de cálculo ou de dados persistidos deve ser acompanhada por testes de contrato/integração e reconciliação; nenhuma alteração de banco foi necessária ou realizada nesta auditoria.
