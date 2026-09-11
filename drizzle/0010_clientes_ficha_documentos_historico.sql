CREATE TABLE IF NOT EXISTS cliente_documentos (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  reserva_id TEXT REFERENCES reservas(id),
  categoria VARCHAR(60) NOT NULL DEFAULT 'outros',
  nome VARCHAR(255) NOT NULL,
  nome_original VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  tamanho_bytes INTEGER NOT NULL,
  sha256 VARCHAR(64) NOT NULL,
  arquivo VARCHAR(500) NOT NULL,
  observacoes TEXT,
  criado_por TEXT REFERENCES usuarios(id),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  removido_em TIMESTAMP
);

CREATE INDEX IF NOT EXISTS cliente_documentos_usuario_idx ON cliente_documentos (usuario_id, removido_em, criado_em);
CREATE INDEX IF NOT EXISTS cliente_documentos_reserva_idx ON cliente_documentos (reserva_id);
CREATE INDEX IF NOT EXISTS cliente_documentos_hash_idx ON cliente_documentos (usuario_id, sha256);

CREATE TABLE IF NOT EXISTS cliente_historico (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  tipo VARCHAR(60) NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_por TEXT REFERENCES usuarios(id),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS cliente_historico_usuario_idx ON cliente_historico (usuario_id, criado_em);
CREATE INDEX IF NOT EXISTS cliente_historico_tipo_idx ON cliente_historico (usuario_id, tipo, criado_em);
