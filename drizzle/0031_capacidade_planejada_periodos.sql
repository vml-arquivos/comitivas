-- Capacidade comercial planejada por período.
-- Os valores limitam vendas, mas não substituem os recursos físicos reais.
ALTER TABLE pacote_periodos
  ADD COLUMN IF NOT EXISTS capacidade_transporte_planejada INTEGER,
  ADD COLUMN IF NOT EXISTS capacidade_hospedagem_planejada INTEGER;

ALTER TABLE pacote_periodos
  DROP CONSTRAINT IF EXISTS pacote_periodos_capacidade_planejada_check;
ALTER TABLE pacote_periodos
  ADD CONSTRAINT pacote_periodos_capacidade_planejada_check CHECK (
    (capacidade_transporte_planejada IS NULL OR capacidade_transporte_planejada >= 0)
    AND (capacidade_hospedagem_planejada IS NULL OR capacidade_hospedagem_planejada >= 0)
  );
