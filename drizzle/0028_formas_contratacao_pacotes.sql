-- Permite que cada pacote habilite uma ou mais formas de contratação.
-- A coluna legada forma_contratacao permanece como compatibilidade e modelo de contrato padrão.
ALTER TABLE pacotes
  ADD COLUMN IF NOT EXISTS formas_contratacao JSONB NOT NULL DEFAULT '["onibus_hospedagem"]'::jsonb;

-- Backfill determinístico dos pacotes existentes sem alterar preços, reservas ou inventário.
UPDATE pacotes
   SET formas_contratacao = CASE
     WHEN modalidade_hospedagem = 'camping' THEN '["onibus"]'::jsonb
     WHEN forma_contratacao IN ('onibus', 'hospedagem', 'onibus_hospedagem') THEN jsonb_build_array(forma_contratacao)
     ELSE '["onibus_hospedagem"]'::jsonb
   END
 WHERE formas_contratacao = '["onibus_hospedagem"]'::jsonb;

CREATE INDEX IF NOT EXISTS pacotes_formas_contratacao_gin_idx
  ON pacotes USING GIN (formas_contratacao);
