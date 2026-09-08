# Entrega final — Excursão das Comitivas

Base remota conferida: `main@f2894038f83bb85a2494bb26354d111dd8b3943b`.

Este pacote consolida as atualizações solicitadas após essa base, incluindo:

- visual premium preservado;
- Ficha 360º do cliente e acervo documental;
- papel DEV/superacesso e isolamento de DEV para administradores;
- convites para administradores/vendedores;
- governança e auditoria;
- vínculo de modelo de contrato ao pacote;
- boleto bancário manual após aprovação cadastral e validação contratual;
- parcelas, PDFs de boleto, registros de envio e comprovantes;
- controle financeiro na Ficha 360º;
- configuração de gateway pelo painel DEV com cofre criptografado;
- migration `0011_governanca_dev_gateway_boleto_manual.sql`.

## Validação executada no empacotamento

- `git diff --cached --check`: PASS
- parse sintático dos arquivos TS/TSX/MTS: PASS
- `drizzle/meta/_journal.json`: JSON válido e inclui `0011`
- gate estático da migration: sem `DROP TABLE`, `DROP COLUMN` ou `TRUNCATE TABLE`

## Gate obrigatório antes do deploy

Execute `./VALIDAR_ANTES_DO_DEPLOY.sh` em ambiente com acesso ao npm registry e banco de homologação.

Não foram incluídos: `.git`, `node_modules`, `dist`, uploads reais ou arquivos `.env` com segredos. `.env.example` foi preservado.
