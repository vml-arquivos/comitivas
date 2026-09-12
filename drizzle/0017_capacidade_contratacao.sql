-- Amarração transacional entre contratação, transporte e hospedagem.
-- Migration forward-only: preserva reservas, alocações e quartos existentes.

ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS grupo_hospedagem VARCHAR(20),
  ADD COLUMN IF NOT EXISTS recursos_contratados JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE quartos_hospedagem
  ADD COLUMN IF NOT EXISTS estrutura VARCHAR(30) NOT NULL DEFAULT 'outro',
  ADD COLUMN IF NOT EXISTS local_hospedagem VARCHAR(120);

UPDATE quartos_hospedagem q
SET estrutura = CASE
  WHEN p.modalidade_hospedagem = 'quarto_ar_condicionado' THEN 'ar_condicionado'
  WHEN p.modalidade_hospedagem = 'quarto_ventilador' THEN 'ventilador'
  WHEN COALESCE(q.observacoes, '') ILIKE '%ar-condicionado%' OR COALESCE(q.nome, '') ILIKE '%ar-condicionado%' THEN 'ar_condicionado'
  WHEN COALESCE(q.observacoes, '') ILIKE '%ventilador%' OR COALESCE(q.nome, '') ILIKE '%ventilador%' THEN 'ventilador'
  ELSE q.estrutura
END
FROM pacotes p
WHERE q.pacote_id = p.id AND q.estrutura = 'outro';

UPDATE quartos_hospedagem
SET estrutura = CASE
  WHEN COALESCE(observacoes, '') ILIKE '%ar-condicionado%' OR COALESCE(nome, '') ILIKE '%ar-condicionado%' THEN 'ar_condicionado'
  WHEN COALESCE(observacoes, '') ILIKE '%ventilador%' OR COALESCE(nome, '') ILIKE '%ventilador%' THEN 'ventilador'
  ELSE estrutura
END
WHERE estrutura = 'outro';

CREATE INDEX IF NOT EXISTS quartos_hospedagem_capacidade_idx
  ON quartos_hospedagem (lote_id, estrutura, genero, ativo);
CREATE INDEX IF NOT EXISTS quartos_hospedagem_local_idx
  ON quartos_hospedagem (lote_id, local_hospedagem, ativo);
CREATE INDEX IF NOT EXISTS reservas_recursos_idx
  ON reservas (lote_id, grupo_hospedagem);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservas_grupo_hospedagem_ck') THEN
    ALTER TABLE reservas ADD CONSTRAINT reservas_grupo_hospedagem_ck
      CHECK (grupo_hospedagem IS NULL OR grupo_hospedagem IN ('masculino', 'feminino'));
  END IF;
END $$;
