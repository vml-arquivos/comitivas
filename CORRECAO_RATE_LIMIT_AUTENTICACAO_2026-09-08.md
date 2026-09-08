# Correção de regressão — autenticação e recuperação de senha

Base de produção revisada: `main@e08bee2c6fc797bf28970a923899bc9f5a5094d5`.

## Problema identificado

O backend aplicava um único `express-rate-limit` em todo o prefixo `/api/auth`, com 20 requisições por 15 minutos em produção. Isso fazia login, cadastro, recuperação de senha, confirmação de e-mail, reenvio, perfil e refresh consumirem o mesmo contador. Depois de navegação e testes normais, usuários legítimos podiam receber `429` com a mensagem "Muitas tentativas" em operações diferentes.

## Correção aplicada

- removido o rate limiter global de `/api/auth`;
- criados limitadores independentes para login, cadastro, recuperação/redefinição de senha, confirmação/reenvio de e-mail e convites;
- login bem-sucedido não permanece contabilizado (`skipSuccessfulRequests`);
- perfil, logout e refresh deixam de consumir limites de login/cadastro;
- recuperação de senha ganhou cooldown de 60 segundos por conta no banco;
- reenvio de confirmação de e-mail ganhou cooldown de 60 segundos por conta;
- a tela de login impede disparos simultâneos de recuperação e mostra `429` específico apenas para recuperação.

## Limites padrão em produção

- login: 50 tentativas / 15 min; sucesso não contabiliza;
- cadastro: 20 / 60 min;
- recuperação e redefinição: 30 / 15 min;
- confirmação/reenvio de e-mail: 30 / 15 min;
- convites: 30 / 15 min;
- OTP contratual e webhook permanecem com as proteções existentes.

## Validações executadas

- parser TypeScript/TSX aprovado nos três arquivos alterados;
- conferência estática confirmou a remoção de `app.use("/api/auth", limiteAutenticacao, authRoutes)`;
- conferência estática confirmou a presença dos limitadores por rota e dos cooldowns de 60 segundos;
- nenhuma migration ou alteração destrutiva de banco foi criada;
- tentativa de `npm ci --offline` não pôde concluir porque `@vitejs/plugin-react` não estava presente no cache local. O build completo deve ser confirmado pelo Coolify no redeploy.

## Arquivos alterados

- `server/index.ts`
- `server/routes/auth.ts`
- `apps/web/src/pages/Login.tsx`

