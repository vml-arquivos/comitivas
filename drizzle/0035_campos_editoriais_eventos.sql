-- Campos editoriais opcionais para apresentar melhor cada excursão na vitrine.
-- Nenhum campo altera datas, preços, lotes ou inventário existentes.
ALTER TABLE eventos
  ADD COLUMN IF NOT EXISTS subtitulo VARCHAR(255),
  ADD COLUMN IF NOT EXISTS destaque_titulo VARCHAR(160),
  ADD COLUMN IF NOT EXISTS destaque_texto TEXT,
  ADD COLUMN IF NOT EXISTS informacoes_praticas TEXT,
  ADD COLUMN IF NOT EXISTS atracoes_programacao TEXT;
