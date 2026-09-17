-- Períodos operacionais pertencem à excursão, independentemente do pacote.
-- Os espelhos em pacote_periodos preservam compatibilidade com contratos e lotes legados.
CREATE TABLE IF NOT EXISTS evento_periodos (
  id TEXT PRIMARY KEY,
  evento_id TEXT NOT NULL REFERENCES eventos(id),
  nome VARCHAR(255) NOT NULL,
  descricao TEXT,
  data_inicio TIMESTAMP NOT NULL,
  data_fim TIMESTAMP NOT NULL,
  data_embarque TIMESTAMP,
  data_retorno TIMESTAMP,
  capacidade_transporte_planejada INTEGER,
  capacidade_hospedagem_planejada INTEGER,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT evento_periodos_capacidade_check CHECK (
    (capacidade_transporte_planejada IS NULL OR capacidade_transporte_planejada >= 0)
    AND (capacidade_hospedagem_planejada IS NULL OR capacidade_hospedagem_planejada >= 0)
  ),
  CONSTRAINT evento_periodos_datas_check CHECK (data_inicio <= data_fim)
);
CREATE INDEX IF NOT EXISTS evento_periodos_evento_idx ON evento_periodos (evento_id, ativo, ordem, data_inicio);

ALTER TABLE pacote_periodos
  ADD COLUMN IF NOT EXISTS evento_periodo_id TEXT REFERENCES evento_periodos(id);
CREATE INDEX IF NOT EXISTS pacote_periodos_evento_periodo_idx ON pacote_periodos (evento_periodo_id, ativo);

ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS evento_periodo_id TEXT REFERENCES evento_periodos(id);
CREATE INDEX IF NOT EXISTS reservas_evento_periodo_idx ON reservas (evento_periodo_id, status);

ALTER TABLE saidas_operacionais
  ADD COLUMN IF NOT EXISTS evento_periodo_id TEXT REFERENCES evento_periodos(id);
CREATE INDEX IF NOT EXISTS saidas_operacionais_evento_periodo_idx ON saidas_operacionais (evento_periodo_id, ativa);

ALTER TABLE onibus_operacionais
  ADD COLUMN IF NOT EXISTS evento_periodo_id TEXT REFERENCES evento_periodos(id);
CREATE INDEX IF NOT EXISTS onibus_operacionais_evento_periodo_idx ON onibus_operacionais (evento_periodo_id, ativo);

ALTER TABLE quartos_hospedagem
  ADD COLUMN IF NOT EXISTS evento_periodo_id TEXT REFERENCES evento_periodos(id);
CREATE INDEX IF NOT EXISTS quartos_hospedagem_evento_periodo_idx ON quartos_hospedagem (evento_periodo_id, ativo);

-- Converte períodos legados em períodos centrais por evento e intervalo de calendário.
-- O uso de md5 torna a operação idempotente e não altera IDs históricos existentes.
INSERT INTO evento_periodos (
  id, evento_id, nome, descricao, data_inicio, data_fim, data_embarque, data_retorno,
  capacidade_transporte_planejada, capacidade_hospedagem_planejada, ordem, ativo, criado_em, atualizado_em
)
SELECT DISTINCT ON (l.evento_id, DATE(pp.data_inicio), DATE(pp.data_fim))
  md5(l.evento_id || ':' || DATE(pp.data_inicio)::text || ':' || DATE(pp.data_fim)::text),
  l.evento_id,
  pp.nome,
  pp.descricao,
  pp.data_inicio,
  pp.data_fim,
  pp.data_embarque,
  pp.data_retorno,
  pp.capacidade_transporte_planejada,
  pp.capacidade_hospedagem_planejada,
  pp.ordem,
  pp.ativo,
  COALESCE(pp.criado_em, CURRENT_TIMESTAMP),
  CURRENT_TIMESTAMP
FROM pacote_periodos pp
JOIN pacotes p ON p.id = pp.pacote_id
JOIN lotes l ON l.id = p.lote_id
WHERE pp.ativo = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM evento_periodos ep
    WHERE ep.evento_id = l.evento_id
      AND DATE(ep.data_inicio) = DATE(pp.data_inicio)
      AND DATE(ep.data_fim) = DATE(pp.data_fim)
  )
ORDER BY l.evento_id, DATE(pp.data_inicio), DATE(pp.data_fim), pp.ordem, pp.criado_em, pp.id;

UPDATE pacote_periodos pp
SET evento_periodo_id = ep.id,
    atualizado_em = CURRENT_TIMESTAMP
FROM pacotes p
JOIN lotes l ON l.id = p.lote_id
JOIN evento_periodos ep ON ep.evento_id = l.evento_id
WHERE pp.pacote_id = p.id
  AND pp.evento_periodo_id IS NULL
  AND DATE(ep.data_inicio) = DATE(pp.data_inicio)
  AND DATE(ep.data_fim) = DATE(pp.data_fim);

UPDATE reservas r
SET evento_periodo_id = pp.evento_periodo_id
FROM pacote_periodos pp
WHERE pp.id = r.periodo_id AND r.evento_periodo_id IS NULL;

UPDATE saidas_operacionais s
SET evento_periodo_id = pp.evento_periodo_id
FROM pacote_periodos pp
WHERE pp.id = s.periodo_id AND s.evento_periodo_id IS NULL;

UPDATE onibus_operacionais o
SET evento_periodo_id = pp.evento_periodo_id
FROM pacote_periodos pp
WHERE pp.id = o.periodo_id AND o.evento_periodo_id IS NULL;

UPDATE quartos_hospedagem q
SET evento_periodo_id = pp.evento_periodo_id
FROM pacote_periodos pp
WHERE pp.id = q.periodo_id AND q.evento_periodo_id IS NULL;

-- Garante que cada pacote criado antes desta migration enxergue os mesmos períodos da excursão.
INSERT INTO pacote_periodos (
  id, pacote_id, evento_periodo_id, nome, descricao, data_inicio, data_fim,
  data_embarque, data_retorno, capacidade_transporte_planejada,
  capacidade_hospedagem_planejada, ordem, ativo, criado_em, atualizado_em
)
SELECT md5(p.id || ':' || ep.id), p.id, ep.id, ep.nome, ep.descricao, ep.data_inicio, ep.data_fim,
       ep.data_embarque, ep.data_retorno, ep.capacidade_transporte_planejada,
       ep.capacidade_hospedagem_planejada, ep.ordem, ep.ativo, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM pacotes p
JOIN lotes l ON l.id = p.lote_id
JOIN evento_periodos ep ON ep.evento_id = l.evento_id
WHERE NOT EXISTS (
  SELECT 1 FROM pacote_periodos pp
  WHERE pp.pacote_id = p.id AND pp.evento_periodo_id = ep.id
);

-- Recursos físicos sem período continuam globais para preservar o comportamento
-- legado. Novos ônibus, saídas e quartos devem receber evento_periodo_id pela UI.
