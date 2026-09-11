# Matriz de cláusulas — Contrato 2026.1

Os dois DOCX fornecidos foram preservados sem modificação. A auditoria indicou conteúdo praticamente idêntico, com diferença apenas no comprimento da linha de assinatura; por isso o runtime usa um único contrato modular combinado.

| Módulo | Fonte preservada | Representação runtime | Estado |
| --- | --- | --- | --- |
| Qualificação das partes | Hospedagem e transporte | Dados da contratada e contratante no snapshot | Implementado |
| Objeto e serviços | Hospedagem e transporte | Cláusulas 1 e 4; lista de serviços | Implementado |
| Hospedagem | Hospedagem | Modalidade, local e período congelados | Implementado |
| Transporte rodoviário | Transporte | Flag explícita `transporte_rodoviario`; não há inferência por nome | Implementado |
| Translado local | Hospedagem e transporte | Serviço incluso descrito no snapshot | Implementado |
| Preço e pagamento | Composição do pacote e operação | Ledger em centavos, forma, parcelas e cronograma | Implementado |
| Cancelamento e reembolso | Fonte original | Faixas preservadas, sem preencher lacunas | Pendente aprovação |
| Danos, embarque e bagagem | Transporte/hospedagem | Módulos condicionais no PDF | Implementado parcialmente |
| Regras de convivência | Cartaz oficial e conteúdo runtime | `regras-2026.1.json`, endpoint público e contrato | Implementado |
| Imagem | Fonte visual fornecida | Página/asset separado; consentimento opcional | Implementado parcialmente |
| Menor de idade | Não modelado nas fontes | Fluxo ainda não habilitado | Pendente |
| Assinatura | Evidência operacional | Assinatura eletrônica com autenticação por código | Implementado |

A expressão “implementado” significa que o sistema registra o módulo no snapshot e no PDF; não constitui parecer jurídico nem aprovação das lacunas listadas abaixo.
