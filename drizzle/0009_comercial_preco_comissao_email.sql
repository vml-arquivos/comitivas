-- Plataforma comercial 2026.2: confirmação de e-mail, origem de venda,
-- regras de cupom e ledger de comissão. Forward-only e idempotente.

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email_confirmado BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email_confirmado_em TIMESTAMP;

CREATE TABLE IF NOT EXISTS verificacoes_email (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  codigo_hash VARCHAR(128) NOT NULL,
  expira_em TIMESTAMP NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0,
  usado_em TIMESTAMP,
  enviado_em TIMESTAMP,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS verificacoes_email_usuario_idx ON verificacoes_email (usuario_id, expira_em);

ALTER TABLE cupons ADD COLUMN IF NOT EXISTS limite_por_cliente INTEGER;
ALTER TABLE cupons ADD COLUMN IF NOT EXISTS pacote_id TEXT;
ALTER TABLE cupons ADD COLUMN IF NOT EXISTS vendedor_id TEXT;
ALTER TABLE cupons ADD COLUMN IF NOT EXISTS campanha VARCHAR(120);
ALTER TABLE cupons ADD COLUMN IF NOT EXISTS valor_minimo DECIMAL(12,2);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cupons_pacote_fk') THEN
    ALTER TABLE cupons ADD CONSTRAINT cupons_pacote_fk FOREIGN KEY (pacote_id) REFERENCES pacotes(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cupons_vendedor_fk') THEN
    ALTER TABLE cupons ADD CONSTRAINT cupons_vendedor_fk FOREIGN KEY (vendedor_id) REFERENCES usuarios(id) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS comissao_regras (
  id TEXT PRIMARY KEY,
  vendedor_id TEXT NOT NULL REFERENCES usuarios(id),
  evento_id TEXT REFERENCES eventos(id),
  pacote_id TEXT,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('percentual', 'fixo')),
  valor DECIMAL(12,4) NOT NULL CHECK (valor >= 0),
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS comissao_regras_vendedor_idx ON comissao_regras (vendedor_id, ativo);

CREATE TABLE IF NOT EXISTS comissoes (
  id TEXT PRIMARY KEY,
  reserva_id TEXT NOT NULL UNIQUE REFERENCES reservas(id),
  vendedor_id TEXT NOT NULL REFERENCES usuarios(id),
  regra_id TEXT REFERENCES comissao_regras(id),
  base_centavos INTEGER NOT NULL CHECK (base_centavos >= 0),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
  regra_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'prevista' CHECK (status IN ('prevista', 'elegivel', 'confirmada', 'paga', 'cancelada', 'estornada')),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS comissoes_vendedor_idx ON comissoes (vendedor_id, status);

CREATE TABLE IF NOT EXISTS cupons_utilizacoes (
  id TEXT PRIMARY KEY,
  cupom_id TEXT NOT NULL REFERENCES cupons(id),
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  reserva_id TEXT NOT NULL REFERENCES reservas(id),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS cupons_utilizacoes_reserva_unica_idx ON cupons_utilizacoes (reserva_id);
CREATE INDEX IF NOT EXISTS cupons_utilizacoes_cliente_idx ON cupons_utilizacoes (cupom_id, usuario_id);

ALTER TABLE reservas ADD COLUMN IF NOT EXISTS vendedor_id TEXT;
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS lead_id TEXT;
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS origem_comercial VARCHAR(100);
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS comissao_regra_snapshot JSONB;
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS comissao_centavos INTEGER NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservas_vendedor_fk') THEN
    ALTER TABLE reservas ADD CONSTRAINT reservas_vendedor_fk FOREIGN KEY (vendedor_id) REFERENCES usuarios(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservas_lead_fk') THEN
    ALTER TABLE reservas ADD CONSTRAINT reservas_lead_fk FOREIGN KEY (lead_id) REFERENCES leads_origem(id) NOT VALID;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS reservas_vendedor_idx ON reservas (vendedor_id, criado_em);
CREATE INDEX IF NOT EXISTS reservas_lead_idx ON reservas (lead_id);

-- Leads já vinculados são a melhor fonte segura para preencher a atribuição histórica.
UPDATE reservas AS r
SET vendedor_id = l.vendedor_id,
    lead_id = l.id,
    origem_comercial = l.codigo_origem
FROM leads_origem AS l
WHERE r.usuario_id = l.usuario_id
  AND r.vendedor_id IS NULL
  AND l.vendedor_id IS NOT NULL;
