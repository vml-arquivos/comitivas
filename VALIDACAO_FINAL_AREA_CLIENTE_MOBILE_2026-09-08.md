# Validação final — Área do Cliente 360º, Mobile e Pacotes

Base de integração conferida: `main@cc43b4f09dfd2bbf392bc55ebb85d0637de23a2d`.

## Entregas incluídas
- Área do Cliente 360º em `/minha-conta`.
- Visão geral, pacotes, viagens, pagamentos, contratos, documentos, histórico, dados e atendimento.
- Cancelamento/reinício/troca com preservação de contratos validados e pagamentos.
- Liberação de inventário somente em encerramentos precoces elegíveis.
- Registro de solicitações na Ficha 360º.
- Vitrine de pacotes com filtros e escolha direta.
- Configurador mobile com sequência clara e CTA fixo.
- Cabeçalho mobile com logo ampliada e acesso direto à instalação do app.
- Página PWA revisada para Android/iPhone.
- Redefinição de senha com continuidade para login.
- Brevo API HTTPS como transporte principal e SMTP 2525 como fallback com timeout.

## Gates executados neste ambiente
- Parse/transpilação TypeScript/TSX: **96 arquivos de código, 0 erros sintáticos**.
- JSON: package files, manifest PWA, Capacitor e journal Drizzle parseados com sucesso.
- Migrations: varredura estática sem `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` ou `DELETE FROM`.
- Scripts shell: sintaxe validada.
- Segredos: varredura sem chave SMTP/API real incorporada ao código-fonte.
- Não existe migration nova nesta rodada; usa as estruturas já criadas em `0010`/`0011`.

## Limite da validação local
O `npm ci` integral não concluiu neste runtime por indisponibilidade/timeout do registro de pacotes. Portanto o gate definitivo de `npm run build` deve ser confirmado pelo build do Coolify antes da promoção do novo container para produção. O Dockerfile já executa `npm ci` + `npm run build` e interrompe o deploy em caso de falha.

## Gate de produção recomendado
1. Backup PostgreSQL.
2. Confirmar volume persistente em `/app/uploads`.
3. Substituir o repositório pelo conteúdo deste pacote.
4. Commit/push na `main` ou branch de release.
5. Redeploy Coolify.
6. Confirmar build verde e `/api/health` OK.
7. Smoke: login, recuperação de senha, `/minha-conta`, explorar pacote, checkout, contrato, boleto/documento, atendimento e cancelamento precoce em uma reserva de teste.
