-- Contratação 2026.1: integridade contratual e operacional.
-- Forward-only e idempotente. Não altera nem remove colunas legadas.

ALTER TABLE reservas ADD COLUMN IF NOT EXISTS checkout_estado VARCHAR(40) NOT NULL DEFAULT 'rascunho';
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS inventario_hold_id TEXT;
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS valor_total_centavos INTEGER;
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS preco_versao VARCHAR(40) NOT NULL DEFAULT 'legado-2026.1';
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cronograma_pagamento JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE reservas SET valor_total_centavos = ROUND(valor_total * 100)::integer WHERE valor_total_centavos IS NULL;
CREATE INDEX IF NOT EXISTS reservas_checkout_estado_idx ON reservas (checkout_estado);

ALTER TABLE contratos_documentos ADD COLUMN IF NOT EXISTS conteudo_canonico TEXT;
ALTER TABLE contratos_documentos ADD COLUMN IF NOT EXISTS regras_versao VARCHAR(30);
ALTER TABLE contratos_documentos ADD COLUMN IF NOT EXISTS regras_sha256 VARCHAR(64);
ALTER TABLE contratos_documentos ADD COLUMN IF NOT EXISTS aviso_privacidade_versao VARCHAR(30);
ALTER TABLE contratos_documentos ADD COLUMN IF NOT EXISTS visualizado_em TIMESTAMP;
ALTER TABLE contratos_documentos ADD COLUMN IF NOT EXISTS motivo_invalidacao TEXT;
WITH pendentes AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY reserva_id ORDER BY criado_em DESC, versao DESC) AS ordem
  FROM contratos_documentos
  WHERE status IN ('rascunho', 'aguardando_validacao', 'preparado')
)
UPDATE contratos_documentos AS d
SET status = 'invalidado', invalidado_em = CURRENT_TIMESTAMP, motivo_invalidacao = 'Migração 0008: versão pendente antiga substituída'
FROM pendentes AS p
WHERE d.id = p.id AND p.ordem > 1;
CREATE UNIQUE INDEX IF NOT EXISTS contratos_documentos_pendente_unico_idx
  ON contratos_documentos (reserva_id) WHERE status IN ('rascunho', 'aguardando_validacao', 'preparado');

ALTER TABLE contrato_validacoes ADD COLUMN IF NOT EXISTS aceite_contrato_texto TEXT;
ALTER TABLE contrato_validacoes ADD COLUMN IF NOT EXISTS aceite_regras_texto TEXT;
ALTER TABLE contrato_validacoes ADD COLUMN IF NOT EXISTS aceites_sha256 VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS contrato_validacoes_contrato_unico_idx ON contrato_validacoes (contrato_id);

ALTER TABLE otp_desafios ADD COLUMN IF NOT EXISTS status_envio VARCHAR(20) NOT NULL DEFAULT 'pendente';
ALTER TABLE otp_desafios ADD COLUMN IF NOT EXISTS provedor VARCHAR(80);
ALTER TABLE otp_desafios ADD COLUMN IF NOT EXISTS message_id VARCHAR(255);
ALTER TABLE otp_desafios ADD COLUMN IF NOT EXISTS solicitado_em TIMESTAMP;
ALTER TABLE otp_desafios ADD COLUMN IF NOT EXISTS enviado_em TIMESTAMP;
ALTER TABLE otp_desafios ADD COLUMN IF NOT EXISTS falhou_em TIMESTAMP;
ALTER TABLE otp_desafios ADD COLUMN IF NOT EXISTS erro_envio TEXT;
CREATE INDEX IF NOT EXISTS otp_desafios_status_envio_idx ON otp_desafios (status_envio, expira_em);

CREATE TABLE IF NOT EXISTS contrato_eventos (
  id TEXT PRIMARY KEY,
  contrato_id TEXT NOT NULL REFERENCES contratos_documentos(id),
  reserva_id TEXT NOT NULL REFERENCES reservas(id),
  tipo VARCHAR(60) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ator_id TEXT REFERENCES usuarios(id),
  sessao_id TEXT,
  ip VARCHAR(45),
  user_agent TEXT,
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  hash_anterior VARCHAR(64),
  hash_evento VARCHAR(64) NOT NULL
);
CREATE INDEX IF NOT EXISTS contrato_eventos_contrato_idx ON contrato_eventos (contrato_id, criado_em);

