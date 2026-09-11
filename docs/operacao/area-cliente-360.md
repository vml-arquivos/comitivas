# Área do Cliente 360º

## Objetivo
Transformar "Minha conta" em um portal operacional completo do cliente, sem duplicar regras financeiras ou contratuais.

## Rotas
- `/minha-conta`: dashboard completo com visão geral, viagens, pagamentos, contratos, histórico, dados e atendimento.
- `/minhas-reservas`: rota legada preservada por compatibilidade e redirecionada para `/minha-conta`.
- `/api/cliente/portal`: consolida somente dados pertencentes ao usuário autenticado.
- `/api/cliente/reservas/:id/cancelar`: cancela imediatamente apenas quando não existe contrato validado nem pagamento confirmado; caso contrário registra solicitação para análise.
- `/api/cliente/reservas/:id/reconfigurar`: troca/reinício direto antes da validação/pagamento; depois disso vira solicitação para análise.
- `/api/cliente/atendimento`: registra mensagem na Ficha 360º e encaminha para a equipe.
- `/api/cliente/documentos/:id`: acesso autenticado a documentos do próprio cliente.

## Regras de integridade
- Contratos validados nunca são apagados.
- Pagamentos nunca são apagados.
- Cancelamento precoce libera hold de inventário e preserva o histórico da reserva.
- Contratos gerados e ainda não validados são marcados como invalidados quando a configuração é cancelada/reiniciada.
- Cancelamento/troca após validação contratual ou pagamento exige análise administrativa.
- Toda solicitação do cliente é gravada em `cliente_historico` e aparece na Ficha 360º administrativa.

## Atendimento
`EMAIL_SUPPORT_INBOX` é opcional. Se ausente, o sistema usa `excursaodascomitivas@gmail.com` como destino interno.


## Navegação mobile e escolha de pacotes
- Cabeçalho mobile com logo ampliada e CTA visível **Instalar app**.
- Faixa mobile permanente leva diretamente às instruções de instalação PWA.
- WhatsApp flutuante fica acima do CTA fixo do configurador, evitando sobreposição.
- Vitrine de excursões possui filtros por hospedagem e disponibilidade.
- O portal do cliente possui aba **Explorar pacotes**, com preço, modalidade, disponibilidade e ação **Analisar e escolher**.
- O configurador mostra a sequência Pacote → Adicionais → Checkout e mantém um CTA fixo no mobile.
