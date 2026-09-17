-- Permite controlar se o lote encerra por vagas, por data ou pela primeira condição atingida.
ALTER TABLE pacote_lotes_comerciais
  ADD COLUMN IF NOT EXISTS criterio_encerramento VARCHAR(20) NOT NULL DEFAULT 'vagas_data';

UPDATE pacote_lotes_comerciais
   SET criterio_encerramento = 'vagas_data'
 WHERE criterio_encerramento IS NULL OR criterio_encerramento NOT IN ('vagas', 'data', 'vagas_data');

ALTER TABLE pacote_lotes_comerciais
  DROP CONSTRAINT IF EXISTS pacote_lotes_comerciais_criterio_encerramento_check;
ALTER TABLE pacote_lotes_comerciais
  ADD CONSTRAINT pacote_lotes_comerciais_criterio_encerramento_check
  CHECK (criterio_encerramento IN ('vagas', 'data', 'vagas_data'));
