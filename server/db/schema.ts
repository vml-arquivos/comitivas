import { pgTable, text, serial, integer, varchar, timestamp, boolean, decimal, jsonb, uuid, pgEnum, index } from "drizzle-orm/pg-core";
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
  id: uuid("id").primaryKey().default(() => createId()),
  nome: varchar("nome", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  cpf: varchar("cpf", { length: 14 }).unique(),
  telefone: varchar("telefone", { length: 20 }),
  senha_hash: varchar("senha_hash", { length: 255 }).notNull(),
  tipo: usuarioTipoEnum("tipo").default("cliente"),
  ativo: boolean("ativo").default(true),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({
  emailIdx: index("usuarios_email_idx").on(table.email),
  cpfIdx: index("usuarios_cpf_idx").on(table.cpf),
}));

export const eventos = pgTable("eventos", {
  id: uuid("id").primaryKey().default(() => createId()),
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
  id: uuid("id").primaryKey().default(() => createId()),
  evento_id: uuid("evento_id").notNull().references(() => eventos.id),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  vagas_totais: integer("vagas_totais").notNull(),
  vagas_disponíveis: integer("vagas_disponíveis").notNull(),
  data_inicio: timestamp("data_inicio").notNull(),
  data_fim: timestamp("data_fim").notNull(),
  valor_base: decimal("valor_base", { precision: 12, scale: 2 }).notNull(),
  ativo: boolean("ativo").default(true),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({
  eventoIdx: index("lotes_evento_id_idx").on(table.evento_id),
}));

export const pacotes = pgTable("pacotes", {
  id: uuid("id").primaryKey().default(() => createId()),
  lote_id: uuid("lote_id").notNull().references(() => lotes.id),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  valor_total: decimal("valor_total", { precision: 12, scale: 2 }).notNull(),
  itens_selecionados: jsonb("itens_selecionados").notNull(),
  ativo: boolean("ativo").default(true),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({
  loteIdx: index("pacotes_lote_id_idx").on(table.lote_id),
}));

export const itens_addon = pgTable("itens_addon", {
  id: uuid("id").primaryKey().default(() => createId()),
  lote_id: uuid("lote_id").notNull().references(() => lotes.id),
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
  id: uuid("id").primaryKey().default(() => createId()),
  evento_id: uuid("evento_id").notNull().references(() => eventos.id),
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
  id: uuid("id").primaryKey().default(() => createId()),
  usuario_id: uuid("usuario_id").notNull().references(() => usuarios.id),
  lote_id: uuid("lote_id").notNull().references(() => lotes.id),
  status: reservaStatusEnum("status").default("visitante"),
  itens_selecionados: jsonb("itens_selecionados").notNull(),
  valor_total: decimal("valor_total", { precision: 12, scale: 2 }).notNull(),
  cupom_id: uuid("cupom_id").references(() => cupons.id),
  desconto_aplicado: decimal("desconto_aplicado", { precision: 12, scale: 2 }).default("0"),
  contrato_pdf_url: varchar("contrato_pdf_url", { length: 500 }),
  aceite_timestamp: timestamp("aceite_timestamp"),
  aceite_ip: varchar("aceite_ip", { length: 45 }),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({
  usuarioIdx: index("reservas_usuario_id_idx").on(table.usuario_id),
  loteIdx: index("reservas_lote_id_idx").on(table.lote_id),
  statusIdx: index("reservas_status_idx").on(table.status),
}));

export const pagamentos = pgTable("pagamentos", {
  id: uuid("id").primaryKey().default(() => createId()),
  reserva_id: uuid("reserva_id").notNull().references(() => reservas.id),
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
  id: uuid("id").primaryKey().default(() => createId()),
  reserva_id: uuid("reserva_id").notNull().references(() => reservas.id),
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
  id: uuid("id").primaryKey().default(() => createId()),
  codigo_origem: varchar("codigo_origem", { length: 100 }).notNull(),
  vendedor_id: uuid("vendedor_id").references(() => usuarios.id),
  usuario_id: uuid("usuario_id").references(() => usuarios.id),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
}, (table) => ({
  codigoIdx: index("leads_origem_codigo_idx").on(table.codigo_origem),
  vendedorIdx: index("leads_origem_vendedor_id_idx").on(table.vendedor_id),
}));

// Relations
export const usuariosRelations = relations(usuarios, ({ many }) => ({
  reservas: many(reservas),
  leads: many(leads_origem),
}));

export const eventosRelations = relations(eventos, ({ many }) => ({
  lotes: many(lotes),
  cupons: many(cupons),
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
