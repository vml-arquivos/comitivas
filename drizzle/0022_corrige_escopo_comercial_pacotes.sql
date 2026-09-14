-- Corrige escopo comercial sem reescrever reservas/contratos históricos.
-- 1) Se um pacote de hospedagem possui evidência inequívoca de transporte,
--    corrige o catálogo para transporte + hospedagem.
UPDATE pacotes
SET forma_contratacao = 'onibus_hospedagem',
    contrato_modelo = 'hospedagem_transporte',
    atualizado_em = CURRENT_TIMESTAMP
WHERE ativo = true
  AND forma_contratacao = 'hospedagem'
  AND modalidade_hospedagem IN ('camping', 'quarto_ventilador', 'quarto_ar_condicionado')
  AND (
    (jsonb_typeof(onibus_config) = 'array' AND jsonb_array_length(onibus_config) > 0
      AND LOWER(COALESCE(itens_selecionados::text, '')) SIMILAR TO '%(transporte|onibus|ônibus)%')
    OR LOWER(COALESCE(itens_selecionados::text, '')) LIKE '%transporte rodovi%'
  );

-- 2) Hotfix de dados confirmado pelo produto: no catálogo Barretos 2027, o
--    Quarto com ar-condicionado de R$ 3.200 inclui transporte + hospedagem.
--    A correção é restrita por evento/ano/modalidade/valor para não alterar outras ofertas.
UPDATE pacotes p
SET forma_contratacao = 'onibus_hospedagem',
    contrato_modelo = 'hospedagem_transporte',
    atualizado_em = CURRENT_TIMESTAMP
FROM lotes l
JOIN eventos e ON e.id = l.evento_id
WHERE p.lote_id = l.id
  AND p.ativo = true
  AND p.forma_contratacao = 'hospedagem'
  AND p.modalidade_hospedagem = 'quarto_ar_condicionado'
  AND p.valor_total = 3200.00
  AND EXTRACT(YEAR FROM l.data_inicio) = 2027
  AND e.nome ILIKE '%Barretos%';

-- 3) Mantém o modelo técnico do contrato coerente com o escopo comercial.
--    Isso afeta apenas a configuração do catálogo; snapshots já assinados são imutáveis.
UPDATE pacotes
SET contrato_modelo = CASE forma_contratacao
  WHEN 'onibus' THEN 'transporte'
  WHEN 'hospedagem' THEN 'hospedagem'
  WHEN 'onibus_hospedagem' THEN 'hospedagem_transporte'
  ELSE contrato_modelo
END,
atualizado_em = CURRENT_TIMESTAMP
WHERE forma_contratacao IN ('onibus', 'hospedagem', 'onibus_hospedagem')
  AND contrato_modelo IS DISTINCT FROM CASE forma_contratacao
    WHEN 'onibus' THEN 'transporte'
    WHEN 'hospedagem' THEN 'hospedagem'
    WHEN 'onibus_hospedagem' THEN 'hospedagem_transporte'
    ELSE contrato_modelo
  END;
