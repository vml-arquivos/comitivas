import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL ausente para validação da migration");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query("SELECT 1");
  const { rows } = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'usuarios' AND column_name IN ('rg', 'data_nascimento', 'estado_civil', 'profissao', 'endereco', 'nacionalidade'))
        OR (table_name = 'pacotes' AND column_name = 'modalidade_hospedagem')
      )
    ORDER BY table_name, column_name
  `);

  console.log(JSON.stringify({ connection: "ok", columns: rows }, null, 2));
} finally {
  await pool.end();
}
