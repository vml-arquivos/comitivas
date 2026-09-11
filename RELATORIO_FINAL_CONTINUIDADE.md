# Relatório final — continuidade técnica da Excursão das Comitivas

Data da validação: 08/09/2026 (UTC)

## 1. Base utilizada

- ZIP analisado e utilizado: `comitivas-main (11).zip`.
- SHA-256 do ZIP de origem: `91ec7759a287074afa17d3371129d5b42b4b5e4e71b5ddb914572d245100eb19`.
- GitHub consultado: `vml-arquivos/comitivas`, branch `main`.
- HEAD remoto encontrado: `b8946ce70ec49c149247a90b092ac7854827071b` (`feat: restore sales team and package operations`).
- O comentário do ZIP aponta para o mesmo commit e a árvore do ZIP coincide com a `main`. Portanto, não houve substituição de código novo por base antiga.

## 2. Diagnóstico e implementação

### Cadastro mínimo

- Cadastro público, edição do próprio perfil, criação administrativa e venda interna agora exigem somente nome, e-mail, CPF, telefone, data de nascimento e endereço, além da senha na abertura da conta.
- RG, estado civil, profissão, nacionalidade e outros campos legados deixaram de ser solicitados, validados ou enviados no fluxo padrão.
- As colunas históricas foram preservadas no banco. Nenhum dado existente foi apagado e nenhuma migration destrutiva foi criada.
- Contratos e telas comuns passaram a usar somente os dados mínimos.
- Documentos de identificação continuam protegidos no módulo de documentos da Ficha 360º e são exigíveis somente quando o processo operacional realmente necessitar deles.

### Equipe e vendedores

- Convites permanecem temporários, de uso único, armazenados por hash e revogáveis.
- ADMIN pode convidar somente VENDEDOR; DEV pode convidar os perfis autorizados, inclusive DEV.
- Links comerciais passaram a usar token assinado com finalidade específica, sem expor o ID interno do vendedor.
- Cada cliente possui seu próprio lead; o link reutilizável do vendedor não reaproveita um card entre clientes diferentes.
- A primeira atribuição válida de vendedor é preservada. Refresh, cadastro, login, retorno ao checkout, reserva, contrato e pagamento não permitem que o navegador troque a atribuição gravada no backend.
- Reservas e dashboards de vendedor são filtrados no backend. A venda mostra o vendedor responsável e o contrato congela nome/e-mail do vendedor no snapshot.

### Contratos

- Os dois modelos oficiais continuam no mesmo motor, com o bloco de transporte condicionado pelo modelo/forma de contratação do pacote.
- O snapshot é persistido, canonizado e identificado por SHA-256 antes da validação.
- Cliques repetidos reutilizam a mesma versão pendente quando o snapshot não mudou; advisory lock evita criação concorrente duplicada.
- Contrato validado não é regenerado silenciosamente. Download usa a versão vigente, confere o hash do PDF e bloqueia arquivo divergente.
- Caminhos históricos de storage são remapeados com contenção no diretório configurado, preservando contratos antigos sem permitir travessia de diretório.
- OTP, versão, protocolo, aceites, evidências, PDF, hash, aprovação administrativa e histórico permanecem integrados.
- O PDF somente passa a constar como disponível depois de criado e armazenado na validação eletrônica.

### Parcelamento e pagamentos

- A configuração existente do pacote passou a aceitar teto de parcelas de boleto/cartão, data limite, prazo de segurança, multa, juros de mora, taxa e juros do cartão.
- A data efetiva é a menor entre a data limite comercial e a data da viagem descontado o prazo de segurança.
- O cálculo usa meses reais de calendário, fuso de São Paulo e o dia efetivo do vencimento; vencimento após o limite é rejeitado.
- O backend recalcula no detalhe da reserva, na simulação, na preparação do contrato e na criação da cobrança. Quantidade manipulada no navegador é rejeitada.
- O checkout apresenta valor-base, desconto, taxa, juros, total, parcela e vencimentos retornados pelo servidor antes da confirmação.
- Idempotência de pagamentos, parcelas e webhooks foi reforçada; duplo clique não cria cobrança duplicada.
- O boleto manual foi preservado: somente após cadastro aprovado com evidência, contrato validado e aprovação administrativa a central é liberada para anexação e envio pela equipe.
- O adaptador Cora existente oferece PIX e boleto. Cartão configurado é calculável pelo domínio, mas não é oferecido como cobrança enquanto não houver provedor compatível; o sistema informa o motivo em vez de simular uma integração inexistente.

