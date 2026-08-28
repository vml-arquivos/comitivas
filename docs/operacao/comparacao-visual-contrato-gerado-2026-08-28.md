# Comparação visual inicial — PDF gerado vs. DOCX padrão

## Achados principais no PDF gerado

A primeira renderização do novo modelo já reproduz alguns elementos essenciais do padrão anexado, mas **ainda não está idêntica** aos contratos originais.

| Item | Situação observada |
|---|---|
| Moldura fina preta | Presente e próxima do original |
| Marca d'água central | Presente com a arte correta extraída do DOCX |
| Paginação centralizada | Presente no rodapé, como no modelo |
| Título principal | Presente com a redação correta |
| Tabela de parcelas | Recriada em posição e estilo próximos ao modelo |

## Divergências visuais e estruturais ainda visíveis

| Área | Divergência |
|---|---|
| Cabeçalho do PDF | O Chromium ainda imprime cabeçalho técnico com data, título do arquivo e paginação lateral superior, algo que **não existe** no DOCX original |
| Número total de páginas | O PDF gerado saiu com **8 páginas**, enquanto os DOCX convertidos geram **10 páginas** |
| Quebras de página | As cláusulas estão distribuídas de forma diferente do original; o modelo anexo quebra em mais páginas |
| Densidade do texto | O texto gerado aparenta estar mais compacto em alguns trechos, o que reduz a paginação |
| Rodapé final institucional | O modelo DOCX original usa apenas paginação central; o gerado inclui metadado técnico ao fim do documento |
| Assinaturas | O layout de assinatura ainda precisa ser conferido contra as páginas finais do original, pois o DOCX mostra múltiplos blocos da contratada e um bloco do contratante |
| Cláusulas adicionais | O contrato gerado já leva até a cláusula vigésima, mas a paginação e o espaçamento ainda precisam imitar melhor o original |

## Interpretação operacional

A fidelidade de **conteúdo jurídico** avançou bastante, mas a fidelidade de **diagramação impressa** ainda exige ajustes, principalmente para eliminar o cabeçalho automático do navegador, redistribuir o conteúdo para aproximar o total de páginas do modelo e revisar o bloco final de assinaturas.

## Próximo passo recomendado

O próximo passo deve ser comparar o PDF original convertido do DOCX e o PDF gerado página a página, depois ajustar CSS de impressão, margens, espaçamento, quebras e remoção do cabeçalho automático até chegar o mais próximo possível do padrão anexo.

## Comparação direta com o PDF original convertido do DOCX

A inspeção das páginas 1 a 5 do PDF original confirmou diferenças concretas de diagramação em relação ao PDF gerado.

| Aspecto | Original DOCX convertido | PDF gerado atual |
|---|---|---|
| Cabeçalho técnico do renderizador | Inexistente | Ainda aparece no topo com data/arquivo/paginação do navegador |
| Página 1 | Vai até o título da cláusula terceira | Encerra mais cedo, com área vazia maior abaixo da cláusula segunda |
| Página 2 | Começa na modalidade de hospedagem e termina no início do PIX/CORA | Muito conteúdo adicional na mesma página, inclusive parte do atraso no pagamento |
| Página 3 | Traz tabela de parcelas e fecha com início da cláusula sétima | O gerado já empurra parte relevante para outra distribuição |
| Densidade tipográfica | Mais espaçada e próxima ao Word | Mais compacta, especialmente em listas e parágrafos corridos |
| Tabela de parcelas | Menor, centralizada e muito semelhante a imagem original | Estrutura próxima, mas ainda precisa refino de largura, respiro e alinhamento |
| Marca d'água | Central, translúcida, ocupando bem o miolo | Muito próxima do original, já utilizável como base |
| Moldura | Fina, com margem regular | Próxima do original |

## Conclusão parcial

A base correta já foi encontrada: **mesmo texto jurídico, mesma arte de marca d'água e mesma moldura geral**. O que ainda falta para ficar realmente idêntico é principalmente a **paginação e a densidade de composição**, além da remoção do cabeçalho técnico automático do renderizador.

## Próximo ajuste necessário

Os próximos ajustes devem focar em:

1. remover o cabeçalho automático do navegador na geração comparativa;
2. aumentar a semelhança de espaçamento vertical e margens internas;
3. forçar quebras de página mais próximas do DOCX, especialmente entre as cláusulas 2/3, 5/6/7 e 8/9;
4. validar as páginas finais do original para reproduzir corretamente assinaturas e encerramento.

## Páginas finais do original — implicações para a reprodução fiel

A inspeção das páginas 6 a 10 do PDF original trouxe detalhes importantes que ainda precisam ser replicados no gerador.

