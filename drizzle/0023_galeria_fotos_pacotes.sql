-- Galeria própria de cada pacote, separada da galeria da excursão.
-- A tabela guarda somente metadados e referências; os bytes permanecem no storage persistente.
CREATE TABLE IF NOT EXISTS fotos_pacote (
  id TEXT PRIMARY KEY,
  pacote_id VARCHAR(255) NOT NULL REFERENCES pacotes(id),
  url_foto VARCHAR(500) NOT NULL,
  legenda VARCHAR(500),
  alt_text VARCHAR(500),
  ordem INTEGER DEFAULT 0,
  destaque BOOLEAN NOT NULL DEFAULT FALSE,
  capa BOOLEAN NOT NULL DEFAULT FALSE,
  formato VARCHAR(30),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS fotos_pacote_idx ON fotos_pacote (pacote_id);