### Segurança e governança

- DEV ficou invisível no backend para ADMIN, VENDEDOR e CLIENTE em listas, busca, acesso direto, alteração, status, exclusão, convites, equipe, exportações e contadores revisados.
- O bootstrap remoto de DEV foi desativado.
- ADMIN não pode alterar/desativar/excluir outro ADMIN; essa operação é exclusiva de DEV.
- IDOR de reservas, contratos, documentos e operações comerciais foi endurecido.
- Aprovação de cadastro somente é verdadeira com usuário ativo, status aprovado, data e responsável registrados. Registros antigos inconsistentes não recebem data inventada.
- Exclusão física ocorre somente sem dependências; caso contrário, o registro é arquivado com sessões revogadas e histórico preservado.
- Credenciais do gateway continuam mascaradas e exclusivas de DEV.
- A arquitetura de e-mail Brevo API HTTPS com fallback SMTP 2525 foi preservada.

## 3. Arquivos alterados

### Backend e domínio

- `server/routes/admin.ts`
- `server/routes/auth.ts`
- `server/routes/cliente.ts`
- `server/routes/contratos.ts`
- `server/routes/jornada.ts`
- `server/routes/pacotes.ts`
- `server/routes/pagamentos.ts`
- `server/routes/publico.ts`
- `server/security/governance.ts` (novo)
- `server/services/authService.ts`
- `server/services/contratoService.ts`
- `server/services/notificationProvider.ts`
- `server/services/relatorioService.ts`
- `packages/contract-engine/contratoModeloPadrao.ts`

### Frontend

- `apps/web/src/components/LeadCapture.tsx`
- `apps/web/src/layouts/AdminLayout.tsx`
- `apps/web/src/pages/Cadastro.tsx`
- `apps/web/src/pages/ConviteAcesso.tsx`
- `apps/web/src/pages/admin/Boletos.tsx`
- `apps/web/src/pages/admin/ClienteFicha.tsx`
- `apps/web/src/pages/admin/Clientes.tsx`
- `apps/web/src/pages/admin/Comissoes.tsx`
- `apps/web/src/pages/admin/Contratos.tsx`
- `apps/web/src/pages/admin/EquipeAcessos.tsx`
- `apps/web/src/pages/admin/Eventos.tsx`
- `apps/web/src/pages/admin/Pagamentos.tsx`
- `apps/web/src/pages/admin/Vendas.tsx`
- `apps/web/src/pages/cliente/Checkout.tsx`
- `apps/web/src/pages/cliente/ConfiguradorPacote.tsx`
- `apps/web/src/pages/cliente/DadosCadastrais.tsx`
- `apps/web/src/pages/cliente/MinhaConta.tsx`
- `apps/web/src/utils/checkoutIntent.ts`

### Testes

- `tests/contratoHtml.spec.ts`
- `tests/contratoService.spec.ts`
- `tests/governance.spec.ts`
- `tests/sellerReferral.spec.ts` (novo)

## 4. Funções preservadas

- Identidade visual do site e organização modular do menu administrativo.
- Ficha 360º, CRM, vendas internas, cupons, comissões, reservas, histórico e documentos.
- Motor único dos contratos, validação OTP, evidências e aprovação administrativa.
- Pagamentos, parcelas, reconciliação, boleto manual e integração Cora já existente.
- Recuperação de senha, confirmação de e-mail, Brevo, storage, Docker/Coolify e migrations publicadas.

## 5. Funções realmente novas

- Token assinado reutilizável de indicação de vendedor e persistência local/servidor da referência.
- Simulação autoritativa de condição de pagamento por reserva.
- Cálculo de data limite efetiva, vencimentos mensais e encargos configurados.
- Governança central para cadastro mínimo, aprovação com evidência, invisibilidade de DEV e gate do boleto.
- Reutilização idempotente da versão contratual pendente pelo hash do snapshot.

## 6. Migrations e compatibilidade

- Nenhuma migration nova foi necessária.
- Foram reutilizados os campos e o JSONB já presentes nas migrations `0011` e `0012`.
- Não houve `DROP`, `TRUNCATE`, `DROP COLUMN`, limpeza em massa nem alteração de dados de produção.
- Antes do deploy real, manter o procedimento operacional: backup lógico do PostgreSQL, snapshot do volume de uploads e ensaio em clone do banco.

