# Projeto Público: Captação e Prova Social (Excursão Barretos)

## 1. Nomes Recomendados (Naming)

Para transmitir autoridade, os 10+ anos de tradição e o aspecto premium da viagem a Barretos, recomendo nomes que unam o conceito de "Comitiva" (que já é o nome do sistema base) com exclusividade e tradição:

1. **Comitiva Prime** (Recomendado - direto, transmite qualidade)
2. **Barretos VIP Tour** (Focado no destino, alto valor percebido)
3. **Tradição Sertaneja** (Focado na história de 10+ anos)
4. **Comitiva Oficial** (Transmite segurança e exclusividade)
5. **Rota Barretão** (Mais jovem, focado na jornada)

*Para o desenvolvimento das telas, usaremos o nome "Comitiva Prime" como base.*

---

## 2. Arquitetura de URLs

Para separar claramente o site de vendas (público) do sistema de gestão (logado), a estrutura ideal de URLs é:

### URLs do Site Público (Frontend Web)
- `https://comitivaprime.com.br/` -> Landing Page de Captação (Hero, História, Prova Social, CTA)
- `https://comitivaprime.com.br/excursoes` -> Lista de excursões ativas (Barretos, Jaguariúna, etc)
- `https://comitivaprime.com.br/historia` -> Galeria de edições anteriores (10+ anos) e fotos
- `https://comitivaprime.com.br/avaliacoes` -> Mural de depoimentos reais de clientes
- `https://comitivaprime.com.br/pacote/:id` -> O configurador de pacote (já existe, será a entrada do funil de conversão)

### URLs do Sistema (Frontend Web - Área Logada)
- `https://comitivaprime.com.br/login` -> Acesso de clientes e admin
- `https://comitivaprime.com.br/minhas-reservas` -> Área do cliente
- `https://comitivaprime.com.br/admin/*` -> Painel gerencial

### URLs da API (Backend)
- `https://api.comitivaprime.com.br/api/publico/eventos-ativos` -> Alimenta o CTA da Home
- `https://api.comitivaprime.com.br/api/publico/eventos-realizados` -> Alimenta a página de História/Galeria
- `https://api.comitivaprime.com.br/api/publico/avaliacoes` -> Alimenta o mural de depoimentos
- `https://api.comitivaprime.com.br/api/pacotes/*` -> Processa o cálculo e reserva

---

## 3. Estrutura da Landing Page Premium (Home)

A Home será focada 100% em conversão e prova social para a excursão de Barretos.

### Seção 1: Hero (A Primeira Impressão)
- **Visual:** Imagem de fundo imersiva em alta qualidade (arena de Barretos lotada ou galera animada no ônibus). Overlay escuro para leitura.
- **Copy:** "A Maior Experiência do Barretão. 10 Anos de Tradição."
- **Sub-copy:** "Viaje com a comitiva mais exclusiva do Brasil. Transporte premium, camarote, hospedagem e open bar em um pacote 100% personalizável."
- **CTA Principal:** "Garantir Minha Vaga" (Leva direto para o evento ativo retornado pela API).

### Seção 2: Prova Social (Os Números)
- **Visual:** Blocos minimalistas com contadores animados.
- **Dados:**
  - "10+ Edições Realizadas" (Fixo/Editorial)
  - "Mais de 5.000 Clientes Satisfeitos" (Puxado da API de reservas confirmadas)
  - "Nota 4.9/5 nas Avaliações" (Calculado da API de avaliações)

### Seção 3: Nossa História (O Diferencial)
- **Visual:** Linha do tempo elegante.
- **Conteúdo Editorial (Estático):**
  - "Desde 2016, nossa equipe transforma a viagem para a Festa do Peão de Barretos em uma experiência inesquecível. Não somos apenas um transporte, somos uma comitiva de amigos. Nossos fundadores começaram levando uma van de conhecidos, e hoje fretamos comboios de ônibus leito com estrutura de camarote móvel."

### Seção 4: O Que Está Incluso (Destaques do Pacote)
- **Visual:** Ícones premium (Lucide React).
- **Itens:** Transporte Leito, Hospedagem 4 Estrelas, Open Bar Premium, Acesso ao Parque, Suporte 24h.

### Seção 5: Depoimentos Reais (Confiança)
- **Visual:** Carrossel ou grid de cards de avaliação.
- **Dados:** Puxa as 3 últimas avaliações 5 estrelas aprovadas da rota `/api/publico/avaliacoes`.

### Seção 6: CTA Final
- **Copy:** "As vagas do 1º lote esgotam rápido. Monte seu pacote agora."
- **Botão:** "Montar Meu Pacote"

---

## 4. Próximos Passos de Implementação

Vou agora:
1. Criar o layout da `Home.tsx` (Landing Page Premium)
2. Criar `Historia.tsx` (Galeria de edições passadas)
3. Criar `AvaliacoesPublicas.tsx` (Mural de depoimentos)
4. Configurar o roteamento no React Router para separar a área pública da área logada
5. Adicionar SEO (Helmet) às páginas públicas
