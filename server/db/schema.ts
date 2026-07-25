import { pgTable, text, serial, integer, varchar, timestamp, boolean, decimal, jsonb, pgEnum, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

// Enums
export const reservaStatusEnum = pgEnum("reserva_status", [
  "visitante",
  "cadastrado",
  "pacote_montado",
  "checkout_iniciado",
  "aguardando_pagamento",
  "contrato_gerado",
  "cliente_confirmado",
  "abandonado"
]);

export const pagamentoStatusEnum = pgEnum("pagamento_status", [
  "pendente",
  "processando",
  "aprovado",
  "recusado",
  "cancelado",
  "reembolsado"
]);

export const usuarioTipoEnum = pgEnum("usuario_tipo", [
  "cliente",
  "vendedor",
  "admin"
]);

// Tabelas

export const usuarios = pgTable("usuarios", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  nome: varchar("nome", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  cpf: varchar("cpf", { length: 14 }).unique(),
  telefone: varchar("telefone", { length: 20 }),
  senha_hash: varchar("senha_hash", { length: 255 }).notNull(),
  tipo: usuarioTipoEnum("tipo").default("cliente"),
  // Dados adicionais exigidos pelo contrato de excursão
  rg: varchar("rg", { length: 20 }),
  data_nascimento: timestamp("data_nascimento"),
  estado_civil: varchar("estado_civil", { length: 30 }),
  profissao: varchar("profissao", { length: 100 }),
  endereco: text("endereco"),
  nacionalidade: varchar("nacionalidade", { length: 50 }).default("Brasileira"),
  ativo: boolean("ativo").default(true),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({
  emailIdx: index("usuarios_email_idx").on(table.email),
  cpfIdx: index("usuarios_cpf_idx").on(table.cpf),
}));

export const eventos = pgTable("eventos", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  data_inicio: timestamp("data_inicio").notNull(),
  data_fim: timestamp("data_fim").notNull(),
  local: varchar("local", { length: 255 }).notNull(),
  ativo: boolean("ativo").default(true),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({
  nomeIdx: index("eventos_nome_idx").on(table.nome),
}));

export const lotes = pgTable("lotes", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  evento_id: text("evento_id").notNull().references(() => eventos.id),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  vagas_totais: integer("vagas_totais").notNull(),
  vagas_disponíveis: integer("vagas_disponíveis").notNull(),
  data_inicio: timestamp("data_inicio").notNull(),
  data_fim: timestamp("data_fim").notNull(),
  data_embarque: timestamp("data_embarque"),
  data_retorno: timestamp("data_retorno"),
  local_embarque: varchar("local_embarque", { length: 255 }),
  local_hospedagem: varchar("local_hospedagem", { length: 255 }),
  valor_base: decimal("valor_base", { precision: 12, scale: 2 }).notNull(),
  ativo: boolean("ativo").default(true),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({
  eventoIdx: index("lotes_evento_id_idx").on(table.evento_id),
}));

export const pacotes = pgTable("pacotes", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  lote_id: text("lote_id").notNull().references(() => lotes.id),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  valor_total: decimal("valor_total", { precision: 12, scale: 2 }).notNull(),
  itens_selecionados: jsonb("itens_selecionados").notNull(),
  // Modalidade de hospedagem do pacote, usada para marcar a cláusula correta
  // no contrato gerado: "camping" | "quarto_ventilador" | "quarto_ar_condicionado"
  modalidade_hospedagem: varchar("modalidade_hospedagem", { length: 30 }).default("quarto_ventilador"),
  disponibilidade: varchar("disponibilidade", { length: 30 }).default("disponivel"),
  ativo: boolean("ativo").default(true),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({
  loteIdx: index("pacotes_lote_id_idx").on(table.lote_id),
}));

export const itens_addon = pgTable("itens_addon", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  lote_id: text("lote_id").notNull().references(() => lotes.id),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  tipo: varchar("tipo", { length: 50 }).notNull(), // translado, camarote, hospedagem, etc
  ativo: boolean("ativo").default(true),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
}, (table) => ({
  loteIdx: index("itens_addon_lote_id_idx").on(table.lote_id),
}));

export const cupons = pgTable("cupons", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  evento_id: text("evento_id").notNull().references(() => eventos.id),
  codigo: varchar("codigo", { length: 50 }).notNull().unique(),
  desconto_percentual: decimal("desconto_percentual", { precision: 5, scale: 2 }),
  desconto_fixo: decimal("desconto_fixo", { precision: 12, scale: 2 }),
  uso_maximo: integer("uso_maximo"),
  uso_atual: integer("uso_atual").default(0),
  validade: timestamp("validade"),
  ativo: boolean("ativo").default(true),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
}, (table) => ({
  codigoIdx: index("cupons_codigo_idx").on(table.codigo),
  eventoIdx: index("cupons_evento_id_idx").on(table.evento_id),
}));