## 7. Resultados de validação

### Linha de base no commit original

- `npm ci`: aprovado, 341 pacotes.
- `npm run typecheck:server`: aprovado.
- `npm run lint`: aprovado.
- `npm test -- --run`: 5 arquivos e 26 testes aprovados.
- `npm run build`: aprovado (`build:server`, `build:seed`, `build:web`).

### Resultado final

- `npm run typecheck:server`: aprovado.
- `npm run lint`: aprovado.
- `npm test -- --run`: 7 arquivos e 46 testes aprovados.
- `npm run build`: aprovado; servidor 560,8 kB, seed 46,6 kB e web com 1.459 módulos transformados.
- `apps/mobile: npm ci`: aprovado, 263 pacotes.
- `apps/mobile: npm run build`: aprovado, 1.483 módulos transformados.
- `git diff --check HEAD`: aprovado, sem erro de whitespace.
- Busca por textos visuais desnecessários de IA: nenhum resultado nos fontes web.
- Artefatos gerados de `dist` foram removidos da entrega; o Dockerfile recompila a aplicação.

## 8. Limitações reais

- Não havia conexão autorizada ao banco de produção, Coolify, Cora Stage, Brevo ou WhatsApp. Portanto, nenhum dado real foi alterado e nenhum envio/cobrança externa foi disparado.
- O ambiente local não possui Docker nem executável Chromium. A geração real do PDF não pôde ser executada aqui; HTML, snapshots, versões e chamadas de renderização passaram nos testes e no build. O Dockerfile de produção instala Chromium e define o caminho usado pelo renderizador. O smoke test de PDF no contêiner final continua obrigatório antes de liberar tráfego.
- Não existe provedor de cartão integrado: o Cora atual atende PIX/boleto. As regras comerciais de cartão estão calculadas e validadas no domínio, mas a cobrança por cartão permanece indisponível até integração/homologação de um provedor compatível.
- E2E com navegador, banco real e serviços externos deve ser feito em homologação; os testes locais não substituem essa etapa operacional.

## 9. Validação manual antes do deploy

1. Subir o ZIP em ambiente de homologação com clone do PostgreSQL e cópia do volume de uploads.
2. Rodar as migrations já existentes pelo procedimento atual, sem habilitar execução automática não prevista.
3. Entrar como ADMIN e confirmar que nenhum DEV aparece em equipe, usuários, busca, URL direta ou exportação.
4. Criar convite de vendedor, concluir o cadastro e gerar o link individual em **Equipe & Acessos**.
5. Abrir o link em navegador limpo, captar o contato, criar a conta, reservar e confirmar o mesmo vendedor na venda, contrato e comissão.
6. Criar cliente apenas com os campos mínimos; aprovar; gerar os modelos hospedagem e transporte; visualizar; validar por OTP; aprovar como ADMIN; abrir e baixar os PDFs.
7. Confirmar que repetir a preparação não cria versão duplicada e que contrato assinado não é alterado.
8. Simular boleto no início, meio e fim do prazo; confirmar que o último vencimento não ultrapassa o limite/viagem.
9. Liberar boletos manualmente, anexar arquivos, enviar e registrar pagamento parcial/quitação sem duplicidade.
10. Testar Cliente A contra IDs de Cliente B e Vendedor A contra vendas do Vendedor B.
11. Conferir home, pacotes, login, cadastro, Minha Conta e checkout em 320, 360, 390, 430, 768 px e desktop.
12. Executar o smoke test no contêiner Coolify e validar healthcheck, logs, storage persistente, Brevo e Cora Stage.

## 10. Resumo e mensagem de commit sugerida

Resumo: reduz o cadastro aos dados essenciais, protege a atribuição comercial por link assinado, corrige versionamento/abertura dos contratos, torna parcelamento autoritativo por data e reforça RBAC, IDOR, boleto e idempotência sem alterar o schema.

Mensagem sugerida:

`fix: secure seller attribution, contracts and dynamic installments`

## 11. Integridade da entrega

O SHA-256 do ZIP final é fornecido no arquivo `.sha256` entregue ao lado do pacote e na mensagem final. Ele é calculado somente depois que este relatório já está dentro do ZIP.
