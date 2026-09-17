-- Lotes comerciais independentes do lote histórico da excursão.
-- Cada registro controla uma janela de venda, preço e vagas para um pacote/período.
CREATE TABLE IF NOT EXISTS pacote_lotes_comerciais (
  id TEXT PRIMARY KEY,
  pacote_id TEXT NOT NULL REFERENCES pacotes(id),
  periodo_id TEXT REFERENCES pacote_periodos(id),
  forma_contratacao VARCHAR(32) NOT NULL DEFAULT 'onibus_hospedagem',
  nome VARCHAR(255) NOT NULL,
  descricao TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  vagas_totais INTEGER NOT NULL,
  vagas_disponiveis INTEGER NOT NULL,
  valor DECIMAL(12,2) NOT NULL,
  data_inicio TIMESTAMP NOT NULL,
  data_fim TIMESTAMP,
  saldo_migrado_em TIMESTAMP,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pacote_lotes_comerciais_vagas_check CHECK (vagas_totais > 0 AND vagas_disponiveis >= 0 AND vagas_disponiveis <= vagas_totais),
  CONSTRAINT pacote_lotes_comerciais_valor_check CHECK (valor >= 0),
  CONSTRAINT pacote_lotes_comerciais_datas_check CHECK (data_fim IS NULL OR data_inicio <= data_fim)
);

CREATE INDEX IF NOT EXISTS pacote_lotes_comerciais_pacote_periodo_idx
  ON pacote_lotes_comerciais (pacote_id, periodo_id, forma_contratacao, ativo, ordem);
CREATE INDEX IF NOT EXISTS pacote_lotes_comerciais_venda_idx
  ON pacote_lotes_comerciais (data_inicio, data_fim, ativo);

ALTER TABLE cupons
  ADD COLUMN IF NOT EXISTS lote_comercial_id TEXT REFERENCES pacote_lotes_comerciais(id);
CREATE INDEX IF NOT EXISTS cupons_lote_comercial_idx ON cupons (lote_comercial_id);

ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS lote_comercial_id TEXT REFERENCES pacote_lotes_comerciais(id);
CREATE INDEX IF NOT EXISTS reservas_lote_comercial_idx ON reservas (lote_comercial_id);

-- Pacotes atuais continuam funcionando com o preço legado até o administrador
-- configurar o primeiro lote comercial de cada pacote/período.
