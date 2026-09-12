-- Cadastro operacional: sexo para direcionamento automático de hospedagem e endereço estruturado.
-- Forward-only e idempotente; o campo endereco legado permanece preservado para compatibilidade.
ALTER TABLE "usuarios"
  ADD COLUMN IF NOT EXISTS "sexo" varchar(20),
  ADD COLUMN IF NOT EXISTS "cep" varchar(9),
  ADD COLUMN IF NOT EXISTS "logradouro" varchar(255),
  ADD COLUMN IF NOT EXISTS "numero" varchar(20),
  ADD COLUMN IF NOT EXISTS "complemento" varchar(120),
  ADD COLUMN IF NOT EXISTS "bairro" varchar(120),
  ADD COLUMN IF NOT EXISTS "cidade" varchar(120),
  ADD COLUMN IF NOT EXISTS "estado" varchar(2);

CREATE INDEX IF NOT EXISTS "usuarios_sexo_idx" ON "usuarios" ("sexo");
CREATE INDEX IF NOT EXISTS "usuarios_cep_idx" ON "usuarios" ("cep");

DO $$
BEGIN
  ALTER TABLE "usuarios"
    ADD CONSTRAINT "usuarios_sexo_check"
    CHECK ("sexo" IS NULL OR "sexo" IN ('masculino', 'feminino'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "usuarios"
    ADD CONSTRAINT "usuarios_estado_check"
    CHECK ("estado" IS NULL OR "estado" ~ '^[A-Za-zÀ-ÿ]{2}$');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "usuarios"
    ADD CONSTRAINT "usuarios_cep_check"
    CHECK ("cep" IS NULL OR regexp_replace("cep", '[^0-9]', '', 'g') ~ '^[0-9]{8}$');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE "usuarios"
SET "sexo" = lower(trim("sexo"))
WHERE "sexo" IS NOT NULL;

UPDATE "usuarios"
SET "estado" = upper(trim("estado"))
WHERE "estado" IS NOT NULL;

UPDATE "usuarios"
SET "cep" = regexp_replace("cep", '[^0-9]', '', 'g')
WHERE "cep" IS NOT NULL;

UPDATE "usuarios"
SET "endereco" = concat_ws(', ',
  NULLIF(trim("logradouro"), ''),
  NULLIF(trim("numero"), ''),
  NULLIF(trim("complemento"), ''),
  NULLIF(trim("bairro"), ''),
  CASE WHEN NULLIF(trim("cidade"), '') IS NOT NULL OR NULLIF(trim("estado"), '') IS NOT NULL
    THEN concat_ws('/', NULLIF(trim("cidade"), ''), NULLIF(trim("estado"), ''))
    ELSE NULL
  END,
  CASE WHEN NULLIF(trim("cep"), '') IS NOT NULL
    THEN concat('CEP ', NULLIF(trim("cep"), ''))
    ELSE NULL
  END
)
WHERE ("endereco" IS NULL OR trim("endereco") = '')
  AND (NULLIF(trim("logradouro"), '') IS NOT NULL OR NULLIF(trim("cidade"), '') IS NOT NULL);

UPDATE "usuarios"
SET "atualizado_em" = CURRENT_TIMESTAMP
WHERE "sexo" IS NOT NULL OR "cep" IS NOT NULL OR "logradouro" IS NOT NULL OR "cidade" IS NOT NULL;

COMMENT ON COLUMN "usuarios"."sexo" IS 'Sexo operacional para direcionamento automático de hospedagem';
COMMENT ON COLUMN "usuarios"."endereco" IS 'Endereço completo formatado, mantido para compatibilidade contratual';
COMMENT ON COLUMN "usuarios"."cep" IS 'CEP sem máscara ou com máscara';
COMMENT ON COLUMN "usuarios"."estado" IS 'UF do endereço';
