import crypto from "node:crypto";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL ausente para validação da migration");
}

const expectedTables = [
  "contratos_documentos",
  "regras_convivencia_versoes",
  "contrato_validacoes",
  "otp_desafios",
  "password_reset_tokens",
  "pagamento_idempotencias",
  "pagamento_parcelas",
  "webhook_eventos",
  "descontos_administrativos",
  "videos_evento",
];

const expectedColumns = {
  usuarios: ["rg", "data_nascimento", "estado_civil", "profissao", "endereco", "nacionalidade"],
  pacotes: ["modalidade_hospedagem", "disponibilidade"],
  pagamentos: ["idempotency_key"],
  fotos_evento: ["alt_text", "categoria", "destaque", "capa", "formato"],
  contratos_documentos: [
    "id", "reserva_id", "versao", "versao_template", "snapshot", "snapshot_sha256",
    "pdf_sha256", "arquivo", "status", "criado_em", "validado_em", "invalidado_em",
  ],
  regras_convivencia_versoes: ["id", "versao", "titulo", "conteudo", "conteudo_sha256", "ativo", "criado_em"],
  contrato_validacoes: [
    "id", "protocolo", "contrato_id", "usuario_id", "reserva_id", "versao", "snapshot_sha256",
    "pdf_sha256", "aceite_contrato", "aceite_regras", "regras_versao", "aviso_privacidade_versao",
    "canal", "destinatario_mascarado", "message_id", "enviado_em", "confirmado_em", "servidor_utc",
    "ip", "user_agent", "navegador", "sistema_operacional", "idioma", "timezone", "latitude",
    "longitude", "precisao_metros", "geolocalizacao_consentida", "criado_em",
  ],
  otp_desafios: [
    "id", "usuario_id", "reserva_id", "contrato_id", "canal", "destinatario_mascarado",
    "segredo_hash", "expira_em", "tentativas", "max_tentativas", "cooldown_ate", "usado_em", "criado_em",
  ],
  password_reset_tokens: ["id", "usuario_id", "token_hash", "expira_em", "usado_em", "criado_em"],
  pagamento_idempotencias: ["id", "chave", "operacao", "reserva_id", "pagamento_id", "resposta", "criado_em", "atualizado_em"],
  pagamento_parcelas: [
    "id", "pagamento_id", "reserva_id", "sequencia", "valor", "vencimento", "cora_id", "status",
    "boleto_url", "pix_copia_e_cola", "codigo_barras", "linha_digitavel", "criado_em", "atualizado_em",
  ],
  webhook_eventos: ["id", "provedor", "evento_id", "tipo", "recurso_id", "payload", "processado_em", "criado_em"],
  descontos_administrativos: [
    "id", "reserva_id", "administrador_id", "motivo", "tipo", "valor_informado", "subtotal_original",
    "valor_desconto", "total_final", "criado_em",
  ],
  videos_evento: ["id", "evento_id", "url", "youtube_id", "titulo", "descricao", "ordem", "ativo", "destaque", "criado_em", "atualizado_em"],
};

const expectedIndexes = [
  "pagamentos_idempotency_key_idx",
  "contratos_documentos_reserva_versao_idx",
  "contratos_documentos_status_idx",
  "contrato_validacoes_reserva_idx",
  "otp_desafios_lookup_idx",
  "password_reset_tokens_user_idx",
  "pagamento_parcelas_reserva_sequencia_idx",
  "descontos_administrativos_reserva_idx",
  "videos_evento_evento_idx",
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query("SELECT 1");

  const tableResult = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [expectedTables],
  );
  const foundTables = new Set(tableResult.rows.map((row) => row.table_name));
  const missingTables = expectedTables.filter((table) => !foundTables.has(table));
  if (missingTables.length) throw new Error(`Migration incompleta. Tabelas ausentes: ${missingTables.join(", ")}`);

  const columnResult = await pool.query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])
     ORDER BY table_name, ordinal_position`,
    [Object.keys(expectedColumns)],
  );
  const foundColumns = new Set(columnResult.rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missingColumns = Object.entries(expectedColumns)
    .flatMap(([table, columns]) => columns.filter((column) => !foundColumns.has(`${table}.${column}`)).map((column) => `${table}.${column}`));
  if (missingColumns.length) throw new Error(`Migration incompleta. Colunas ausentes: ${missingColumns.join(", ")}`);

  const indexResult = await pool.query(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = ANY($1::text[])
     ORDER BY indexname`,
    [expectedIndexes],
  );
  const foundIndexes = new Set(indexResult.rows.map((row) => row.indexname));
  const missingIndexes = expectedIndexes.filter((index) => !foundIndexes.has(index));
  if (missingIndexes.length) throw new Error(`Migration incompleta. Índices ausentes: ${missingIndexes.join(", ")}`);

  const migrationTableResult = await pool.query(
    `SELECT to_regclass('drizzle.__drizzle_migrations') AS migration_table`,
  );
  if (!migrationTableResult.rows[0]?.migration_table) throw new Error("Tabela de controle do Drizzle ausente");
  const migrationCountResult = await pool.query(
    `SELECT COUNT(*)::int AS count FROM drizzle.__drizzle_migrations`,
  );
  const migrationCount = Number(migrationCountResult.rows[0]?.count || 0);
  if (migrationCount < 8) throw new Error(`Histórico Drizzle incompleto: ${migrationCount}/8 migrations`);

  const rulesResult = await pool.query(
    `SELECT conteudo, conteudo_sha256 FROM regras_convivencia_versoes WHERE versao = $1 LIMIT 1`,
    ["2026.1"],
  );
  if (rulesResult.rowCount !== 1) throw new Error("Seed das Regras de Convivência 2026.1 ausente");
  const rules = rulesResult.rows[0];
  const calculatedHash = crypto.createHash("sha256").update(rules.conteudo, "utf8").digest("hex");
  if (calculatedHash !== rules.conteudo_sha256) throw new Error("Hash da versão das Regras de Convivência não confere");

  console.log(JSON.stringify({
    connection: "ok",
    validation: "ok",
    migration: "0007",
    migrationHistory: migrationCount,
    tables: expectedTables.length,
    columns: Object.values(expectedColumns).reduce((total, columns) => total + columns.length, 0),
    indexes: expectedIndexes.length,
    rulesVersion: "2026.1",
    rulesHash: "ok",
  }, null, 2));
} finally {
  await pool.end();
}
