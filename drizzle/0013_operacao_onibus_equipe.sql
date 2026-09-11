-- Operação física de ônibus/poltronas e vínculo de equipe.
-- Migration forward-only: preserva integralmente clientes, reservas,
-- pagamentos, contratos e os campos legados de configuração dos pacotes.

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS gestor_id TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS equipe_nome VARCHAR(120);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acesso_em TIMESTAMP;

DO $$ BEGIN
  ALTER TABLE usuarios ADD CONSTRAINT usuarios_gestor_id_fk FOREIGN KEY (gestor_id) REFERENCES usuarios(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS usuarios_gestor_idx ON usuarios (gestor_id, tipo, ativo);

CREATE TABLE IF NOT EXISTS saidas_operacionais (
  id TEXT PRIMARY KEY,
  lote_id TEXT NOT NULL REFERENCES lotes(id),
  nome VARCHAR(160) NOT NULL,
  data_partida TIMESTAMP,
  data_retorno TIMESTAMP,
  status VARCHAR(30) NOT NULL DEFAULT 'planejamento',
  ativa BOOLEAN NOT NULL DEFAULT true,
  criado_por TEXT REFERENCES usuarios(id),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT saidas_operacionais_datas_ck CHECK (data_retorno IS NULL OR data_partida IS NULL OR data_retorno >= data_partida)
);
CREATE INDEX IF NOT EXISTS saidas_operacionais_lote_idx ON saidas_operacionais (lote_id, ativa);

CREATE TABLE IF NOT EXISTS onibus_operacionais (
  id TEXT PRIMARY KEY,
  saida_id TEXT NOT NULL REFERENCES saidas_operacionais(id),
  nome VARCHAR(120) NOT NULL,
  identificacao VARCHAR(120),
  placa VARCHAR(12),
  capacidade INTEGER NOT NULL,
  motorista_nome VARCHAR(160),
  motorista_telefone VARCHAR(20),
  responsavel_nome VARCHAR(160),
  status VARCHAR(30) NOT NULL DEFAULT 'planejamento',
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT onibus_operacionais_capacidade_ck CHECK (capacidade BETWEEN 1 AND 100)
);
CREATE INDEX IF NOT EXISTS onibus_operacionais_saida_idx ON onibus_operacionais (saida_id, ativo);

CREATE TABLE IF NOT EXISTS assentos_onibus (
  id TEXT PRIMARY KEY,
  onibus_id TEXT NOT NULL REFERENCES onibus_operacionais(id),
  numero INTEGER NOT NULL,
  fileira INTEGER NOT NULL,
  posicao VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'disponivel',
  motivo_bloqueio TEXT,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT assentos_onibus_numero_ck CHECK (numero > 0),
  CONSTRAINT assentos_onibus_status_ck CHECK (status IN ('disponivel', 'bloqueado')),
  CONSTRAINT assentos_onibus_unico UNIQUE (onibus_id, numero)
);
CREATE INDEX IF NOT EXISTS assentos_onibus_onibus_idx ON assentos_onibus (onibus_id, numero);

CREATE TABLE IF NOT EXISTS pontos_embarque_operacao (
  id TEXT PRIMARY KEY,
  saida_id TEXT NOT NULL REFERENCES saidas_operacionais(id),
  nome VARCHAR(160) NOT NULL,
  endereco TEXT,
  horario TIMESTAMP,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS pontos_embarque_operacao_saida_idx ON pontos_embarque_operacao (saida_id, ativo, ordem);

CREATE TABLE IF NOT EXISTS assento_holds (
  id TEXT PRIMARY KEY,
  assento_id TEXT NOT NULL REFERENCES assentos_onibus(id),
  reserva_id TEXT REFERENCES reservas(id),
  usuario_id TEXT REFERENCES usuarios(id),
  status VARCHAR(20) NOT NULL DEFAULT 'ativo',
  expira_em TIMESTAMP NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  convertido_em TIMESTAMP,
  liberado_em TIMESTAMP,
  CONSTRAINT assento_holds_status_ck CHECK (status IN ('ativo', 'convertido', 'liberado', 'expirado'))
);
CREATE INDEX IF NOT EXISTS assento_holds_assento_idx ON assento_holds (assento_id, status, expira_em);
CREATE UNIQUE INDEX IF NOT EXISTS assento_holds_ativo_unico ON assento_holds (assento_id) WHERE status = 'ativo';

CREATE TABLE IF NOT EXISTS assento_alocacoes (
  id TEXT PRIMARY KEY,
  assento_id TEXT NOT NULL REFERENCES assentos_onibus(id),
  reserva_id TEXT NOT NULL REFERENCES reservas(id),
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  ponto_embarque_id TEXT REFERENCES pontos_embarque_operacao(id),
  status VARCHAR(20) NOT NULL DEFAULT 'ativa',
  alocado_por TEXT REFERENCES usuarios(id),
  alocado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  encerrado_em TIMESTAMP,
  motivo TEXT,
  CONSTRAINT assento_alocacoes_status_ck CHECK (status IN ('ativa', 'movida', 'cancelada'))
);
CREATE INDEX IF NOT EXISTS assento_alocacoes_assento_idx ON assento_alocacoes (assento_id, status);
CREATE INDEX IF NOT EXISTS assento_alocacoes_reserva_idx ON assento_alocacoes (reserva_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS assento_alocacoes_assento_ativo_unico ON assento_alocacoes (assento_id) WHERE status = 'ativa';
CREATE UNIQUE INDEX IF NOT EXISTS assento_alocacoes_reserva_ativa_unico ON assento_alocacoes (reserva_id) WHERE status = 'ativa';

CREATE TABLE IF NOT EXISTS checkins_operacao (
  id TEXT PRIMARY KEY,
  saida_id TEXT NOT NULL REFERENCES saidas_operacionais(id),
  reserva_id TEXT NOT NULL REFERENCES reservas(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pendente',
  confirmado_em TIMESTAMP,
  confirmado_por TEXT REFERENCES usuarios(id),
  observacoes TEXT,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT checkins_operacao_status_ck CHECK (status IN ('pendente', 'presente', 'ausente')),
  CONSTRAINT checkins_operacao_unico UNIQUE (saida_id, reserva_id)
);
CREATE INDEX IF NOT EXISTS checkins_operacao_saida_idx ON checkins_operacao (saida_id, status);

CREATE TABLE IF NOT EXISTS operacao_historico (
  id TEXT PRIMARY KEY,
  saida_id TEXT REFERENCES saidas_operacionais(id),
  entidade VARCHAR(50) NOT NULL,
  entidade_id TEXT,
  acao VARCHAR(80) NOT NULL,
  ator_id TEXT REFERENCES usuarios(id),
  antes JSONB,
  depois JSONB,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS operacao_historico_saida_idx ON operacao_historico (saida_id, criado_em);

ALTER TABLE reservas ADD COLUMN IF NOT EXISTS saida_operacional_id TEXT;
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS ponto_embarque_id TEXT;

DO $$ BEGIN
  ALTER TABLE reservas ADD CONSTRAINT reservas_saida_operacional_id_fk FOREIGN KEY (saida_operacional_id) REFERENCES saidas_operacionais(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE reservas ADD CONSTRAINT reservas_ponto_embarque_id_fk FOREIGN KEY (ponto_embarque_id) REFERENCES pontos_embarque_operacao(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS reservas_saida_operacional_idx ON reservas (saida_operacional_id);

