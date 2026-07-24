-- Migration: condições de pagamento vinculadas ao aceite contratual.
-- As colunas são opcionais para manter a compatibilidade com reservas históricas.

ALTER TABLE reservas ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(30);
--> statement-breakpoint
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS quantidade_parcelas INTEGER;
--> statement-breakpoint
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS valor_parcela DECIMAL(12,2);
--> statement-breakpoint
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS desconto_pagamento DECIMAL(12,2) DEFAULT 0;
