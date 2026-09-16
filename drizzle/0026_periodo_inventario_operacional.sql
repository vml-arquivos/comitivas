-- Vincula o inventário físico ao período comercial escolhido dentro do pacote.
-- NULL preserva o comportamento legado: a saída/quarto atende todo o lote.
ALTER TABLE saidas_operacionais
  ADD COLUMN IF NOT EXISTS periodo_id TEXT REFERENCES pacote_periodos(id);

ALTER TABLE quartos_hospedagem
  ADD COLUMN IF NOT EXISTS periodo_id TEXT REFERENCES pacote_periodos(id);

CREATE INDEX IF NOT EXISTS saidas_operacionais_periodo_idx
  ON saidas_operacionais (periodo_id, ativa);

CREATE INDEX IF NOT EXISTS quartos_hospedagem_periodo_idx
  ON quartos_hospedagem (periodo_id, ativo);
