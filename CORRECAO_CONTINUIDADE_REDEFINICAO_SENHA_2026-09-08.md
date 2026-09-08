# Correção de continuidade — redefinição de senha

Base: main@cc43b4f09dfd2bbf392bc55ebb85d0637de23a2d

## Correções
- Redirecionamento garantido após redefinição com `window.location.replace`.
- URL do token sai do histórico do navegador.
- Login exibe confirmação explícita de senha redefinida.
- Cookie de sessão antigo é limpo no backend após a troca de senha.
- Link inválido/incompleto não exibe formulário utilizável.
- Nenhuma migration de banco.
