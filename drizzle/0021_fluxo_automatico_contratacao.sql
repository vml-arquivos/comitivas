-- Fluxo automático de contratação e normalização de pacotes legados.
-- Pacotes de quarto criados com os defaults antigos e contrato automático passam
-- a representar transporte + hospedagem. Pacotes explicitamente configurados com
-- contrato de somente hospedagem permanecem inalterados.
UPDATE pacotes
SET forma_contratacao = 'onibus_hospedagem', atualizado_em = CURRENT_TIMESTAMP
WHERE modalidade_hospedagem IN ('quarto_ventilador', 'quarto_ar_condicionado')
  AND forma_contratacao = 'hospedagem'
  AND COALESCE(contrato_modelo, 'auto') = 'auto';

-- Contratos já validados no fluxo anterior não aguardam mais clique administrativo.
UPDATE contratos_documentos
SET status = 'validado'
WHERE status = 'aguardando_aprovacao_admin'
  AND validado_em IS NOT NULL;

-- Cadastros completos com e-mail confirmado e documento enviado podem ser
-- reconciliados automaticamente; a análise documental permanece independente.
UPDATE usuarios u
SET cadastro_status = 'aprovado',
    aprovado_em = COALESCE(u.aprovado_em, CURRENT_TIMESTAMP),
    aprovado_por = COALESCE(NULLIF(u.aprovado_por, ''), 'automatico_fluxo_contratacao'),
    atualizado_em = CURRENT_TIMESTAMP
WHERE u.tipo = 'cliente'
  AND u.ativo = true
  AND u.email_confirmado = true
  AND u.cadastro_status IN ('pendente', 'em_analise')
  AND EXISTS (
    SELECT 1 FROM cliente_documentos d
    WHERE d.usuario_id = u.id AND d.categoria = 'identidade' AND d.removido_em IS NULL
  )
  AND NULLIF(BTRIM(u.nome), '') IS NOT NULL
  AND LENGTH(REGEXP_REPLACE(COALESCE(u.cpf, ''), '\D', '', 'g')) = 11
  AND LENGTH(REGEXP_REPLACE(COALESCE(u.telefone, ''), '\D', '', 'g')) BETWEEN 10 AND 13
  AND u.data_nascimento IS NOT NULL
  AND LOWER(COALESCE(u.sexo, '')) IN ('masculino', 'feminino')
  AND LENGTH(REGEXP_REPLACE(COALESCE(u.cep, ''), '\D', '', 'g')) = 8
  AND LENGTH(BTRIM(COALESCE(u.logradouro, ''))) >= 2
  AND NULLIF(BTRIM(COALESCE(u.numero, '')), '') IS NOT NULL
  AND LENGTH(BTRIM(COALESCE(u.bairro, ''))) >= 2
  AND LENGTH(BTRIM(COALESCE(u.cidade, ''))) >= 2
  AND LENGTH(BTRIM(COALESCE(u.estado, ''))) = 2
  AND LENGTH(BTRIM(COALESCE(u.endereco, ''))) >= 8;
