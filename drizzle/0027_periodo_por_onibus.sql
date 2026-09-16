-- Permite separar os ônibus de uma mesma saída por período comercial.
-- NULL mantém compatibilidade com saídas e ônibus legados que atendem todo o lote.
ALTER TABLE onibus_operacionais
  ADD COLUMN IF NOT EXISTS periodo_id TEXT REFERENCES pacote_periodos(id);

CREATE INDEX IF NOT EXISTS onibus_operacionais_periodo_idx
  ON onibus_operacionais (periodo_id, ativo);
