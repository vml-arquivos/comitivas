-- Fila comercial dos ônibus, mapa de quartos e solicitações de pós-venda.
-- Migration forward-only e aditiva: nenhum contrato, pagamento ou histórico é removido.

ALTER TABLE onibus_operacionais ADD COLUMN IF NOT EXISTS venda_ordem INTEGER NOT NULL DEFAULT 1;

WITH ordenados AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY saida_id ORDER BY criado_em, id)::int AS ordem
  FROM onibus_operacionais
  WHERE ativo = true
)
UPDATE onibus_operacionais AS o
SET venda_ordem = ordenados.ordem
FROM ordenados
WHERE o.id = ordenados.id;

CREATE UNIQUE INDEX IF NOT EXISTS onibus_operacionais_venda_ordem_ativa_idx
  ON onibus_operacionais (saida_id, venda_ordem) WHERE ativo = true;

CREATE TABLE IF NOT EXISTS quartos_hospedagem (
  id TEXT PRIMARY KEY,
  lote_id TEXT NOT NULL REFERENCES lotes(id),
  pacote_id TEXT REFERENCES pacotes(id),
  nome VARCHAR(120) NOT NULL,
  genero VARCHAR(20) NOT NULL,
  capacidade INTEGER NOT NULL,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por TEXT REFERENCES usuarios(id),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quartos_hospedagem_genero_ck CHECK (genero IN ('masculino', 'feminino')),
  CONSTRAINT quartos_hospedagem_capacidade_ck CHECK (capacidade BETWEEN 1 AND 30)
);
CREATE INDEX IF NOT EXISTS quartos_hospedagem_lote_idx ON quartos_hospedagem (lote_id, ativo);

CREATE TABLE IF NOT EXISTS quarto_alocacoes (
  id TEXT PRIMARY KEY,
  quarto_id TEXT NOT NULL REFERENCES quartos_hospedagem(id),
  reserva_id TEXT NOT NULL REFERENCES reservas(id),
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  numero_vaga INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ativa',
  alocado_por TEXT REFERENCES usuarios(id),
  alocado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  encerrado_em TIMESTAMP,
  motivo TEXT,
  CONSTRAINT quarto_alocacoes_status_ck CHECK (status IN ('ativa', 'movida', 'cancelada')),
  CONSTRAINT quarto_alocacoes_vaga_ck CHECK (numero_vaga > 0)
);
CREATE INDEX IF NOT EXISTS quarto_alocacoes_quarto_idx ON quarto_alocacoes (quarto_id, status);
CREATE INDEX IF NOT EXISTS quarto_alocacoes_reserva_idx ON quarto_alocacoes (reserva_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS quarto_alocacoes_vaga_ativa_unica
  ON quarto_alocacoes (quarto_id, numero_vaga) WHERE status = 'ativa';
CREATE UNIQUE INDEX IF NOT EXISTS quarto_alocacoes_reserva_ativa_unica
  ON quarto_alocacoes (reserva_id) WHERE status = 'ativa';

CREATE TABLE IF NOT EXISTS reserva_solicitacoes (
  id TEXT PRIMARY KEY,
  reserva_id TEXT NOT NULL REFERENCES reservas(id),
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  solicitado_por TEXT REFERENCES usuarios(id),
  solicitado_por_tipo VARCHAR(20) NOT NULL,
  tipo VARCHAR(30) NOT NULL,
  pacote_destino_id TEXT REFERENCES pacotes(id),
  motivo TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente',
  parecer TEXT,
  reembolso_status VARCHAR(30) NOT NULL DEFAULT 'nao_aplicavel',
  valor_reembolso_centavos INTEGER,
  decidido_por TEXT REFERENCES usuarios(id),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  concluido_em TIMESTAMP,
  CONSTRAINT reserva_solicitacoes_tipo_ck CHECK (tipo IN ('cancelamento', 'troca_pacote', 'reinicio')),
  CONSTRAINT reserva_solicitacoes_status_ck CHECK (status IN ('pendente', 'em_analise', 'aprovada', 'rejeitada', 'concluida')),
  CONSTRAINT reserva_solicitacoes_reembolso_ck CHECK (reembolso_status IN ('nao_aplicavel', 'a_analisar', 'aprovado', 'negado', 'processado')),
  CONSTRAINT reserva_solicitacoes_valor_ck CHECK (valor_reembolso_centavos IS NULL OR valor_reembolso_centavos >= 0)
);
CREATE INDEX IF NOT EXISTS reserva_solicitacoes_reserva_idx ON reserva_solicitacoes (reserva_id, status);
CREATE INDEX IF NOT EXISTS reserva_solicitacoes_usuario_idx ON reserva_solicitacoes (usuario_id, criado_em);
CREATE UNIQUE INDEX IF NOT EXISTS reserva_solicitacoes_aberta_unica
  ON reserva_solicitacoes (reserva_id, tipo)
  WHERE status IN ('pendente', 'em_analise', 'aprovada');
