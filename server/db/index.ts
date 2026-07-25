import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "node:path";
import bcrypt from "bcryptjs";
import * as schema from "./schema.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

// Todas as tabelas do schema.ts, na ordem de dependência (tabelas
// referenciadas antes das que têm foreign key para elas).
//
// Observação: as colunas de id/relacionamento usam TEXT em vez de UUID
// nativo do Postgres porque o app gera os ids com createId() do
// @paralleldrive/cuid2, cujo formato NÃO é um UUID válido — uma coluna
// UUID nativa rejeitaria esses valores em todo INSERT.
const CREATE_TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    cpf VARCHAR(14) UNIQUE,
    telefone VARCHAR(20),
    senha_hash VARCHAR(255) NOT NULL,
    tipo VARCHAR(50) DEFAULT 'cliente',
    rg VARCHAR(20),
    data_nascimento TIMESTAMP,
    estado_civil VARCHAR(30),
    profissao VARCHAR(100),
    endereco TEXT,
    nacionalidade VARCHAR(50) DEFAULT 'Brasileira',
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS usuarios_email_idx ON usuarios (email)`,
  `CREATE INDEX IF NOT EXISTS usuarios_cpf_idx ON usuarios (cpf)`,

  `CREATE TABLE IF NOT EXISTS eventos (
    id TEXT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    data_inicio TIMESTAMP NOT NULL,
    data_fim TIMESTAMP NOT NULL,
    local VARCHAR(255) NOT NULL,
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS eventos_nome_idx ON eventos (nome)`,

  `CREATE TABLE IF NOT EXISTS lotes (
    id TEXT PRIMARY KEY,
    evento_id TEXT NOT NULL REFERENCES eventos(id),
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    vagas_totais INTEGER NOT NULL,
    "vagas_disponíveis" INTEGER NOT NULL,
    data_inicio TIMESTAMP NOT NULL,
    data_fim TIMESTAMP NOT NULL,
    valor_base DECIMAL(12,2) NOT NULL,
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS lotes_evento_id_idx ON lotes (evento_id)`,

  `CREATE TABLE IF NOT EXISTS pacotes (
    id TEXT PRIMARY KEY,
    lote_id TEXT NOT NULL REFERENCES lotes(id),
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    valor_total DECIMAL(12,2) NOT NULL,
    itens_selecionados JSONB NOT NULL,
    modalidade_hospedagem VARCHAR(30) DEFAULT 'quarto_ventilador',
    disponibilidade VARCHAR(30) DEFAULT 'disponivel',
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS pacotes_lote_id_idx ON pacotes (lote_id)`,

  `CREATE TABLE IF NOT EXISTS itens_addon (
    id TEXT PRIMARY KEY,
    lote_id TEXT NOT NULL REFERENCES lotes(id),
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    valor DECIMAL(12,2) NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS itens_addon_lote_id_idx ON itens_addon (lote_id)`,

  `CREATE TABLE IF NOT EXISTS cupons (
    id TEXT PRIMARY KEY,
    evento_id TEXT NOT NULL REFERENCES eventos(id),
    codigo VARCHAR(50) NOT NULL UNIQUE,
    desconto_percentual DECIMAL(5,2),
    desconto_fixo DECIMAL(12,2),
    uso_maximo INTEGER,
    uso_atual INTEGER DEFAULT 0,
    validade TIMESTAMP,
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS cupons_codigo_idx ON cupons (codigo)`,
  `CREATE INDEX IF NOT EXISTS cupons_evento_id_idx ON cupons (evento_id)`,

  `CREATE TABLE IF NOT EXISTS reservas (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES usuarios(id),
    lote_id TEXT NOT NULL REFERENCES lotes(id),
    pacote_id TEXT REFERENCES pacotes(id),
    status VARCHAR(50) DEFAULT 'visitante',
    itens_selecionados JSONB NOT NULL,
    valor_total DECIMAL(12,2) NOT NULL,
    cupom_id TEXT REFERENCES cupons(id),
    desconto_aplicado DECIMAL(12,2) DEFAULT 0,
    forma_pagamento VARCHAR(30),
    quantidade_parcelas INTEGER,
    valor_parcela DECIMAL(12,2),
    desconto_pagamento DECIMAL(12,2) DEFAULT 0,
    contrato_pdf_url VARCHAR(500),
    aceite_timestamp TIMESTAMP,
    aceite_ip VARCHAR(45),
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS reservas_usuario_id_idx ON reservas (usuario_id)`,
  `CREATE INDEX IF NOT EXISTS reservas_lote_id_idx ON reservas (lote_id)`,
  // Índice de pacote_id NÃO é criado aqui de propósito: em bancos já existentes a
  // tabela reservas já existe (o CREATE TABLE IF NOT EXISTS acima é um no-op) e a
  // coluna pacote_id ainda não existiria neste ponto, fazendo este CREATE INDEX
  // falhar com "column pacote_id does not exist" e derrubar o boot da aplicação.
  // A coluna + índice são criados de forma idempotente (e segura para bancos novos
  // ou existentes) pela migration drizzle/0001_reserva_pacote_escolhido.sql, que
  // roda logo em seguida via runDrizzleMigrations().
  `CREATE INDEX IF NOT EXISTS reservas_status_idx ON reservas (status)`,

  `CREATE TABLE IF NOT EXISTS pagamentos (
    id TEXT PRIMARY KEY,
    reserva_id TEXT NOT NULL REFERENCES reservas(id),
    status VARCHAR(50) DEFAULT 'pendente',
    valor DECIMAL(12,2) NOT NULL,
    metodo VARCHAR(50) NOT NULL,
    gateway_id VARCHAR(255),
    gateway_resposta JSONB,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS pagamentos_reserva_id_idx ON pagamentos (reserva_id)`,
  `CREATE INDEX IF NOT EXISTS pagamentos_status_idx ON pagamentos (status)`,

  `CREATE TABLE IF NOT EXISTS emails_enviados (
    id TEXT PRIMARY KEY,
    reserva_id TEXT NOT NULL REFERENCES reservas(id),
    tipo VARCHAR(50) NOT NULL,
    destinatario VARCHAR(255) NOT NULL,
    assunto VARCHAR(255) NOT NULL,
    corpo TEXT,
    anexos JSONB,
    enviado_em TIMESTAMP,
    erro TEXT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS emails_enviados_reserva_id_idx ON emails_enviados (reserva_id)`,

  `CREATE TABLE IF NOT EXISTS leads_origem (
    id TEXT PRIMARY KEY,
    codigo_origem VARCHAR(100) NOT NULL,
    vendedor_id TEXT REFERENCES usuarios(id),
    usuario_id TEXT REFERENCES usuarios(id),
    evento_id TEXT REFERENCES eventos(id),
    lote_id TEXT REFERENCES lotes(id),
    pacote_id TEXT REFERENCES pacotes(id),
    nome VARCHAR(255),
    whatsapp VARCHAR(20),
    email VARCHAR(255),
    origem VARCHAR(80) DEFAULT 'site',
    status VARCHAR(40) DEFAULT 'novo',
    consentimento_whatsapp BOOLEAN DEFAULT false,
    dados_contexto JSONB,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS leads_origem_codigo_idx ON leads_origem (codigo_origem)`,
  `CREATE INDEX IF NOT EXISTS leads_origem_vendedor_id_idx ON leads_origem (vendedor_id)`,
  `CREATE INDEX IF NOT EXISTS leads_origem_status_idx ON leads_origem (status)`,
  `CREATE INDEX IF NOT EXISTS leads_origem_whatsapp_idx ON leads_origem (whatsapp)`,

  `CREATE TABLE IF NOT EXISTS fotos_evento (
    id TEXT PRIMARY KEY,
    evento_id TEXT NOT NULL REFERENCES eventos(id),
    url_foto VARCHAR(500) NOT NULL,
    legenda VARCHAR(500),
    ordem INTEGER DEFAULT 0,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS fotos_evento_idx ON fotos_evento (evento_id)`,

  `CREATE TABLE IF NOT EXISTS avaliacoes (
    id TEXT PRIMARY KEY,
    evento_id TEXT NOT NULL REFERENCES eventos(id),
    usuario_id TEXT NOT NULL REFERENCES usuarios(id),
    reserva_id TEXT NOT NULL REFERENCES reservas(id),
    nota INTEGER NOT NULL,
    comentario TEXT,
    aprovado BOOLEAN DEFAULT false,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS avaliacoes_evento_idx ON avaliacoes (evento_id)`,
  `CREATE INDEX IF NOT EXISTS avaliacoes_usuario_idx ON avaliacoes (usuario_id)`,
  `CREATE INDEX IF NOT EXISTS avaliacoes_reserva_idx ON avaliacoes (reserva_id)`,
];

async function ensureSchema() {
  console.log("[DB] Verificando/criando schema (todas as tabelas)...");
  for (const statement of CREATE_TABLES) {
    await pool.query(statement);
  }
  console.log("[DB] Schema OK (12 tabelas verificadas)");
}

async function runDrizzleMigrations() {
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  console.log(`[DB] Aplicando migrations Drizzle em ${migrationsFolder}...`);
  await migrate(db, { migrationsFolder });
  console.log("[DB] Migrations Drizzle aplicadas com sucesso");
}

async function ensureAdminTestUser() {
  if (process.env.ENABLE_TEST_ADMIN !== "true") {
    console.log("[DB] Usuário administrativo de teste desabilitado");
    return;
  }

  const adminExists = await pool.query(
    "SELECT id FROM usuarios WHERE email = $1",
    ["admin@comitivas.test"]
  );

  if (adminExists.rows.length === 0) {
    const senhaHash = await bcrypt.hash("Comitiva@2026!Teste", 10);

    await pool.query(
      `INSERT INTO usuarios (id, nome, email, senha_hash, tipo, ativo)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ["admin-test-001", "Admin Teste", "admin@comitivas.test", senhaHash, "admin", true]
    );
    console.log("[DB] Usuário administrativo de teste criado");
  } else {
    console.log("[DB] Usuário admin de teste já existe");
  }
}

export async function initializeDatabase() {
  try {
    console.log("[DB] Conectando ao banco de dados...");
    await pool.query("SELECT 1");
    console.log("[DB] Conexão estabelecida com sucesso");

    await ensureSchema();
    await runDrizzleMigrations();
    await ensureAdminTestUser();

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