export const reservas = pgTable("reservas", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  usuario_id: text("usuario_id").notNull().references(() => usuarios.id),
  lote_id: text("lote_id").notNull().references(() => lotes.id),
  pacote_id: text("pacote_id").references(() => pacotes.id),
  status: reservaStatusEnum("status").default("visitante"),
  itens_selecionados: jsonb("itens_selecionados").notNull(),
  valor_total: decimal("valor_total", { precision: 12, scale: 2 }).notNull(),
  cupom_id: text("cupom_id").references(() => cupons.id),
  desconto_aplicado: decimal("desconto_aplicado", { precision: 12, scale: 2 }).default("0"),
  // Condição de pagamento aceita antes da geração do contrato.
  // Mantida na reserva para que o PDF seja um retrato imutável da contratação.
  forma_pagamento: varchar("forma_pagamento", { length: 30 }),
  quantidade_parcelas: integer("quantidade_parcelas"),
  valor_parcela: decimal("valor_parcela", { precision: 12, scale: 2 }),
  desconto_pagamento: decimal("desconto_pagamento", { precision: 12, scale: 2 }).default("0"),
  contrato_pdf_url: varchar("contrato_pdf_url", { length: 500 }),
  aceite_timestamp: timestamp("aceite_timestamp"),
  aceite_ip: varchar("aceite_ip", { length: 45 }),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({
  usuarioIdx: index("reservas_usuario_id_idx").on(table.usuario_id),
  loteIdx: index("reservas_lote_id_idx").on(table.lote_id),
  pacoteIdx: index("reservas_pacote_id_idx").on(table.pacote_id),
  statusIdx: index("reservas_status_idx").on(table.status),
}));

export const pagamentos = pgTable("pagamentos", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  reserva_id: text("reserva_id").notNull().references(() => reservas.id),
  status: pagamentoStatusEnum("status").default("pendente"),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  metodo: varchar("metodo", { length: 50 }).notNull(), // pix, credito, debito
  gateway_id: varchar("gateway_id", { length: 255 }),
  gateway_resposta: jsonb("gateway_resposta"),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({
  reservaIdx: index("pagamentos_reserva_id_idx").on(table.reserva_id),
  statusIdx: index("pagamentos_status_idx").on(table.status),
}));

export const emails_enviados = pgTable("emails_enviados", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  reserva_id: text("reserva_id").notNull().references(() => reservas.id),
  tipo: varchar("tipo", { length: 50 }).notNull(), // confirmacao, contrato, reenvio
  destinatario: varchar("destinatario", { length: 255 }).notNull(),
  assunto: varchar("assunto", { length: 255 }).notNull(),
  corpo: text("corpo"),
  anexos: jsonb("anexos"),
  enviado_em: timestamp("enviado_em"),
  erro: text("erro"),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
}, (table) => ({
  reservaIdx: index("emails_enviados_reserva_id_idx").on(table.reserva_id),
}));

export const leads_origem = pgTable("leads_origem", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  codigo_origem: varchar("codigo_origem", { length: 100 }).notNull(),
  vendedor_id: text("vendedor_id").references(() => usuarios.id),
  usuario_id: text("usuario_id").references(() => usuarios.id),
  evento_id: text("evento_id").references(() => eventos.id),
  lote_id: text("lote_id").references(() => lotes.id),
  pacote_id: text("pacote_id").references(() => pacotes.id),
  nome: varchar("nome", { length: 255 }),
  whatsapp: varchar("whatsapp", { length: 20 }),
  email: varchar("email", { length: 255 }),
  origem: varchar("origem", { length: 80 }).default("site"),
  status: varchar("status", { length: 40 }).default("novo"),
  consentimento_whatsapp: boolean("consentimento_whatsapp").default(false),
  dados_contexto: jsonb("dados_contexto"),
  observacoes: text("observacoes"),
  proximo_contato_em: timestamp("proximo_contato_em"),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
}, (table) => ({
  codigoIdx: index("leads_origem_codigo_idx").on(table.codigo_origem),
  vendedorIdx: index("leads_origem_vendedor_id_idx").on(table.vendedor_id),
  statusIdx: index("leads_origem_status_idx").on(table.status),
  whatsappIdx: index("leads_origem_whatsapp_idx").on(table.whatsapp),
}));

