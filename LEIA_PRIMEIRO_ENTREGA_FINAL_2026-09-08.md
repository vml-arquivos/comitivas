# ENTREGA FINAL — EXCURSÃO DAS COMITIVAS

Base integrada: `main@cc43b4f09dfd2bbf392bc55ebb85d0637de23a2d`.

Este pacote contém o repositório completo atualizado para substituição do conteúdo atual, incluindo:
- Área do Cliente 360º;
- histórico, pagamentos, contratos, documentos, boletos e atendimento;
- cancelamento, reinício e solicitação de troca de pacote com preservação de histórico;
- navegação e comparação/seleção de pacotes;
- revisão mobile e instalação do PWA;
- continuidade da redefinição de senha;
- Brevo API HTTPS + SMTP 2525 fallback;
- Ficha 360º administrativa, DEV, convites, gateway e boleto manual existentes.

Não há migration nova nesta rodada. As migrations `0010` e `0011` permanecem no pacote.

Antes do redeploy: backup PostgreSQL, volume persistente `/app/uploads`, variáveis Runtime no Coolify e `VITE_WHATSAPP_NUMERO` em Build Time.

Leia também:
- `VALIDACAO_FINAL_AREA_CLIENTE_MOBILE_2026-09-08.md`
- `COOLIFY_PRODUCAO_ATUAL_2026-09-08.txt`
- `docs/operacao/area-cliente-360.md`
