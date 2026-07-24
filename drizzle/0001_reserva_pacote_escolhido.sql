-- Migration: vínculo explícito entre reserva e pacote escolhido
-- A coluna é opcional para preservar reservas legadas; novas reservas passam a gravá-la.

ALTER TABLE reservas ADD COLUMN IF NOT EXISTS pacote_id TEXT;
--> statement-breakpoint
ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_pacote_id_fkey;
--> statement-breakpoint
ALTER TABLE reservas ADD CONSTRAINT reservas_pacote_id_fkey
  FOREIGN KEY (pacote_id) REFERENCES pacotes(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reservas_pacote_id_idx ON reservas (pacote_id);
