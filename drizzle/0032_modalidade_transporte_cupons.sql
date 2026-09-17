-- Permite campanhas específicas para transporte da excursão ou deslocamento por conta própria.
-- NULL preserva cupons já existentes como cupons gerais.
ALTER TABLE cupons
  ADD COLUMN IF NOT EXISTS modalidade_transporte VARCHAR(20);

ALTER TABLE cupons
  DROP CONSTRAINT IF EXISTS cupons_modalidade_transporte_check;

ALTER TABLE cupons
  ADD CONSTRAINT cupons_modalidade_transporte_check
  CHECK (modalidade_transporte IS NULL OR modalidade_transporte IN ('excursao', 'proprio'));

CREATE INDEX IF NOT EXISTS cupons_modalidade_transporte_idx
  ON cupons (modalidade_transporte);
