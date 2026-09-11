-- Identificação do local físico dos quartos (ex.: Chácara Santa Rita, Casa 2).
-- Migration aditiva e forward-only: preserva todos os quartos, hóspedes e históricos existentes.

ALTER TABLE quartos_hospedagem
  ADD COLUMN IF NOT EXISTS local_hospedagem VARCHAR(120);

CREATE INDEX IF NOT EXISTS quartos_hospedagem_local_idx
  ON quartos_hospedagem (lote_id, local_hospedagem, ativo);
