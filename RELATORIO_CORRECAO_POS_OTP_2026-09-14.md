# Correção pós-OTP — avanço automático da contratação

Data: 14/09/2026
Base operacional: `vml-arquivos/comitivas` — `main` em `c7395e0037bff1ef4d0fe76d1db76ac550a1a0b2`.

## Problema reproduzido

Após o cliente receber e confirmar corretamente o código OTP, o backend validava o contrato, mas o frontend permanecia no checkout. O handler `finalizarAssinatura` apenas limpava o código e recarregava a mesma página. O controle financeiro do boleto manual era iniciado por um `useEffect`, também sem navegação.

Com isso, o cliente continuava vendo a etapa de assinatura. Uma nova tentativa de solicitar código sobre o contrato já validado retornava corretamente `Este contrato não está disponível para validação`, mas a mensagem parecia um erro da primeira confirmação.

## Correção

- OTP confirmado encerra a etapa contratual.
- A etapa financeira é iniciada imediatamente com a mesma forma de pagamento já congelada no contrato.
- Em sucesso, o checkout redireciona com `replace: true` para `/confirmacao/:reservaId`.
- Boleto manual cria/reutiliza o controle financeiro idempotente existente e segue para `boletos_em_preparacao`.
- PIX/boleto de gateway seguem o mesmo princípio: cria a cobrança e avança para a confirmação quando o gateway responde com sucesso.
- Se a etapa financeira falhar depois do OTP, o contrato permanece validado; a tela recarrega o estado e permite retomar o pagamento sem pedir novo OTP.
- Sessões antigas já validadas também são recuperadas: se houver contrato validado + pagamento/controle existente, o checkout redireciona automaticamente para a confirmação.
- A página de confirmação deixou de informar que existe aprovação administrativa manual de cadastro/contrato, pois o fluxo atual é automático.

## Arquivos alterados

- `apps/web/src/pages/cliente/Checkout.tsx`
- `apps/web/src/pages/cliente/Confirmacao.tsx`
- `tests/checkoutPosOtp.spec.ts` (novo)
- `RELATORIO_CORRECAO_POS_OTP_2026-09-14.md`
- `DEPLOY_CORRECAO_POS_OTP_2026-09-14.md`

## Persistência e segurança

Nenhuma migration foi criada nesta rodada. Nenhum contrato histórico é reescrito. Nenhum preço, parcela, inventário, documento ou evidência OTP é alterado pela correção de navegação.

O endpoint de pagamento existente permanece autoritativo e idempotente. Para boleto manual, a própria rota reutiliza o pagamento existente da reserva quando ele já foi criado.

## Resultado esperado

`Contrato + regras aceitos -> OTP confirmado -> contrato validado -> controle financeiro/cobrança -> /confirmacao/:reservaId`.

Não deve ser necessário solicitar um segundo OTP para a mesma versão contratual.

## Validação executada nesta entrega

- Base comparada com o pacote que originou o commit de produção `c7395e...`.
- Blobs críticos conferidos previamente contra a `main` remota (Checkout, Confirmacao, contratos e pagamentos).
- Transpilação sintática com TypeScript 5.8.3: **150 arquivos TS/TSX/MTS, 0 erros de sintaxe**.
- 8 verificações estáticas específicas do pós-OTP: **8 aprovadas**.
- `git diff --check`: **sem erros de whitespace**.
- `npm ci` foi tentado, mas o acesso externo ao registry expirou no ambiente desta execução; portanto a suíte integral `npm test`/`npm run build` deve ser executada no clone/CI com acesso ao npm antes do redeploy.