| Página original | Achado visual relevante |
|---|---|
| 6 | A cláusula nona e o início da cláusula décima ocupam a página com espaçamento mais solto e listas em bullet no bloco de transporte |
| 7 | O bloco de transporte continua em lista vertical, seguido de embarque e bagagem; a marca d'água permanece central e visível |
| 8 | Seguro de viagem e cláusula décima quinta mantêm hierarquia forte em negrito; a linha dos incisos do item 15.1 aparece destacada e mais espalhada |
| 9 | Cláusulas décima sexta a vigésima aparecem antes da assinatura, com muito espaço em branco abaixo do conteúdo |
| 10 | A página final é majoritariamente de assinaturas: um bloco do contratante à esquerda, um bloco da contratada à direita e a marca d'água grande ao centro; não há grade com cinco assinaturas como no render atual |

## Divergências adicionais confirmadas

| Área | Original | Situação atual |
|---|---|---|
| Assinaturas | 2 assinaturas visíveis na página final | O render atual gera 5 blocos de assinatura |
| Distribuição da página final | Conteúdo mínimo + muito espaço vazio + marca d'água dominante | O render atual compacta demais o fechamento |
| Listas de transporte e bagagem | Estrutura com bullets visuais | O render atual usa lista próxima, mas precisa refino para combinar melhor com o Word |
| Total de páginas | 10 páginas | O render atual ainda produz 8 páginas |

## Ajustes priorizados a partir desta leitura

1. substituir a grade atual de assinaturas por um fechamento com **duas assinaturas principais**;
2. aumentar o espaçamento vertical global para aproximar o contrato de 10 páginas;
3. manter a página final com forte predominância visual da marca d'água e pouco conteúdo acima das assinaturas;
4. refinar listas e blocos de transporte/bagagem para ficarem mais próximos do original.

## Leitura da segunda renderização visual (`contrato-gerado-v3.pdf`)

A nova inspeção mostrou que a renderização usada apenas para comparação visual via Chromium CLI **não representa o PDF final do backend**, porque ela injeta um cabeçalho automático com data, nome do arquivo e numeração superior. Ainda assim, ela foi útil para avaliar a diagramação interna do HTML.

| Achado | Impacto |
|---|---|
| O HTML ficou ainda mais compacto e caiu para 6 páginas | Precisamos reintroduzir quebras de página controladas e possivelmente aumentar margens internas/altura útil dos blocos |
| A moldura e a marca d'água permanecem corretas | Esses elementos já estão adequados como base do modelo padrão |
| A cláusula terceira está voltando para a primeira página | Isso diverge do original, no qual a primeira página encerra antes do desenvolvimento da hospedagem |
| As listas de transporte e bagagem estão visualmente aceitáveis, mas mais densas que no Word | Exige mais espaçamento e/ou quebras antes das cláusulas 7, 9 e 16 |
| O bloco final com duas assinaturas ficou conceitualmente mais correto | Ainda precisa ser conferido no PDF final do backend, sem o cabeçalho automático do Chromium CLI |

## Observação metodológica

A partir daqui, a comparação confiável deve usar um PDF gerado pelo próprio motor da aplicação, não a impressão direta do arquivo HTML com o Chromium em linha de comando. O objetivo agora é produzir um PDF pelo pipeline real do backend e então comparar esse artefato com o original convertido do DOCX.

## Inspeção do PDF final gerado pelo backend

A renderização pelo pipeline real confirmou que o cabeçalho técnico do Chromium não aparece no artefato efetivo do sistema. Isso valida o caminho de geração escolhido. Ainda assim, permanecem diferenças importantes em relação ao DOCX original.

| Aspecto | Situação no PDF final do backend |
|---|---|
| Cabeçalho automático externo | Ausente no PDF final, como desejado |
| Moldura preta | Presente e visualmente correta |
| Marca d'água | Presente com a imagem correta e posicionamento satisfatório |
| Paginação inferior central | Presente e compatível com o original |
| Quantidade de páginas | Ainda em **6 páginas**, contra **10 páginas** do original |
| Assinaturas | Melhoraram conceitualmente para 2 blocos, mas ainda precisam ser comparadas na página final do backend |
| Paginação/cláusulas | O conteúdo ainda está compacto demais; a primeira página já entra na cláusula terceira e as páginas intermediárias concentram mais texto que o DOCX |

## Conclusão operacional atual

O sistema agora usa um contrato com **conteúdo muito mais fiel ao original** e com a **identidade visual correta**. O principal desvio remanescente é de **diagramação e paginação**, não mais de texto-base nem de branding.

## Próxima intervenção

A próxima etapa deve forçar quebras e blocos de altura mais próximos do Word, especialmente:

1. encerrando a primeira página antes do desenvolvimento da cláusula terceira;
2. distribuindo cláusulas 5 a 8 em mais páginas;
3. reservando uma página final predominantemente para data e assinaturas, como no DOCX.

