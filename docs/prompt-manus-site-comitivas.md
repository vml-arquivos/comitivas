# Prompt para o Manus — Site institucional e comercial "Excursão das Comitivas"

Cole o conteúdo abaixo no Manus como instrução única. Está escrito para um agente
que só tem acesso ao repositório (código) — não ao servidor. Deploy e qualquer
comando na VPS continuam manuais, por decisão do cliente.

---

## CONTEXTO DO NEGÓCIO

Você vai reformular o site público de uma empresa de excursões para festas de
peão/rodeio no Brasil, chamada **Excursão das Comitivas**. Instagram: `@excurssaodascomitivas`
(confirme a grafia exata com o cliente antes de publicar — variações "excursao"
vs "excurssao" aparecem em fontes diferentes).

- A operação atual foi oficializada em **2015**, mas os idealizadores já viviam
  o universo das excursões e da cultura country havia cerca de **18 anos** antes
  disso. A comunicação deve transmitir "tradição de estrada" sem inventar
  detalhes específicos que o cliente não confirmou (nomes dos fundadores,
  histórias pontuais, número exato de excursões já realizadas). Onde faltar
  informação, use placeholders claramente marcados como `[CONFIRMAR COM CLIENTE]`
  em vez de inventar.
- Contratada: HENRIQUE SANTOS CUNHA, CNPJ 39.763.571/0001-13.
- Público-alvo: pessoas que quer viver a Festa do Peão de Barretos (e
  potencialmente outras festas do circuito) com hospedagem, transporte,
  bebida e comida resolvidos — "chegar e curtir".
- Próximo evento confirmado: **71ª Festa do Peão de Barretos, 20 a 30 de
  agosto de 2026**, Parque do Peão, Barretos/SP. A operação roda em dois
  lotes de fim de semana (1º: 20–23/08; 2º: 27–30/08).

## STACK JÁ EXISTENTE — NÃO REESCREVER DO ZERO

O sistema já é full-stack e funcional. Não recrie infraestrutura que já existe:

- Frontend: React + TypeScript + Vite, em `apps/web/`.
- Backend: Node/Express (TypeScript), em `server/`.
- Banco: PostgreSQL, schema gerenciado por Drizzle ORM (`server/db/schema.ts`)
  + migrations idempotentes em `drizzle/`.
- **Já implementado e funcionando**: login de cliente e de admin/vendedor
  (`server/routes/auth.ts`, `apps/web/src/contexts/AuthContext`), geração
  automática de contrato em PDF via Puppeteer no momento do pagamento
  (`server/services/contratoService.ts`), CRM/Kanban de leads
  (`server/routes/jornada.ts`), dashboard administrativo
  (`server/routes/admin.ts`), cupons, pagamentos, e-mails transacionais.
- **Seu trabalho é majoritariamente FRONT-END**: reformular o site público
  (landing page, páginas de pacote, galeria) para um padrão premium e de
  alta conversão. Não altere lógica de backend, autenticação, geração de
  contrato ou banco de dados a menos que encontre um bug concreto — nesse
  caso, documente o bug separadamente antes de mexer.

## OS TRÊS PACOTES (já modelados no backend, schema pronto)

O contrato é um contrato-base único, com três modalidades marcáveis por
checkbox (já implementado em `contratoService.ts`, não precisa recriar):

1. **Camping** — área gramada, banheiros externos, pontos de energia,
   segurança. Cliente leva o próprio material. Vendido como a opção "econômica,
   no meio da festa".
2. **Quarto compartilhado com ventilador** — suíte para 5–6 pessoas,
   separado por gênero (nunca misto).
3. **Quarto compartilhado com ar-condicionado** — mesma estrutura do
   ventilador, com ar-condicionado.

Incluso em todos os pacotes (usar como argumento de venda, não como lista
seca): café da manhã, almoço, 10h de open bar (água, refrigerante,
energético, vodka, gin, cerveja, paratudo), barman fazendo drinks, DJ +
som automotivo, piscina liberada, translado chácara ⇄ Parque do Peão,
transporte ida e volta Brasília ⇄ Barretos (com embarque em Goiânia).

## REGRA CRÍTICA DE PREÇO — NÃO NEGOCIÁVEL

**Nunca exiba valores em R$ em nenhuma página pública do site.** Nem no
hero, nem nos cards de pacote, nem na seção de FAQ. Preço é informado
somente por um vendedor humano via WhatsApp, depois que o lead demonstrou
interesse. Isso é uma decisão de negócio do cliente, não um detalhe estético.

Em vez de preço, cada card/seção de pacote deve terminar com uma CTA de
WhatsApp pré-preenchida, por exemplo:
`https://wa.me/<numero>?text=Quero%20saber%20mais%20sobre%20o%20pacote%20[Camping/Quarto%20Ventilador/Quarto%20Ar]%20pra%20Barretos%202026`

