-- Distingue a estrutura operacional legada do lote comercial configurável.
-- Registros existentes permanecem como false para preservar o comportamento histórico.
ALTER TABLE lotes
  ADD COLUMN IF NOT EXISTS operacional_interno BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS lotes_evento_operacional_idx
  ON lotes (evento_id, operacional_interno, ativo);
