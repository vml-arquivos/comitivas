# Gestão de clientes — ficha 360º

A área administrativa `/admin/clientes` é o cadastro central de passageiros/clientes. Cada cliente possui uma ficha em `/admin/clientes/:clienteId` consolidando dados pessoais, reservas, viagens, contratos, pagamentos, parcelas, documentos e linha do tempo.

## Fonte dos dados

A ficha não duplica informações financeiras ou contratuais. Ela consulta as tabelas autoritativas já existentes (`usuarios`, `reservas`, `pagamentos`, `pagamento_parcelas`, `contratos_documentos`, `contrato_validacoes`, `leads_origem` e `emails_enviados`) e acrescenta apenas duas estruturas próprias:

- `cliente_documentos`: metadados e referência segura a arquivos enviados pela administração;
- `cliente_historico`: anotações e eventos administrativos que não existiam em outro módulo.

A migration é forward-only: `0010_clientes_ficha_documentos_historico.sql`.

## Documentos do cliente

Arquivos aceitos: PDF, JPG/JPEG, PNG e WEBP, até 12 MB. O servidor valida extensão e assinatura real do arquivo, calcula SHA-256 e impede duplicação do mesmo arquivo na ficha ativa.

Os arquivos são armazenados em `${STORAGE_PATH}/clientes/<usuario_id>/`. Em produção, `STORAGE_PATH` precisa apontar para volume persistente do Coolify. O caminho físico nunca é devolvido à interface; visualização e download passam por endpoint autenticado e restrito ao administrador.

Toda inclusão, visualização, download e remoção gera evento na linha do tempo. Remoção é registrada no banco e o arquivo físico é excluído; o histórico preserva identificador e hash para auditoria.

## Permissões e dados pessoais

A ficha, relatórios e documentos são restritos a `admin`. CRUD de usuários/clientes também exige papel de administrador. Vendedores continuam usando os endpoints de venda/carteira, sem acesso direto ao acervo documental geral.

Os documentos podem conter dados pessoais e devem seguir a política de retenção/LGPD da operação. Não anexar informações além das necessárias para execução da viagem, contrato, pagamento ou obrigação operacional.

## Relatórios

- Relatório imprimível: `/api/admin/clientes/:id/relatorio`
- Relatório individual CSV: `/api/admin/clientes/:id/relatorio?formato=csv`
- Exportação da base de clientes: `/api/admin/clientes/exportar`

O relatório é uma visão de leitura. Contratos validados, pagamentos e históricos financeiros permanecem imutáveis em suas tabelas de origem.

## Checklist antes de produção

1. Fazer backup lógico do PostgreSQL.
2. Confirmar volume persistente e backup de `STORAGE_PATH` no Coolify.
3. Aplicar/testar a migration em clone do banco.
4. Validar upload, visualização, download e remoção de documento.
5. Validar acesso negado para vendedor/cliente.
6. Validar ficha com cliente sem reserva e cliente com múltiplas reservas/contratos/pagamentos.
7. Validar impressão e CSV sem exposição do caminho físico dos arquivos.
