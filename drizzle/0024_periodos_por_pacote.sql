-- Períodos comerciais configuráveis dentro de cada pacote.
-- O lote permanece como unidade de inventário para preservar reservas existentes.
CREATE TABLE IF NOT EXISTS pacote_periodos (
  id TEXT PRIMARY KEY,
  pacote_id TEXT NOT NULL REFERENCES pacotes(id),
  nome VARCHAR(255) NOT NULL,
  descricao TEXT,
  data_inicio TIMESTAMP NOT NULL,
  data_fim TIMESTAMP NOT NULL,
  data_embarque TIMESTAMP,
  data_retorno TIMESTAMP,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS pacote_periodos_pacote_id_idx ON pacote_periodos (pacote_id);
CREATE INDEX IF NOT EXISTS pacote_periodos_ativo_idx ON pacote_periodos (pacote_id, ativo, ordem);

ALTER TABLE reservas ADD COLUMN IF NOT EXISTS periodo_id TEXT;
ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_periodo_id_fkey;
ALTER TABLE reservas ADD CONSTRAINT reservas_periodo_id_fkey
  FOREIGN KEY (periodo_id) REFERENCES pacote_periodos(id);
CREATE INDEX IF NOT EXISTS reservas_periodo_id_idx ON reservas (periodo_id);
