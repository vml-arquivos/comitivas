# Relatório de implementação — nova especificação

**Projeto:** Excursão das Comitivas
**Data:** 6 de setembro de 2026
**Regra aplicada:** zero regressão e zero quebra; mudanças incrementais sobre os fluxos existentes.

## Escopo executado

A Home foi mantida como página institucional principal, mas passou a priorizar o CTA de excursões abertas e a exibir preço inicial quando a API pública retornar modalidades e valores. A vitrine recebeu suporte a URL singular de campanha (`/excursao/:eventoSlug`), resolução por slug, canonical e metadados Open Graph coerentes. A navegação pública foi ajustada para tablets, com menu acessível e rótulos coerentes para cliente, vendedor e administrador.

O login continua usando cookie HttpOnly e deixou de depender de token no corpo JSON. Após a autenticação, o cliente é encaminhado ao destino solicitado quando seguro; sem destino, clientes vão para a conta e vendedores/administradores para o painel. Contas pendentes de confirmação são encaminhadas para o fluxo de confirmação. O cadastro e a confirmação foram alinhados ao contrato cookie-only, e foi adicionado suporte global a `prefers-reduced-motion`.

O painel de contratos agora distingue visualização inline e download do PDF final. A área do cliente também oferece as duas ações. O backend preserva o endpoint legado de download e aceita `?inline=1`, sem criar uma segunda implementação de geração de PDF. O modelo jurídico oficial passa a incluir as cláusulas de transporte rodoviário, embarque, bagagem, poltrona, seguro e atrasos somente quando a flag autoritativa do snapshot indica transporte contratado. Sem transporte, o contrato não renderiza essas cláusulas e mantém a exclusão expressa do serviço.

A consulta de reservas do vendedor foi liberada somente para `GET /admin/reservas` e recebe filtro obrigatório por `vendedor_id`; todas as demais operações administrativas continuam protegidas para administradores. O consumo concorrente de cupons passou a respeitar também a validade temporal no update atômico, e percentuais/valores inválidos são rejeitados no CRUD e no motor de preço. O desconto administrativo mantém reais e centavos sincronizados.

A confirmação OTP passou a registrar tentativas inválidas sem abortar a transação que incrementa o contador, esgotando o desafio no limite configurado. A solicitação de OTP rejeita documentos que não estejam em estado preparável/validável.

## Validação

| Gate | Resultado |
|---|---|
| `npm run typecheck:server` | Aprovado |
| `cd apps/web && npx tsc --noEmit` | Aprovado |
| `npm run lint` | Aprovado; o script atual é o typecheck do workspace web |
| `npm test -- --run` | Aprovado: 5 arquivos, 26 testes |
| `npm run build` | Aprovado: servidor, seed e web |
| `git diff --check` | Aprovado após correção do relatório |
| `npm run db:verify-contract-fields` | Não executado com sucesso localmente: o script exige `DATABASE_URL`, ausente no sandbox; não foi mascarado como sucesso |

Nenhuma migration ou alteração destrutiva de dados foi introduzida nesta etapa.

## Publicação

O próximo passo operacional é versionar e publicar este conjunto no remoto autorizado e acionar o redeploy do ambiente Coolify já configurado. O relatório não declara deploy concluído antes da confirmação externa do deployment e do smoke test do domínio.

## Arquivos de maior impacto

- `apps/web/src/pages/publico/Home.tsx`
- `apps/web/src/pages/Eventos.tsx`
- `apps/web/src/pages/Login.tsx`
- `apps/web/src/contexts/AuthContext.tsx`
- `apps/web/src/pages/admin/Contratos.tsx`
- `apps/web/src/pages/cliente/Checkout.tsx`
- `apps/web/src/pages/cliente/MinhasReservas.tsx`
- `packages/contract-engine/contratoModeloPadrao.ts`
- `server/routes/admin.ts`
- `server/routes/contratos.ts`
- `server/routes/cupons.ts`
- `server/services/otpService.ts`
- `server/services/pacoteService.ts`

## Critérios de não regressão

Os endpoints legados foram preservados, o download continua usando o mesmo caminho protegido, o HTML contratual existente continua sendo usado para leitura e os testes de autenticação, PDF, contrato e gateway permaneceram verdes. O comportamento financeiro continua autoritativo no servidor; a interface não reaplica desconto sobre total congelado.

## Estado final antes da publicação

Código validado localmente, sem whitespace inválido e sem dependência de segredo no repositório. A comprovação de produção será registrada somente após o commit remoto, redeploy e smoke test externo.

> Este documento é operacional e não substitui a aprovação jurídica formal do modelo contratual versionado.
