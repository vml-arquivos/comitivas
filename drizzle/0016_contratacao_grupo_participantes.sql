ALTER TABLE "reservas"
  ADD COLUMN IF NOT EXISTS "grupo_id" text;

CREATE TABLE IF NOT EXISTS "reserva_grupos" (
  "id" text PRIMARY KEY NOT NULL,
  "responsavel_id" text NOT NULL REFERENCES "usuarios"("id"),
  "lote_id" text NOT NULL REFERENCES "lotes"("id"),
  "vendedor_id" text REFERENCES "usuarios"("id"),
  "status" varchar(30) NOT NULL DEFAULT 'rascunho',
  "quantidade_participantes" integer NOT NULL DEFAULT 0,
  "valor_total_centavos" integer NOT NULL DEFAULT 0,
  "criado_em" timestamp NOT NULL DEFAULT now(),
  "atualizado_em" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "reserva_participantes" (
  "id" text PRIMARY KEY NOT NULL,
  "grupo_id" text NOT NULL REFERENCES "reserva_grupos"("id"),
  "reserva_id" text REFERENCES "reservas"("id"),
  "nome_completo" varchar(255) NOT NULL,
  "cpf" varchar(14),
  "data_nascimento" timestamp,
  "telefone" varchar(20),
  "email" varchar(255),
  "sexo_operacional" varchar(30),
  "vinculo_responsavel" varchar(80),
  "menor_idade" boolean NOT NULL DEFAULT false,
  "documento_status" varchar(30) NOT NULL DEFAULT 'nao_iniciada',
  "assento_id" text,
  "quarto_id" text,
  "vaga_quarto_id" text,
  "observacoes" text,
  "criado_em" timestamp NOT NULL DEFAULT now(),
  "atualizado_em" timestamp NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservas_grupo_id_fkey') THEN
    ALTER TABLE "reservas" ADD CONSTRAINT "reservas_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "reserva_grupos"("id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "reservas_grupo_id_idx" ON "reservas" ("grupo_id");
CREATE INDEX IF NOT EXISTS "reserva_grupos_responsavel_idx" ON "reserva_grupos" ("responsavel_id", "lote_id");
CREATE INDEX IF NOT EXISTS "reserva_grupos_lote_idx" ON "reserva_grupos" ("lote_id", "status");
CREATE INDEX IF NOT EXISTS "reserva_participantes_grupo_idx" ON "reserva_participantes" ("grupo_id");
CREATE INDEX IF NOT EXISTS "reserva_participantes_cpf_idx" ON "reserva_participantes" ("cpf", "grupo_id");
CREATE INDEX IF NOT EXISTS "reserva_participantes_reserva_idx" ON "reserva_participantes" ("reserva_id");
