-- Destaques comerciais opcionais exibidos na vitrine e no configurador.
-- Campos nulos preservam todos os pacotes existentes sem alterar preços, períodos ou reservas.
ALTER TABLE pacotes ADD COLUMN IF NOT EXISTS destaque_titulo VARCHAR(160);
ALTER TABLE pacotes ADD COLUMN IF NOT EXISTS destaque_subtitulo VARCHAR(255);
ALTER TABLE pacotes ADD COLUMN IF NOT EXISTS destaque_texto TEXT;