// Relations
export const usuariosRelations = relations(usuarios, ({ many }) => ({
  reservas: many(reservas),
  leads: many(leads_origem),
}));

export const lotesRelations = relations(lotes, ({ one, many }) => ({
  evento: one(eventos, { fields: [lotes.evento_id], references: [eventos.id] }),
  pacotes: many(pacotes),
  itens_addon: many(itens_addon),
  reservas: many(reservas),
}));

export const reservasRelations = relations(reservas, ({ one, many }) => ({
  usuario: one(usuarios, { fields: [reservas.usuario_id], references: [usuarios.id] }),
  lote: one(lotes, { fields: [reservas.lote_id], references: [lotes.id] }),
  cupom: one(cupons, { fields: [reservas.cupom_id], references: [cupons.id] }),
  pagamentos: many(pagamentos),
  emails: many(emails_enviados),
}));

export const pagamentosRelations = relations(pagamentos, ({ one }) => ({
  reserva: one(reservas, { fields: [pagamentos.reserva_id], references: [reservas.id] }),
}));

export const emailsRelations = relations(emails_enviados, ({ one }) => ({
  reserva: one(reservas, { fields: [emails_enviados.reserva_id], references: [reservas.id] }),
}));

export const cupomsRelations = relations(cupons, ({ one, many }) => ({
  evento: one(eventos, { fields: [cupons.evento_id], references: [eventos.id] }),
  reservas: many(reservas),
}));

export const leadsRelations = relations(leads_origem, ({ one }) => ({
  vendedor: one(usuarios, { fields: [leads_origem.vendedor_id], references: [usuarios.id] }),
  usuario: one(usuarios, { fields: [leads_origem.usuario_id], references: [usuarios.id] }),
}));

// Tabelas para área pública premium

export const fotos_evento = pgTable("fotos_evento", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  evento_id: varchar("evento_id", { length: 255 }).notNull().references(() => eventos.id),
  url_foto: varchar("url_foto", { length: 500 }).notNull(),
  legenda: varchar("legenda", { length: 500 }),
  ordem: integer("ordem").default(0),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
}, (table) => ({
  eventoIdx: index("fotos_evento_idx").on(table.evento_id),
}));

export const avaliacoes = pgTable("avaliacoes", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  evento_id: varchar("evento_id", { length: 255 }).notNull().references(() => eventos.id),
  usuario_id: text("usuario_id").notNull().references(() => usuarios.id),
  reserva_id: varchar("reserva_id", { length: 255 }).notNull().references(() => reservas.id),
  nota: integer("nota").notNull(), // 1-5
  comentario: text("comentario"),
  aprovado: boolean("aprovado").default(false),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({
  eventoIdx: index("avaliacoes_evento_idx").on(table.evento_id),
  usuarioIdx: index("avaliacoes_usuario_idx").on(table.usuario_id),
  reservaIdx: index("avaliacoes_reserva_idx").on(table.reserva_id),
}));

// Relações

export const fotosRelations = relations(fotos_evento, ({ one }) => ({
  evento: one(eventos, { fields: [fotos_evento.evento_id], references: [eventos.id] }),
}));

export const avaliacoesRelations = relations(avaliacoes, ({ one }) => ({
  evento: one(eventos, { fields: [avaliacoes.evento_id], references: [eventos.id] }),
  usuario: one(usuarios, { fields: [avaliacoes.usuario_id], references: [usuarios.id] }),
  reserva: one(reservas, { fields: [avaliacoes.reserva_id], references: [reservas.id] }),
}));

export const eventosRelations = relations(eventos, ({ many }) => ({
  lotes: many(lotes),
  cupons: many(cupons),
  fotos: many(fotos_evento),
  avaliacoes: many(avaliacoes),
}));
