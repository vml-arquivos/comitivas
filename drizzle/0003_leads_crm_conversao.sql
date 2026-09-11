-- Migration: captação pública de leads e acompanhamento real no CRM.
-- Todos os novos campos são opcionais ou possuem default para preservar
-- os links de vendedores e leads já existentes.

ALTER TABLE leads_origem ADD COLUMN IF NOT EXISTS evento_id TEXT;
--> statement-breakpoint
ALTER TABLE leads_origem ADD COLUMN IF NOT EXISTS lote_id TEXT;
--> statement-breakpoint
ALTER TABLE leads_origem ADD COLUMN IF NOT EXISTS pacote_id TEXT;
--> statement-breakpoint
ALTER TABLE leads_origem ADD COLUMN IF NOT EXISTS nome VARCHAR(255);
--> statement-breakpoint
ALTER TABLE leads_origem ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(20);
--> statement-breakpoint
ALTER TABLE leads_origem ADD COLUMN IF NOT EXISTS email VARCHAR(255);
--> statement-breakpoint
ALTER TABLE leads_origem ADD COLUMN IF NOT EXISTS origem VARCHAR(80) DEFAULT 'site';
--> statement-breakpoint
ALTER TABLE leads_origem ADD COLUMN IF NOT EXISTS status VARCHAR(40) DEFAULT 'novo';
--> statement-breakpoint
ALTER TABLE leads_origem ADD COLUMN IF NOT EXISTS consentimento_whatsapp BOOLEAN DEFAULT false;
--> statement-breakpoint
ALTER TABLE leads_origem ADD COLUMN IF NOT EXISTS dados_contexto JSONB;
--> statement-breakpoint
ALTER TABLE leads_origem ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE leads_origem DROP CONSTRAINT IF EXISTS leads_origem_evento_id_fkey;
--> statement-breakpoint
ALTER TABLE leads_origem ADD CONSTRAINT leads_origem_evento_id_fkey
  FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE leads_origem DROP CONSTRAINT IF EXISTS leads_origem_lote_id_fkey;
--> statement-breakpoint
ALTER TABLE leads_origem ADD CONSTRAINT leads_origem_lote_id_fkey
  FOREIGN KEY (lote_id) REFERENCES lotes(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE leads_origem DROP CONSTRAINT IF EXISTS leads_origem_pacote_id_fkey;
--> statement-breakpoint
ALTER TABLE leads_origem ADD CONSTRAINT leads_origem_pacote_id_fkey
  FOREIGN KEY (pacote_id) REFERENCES pacotes(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS leads_origem_status_idx ON leads_origem (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS leads_origem_whatsapp_idx ON leads_origem (whatsapp);
