# Análise visual — contrato padrão de hospedagem 2026

## Identidade visual e composição

O documento usa **papel timbrado formal** com moldura preta fina em toda a página, paginação centralizada no rodapé e uma **marca d'água central grande e translúcida** com o logotipo da Excursão das Comitivas em vermelho e azul, ocupando boa parte do miolo sem comprometer a leitura. O texto é diagramado em bloco único, alinhado à esquerda, com títulos em caixa alta e negrito. As cláusulas usam numeração jurídica progressiva e subtítulos também em caixa alta e negrito.

## Título e abertura

O título exibido na primeira página é:

> CONTRATO DE PACOTE DE VIAGEM- EXCURSÃO DAS COMITIVAS 2026

A abertura contém a seção **QUALIFICAÇÃO DAS PARTES**, seguida da descrição de que as partes celebram contrato para prestação de serviços de **HOSPEDAGEM/TRANSPORTE**. Em seguida há qualificação da contratada e do contratante em parágrafo corrido.

## Dados fixos observados da contratada

| Campo | Conteúdo observado |
|---|---|
| Nome | HENRIQUE SANTOS CUNHA |
| CNPJ | 39.763.571/0001-13 |
| Endereço | QR 502 conjunto 20 – Samambaia Sul/DF |
| CEP | 72.210-420 |
| E-mail | excursaodascomitivas@gmail.com |

## Estrutura contratual observada nas páginas 1 a 5

| Página | Conteúdo principal |
|---|---|
| 1 | Qualificação das partes; cláusula primeira com objeto do contrato; cláusula segunda com dados da hospedagem; início da cláusula terceira |
| 2 | Modalidade de hospedagem; regras de substituição; quartos compartilhados; banheiros; piscina/ventilador/climatizador; roupa de cama; cláusula quarta com serviços inclusos; cláusula quinta com formas de pagamento |
| 3 | Parcelamento por boleto com tabela de parcelas e vencimentos; cartão de crédito; confirmação da reserva; inadimplência; cláusula sexta sobre atraso; início da cláusula sétima sobre cancelamento e reembolso |
| 4 | Continuação completa da política de cancelamento com faixas percentuais e no-show |
| 5 | Continuação da política; cláusula oitava sobre exclusões |

## Campos e variáveis que precisam existir no gerador

| Grupo | Campos identificados |
|---|---|
| Qualificação do contratante | nome, nacionalidade, estado civil, profissão, data de nascimento, RG, CPF, endereço/residência, telefone, e-mail |
| Dados da hospedagem | check-in, check-out |
| Modalidade | camping, quarto com ventilador compartilhado, quarto com climatizador compartilhado |
| Local da hospedagem | Chácara Recanto Novo Encantado ou Santa Thereza |
| Serviços inclusos | hospedagem, café da manhã, almoço, open bar, translado interno |
| Pagamento | valor total, valor por extenso, modalidade escolhida, chave PIX, banco, parcelas, vencimentos |

## Conteúdo material que precisa ser preservado fielmente

O contrato de hospedagem estabelece, entre os pontos visíveis nas páginas analisadas, que o pacote compreende hospedagem, café da manhã, almoço, open bar e translado interno entre a chácara e o Parque do Peão; que o open bar é exclusivo para maiores de 18 anos; que a hospedagem pode ocorrer em modalidades distintas; que a ocupação dos quartos é compartilhada; que a confirmação da reserva depende do pagamento; que inadimplência não garante usufruto; e que existe uma política escalonada de cancelamento com retenções percentuais por janela temporal.

## Requisitos de fidelidade para implementação

O gerador não deve apenas aproveitar o conteúdo como referência textual. Ele precisa reproduzir **o mesmo enquadramento visual, a mesma hierarquia de títulos, a marca d'água central, a paginação, o texto jurídico e a separação das cláusulas**. Também deve suportar tabela de parcelas com vencimentos dentro do corpo do contrato, como no original.
