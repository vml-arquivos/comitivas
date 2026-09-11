-- Migration: dados contratuais do cliente e modalidade de hospedagem
-- Compatível com bancos novos e existentes: todas as colunas são opcionais
-- ou possuem default, preservando registros já criados.

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rg VARCHAR(20);
--> statement-breakpoint
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS data_nascimento TIMESTAMP;
--> statement-breakpoint
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS estado_civil VARCHAR(30);
--> statement-breakpoint
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS profissao VARCHAR(100);
--> statement-breakpoint
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS endereco TEXT;
--> statement-breakpoint
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nacionalidade VARCHAR(50) DEFAULT 'Brasileira';
--> statement-breakpoint
ALTER TABLE pacotes ADD COLUMN IF NOT EXISTS modalidade_hospedagem VARCHAR(30) DEFAULT 'quarto_ventilador';
--> statement-breakpoint
ALTER TABLE pacotes DROP CONSTRAINT IF EXISTS pacotes_modalidade_hospedagem_check;
--> statement-breakpoint
ALTER TABLE pacotes ADD CONSTRAINT pacotes_modalidade_hospedagem_check
  CHECK (modalidade_hospedagem IS NULL OR modalidade_hospedagem IN ('camping', 'quarto_ventilador', 'quarto_ar_condicionado'));
