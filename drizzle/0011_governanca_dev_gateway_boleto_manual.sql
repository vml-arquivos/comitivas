-- Governança, convites, gateway administrável e boleto manual.
-- Forward-only e idempotente. Não remove dados históricos.

-- Bancos antigos deste projeto usam VARCHAR para usuarios.tipo, mas alguns
-- ambientes podem ter sido provisionados pelo schema Drizzle com o enum
-- usuario_tipo. Se o enum existir, adiciona DEV de forma idempotente; se não
-- existir, o bloco é um no-op e o VARCHAR já aceita o novo papel.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'usuario_tipo') THEN
    ALTER TYPE usuario_tipo ADD VALUE IF NOT EXISTS 'dev';
  END IF;
END $$;

ALTER TABLE cliente_documentos ADD COLUMN IF NOT EXISTS removido_por TEXT REFERENCES usuarios(id);

ALTER TABLE configuracoes_pagamento ADD COLUMN IF NOT EXISTS boleto_modo VARCHAR(20) NOT NULL DEFAULT 'manual';
ALTER TABLE configuracoes_pagamento DROP CONSTRAINT IF EXISTS configuracoes_pagamento_boleto_modo_check;
ALTER TABLE configuracoes_pagamento ADD CONSTRAINT configuracoes_pagamento_boleto_modo_check CHECK (boleto_modo IN ('manual', 'gateway'));

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cadastro_status VARCHAR(30) NOT NULL DEFAULT 'aprovado';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS aprovado_em TIMESTAMP;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS aprovado_por TEXT;
CREATE INDEX IF NOT EXISTS usuarios_cadastro_status_idx ON usuarios (cadastro_status, criado_em);

ALTER TABLE pacotes ADD COLUMN IF NOT EXISTS contrato_modelo VARCHAR(30) NOT NULL DEFAULT 'auto';
ALTER TABLE pacotes DROP CONSTRAINT IF EXISTS pacotes_contrato_modelo_check;
ALTER TABLE pacotes ADD CONSTRAINT pacotes_contrato_modelo_check
  CHECK (contrato_modelo IN ('auto', 'hospedagem', 'transporte'));

ALTER TABLE reservas ADD COLUMN IF NOT EXISTS boleto_liberado_em TIMESTAMP;
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS boleto_liberado_por TEXT;

ALTER TABLE contratos_documentos ADD COLUMN IF NOT EXISTS aprovado_admin_em TIMESTAMP;
ALTER TABLE contratos_documentos ADD COLUMN IF NOT EXISTS aprovado_admin_por TEXT REFERENCES usuarios(id);

ALTER TABLE pagamento_parcelas ADD COLUMN IF NOT EXISTS boleto_documento_id TEXT;
ALTER TABLE pagamento_parcelas ADD COLUMN IF NOT EXISTS enviado_email_em TIMESTAMP;
ALTER TABLE pagamento_parcelas ADD COLUMN IF NOT EXISTS enviado_whatsapp_em TIMESTAMP;
ALTER TABLE pagamento_parcelas ADD COLUMN IF NOT EXISTS pago_confirmado_em TIMESTAMP;
ALTER TABLE pagamento_parcelas ADD COLUMN IF NOT EXISTS pago_confirmado_por TEXT;
ALTER TABLE pagamento_parcelas ADD COLUMN IF NOT EXISTS comprovante_documento_id TEXT;

CREATE TABLE IF NOT EXISTS convites_acesso (
  id TEXT PRIMARY KEY,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  papel VARCHAR(20) NOT NULL CHECK (papel IN ('admin', 'vendedor')),
  email_destino VARCHAR(255),
  criado_por TEXT NOT NULL REFERENCES usuarios(id),
  expira_em TIMESTAMP NOT NULL,
  usado_em TIMESTAMP,
  usado_por TEXT REFERENCES usuarios(id),
  revogado_em TIMESTAMP,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS convites_acesso_token_idx ON convites_acesso (token_hash);
CREATE INDEX IF NOT EXISTS convites_acesso_status_idx ON convites_acesso (expira_em, usado_em, revogado_em);

CREATE TABLE IF NOT EXISTS auditoria_admin (
  id TEXT PRIMARY KEY,
  ator_id TEXT REFERENCES usuarios(id),
  ator_tipo VARCHAR(20) NOT NULL,
  acao VARCHAR(120) NOT NULL,
  entidade VARCHAR(80) NOT NULL,
  entidade_id TEXT,
  antes JSONB,
  depois JSONB,
  ip VARCHAR(45),
  user_agent TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS auditoria_admin_ator_idx ON auditoria_admin (ator_id, criado_em);
CREATE INDEX IF NOT EXISTS auditoria_admin_entidade_idx ON auditoria_admin (entidade, entidade_id, criado_em);

CREATE TABLE IF NOT EXISTS gateway_credenciais (
  id TEXT PRIMARY KEY DEFAULT 'cora',
  provedor VARCHAR(30) NOT NULL DEFAULT 'cora',
  ambiente VARCHAR(20) NOT NULL DEFAULT 'stage',
  ativo BOOLEAN NOT NULL DEFAULT false,
  client_id_enc TEXT,
  certificate_enc TEXT,
  private_key_enc TEXT,
  webhook_secret_enc TEXT,
  token_url VARCHAR(500),
  api_base VARCHAR(500),
  installments_api_base VARCHAR(500),
  webhook_public_url VARCHAR(500),
  http_timeout_ms INTEGER,
  carne_timeout_ms INTEGER,
  ultimo_teste_em TIMESTAMP,
  ultimo_teste_status VARCHAR(30),
  ultimo_teste_mensagem TEXT,
  atualizado_por TEXT REFERENCES usuarios(id),
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS gateway_credenciais_provedor_idx ON gateway_credenciais (provedor);

INSERT INTO gateway_credenciais (id, provedor, ambiente, ativo)
VALUES ('cora', 'cora', 'stage', false)
ON CONFLICT (id) DO NOTHING;
