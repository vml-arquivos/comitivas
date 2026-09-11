# Atualização de acessos e gestão de usuários — 10/09/2026

Base desta entrega: ZIP fornecido pelo usuário `comitivas-main (9).zip`.

## Regra aplicada

A atualização foi feita sobre o ZIP fornecido, sem reconstruir módulos e sem criar migration. Funções que já existiam e estavam implementadas foram preservadas.

## Alterações pontuais

- DEV continua como super acesso e continua sendo o único perfil que enxerga usuários DEV.
- Listagens genéricas de usuários já escondiam DEV de não-DEV e foram preservadas.
- A área Equipe & Acessos passa a ser acessível a Admin/DEV; o backend filtra DEV para Admin.
- Admin nunca recebe usuário DEV pela rota da equipe.
- Admin/DEV podem criar/revogar convites de Administrador/Vendedor pela função existente.
- Gateway e auditoria DEV continuam exclusivos do DEV.
- Gestão existente de clientes/usuários foi reaproveitada; não foi criado CRUD duplicado.
- Inclusão de exclusão segura: sem vínculos, remove; com vínculos históricos, arquiva/desativa preservando contratos, reservas, pagamentos e auditoria.
- Impedido desativar/excluir a própria conta administrativa por engano.
- Edição de um administrador por outro administrador pode manter o perfil atual, sem permitir promoção indevida para DEV.
- A tela de clientes passou a aceitar `?tipo=` para reutilização a partir da equipe.
- Ações administrativas relevantes de usuário passaram a registrar auditoria sem armazenar senha ou segredo.
- Textos longos foram simplificados apenas nos pontos alterados.
- Não foi encontrada referência textual a IA/Inteligência Artificial no frontend ativo durante a varredura; portanto nada funcional foi removido por esse motivo.

## Banco

Nenhuma migration nova.
Nenhuma tabela removida.
Nenhuma coluna removida.
Nenhum dado de produção incluído no pacote.

## Gate

Executar `npm ci`, `npm run build`, testes e lint antes do redeploy. O deploy deve ser interrompido se qualquer gate crítico falhar.
