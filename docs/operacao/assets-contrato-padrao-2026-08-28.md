# Assets visuais dos contratos padrão

A inspeção interna dos dois DOCX mostrou que ambos usam os mesmos dois assets incorporados e têm o mesmo conteúdo textual/layout-base.

| Asset | Dimensão | Função observada |
|---|---:|---|
| `word/media/image2.jpeg` | 1002 × 953 px | Marca d'água central em página, com logotipo circular Excursão das Comitivas em azul/vermelho e fundo claro; o DOCX usa essa imagem em shape VML com posicionamento central, relativo às margens, largura 510 pt, altura 485,05 pt e z-index negativo |
| `word/media/image1.png` | 639 × 88 px | Tabela de parcelas/vencimentos com borda preta, texto das parcelas em preto e rótulos `VENCIMENTO` em vermelho |

O renderer atual não possui a marca d'água JPEG incorporada nem usa o PNG da tabela de parcelas; ele usa apenas `logo-pdf.png` no cabeçalho e cria uma tabela HTML genérica com destaque azul/vermelho. Para fidelidade, o JPEG precisa entrar como background/elemento absoluto de baixa opacidade em todas as páginas do contrato, enquanto a tabela de parcelas deve ser recriada com a mesma estrutura, bordas, tipografia e cor vermelha dos vencimentos, usando dados dinâmicos do snapshot.