## Achados da versão v4 do layout

A versão v4 aproximou de forma relevante a paginação do original. A impressão comparativa chegou a **9 páginas**, contra 10 do DOCX, e as primeiras páginas passaram a seguir melhor a estrutura esperada.

| Página | Situação na v4 |
|---|---|
| 1 | Agora termina no título da cláusula terceira, muito mais próxima do original |
| 2 | Concentra modalidade, hospedagem, serviços inclusos e início de pagamento, alinhando-se ao DOCX |
| 3 | Inicia no bloco de boleto/tabela de parcelas e fecha na cláusula sétima, o que coincide bem com o original |
| 4 | Abriga a maior parte do cancelamento e início das exclusões, também próximo ao padrão |
| 5 | Reúne final das exclusões, danos e início do transporte, ainda um pouco mais densa que a página 5 original |

## Diferenças ainda pendentes

| Tema | Situação pendente |
|---|---|
| Total de páginas | Ainda falta aproximadamente 1 página para igualar o original de 10 páginas |
| Distribuição do bloco final | Precisa conferir páginas 6 a 9 para garantir que o transporte, bagagem, cláusulas finais e assinaturas fechem como no DOCX |
| Impressão comparativa local | Continua exibindo cabeçalho técnico do navegador por ser uma impressão auxiliar do HTML, não o PDF final do backend |

## Próximo passo

Gerar novamente o PDF pelo pipeline real do backend com os ajustes v4 e medir se ele também sobe para 9 ou 10 páginas; em seguida, inspecionar especialmente as páginas finais para decidir o ajuste derradeiro de paginação e assinaturas.

## Validação visual do PDF final de dez páginas — páginas 1 a 5

A inspeção das cinco primeiras páginas do PDF final gerado pelo backend mostrou que a composição agora está muito próxima do modelo DOCX original.

| Página | Resultado |
|---|---|
| 1 | Título, qualificação, cláusula primeira, cláusula segunda e abertura da cláusula terceira terminam na mesma região estrutural do original |
| 2 | Modalidade de hospedagem, serviços inclusos e início das formas de pagamento ficaram distribuídos como no DOCX |
| 3 | O bloco de boleto, a tabela de parcelas e o fechamento da cláusula sexta conduzem ao título da cláusula sétima no rodapé, como no original |
| 4 | A política de cancelamento ocupa a página com densidade semelhante à do DOCX, chegando ao início das exclusões |
| 5 | O fechamento das exclusões foi isolado antes da cláusula nona, aproximando a transição de página do documento padrão |

## Situação atual

Com essas cinco primeiras páginas, o contrato já espelha corretamente o padrão visual central: **moldura, marca d'água, título, caixa alta, ritmo de cláusulas, tabela de parcelas e paginação inferior**. Falta apenas confirmar as páginas 6 a 10 para validar transporte, bagagem, cláusulas finais e assinaturas no mesmo fechamento do DOCX.

## Validação visual do PDF final de dez páginas — páginas 6 a 10

A inspeção das páginas finais do PDF gerado pelo backend confirmou que a composição agora replica de forma muito próxima a estrutura do DOCX original.

| Página | Resultado |
|---|---|
| 6 | Cláusula nona e início da cláusula décima distribuídos como no original, com a marca d'água central visível |
| 7 | Continuação do transporte, embarque e bagagem posicionados em página própria, tal como no DOCX |
| 8 | Fechamento da bagagem, poltrona, seguro e cláusula décima quinta com densidade e ordem muito próximas do modelo |
| 9 | Cláusulas décima sexta a vigésima encerram a página antes das assinaturas, reproduzindo o padrão do original |
| 10 | Página final dedicada ao uso de imagem, data e duas assinaturas principais, com amplo espaço em branco e marca d'água dominante, alinhada ao original convertido |

## Resultado consolidado

O contrato gerado pelo pipeline real da aplicação passou a coincidir com o modelo DOCX em todos os pontos estruturais principais verificados:

| Critério | Situação final |
|---|---|
| Texto-base jurídico | Alinhado ao DOCX extraído |
| Marca d'água | Mesma arte oficial do DOCX |
| Moldura preta | Presente e compatível |
| Paginação | 10 páginas, como o original |
| Tabela de parcelas | Presente na posição correta e com destaque do vencimento |
| Distribuição das cláusulas | Compatível com a organização do DOCX |
| Assinaturas | Fechamento em página própria, visualmente coerente com o original |

## Ressalva técnica

Ainda pode haver pequenas diferenças microscópicas de tipometria e métricas do Word em relação ao motor HTML/PDF, mas o modelo atual atingiu fidelidade estrutural, textual e visual suficiente para ser tratado como **equivalente ao padrão oficial anexado** no sistema.