Isso já é suportado pelo build: a variável `VITE_WHATSAPP_NUMERO` é injetada
em tempo de build (ver `Dockerfile`, `ARG VITE_WHATSAPP_NUMERO`). Se o número
não estiver configurado como build arg no Coolify, os botões de WhatsApp
simplesmente não renderizam — **confirme com o cliente que essa variável está
setada antes de considerar a tarefa concluída**, e avise se não conseguir
verificar (você não tem acesso ao painel do Coolify).

## O QUE CONSTRUIR / REFORMULAR

1. **Home / landing de alta conversão**
   - Hero com a logo original, identidade visual country/rodeio, headline
     forte em torno de "viver a Festa de Barretos sem se preocupar com nada"
     + CTA primária de WhatsApp e CTA secundária "Ver pacotes".
   - Bloco de história/tradição (usar os fatos confirmados acima; não
     inventar).
   - Bloco "O que está incluso" com ícones, sem preço.
   - Três cards de pacote (Camping / Ventilador / Ar-condicionado), cada
     um com 3–4 bullets de benefício + CTA de WhatsApp própria por pacote
     (usar `?text=` diferente por pacote para o vendedor já saber o
     interesse do lead ao abrir o WhatsApp).
   - Seção de galeria de fotos (ver observação sobre imagens abaixo).
   - Seção de prova social / depoimentos — usar `[CONFIRMAR COM CLIENTE]`
     como placeholder até haver depoimentos reais aprovados.
   - Rodapé com CTA de WhatsApp fixa (botão flutuante) em todas as páginas.
   - Links para "Área do Cliente" (login) e "Já é cliente? Baixe o app"
     (mencionar app apenas se o cliente confirmar que existe; caso
     contrário, usar CTA para "Fale com a gente no WhatsApp").

2. **Página de detalhe de cada pacote** — expande os benefícios do card,
   mesma regra de não mostrar preço, CTA de WhatsApp específica do pacote.

3. **Galeria** — estruturar a página para aceitar tanto as fotos públicas
   que o cliente for anexando (uso autorizado, de fontes públicas) quanto,
   futuramente, fotos reais das excursões. Deixe o componente pronto para
   receber novas imagens sem precisar de retrabalho de layout.

4. **Área logada do cliente e do admin** — já existe. Apenas garanta que a
   nova identidade visual (cores, tipografia, componentes) seja aplicada
   de forma consistente também nessas telas, sem quebrar funcionalidade.

## SOBRE AS IMAGENS

O cliente mencionou que vai anexar fotos públicas (de sites/locais públicos)
para uso no site, mais a logo oficial e o @ do Instagram — **esses arquivos
ainda não foram recebidos por mim (Claude) nesta tarefa**, então não estão
disponíveis para você (Manus) neste prompt. Trate isso como uma dependência
pendente: monte a estrutura da galeria e os espaços de imagem no layout com
placeholders claramente identificados, e não publique nada com imagem de
banco de imagens genérico fingindo ser foto real do evento.

## O QUE JÁ FOI CORRIGIDO NO BACKEND NESTA RODADA (não repetir)

- Bug de deploy no `ensureSchema()` (`server/db/index.ts`): índices sendo
  criados antes das colunas existirem em bancos já existentes — corrigido.
- Bug de CRM: cadastro direto de cliente pelo site (sem vir de link de
  vendedor) não gerava registro em `leads_origem`, então não aparecia no
  Kanban nem era contado em lugar nenhum — corrigido em
  `server/routes/auth.ts`. O dashboard admin também passou a expor
  `total_leads` — ver `server/routes/admin.ts` e
  `apps/web/src/pages/admin/Dashboard.tsx`.
- Evento "Festa do Peão de Barretos 2026" com os dois lotes de fim de
  semana e os três pacotes por lote já tem script de seed pronto em
  `scripts/seed-barretos-2026.ts` (`npm run seed:barretos-2026`) — os
  valores usados nele **não devem aparecer no site público** (ver regra
  crítica de preço acima), servem só para o backend calcular
  parcelamento/checkout.

## FORA DO ESCOPO / NÃO FAZER

- Não faça deploy. Não rode comandos na VPS. Não altere variáveis de
  ambiente em produção. O cliente disse explicitamente que redeploy e
  qualquer comando de VPS são feitos manualmente por ele.
- Não exponha preços em nenhuma página pública.
- Não invente história, números ou depoimentos que o cliente não confirmou.
- Não altere a lógica de geração de contrato, pagamento ou autenticação.

## ENTREGA

Ao final, liste separadamente:
1. Arquivos criados/alterados no frontend.
2. Qualquer dependência pendente do cliente (fotos, logo em alta
   resolução, confirmação do @ do Instagram, confirmação de
   `VITE_WHATSAPP_NUMERO`, aprovação de depoimentos).
3. Passo a passo manual que o cliente precisa rodar para publicar
   (build local, git push, e o que configurar no Coolify) — sem executar
   nada disso você mesmo.
