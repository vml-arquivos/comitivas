-- Operação comercial por pacote 2026.4
-- Configuração de contratação, ônibus, mapa de vagas e parcelas por data.
-- Forward-only e idempotente; não remove dados históricos.

ALTER TABLE pacotes ADD COLUMN IF NOT EXISTS forma_contratacao VARCHAR(30) NOT NULL DEFAULT 'hospedagem';
ALTER TABLE pacotes ADD COLUMN IF NOT EXISTS onibus_config JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE pacotes ADD COLUMN IF NOT EXISTS configuracao_pagamento JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pacotes ADD COLUMN IF NOT EXISTS data_limite_pagamento TIMESTAMP;

ALTER TABLE pacotes DROP CONSTRAINT IF EXISTS pacotes_forma_contratacao_check;
ALTER TABLE pacotes ADD CONSTRAINT pacotes_forma_contratacao_check
  CHECK (forma_contratacao IN ('onibus', 'hospedagem', 'onibus_hospedagem', 'livre'));

CREATE INDEX IF NOT EXISTS pacotes_forma_contratacao_idx ON pacotes (forma_contratacao, ativo);
CREATE INDEX IF NOT EXISTS pacotes_data_limite_pagamento_idx ON pacotes (data_limite_pagamento);

COMMENT ON COLUMN pacotes.forma_contratacao IS 'Forma comercial configurada: ônibus, hospedagem, ambos ou livre';
COMMENT ON COLUMN pacotes.onibus_config IS 'Mapa JSON de ônibus e assentos/vagas disponíveis do pacote';
COMMENT ON COLUMN pacotes.configuracao_pagamento IS 'Formas aceitas e limites de parcelamento configurados pelo administrador';
COMMENT ON COLUMN pacotes.data_limite_pagamento IS 'Data final até a qual as parcelas do pacote podem vencer';