CREATE TABLE IF NOT EXISTS consentimentos_imagem (
  id TEXT PRIMARY KEY,
  reserva_id TEXT NOT NULL REFERENCES reservas(id),
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  versao VARCHAR(40) NOT NULL,
  texto_exato TEXT NOT NULL,
  aceito BOOLEAN NOT NULL DEFAULT false,
  revogado_em TIMESTAMP,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS consentimentos_imagem_reserva_idx ON consentimentos_imagem (reserva_id, criado_em);

CREATE TABLE IF NOT EXISTS precos_ledger (
  id TEXT PRIMARY KEY,
  reserva_id TEXT NOT NULL REFERENCES reservas(id),
  tipo VARCHAR(40) NOT NULL,
  codigo VARCHAR(120),
  descricao TEXT NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1,
  valor_unitario_centavos INTEGER NOT NULL,
  valor_total_centavos INTEGER NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_por TEXT REFERENCES usuarios(id),
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS precos_ledger_reserva_idx ON precos_ledger (reserva_id, criado_em);

CREATE TABLE IF NOT EXISTS inventario_holds (
  id TEXT PRIMARY KEY,
  reserva_id TEXT NOT NULL UNIQUE REFERENCES reservas(id),
  lote_id TEXT NOT NULL REFERENCES lotes(id),
  modalidade VARCHAR(80),
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'ativo',
  expira_em TIMESTAMP NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  convertido_em TIMESTAMP,
  liberado_em TIMESTAMP,
  motivo_liberacao TEXT
);
CREATE INDEX IF NOT EXISTS inventario_holds_lote_ativos_idx ON inventario_holds (lote_id, status, expira_em);
CREATE INDEX IF NOT EXISTS inventario_holds_expiracao_idx ON inventario_holds (status, expira_em);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reservas_inventario_hold_fk'
  ) THEN
    ALTER TABLE reservas ADD CONSTRAINT reservas_inventario_hold_fk
      FOREIGN KEY (inventario_hold_id) REFERENCES inventario_holds(id) NOT VALID;
  END IF;
END $$;

ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS valor_centavos INTEGER;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS valor_pago_centavos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS status_reconciliado VARCHAR(30) NOT NULL DEFAULT 'pendente';
UPDATE pagamentos SET valor_centavos = ROUND(valor * 100)::integer WHERE valor_centavos IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pagamentos_gateway_id_unico_idx ON pagamentos (gateway_id) WHERE gateway_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pagamentos_status_reconciliado_idx ON pagamentos (status_reconciliado);

ALTER TABLE pagamento_parcelas ADD COLUMN IF NOT EXISTS valor_centavos INTEGER;
ALTER TABLE pagamento_parcelas ADD COLUMN IF NOT EXISTS valor_pago_centavos INTEGER NOT NULL DEFAULT 0;
UPDATE pagamento_parcelas SET valor_centavos = ROUND(valor * 100)::integer WHERE valor_centavos IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pagamento_parcelas_cora_id_unico_idx ON pagamento_parcelas (cora_id) WHERE cora_id IS NOT NULL;

ALTER TABLE webhook_eventos ADD COLUMN IF NOT EXISTS tentativas INTEGER NOT NULL DEFAULT 0;
ALTER TABLE webhook_eventos ADD COLUMN IF NOT EXISTS ultimo_erro TEXT;
ALTER TABLE webhook_eventos ADD COLUMN IF NOT EXISTS proxima_tentativa TIMESTAMP;
CREATE INDEX IF NOT EXISTS webhook_eventos_reprocessamento_idx ON webhook_eventos (processado_em, proxima_tentativa);

CREATE TABLE IF NOT EXISTS notificacoes_outbox (
  id TEXT PRIMARY KEY,
  reserva_id TEXT REFERENCES reservas(id),
  tipo VARCHAR(60) NOT NULL,
  chave_idempotente VARCHAR(255) NOT NULL UNIQUE,
  template VARCHAR(100) NOT NULL,
  versao VARCHAR(30) NOT NULL,
  destinatario_mascarado VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  anexos JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente',
  tentativas INTEGER NOT NULL DEFAULT 0,
  proxima_tentativa TIMESTAMP,
  message_id VARCHAR(255),
  ultimo_erro TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enviado_em TIMESTAMP
);
CREATE INDEX IF NOT EXISTS notificacoes_outbox_fila_idx ON notificacoes_outbox (status, proxima_tentativa, criado_em);

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS sessoes (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  versao INTEGER NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_em TIMESTAMP NOT NULL,
  revogada_em TIMESTAMP,
  ip VARCHAR(45),
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS sessoes_usuario_ativas_idx ON sessoes (usuario_id, versao, revogada_em, expira_em);

-- Backfill conservador do novo estado: não altera o status legado da reserva.
UPDATE reservas SET checkout_estado = CASE
  WHEN status = 'cliente_confirmado' THEN 'primeira_parcela_confirmada'
  WHEN status = 'aguardando_pagamento' THEN 'aguardando_pagamento'
  WHEN status = 'contrato_gerado' THEN 'contrato_validado'
  WHEN status = 'pacote_montado' THEN 'pacote_montado'
  ELSE 'rascunho'
END WHERE checkout_estado = 'rascunho';
