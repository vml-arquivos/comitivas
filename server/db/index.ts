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

    // Criar tabelas se não existirem
    console.log("[DB] Criando schema se necessário...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id TEXT PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        cpf VARCHAR(14),
        telefone VARCHAR(20),
        senha_hash VARCHAR(255) NOT NULL,
        tipo VARCHAR(50) DEFAULT 'cliente',
        ativo BOOLEAN DEFAULT true,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("[DB] Tabela usuarios criada ou já existe");

    // Criar usuário admin de teste se não existir
    const adminExists = await pool.query(
      "SELECT id FROM usuarios WHERE email = $1",
      ["admin@comitivas.test"]
    );

    if (adminExists.rows.length === 0) {
      const bcrypt = await import("bcrypt");
      const senhaHash = await bcrypt.default.hash("Comitiva@2026!Teste", 10);
      
      await pool.query(
        `INSERT INTO usuarios (id, nome, email, senha_hash, tipo, ativo) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["admin-test-001", "Admin Teste", "admin@comitivas.test", senhaHash, "admin", true]
      );
      console.log("[DB] Usuário admin de teste criado");
    } else {
      console.log("[DB] Usuário admin de teste já existe");
    }

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
