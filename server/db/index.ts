import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

export async function initializeDatabase() {
  try {
    console.log("[DB] Conectando ao banco de dados...");
    await pool.query("SELECT 1");
    console.log("[DB] Conexão estabelecida com sucesso");
    return true;
  } catch (error) {
    console.error("[DB] Erro ao conectar:", error);
    return false;
  }
}

export async function closeDatabase() {
  await pool.end();
}

export type Database = typeof db;
