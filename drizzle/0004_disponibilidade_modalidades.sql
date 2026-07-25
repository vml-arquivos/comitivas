-- Migration: disponibilidade comercial individual por modalidade.
-- Permite sinalizar vagas disponíveis, últimas vagas ou esgotado sem usar
-- textos fixos na vitrine pública.

ALTER TABLE pacotes ADD COLUMN IF NOT EXISTS disponibilidade VARCHAR(30) DEFAULT 'disponivel';
--> statement-breakpoint
ALTER TABLE pacotes DROP CONSTRAINT IF EXISTS pacotes_disponibilidade_check;
--> statement-breakpoint
ALTER TABLE pacotes ADD CONSTRAINT pacotes_disponibilidade_check
  CHECK (disponibilidade IS NULL OR disponibilidade IN ('disponivel', 'ultimas_vagas', 'esgotado'));
