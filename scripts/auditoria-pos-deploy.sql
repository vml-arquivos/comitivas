-- Diagnóstico somente de leitura. Executar após as migrations existentes.
-- Nenhuma divergência é corrigida automaticamente. Conferir IDs com a equipe.
BEGIN;
SET TRANSACTION READ ONLY;

-- Contratos assinados vigentes sem evidências correspondentes.
SELECT cd.id AS contrato_id, cd.reserva_id, cd.status
FROM contratos_documentos cd
WHERE cd.status <> 'invalidado' AND cd.validado_em IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM contrato_validacoes cv
  WHERE cv.contrato_id = cd.id AND cv.reserva_id = cd.reserva_id
    AND cv.aceite_contrato AND cv.aceite_regras
    AND cv.snapshot_sha256 = cd.snapshot_sha256
    AND cd.pdf_sha256 IS NOT NULL AND cv.pdf_sha256 = cd.pdf_sha256
);

-- Mais de um documento não invalidado por reserva: conferir versões pendentes/legadas.
SELECT reserva_id, COUNT(*) AS documentos_vigentes
FROM contratos_documentos WHERE status <> 'invalidado'
GROUP BY reserva_id HAVING COUNT(*) > 1;

-- Valor da reserva divergente do snapshot assinado, sem corrigir histórico.
SELECT cd.id AS contrato_id, cd.reserva_id, r.valor_total,
       cd.snapshot->'financeiro'->>'total' AS total_assinado
FROM contratos_documentos cd JOIN reservas r ON r.id = cd.reserva_id
WHERE cd.status <> 'invalidado' AND cd.validado_em IS NOT NULL
  AND cd.snapshot->'financeiro'->>'total' IS NOT NULL
  AND (cd.snapshot->'financeiro'->>'total')::numeric <> r.valor_total::numeric;

-- Parcelas que não fecham o valor do pagamento.
SELECT p.id AS pagamento_id, p.reserva_id, p.valor_centavos,
       SUM(pp.valor_centavos) AS total_parcelas_centavos
FROM pagamentos p JOIN pagamento_parcelas pp ON pp.pagamento_id = p.id
GROUP BY p.id, p.reserva_id, p.valor_centavos
HAVING SUM(pp.valor_centavos) <> COALESCE(p.valor_centavos, ROUND(p.valor::numeric * 100)::integer);

-- Boletos anteriormente liberados sem contrato administrativo aprovado vigente.
SELECT r.id AS reserva_id, r.boleto_liberado_em
FROM reservas r
WHERE r.boleto_liberado_em IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM contratos_documentos cd WHERE cd.reserva_id = r.id
 AND cd.status = 'aprovado_admin' AND cd.aprovado_admin_em IS NOT NULL AND cd.aprovado_admin_por IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM contratos_documentos novo WHERE novo.reserva_id = r.id AND novo.status <> 'invalidado' AND novo.versao > cd.versao)
);

-- Vínculos inválidos/divergentes de período.
SELECT r.id AS reserva_id, r.periodo_id, r.evento_periodo_id, pp.evento_periodo_id AS vinculo_pacote
FROM reservas r LEFT JOIN pacote_periodos pp ON pp.id = r.periodo_id AND pp.pacote_id = r.pacote_id
LEFT JOIN evento_periodos ep ON ep.id = COALESCE(r.evento_periodo_id, pp.evento_periodo_id)
WHERE (r.periodo_id IS NOT NULL AND pp.id IS NULL)
 OR (COALESCE(r.evento_periodo_id, pp.evento_periodo_id) IS NOT NULL AND ep.id IS NULL)
 OR (r.evento_periodo_id IS NOT NULL AND pp.evento_periodo_id IS NOT NULL AND r.evento_periodo_id <> pp.evento_periodo_id);

-- Fila que precisa de atenção; eventos com 20 tentativas exigem intervenção.
SELECT COUNT(*) FILTER (WHERE processado_em IS NULL) AS pendentes,
       COUNT(*) FILTER (WHERE processado_em IS NULL AND tentativas >= 20) AS limite_atingido,
       MIN(criado_em) FILTER (WHERE processado_em IS NULL) AS pendente_mais_antigo
FROM webhook_eventos;

-- Holds convertidos indicam vagas comerciais consolidadas; não liberar à mão.
SELECT status, COUNT(*) AS quantidade_holds, COALESCE(SUM(quantidade),0) AS pessoas
FROM inventario_holds GROUP BY status;
COMMIT;
