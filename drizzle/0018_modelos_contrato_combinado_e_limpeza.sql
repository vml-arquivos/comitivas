-- Modelos contratuais explícitos: hospedagem, transporte e hospedagem + transporte.
-- Forward-only e idempotente; não remove dados históricos.

ALTER TABLE pacotes DROP CONSTRAINT IF EXISTS pacotes_contrato_modelo_check;
ALTER TABLE pacotes ADD CONSTRAINT pacotes_contrato_modelo_check
  CHECK (contrato_modelo IN ('auto', 'hospedagem', 'transporte', 'hospedagem_transporte'));
