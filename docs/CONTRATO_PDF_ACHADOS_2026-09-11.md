# Achados da inspeção do contrato PDF anexado

Arquivo analisado: `minuta-ln0lvm3t6jlndvp79qcz5wi0-v1.pdf`.

O documento possui 10 páginas em A4 e apresenta conteúdo textual legível, mas a composição visual está inadequada. A primeira página começa muito próxima do topo, usa uma moldura pesada e termina a seção com grande área vazia. As páginas seguintes repetem o problema: há quebra de página antes de completar o espaço útil, grandes áreas brancas e marca d'água muito forte atravessando o conteúdo. A página 4 termina com uma cláusula parcialmente continuada na página 5, o que evidencia paginação sem controle de bloco.

A inspeção textual confirmou que o PDF contém dados preenchidos automaticamente da contratação, incluindo evento, destino, período, datas, pacote, valor, forma de pagamento, reserva, contratante, CPF, endereço e telefone. Entretanto, a modalidade exibida no resumo é `Quarto com ar-condicionado`, enquanto a cláusula aparece como `QUARTO COM CLIMATIZADOR COMPARTILHADO`, indicando necessidade de normalização da terminologia a partir do pacote escolhido.

O contrato também inclui cláusulas genéricas de hospedagem, transporte, pagamento e exclusões. A correção deve manter apenas os serviços efetivamente escolhidos no pacote na seção de objeto/serviços, sem apagar cláusulas jurídicas necessárias. Contratos já assinados devem continuar imutáveis; a melhoria deve aplicar-se a novas versões ou minutas não assinadas.

O gerador atual passa por `server/services/contratoService.ts`, `packages/contract-engine/contratoModeloPadrao.ts` e `packages/contract-engine/brandedPdfLayout.ts`. O PDF é montado com `pdf-lib` e o layout atual usa moldura/marca d'água, que devem ser substituídas ou reduzidas com margens seguras, tipografia consistente, cabeçalho compacto, blocos que não sejam quebrados indevidamente e rodapé de página.
