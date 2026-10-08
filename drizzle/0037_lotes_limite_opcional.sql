ALTER TABLE pacote_lotes_comerciais ALTER COLUMN vagas_totais DROP NOT NULL;
ALTER TABLE pacote_lotes_comerciais ALTER COLUMN vagas_disponiveis DROP NOT NULL;
ALTER TABLE pacote_lotes_comerciais DROP CONSTRAINT IF EXISTS pacote_lotes_comerciais_limite_completo_check;
ALTER TABLE pacote_lotes_comerciais ADD CONSTRAINT pacote_lotes_comerciais_limite_completo_check CHECK ((vagas_totais IS NULL) = (vagas_disponiveis IS NULL));
