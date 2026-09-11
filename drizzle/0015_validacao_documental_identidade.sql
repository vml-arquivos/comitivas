ALTER TABLE "cliente_documentos"
  ADD COLUMN IF NOT EXISTS "tipo_identidade" varchar(30),
  ADD COLUMN IF NOT EXISTS "validacao_status" varchar(30) NOT NULL DEFAULT 'nao_iniciada',
  ADD COLUMN IF NOT EXISTS "dados_extraidos" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "validacao_resultado" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "validacao_provedor" varchar(40),
  ADD COLUMN IF NOT EXISTS "validacao_modelo" varchar(120),
  ADD COLUMN IF NOT EXISTS "leitura_iniciada_em" timestamp,
  ADD COLUMN IF NOT EXISTS "validado_em" timestamp,
  ADD COLUMN IF NOT EXISTS "erro_validacao" text,
  ADD COLUMN IF NOT EXISTS "leitura_tentativas" integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cliente_documentos_validacao_status_check') THEN
    ALTER TABLE "cliente_documentos"
      ADD CONSTRAINT "cliente_documentos_validacao_status_check"
      CHECK ("validacao_status" IN ('nao_iniciada', 'processando', 'aprovado', 'rejeitado', 'analise_manual', 'erro'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cliente_documentos_tipo_identidade_check') THEN
    ALTER TABLE "cliente_documentos"
      ADD CONSTRAINT "cliente_documentos_tipo_identidade_check"
      CHECK ("tipo_identidade" IS NULL OR "tipo_identidade" IN ('rg', 'cnh', 'passaporte', 'outro'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "cliente_documentos_validacao_idx"
  ON "cliente_documentos" ("usuario_id", "categoria", "validacao_status");

COMMENT ON COLUMN "cliente_documentos"."dados_extraidos" IS
  'Dados mínimos derivados do documento; não armazena a resposta integral do provedor.';
COMMENT ON COLUMN "cliente_documentos"."validacao_resultado" IS
  'Comparações entre documento e cadastro, sem alterar automaticamente a aprovação administrativa.';
