import { pgTable, text, serial, integer, varchar, timestamp, boolean, decimal, jsonb, pgEnum, index, date } from "drizzle-orm/pg-core";
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
  "admin",
  "dev"
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
  sexo: varchar("sexo", { length: 20 }),
  data_nascimento: timestamp("data_nascimento"),
  estado_civil: varchar("estado_civil", { length: 30 }),
  profissao: varchar("profissao", { length: 100 }),
  endereco: text("endereco"),
  cep: varchar("cep", { length: 9 }),
  logradouro: varchar("logradouro", { length: 255 }),
  numero: varchar("numero", { length: 20 }),
  complemento: varchar("complemento", { length: 120 }),
  bairro: varchar("bairro", { length: 120 }),
  cidade: varchar("cidade", { length: 120 }),
  estado: varchar("estado", { length: 2 }),
  nacionalidade: varchar("nacionalidade", { length: 50 }).default("Brasileira"),
  ativo: boolean("ativo").default(true),
  session_version: integer("session_version").notNull().default(1),
  email_confirmado: boolean("email_confirmado").notNull().default(true),
  email_confirmado_em: timestamp("email_confirmado_em"),
  cadastro_status: varchar("cadastro_status", { length: 30 }).notNull().default("aprovado"),
  aprovado_em: timestamp("aprovado_em"),
  aprovado_por: text("aprovado_por"),
  gestor_id: text("gestor_id"),
  equipe_nome: varchar("equipe_nome", { length: 120 }),
  ultimo_acesso_em: timestamp("ultimo_acesso_em"),
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
  contrato_modelo: varchar("contrato_modelo", { length: 30 }).notNull().default("auto"),
  forma_contratacao: varchar("forma_contratacao", { length: 30 }).notNull().default("hospedagem"),
  onibus_config: jsonb("onibus_config").notNull().default([]),
  configuracao_pagamento: jsonb("configuracao_pagamento").notNull().default({}),
  data_limite_pagamento: timestamp("data_limite_pagamento"),
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

export const reservaGrupos = pgTable("reserva_grupos", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  responsavel_id: text("responsavel_id").notNull().references(() => usuarios.id),
  lote_id: text("lote_id").notNull().references(() => lotes.id),
  vendedor_id: text("vendedor_id").references(() => usuarios.id),
  status: varchar("status", { length: 30 }).notNull().default("rascunho"),
  quantidade_participantes: integer("quantidade_participantes").notNull().default(0),
  valor_total_centavos: integer("valor_total_centavos").notNull().default(0),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({ responsavelIdx: index("reserva_grupos_responsavel_idx").on(table.responsavel_id, table.lote_id), loteIdx: index("reserva_grupos_lote_idx").on(table.lote_id, table.status) }));

export const cupons = pgTable("cupons", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  evento_id: text("evento_id").notNull().references(() => eventos.id),
  codigo: varchar("codigo", { length: 50 }).notNull().unique(),
  desconto_percentual: decimal("desconto_percentual", { precision: 5, scale: 2 }),
  desconto_fixo: decimal("desconto_fixo", { precision: 12, scale: 2 }),
  uso_maximo: integer("uso_maximo"),
  limite_por_cliente: integer("limite_por_cliente"),
  pacote_id: text("pacote_id"),
  vendedor_id: text("vendedor_id"),
  campanha: varchar("campanha", { length: 120 }),
  valor_minimo: decimal("valor_minimo", { precision: 12, scale: 2 }),
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
  checkout_estado: varchar("checkout_estado", { length: 40 }).notNull().default("rascunho"),
  inventario_hold_id: text("inventario_hold_id"),
  valor_total_centavos: integer("valor_total_centavos"),
  preco_versao: varchar("preco_versao", { length: 40 }).notNull().default("legado-2026.1"),
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
  cronograma_pagamento: jsonb("cronograma_pagamento").notNull().default([]),
  vendedor_id: text("vendedor_id"),
  lead_id: text("lead_id"),
  origem_comercial: varchar("origem_comercial", { length: 100 }),
  comissao_regra_snapshot: jsonb("comissao_regra_snapshot"),
  comissao_centavos: integer("comissao_centavos").notNull().default(0),
  contrato_pdf_url: varchar("contrato_pdf_url", { length: 500 }),
  aceite_timestamp: timestamp("aceite_timestamp"),
  aceite_ip: varchar("aceite_ip", { length: 45 }),
  boleto_liberado_em: timestamp("boleto_liberado_em"),
  boleto_liberado_por: text("boleto_liberado_por"),
  saida_operacional_id: text("saida_operacional_id"),
  ponto_embarque_id: text("ponto_embarque_id"),
  grupo_hospedagem: varchar("grupo_hospedagem", { length: 20 }),
  recursos_contratados: jsonb("recursos_contratados").notNull().default({}),
  grupo_id: text("grupo_id").references(() => reservaGrupos.id),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({
  usuarioIdx: index("reservas_usuario_id_idx").on(table.usuario_id),
  loteIdx: index("reservas_lote_id_idx").on(table.lote_id),
  pacoteIdx: index("reservas_pacote_id_idx").on(table.pacote_id),
  statusIdx: index("reservas_status_idx").on(table.status),
  grupoIdx: index("reservas_grupo_id_idx").on(table.grupo_id),
}));

export const reservaParticipantes = pgTable("reserva_participantes", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  grupo_id: text("grupo_id").notNull().references(() => reservaGrupos.id),
  reserva_id: text("reserva_id").references(() => reservas.id),
  nome_completo: varchar("nome_completo", { length: 255 }).notNull(),
  cpf: varchar("cpf", { length: 14 }),
  data_nascimento: timestamp("data_nascimento"),
  telefone: varchar("telefone", { length: 20 }),
  email: varchar("email", { length: 255 }),
  sexo_operacional: varchar("sexo_operacional", { length: 30 }),
  vinculo_responsavel: varchar("vinculo_responsavel", { length: 80 }),
  menor_idade: boolean("menor_idade").notNull().default(false),
  documento_status: varchar("documento_status", { length: 30 }).notNull().default("nao_iniciada"),
  assento_id: text("assento_id"),
  quarto_id: text("quarto_id"),
  vaga_quarto_id: text("vaga_quarto_id"),
  observacoes: text("observacoes"),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({ grupoIdx: index("reserva_participantes_grupo_idx").on(table.grupo_id), cpfIdx: index("reserva_participantes_cpf_idx").on(table.cpf, table.grupo_id), reservaIdx: index("reserva_participantes_reserva_idx").on(table.reserva_id) }));

export const pagamentos = pgTable("pagamentos", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  reserva_id: text("reserva_id").notNull().references(() => reservas.id),
  status: pagamentoStatusEnum("status").default("pendente"),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  metodo: varchar("metodo", { length: 50 }).notNull(), // pix, credito, debito
  gateway_id: varchar("gateway_id", { length: 255 }),
  gateway_resposta: jsonb("gateway_resposta"),
  idempotency_key: varchar("idempotency_key", { length: 255 }),
  valor_centavos: integer("valor_centavos"),
  valor_pago_centavos: integer("valor_pago_centavos").notNull().default(0),
  status_reconciliado: varchar("status_reconciliado", { length: 30 }).notNull().default("pendente"),
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

// Configurações de pagamento editáveis pelo admin (regras de negócio, não
// segredos). Tabela singleton: sempre existe apenas a linha id='default'.
// Regras comerciais ficam aqui; as credenciais bancárias são mantidas em cofre
// criptografado próprio, acessível somente pelo perfil DEV.
export const configuracoesPagamento = pgTable("configuracoes_pagamento", {
  id: text("id").primaryKey().default("default"),
  pix_desconto_percentual: decimal("pix_desconto_percentual", { precision: 5, scale: 2 }).notNull().default("5"),
  credito_parcelas_maximo: integer("credito_parcelas_maximo").notNull().default(10),
  boleto_meses_maximo_antecedencia: integer("boleto_meses_maximo_antecedencia").notNull().default(20),
  boleto_modo: varchar("boleto_modo", { length: 20 }).notNull().default("manual"),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
  atualizado_por: text("atualizado_por"),
});

export const contratosDocumentos = pgTable("contratos_documentos", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  reserva_id: text("reserva_id").notNull().references(() => reservas.id),
  versao: integer("versao").notNull(),
  versao_template: varchar("versao_template", { length: 80 }).notNull(),
  snapshot: jsonb("snapshot").notNull(),
  snapshot_sha256: varchar("snapshot_sha256", { length: 64 }).notNull(),
  pdf_sha256: varchar("pdf_sha256", { length: 64 }),
  arquivo: varchar("arquivo", { length: 500 }),
  status: varchar("status", { length: 30 }).default("rascunho").notNull(),
  conteudo_canonico: text("conteudo_canonico"),
  regras_versao: varchar("regras_versao", { length: 30 }),
  regras_sha256: varchar("regras_sha256", { length: 64 }),
  aviso_privacidade_versao: varchar("aviso_privacidade_versao", { length: 30 }),
  visualizado_em: timestamp("visualizado_em"),
  motivo_invalidacao: text("motivo_invalidacao"),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  validado_em: timestamp("validado_em"),
  aprovado_admin_em: timestamp("aprovado_admin_em"),
  aprovado_admin_por: text("aprovado_admin_por").references(() => usuarios.id),
  invalidado_em: timestamp("invalidado_em"),
}, (table) => ({
  reservaVersaoIdx: index("contratos_documentos_reserva_versao_idx").on(table.reserva_id, table.versao),
  statusIdx: index("contratos_documentos_status_idx").on(table.status),
}));

export const regrasConvivenciaVersoes = pgTable("regras_convivencia_versoes", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  versao: varchar("versao", { length: 30 }).notNull().unique(),
  titulo: varchar("titulo", { length: 255 }).notNull(),
  conteudo: text("conteudo").notNull(),
  conteudo_sha256: varchar("conteudo_sha256", { length: 64 }).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
});

export const contratoValidacoes = pgTable("contrato_validacoes", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  protocolo: varchar("protocolo", { length: 80 }).notNull().unique(),
  contrato_id: text("contrato_id").notNull().references(() => contratosDocumentos.id),
  usuario_id: text("usuario_id").notNull().references(() => usuarios.id),
  reserva_id: text("reserva_id").notNull().references(() => reservas.id),
  versao: integer("versao").notNull(),
  snapshot_sha256: varchar("snapshot_sha256", { length: 64 }).notNull(),
  pdf_sha256: varchar("pdf_sha256", { length: 64 }).notNull(),
  aceite_contrato: boolean("aceite_contrato").notNull(),
  aceite_regras: boolean("aceite_regras").notNull(),
  aceite_contrato_texto: text("aceite_contrato_texto"),
  aceite_regras_texto: text("aceite_regras_texto"),
  aceites_sha256: varchar("aceites_sha256", { length: 64 }),
  regras_versao: varchar("regras_versao", { length: 30 }).notNull(),
  aviso_privacidade_versao: varchar("aviso_privacidade_versao", { length: 30 }).notNull(),
  canal: varchar("canal", { length: 20 }).notNull(),
  destinatario_mascarado: varchar("destinatario_mascarado", { length: 255 }).notNull(),
  message_id: varchar("message_id", { length: 255 }),
  enviado_em: timestamp("enviado_em"),
  confirmado_em: timestamp("confirmado_em").notNull(),
  servidor_utc: timestamp("servidor_utc").notNull(),
  ip: varchar("ip", { length: 45 }),
  user_agent: text("user_agent"),
  navegador: varchar("navegador", { length: 120 }),
  sistema_operacional: varchar("sistema_operacional", { length: 120 }),
  idioma: varchar("idioma", { length: 30 }),
  timezone: varchar("timezone", { length: 80 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  precisao_metros: decimal("precisao_metros", { precision: 10, scale: 2 }),
  geolocalizacao_consentida: boolean("geolocalizacao_consentida").default(false).notNull(),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
}, (table) => ({ reservaIdx: index("contrato_validacoes_reserva_idx").on(table.reserva_id) }));

export const otpDesafios = pgTable("otp_desafios", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  usuario_id: text("usuario_id").notNull().references(() => usuarios.id),
  reserva_id: text("reserva_id").notNull().references(() => reservas.id),
  contrato_id: text("contrato_id").notNull().references(() => contratosDocumentos.id),
  canal: varchar("canal", { length: 20 }).notNull(),
  destinatario_mascarado: varchar("destinatario_mascarado", { length: 255 }).notNull(),
  segredo_hash: varchar("segredo_hash", { length: 128 }).notNull(),
  expira_em: timestamp("expira_em").notNull(),
  tentativas: integer("tentativas").default(0).notNull(),
  max_tentativas: integer("max_tentativas").default(5).notNull(),
  cooldown_ate: timestamp("cooldown_ate").notNull(),
  status_envio: varchar("status_envio", { length: 20 }).notNull().default("pendente"),
  provedor: varchar("provedor", { length: 80 }),
  message_id: varchar("message_id", { length: 255 }),
  solicitado_em: timestamp("solicitado_em"),
  enviado_em: timestamp("enviado_em"),
  falhou_em: timestamp("falhou_em"),
  erro_envio: text("erro_envio"),
  usado_em: timestamp("usado_em"),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
}, (table) => ({ lookupIdx: index("otp_desafios_lookup_idx").on(table.usuario_id, table.reserva_id, table.contrato_id, table.criado_em) }));

export const contratoEventos = pgTable("contrato_eventos", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  contrato_id: text("contrato_id").notNull().references(() => contratosDocumentos.id),
  reserva_id: text("reserva_id").notNull().references(() => reservas.id),
  tipo: varchar("tipo", { length: 60 }).notNull(),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  ator_id: text("ator_id").references(() => usuarios.id),
  sessao_id: text("sessao_id"),
  ip: varchar("ip", { length: 45 }),
  user_agent: text("user_agent"),
  metadados: jsonb("metadados").notNull().default({}),
  hash_anterior: varchar("hash_anterior", { length: 64 }),
  hash_evento: varchar("hash_evento", { length: 64 }).notNull(),
}, (table) => ({ contratoIdx: index("contrato_eventos_contrato_idx").on(table.contrato_id, table.criado_em) }));

export const consentimentosImagem = pgTable("consentimentos_imagem", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  reserva_id: text("reserva_id").notNull().references(() => reservas.id),
  usuario_id: text("usuario_id").notNull().references(() => usuarios.id),
  versao: varchar("versao", { length: 40 }).notNull(),
  texto_exato: text("texto_exato").notNull(),
  aceito: boolean("aceito").notNull().default(false),
  revogado_em: timestamp("revogado_em"),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
}, (table) => ({ reservaIdx: index("consentimentos_imagem_reserva_idx").on(table.reserva_id, table.criado_em) }));

export const precosLedger = pgTable("precos_ledger", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  reserva_id: text("reserva_id").notNull().references(() => reservas.id),
  tipo: varchar("tipo", { length: 40 }).notNull(),
  codigo: varchar("codigo", { length: 120 }),
  descricao: text("descricao").notNull(),
  quantidade: integer("quantidade").notNull().default(1),
  valor_unitario_centavos: integer("valor_unitario_centavos").notNull(),
  valor_total_centavos: integer("valor_total_centavos").notNull(),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  criado_por: text("criado_por").references(() => usuarios.id),
  metadados: jsonb("metadados").notNull().default({}),
}, (table) => ({ reservaIdx: index("precos_ledger_reserva_idx").on(table.reserva_id, table.criado_em) }));

export const inventarioHolds = pgTable("inventario_holds", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  reserva_id: text("reserva_id").notNull().unique(),
  lote_id: text("lote_id").notNull().references(() => lotes.id),
  modalidade: varchar("modalidade", { length: 80 }),
  quantidade: integer("quantidade").notNull().default(1),
  status: varchar("status", { length: 20 }).notNull().default("ativo"),
  expira_em: timestamp("expira_em").notNull(),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  convertido_em: timestamp("convertido_em"),
  liberado_em: timestamp("liberado_em"),
  motivo_liberacao: text("motivo_liberacao"),
}, (table) => ({ loteIdx: index("inventario_holds_lote_ativos_idx").on(table.lote_id, table.status, table.expira_em), expiracaoIdx: index("inventario_holds_expiracao_idx").on(table.status, table.expira_em) }));

// Operação física da excursão. O inventário comercial continua em lotes e
// inventario_holds; estas tabelas controlam veículo, poltrona e embarque sem
// alterar reservas ou contratos históricos.
export const saidasOperacionais = pgTable("saidas_operacionais", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  lote_id: text("lote_id").notNull().references(() => lotes.id),
  nome: varchar("nome", { length: 160 }).notNull(),
  data_partida: timestamp("data_partida"),
  data_retorno: timestamp("data_retorno"),
  status: varchar("status", { length: 30 }).notNull().default("planejamento"),
  ativa: boolean("ativa").notNull().default(true),
  criado_por: text("criado_por").references(() => usuarios.id),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({ loteIdx: index("saidas_operacionais_lote_idx").on(table.lote_id, table.ativa) }));

export const onibusOperacionais = pgTable("onibus_operacionais", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  saida_id: text("saida_id").notNull().references(() => saidasOperacionais.id),
  nome: varchar("nome", { length: 120 }).notNull(),
  identificacao: varchar("identificacao", { length: 120 }),
  placa: varchar("placa", { length: 12 }),
  capacidade: integer("capacidade").notNull(),
  venda_ordem: integer("venda_ordem").notNull().default(1),
  motorista_nome: varchar("motorista_nome", { length: 160 }),
  motorista_telefone: varchar("motorista_telefone", { length: 20 }),
  responsavel_nome: varchar("responsavel_nome", { length: 160 }),
  status: varchar("status", { length: 30 }).notNull().default("planejamento"),
  ativo: boolean("ativo").notNull().default(true),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({ saidaIdx: index("onibus_operacionais_saida_idx").on(table.saida_id, table.ativo) }));

export const assentosOnibus = pgTable("assentos_onibus", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  onibus_id: text("onibus_id").notNull().references(() => onibusOperacionais.id),
  numero: integer("numero").notNull(),
  fileira: integer("fileira").notNull(),
  posicao: varchar("posicao", { length: 10 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("disponivel"),
  motivo_bloqueio: text("motivo_bloqueio"),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({ onibusIdx: index("assentos_onibus_onibus_idx").on(table.onibus_id, table.numero) }));

export const pontosEmbarqueOperacao = pgTable("pontos_embarque_operacao", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  saida_id: text("saida_id").notNull().references(() => saidasOperacionais.id),
  nome: varchar("nome", { length: 160 }).notNull(),
  endereco: text("endereco"),
  horario: timestamp("horario"),
  ordem: integer("ordem").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
}, (table) => ({ saidaIdx: index("pontos_embarque_operacao_saida_idx").on(table.saida_id, table.ativo, table.ordem) }));

export const assentoHolds = pgTable("assento_holds", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  assento_id: text("assento_id").notNull().references(() => assentosOnibus.id),
  reserva_id: text("reserva_id").references(() => reservas.id),
  usuario_id: text("usuario_id").references(() => usuarios.id),
  status: varchar("status", { length: 20 }).notNull().default("ativo"),
  expira_em: timestamp("expira_em").notNull(),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  convertido_em: timestamp("convertido_em"),
  liberado_em: timestamp("liberado_em"),
}, (table) => ({ assentoIdx: index("assento_holds_assento_idx").on(table.assento_id, table.status, table.expira_em) }));

export const assentoAlocacoes = pgTable("assento_alocacoes", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  assento_id: text("assento_id").notNull().references(() => assentosOnibus.id),
  reserva_id: text("reserva_id").notNull().references(() => reservas.id),
  usuario_id: text("usuario_id").notNull().references(() => usuarios.id),
  ponto_embarque_id: text("ponto_embarque_id").references(() => pontosEmbarqueOperacao.id),
  status: varchar("status", { length: 20 }).notNull().default("ativa"),
  alocado_por: text("alocado_por").references(() => usuarios.id),
  alocado_em: timestamp("alocado_em").defaultNow().notNull(),
  encerrado_em: timestamp("encerrado_em"),
  motivo: text("motivo"),
}, (table) => ({ assentoIdx: index("assento_alocacoes_assento_idx").on(table.assento_id, table.status), reservaIdx: index("assento_alocacoes_reserva_idx").on(table.reserva_id, table.status) }));

export const checkinsOperacao = pgTable("checkins_operacao", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  saida_id: text("saida_id").notNull().references(() => saidasOperacionais.id),
  reserva_id: text("reserva_id").notNull().references(() => reservas.id),
  status: varchar("status", { length: 20 }).notNull().default("pendente"),
  confirmado_em: timestamp("confirmado_em"),
  confirmado_por: text("confirmado_por").references(() => usuarios.id),
  observacoes: text("observacoes"),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({ saidaIdx: index("checkins_operacao_saida_idx").on(table.saida_id, table.status) }));

export const operacaoHistorico = pgTable("operacao_historico", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  saida_id: text("saida_id").references(() => saidasOperacionais.id),
  entidade: varchar("entidade", { length: 50 }).notNull(),
  entidade_id: text("entidade_id"),
  acao: varchar("acao", { length: 80 }).notNull(),
  ator_id: text("ator_id").references(() => usuarios.id),
  antes: jsonb("antes"),
  depois: jsonb("depois"),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
}, (table) => ({ saidaIdx: index("operacao_historico_saida_idx").on(table.saida_id, table.criado_em) }));

// Mapa operacional de hospedagem. O quarto pode atender todo o lote ou uma
// modalidade específica; as alocações permanecem versionadas ao remanejar.
export const quartosHospedagem = pgTable("quartos_hospedagem", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  lote_id: text("lote_id").notNull().references(() => lotes.id),
  pacote_id: text("pacote_id").references(() => pacotes.id),
  nome: varchar("nome", { length: 120 }).notNull(),
  genero: varchar("genero", { length: 20 }).notNull(),
  capacidade: integer("capacidade").notNull(),
  estrutura: varchar("estrutura", { length: 30 }).notNull().default("outro"),
  local_hospedagem: varchar("local_hospedagem", { length: 120 }),
  observacoes: text("observacoes"),
  ativo: boolean("ativo").notNull().default(true),
  criado_por: text("criado_por").references(() => usuarios.id),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({ loteIdx: index("quartos_hospedagem_lote_idx").on(table.lote_id, table.ativo) }));

export const quartoAlocacoes = pgTable("quarto_alocacoes", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  quarto_id: text("quarto_id").notNull().references(() => quartosHospedagem.id),
  reserva_id: text("reserva_id").notNull().references(() => reservas.id),
  usuario_id: text("usuario_id").notNull().references(() => usuarios.id),
  numero_vaga: integer("numero_vaga").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("ativa"),
  alocado_por: text("alocado_por").references(() => usuarios.id),
  alocado_em: timestamp("alocado_em").defaultNow().notNull(),
  encerrado_em: timestamp("encerrado_em"),
  motivo: text("motivo"),
}, (table) => ({
  quartoIdx: index("quarto_alocacoes_quarto_idx").on(table.quarto_id, table.status),
  reservaIdx: index("quarto_alocacoes_reserva_idx").on(table.reserva_id, table.status),
}));

// Solicitações nunca apagam contrato ou pagamento. Cancelamento, reinício e
// troca de pacote são analisados e concluídos por usuário autorizado.
export const reservaSolicitacoes = pgTable("reserva_solicitacoes", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  reserva_id: text("reserva_id").notNull().references(() => reservas.id),
  usuario_id: text("usuario_id").notNull().references(() => usuarios.id),
  solicitado_por: text("solicitado_por").references(() => usuarios.id),
  solicitado_por_tipo: varchar("solicitado_por_tipo", { length: 20 }).notNull(),
  tipo: varchar("tipo", { length: 30 }).notNull(),
  pacote_destino_id: text("pacote_destino_id").references(() => pacotes.id),
  motivo: text("motivo").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pendente"),
  parecer: text("parecer"),
  reembolso_status: varchar("reembolso_status", { length: 30 }).notNull().default("nao_aplicavel"),
  valor_reembolso_centavos: integer("valor_reembolso_centavos"),
  decidido_por: text("decidido_por").references(() => usuarios.id),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
  concluido_em: timestamp("concluido_em"),
}, (table) => ({
  reservaIdx: index("reserva_solicitacoes_reserva_idx").on(table.reserva_id, table.status),
  usuarioIdx: index("reserva_solicitacoes_usuario_idx").on(table.usuario_id, table.criado_em),
}));

export const notificacoesOutbox = pgTable("notificacoes_outbox", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  reserva_id: text("reserva_id").references(() => reservas.id),
  tipo: varchar("tipo", { length: 60 }).notNull(),
  chave_idempotente: varchar("chave_idempotente", { length: 255 }).notNull().unique(),
  template: varchar("template", { length: 100 }).notNull(),
  versao: varchar("versao", { length: 30 }).notNull(),
  destinatario_mascarado: varchar("destinatario_mascarado", { length: 255 }).notNull(),
  payload: jsonb("payload").notNull().default({}),
  anexos: jsonb("anexos").notNull().default([]),
  status: varchar("status", { length: 20 }).notNull().default("pendente"),
  tentativas: integer("tentativas").notNull().default(0),
  proxima_tentativa: timestamp("proxima_tentativa"),
  message_id: varchar("message_id", { length: 255 }),
  ultimo_erro: text("ultimo_erro"),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  enviado_em: timestamp("enviado_em"),
}, (table) => ({ filaIdx: index("notificacoes_outbox_fila_idx").on(table.status, table.proxima_tentativa, table.criado_em) }));

export const sessoes = pgTable("sessoes", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  usuario_id: text("usuario_id").notNull().references(() => usuarios.id),
  versao: integer("versao").notNull(),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  expira_em: timestamp("expira_em").notNull(),
  revogada_em: timestamp("revogada_em"),
  ip: varchar("ip", { length: 45 }),
  user_agent: text("user_agent"),
}, (table) => ({ usuarioIdx: index("sessoes_usuario_ativas_idx").on(table.usuario_id, table.versao, table.revogada_em, table.expira_em) }));

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  usuario_id: text("usuario_id").notNull().references(() => usuarios.id),
  token_hash: varchar("token_hash", { length: 128 }).notNull().unique(),
  expira_em: timestamp("expira_em").notNull(),
  usado_em: timestamp("usado_em"),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
}, (table) => ({ userIdx: index("password_reset_tokens_user_idx").on(table.usuario_id, table.criado_em) }));

export const pagamentoIdempotencias = pgTable("pagamento_idempotencias", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  chave: varchar("chave", { length: 255 }).notNull().unique(),
  operacao: varchar("operacao", { length: 80 }).notNull(),
  reserva_id: text("reserva_id").notNull().references(() => reservas.id),
  pagamento_id: text("pagamento_id").references(() => pagamentos.id),
  resposta: jsonb("resposta"),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
});

export const pagamentoParcelas = pgTable("pagamento_parcelas", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  pagamento_id: text("pagamento_id").notNull().references(() => pagamentos.id),
  reserva_id: text("reserva_id").notNull().references(() => reservas.id),
  sequencia: integer("sequencia").notNull(),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  vencimento: date("vencimento").notNull(),
  cora_id: varchar("cora_id", { length: 255 }),
  valor_centavos: integer("valor_centavos"),
  valor_pago_centavos: integer("valor_pago_centavos").notNull().default(0),
  status: varchar("status", { length: 30 }).default("pendente").notNull(),
  boleto_url: varchar("boleto_url", { length: 500 }),
  pix_copia_e_cola: text("pix_copia_e_cola"),
  codigo_barras: varchar("codigo_barras", { length: 255 }),
  linha_digitavel: varchar("linha_digitavel", { length: 255 }),
  boleto_documento_id: text("boleto_documento_id"),
  enviado_email_em: timestamp("enviado_email_em"),
  enviado_whatsapp_em: timestamp("enviado_whatsapp_em"),
  pago_confirmado_em: timestamp("pago_confirmado_em"),
  pago_confirmado_por: text("pago_confirmado_por"),
  comprovante_documento_id: text("comprovante_documento_id"),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({ reservaSequenciaIdx: index("pagamento_parcelas_reserva_sequencia_idx").on(table.reserva_id, table.sequencia) }));

export const webhookEventos = pgTable("webhook_eventos", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  provedor: varchar("provedor", { length: 30 }).default("cora").notNull(),
  evento_id: varchar("evento_id", { length: 255 }).notNull().unique(),
  tipo: varchar("tipo", { length: 120 }).notNull(),
  recurso_id: varchar("recurso_id", { length: 255 }),
  payload: jsonb("payload").notNull(),
  processado_em: timestamp("processado_em"),
  tentativas: integer("tentativas").notNull().default(0),
  ultimo_erro: text("ultimo_erro"),
  proxima_tentativa: timestamp("proxima_tentativa"),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
});

export const descontosAdministrativos = pgTable("descontos_administrativos", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  reserva_id: text("reserva_id").notNull().references(() => reservas.id),
  administrador_id: text("administrador_id").notNull().references(() => usuarios.id),
  motivo: text("motivo").notNull(),
  tipo: varchar("tipo", { length: 20 }).notNull(),
  valor_informado: decimal("valor_informado", { precision: 12, scale: 2 }).notNull(),
  subtotal_original: decimal("subtotal_original", { precision: 12, scale: 2 }).notNull(),
  valor_desconto: decimal("valor_desconto", { precision: 12, scale: 2 }).notNull(),
  total_final: decimal("total_final", { precision: 12, scale: 2 }).notNull(),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
}, (table) => ({ reservaIdx: index("descontos_administrativos_reserva_idx").on(table.reserva_id) }));

export const comissaoRegras = pgTable("comissao_regras", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  vendedor_id: text("vendedor_id").notNull().references(() => usuarios.id),
  evento_id: text("evento_id").references(() => eventos.id),
  pacote_id: text("pacote_id"),
  tipo: varchar("tipo", { length: 20 }).notNull(), // percentual | fixo
  valor: decimal("valor", { precision: 12, scale: 4 }).notNull(),
  ativo: boolean("ativo").notNull().default(true),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({ vendedorIdx: index("comissao_regras_vendedor_idx").on(table.vendedor_id, table.ativo) }));

export const comissoes = pgTable("comissoes", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  reserva_id: text("reserva_id").notNull().references(() => reservas.id),
  vendedor_id: text("vendedor_id").notNull().references(() => usuarios.id),
  regra_id: text("regra_id").references(() => comissaoRegras.id),
  base_centavos: integer("base_centavos").notNull(),
  valor_centavos: integer("valor_centavos").notNull(),
  regra_snapshot: jsonb("regra_snapshot").notNull().default({}),
  status: varchar("status", { length: 20 }).notNull().default("prevista"),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({ reservaUnica: index("comissoes_reserva_idx").on(table.reserva_id), vendedorIdx: index("comissoes_vendedor_idx").on(table.vendedor_id, table.status) }));

export const cuponsUtilizacoes = pgTable("cupons_utilizacoes", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  cupom_id: text("cupom_id").notNull().references(() => cupons.id),
  usuario_id: text("usuario_id").notNull().references(() => usuarios.id),
  reserva_id: text("reserva_id").notNull().references(() => reservas.id),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
}, (table) => ({ clienteIdx: index("cupons_utilizacoes_cliente_idx").on(table.cupom_id, table.usuario_id) }));

export const verificacoesEmail = pgTable("verificacoes_email", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  usuario_id: text("usuario_id").notNull().references(() => usuarios.id),
  codigo_hash: varchar("codigo_hash", { length: 128 }).notNull(),
  expira_em: timestamp("expira_em").notNull(),
  tentativas: integer("tentativas").notNull().default(0),
  usado_em: timestamp("usado_em"),
  enviado_em: timestamp("enviado_em"),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
}, (table) => ({ usuarioIdx: index("verificacoes_email_usuario_idx").on(table.usuario_id, table.expira_em) }));

export const videosEvento = pgTable("videos_evento", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  evento_id: text("evento_id").notNull().references(() => eventos.id),
  url: varchar("url", { length: 500 }).notNull(),
  youtube_id: varchar("youtube_id", { length: 80 }).notNull(),
  titulo: varchar("titulo", { length: 255 }),
  descricao: text("descricao"),
  ordem: integer("ordem").default(0).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  destaque: boolean("destaque").default(false).notNull(),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({ eventoIdx: index("videos_evento_evento_idx").on(table.evento_id, table.ativo, table.ordem) }));


export const clienteDocumentos = pgTable("cliente_documentos", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  usuario_id: text("usuario_id").notNull().references(() => usuarios.id),
  reserva_id: text("reserva_id").references(() => reservas.id),
  categoria: varchar("categoria", { length: 60 }).notNull().default("outros"),
  nome: varchar("nome", { length: 255 }).notNull(),
  nome_original: varchar("nome_original", { length: 255 }).notNull(),
  mime_type: varchar("mime_type", { length: 120 }).notNull(),
  tamanho_bytes: integer("tamanho_bytes").notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  arquivo: varchar("arquivo", { length: 500 }).notNull(),
  observacoes: text("observacoes"),
  tipo_identidade: varchar("tipo_identidade", { length: 30 }),
  validacao_status: varchar("validacao_status", { length: 30 }).notNull().default("nao_iniciada"),
  dados_extraidos: jsonb("dados_extraidos").notNull().default({}),
  validacao_resultado: jsonb("validacao_resultado").notNull().default({}),
  validacao_provedor: varchar("validacao_provedor", { length: 40 }),
  validacao_modelo: varchar("validacao_modelo", { length: 120 }),
  leitura_iniciada_em: timestamp("leitura_iniciada_em"),
  validado_em: timestamp("validado_em"),
  erro_validacao: text("erro_validacao"),
  leitura_tentativas: integer("leitura_tentativas").notNull().default(0),
  criado_por: text("criado_por").references(() => usuarios.id),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
  removido_em: timestamp("removido_em"),
  removido_por: text("removido_por").references(() => usuarios.id),
}, (table) => ({
  usuarioIdx: index("cliente_documentos_usuario_idx").on(table.usuario_id, table.removido_em, table.criado_em),
  reservaIdx: index("cliente_documentos_reserva_idx").on(table.reserva_id),
  hashIdx: index("cliente_documentos_hash_idx").on(table.usuario_id, table.sha256),
  validacaoIdx: index("cliente_documentos_validacao_idx").on(table.usuario_id, table.categoria, table.validacao_status),
}));

export const clienteHistorico = pgTable("cliente_historico", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  usuario_id: text("usuario_id").notNull().references(() => usuarios.id),
  tipo: varchar("tipo", { length: 60 }).notNull(),
  titulo: varchar("titulo", { length: 255 }).notNull(),
  descricao: text("descricao"),
  metadados: jsonb("metadados").notNull().default({}),
  criado_por: text("criado_por").references(() => usuarios.id),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
}, (table) => ({
  usuarioIdx: index("cliente_historico_usuario_idx").on(table.usuario_id, table.criado_em),
  tipoIdx: index("cliente_historico_tipo_idx").on(table.usuario_id, table.tipo, table.criado_em),
}));

export const convitesAcesso = pgTable("convites_acesso", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  token_hash: varchar("token_hash", { length: 64 }).notNull().unique(),
  papel: varchar("papel", { length: 20 }).notNull(),
  email_destino: varchar("email_destino", { length: 255 }),
  criado_por: text("criado_por").notNull().references(() => usuarios.id),
  expira_em: timestamp("expira_em").notNull(),
  usado_em: timestamp("usado_em"),
  usado_por: text("usado_por").references(() => usuarios.id),
  revogado_em: timestamp("revogado_em"),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
}, (table) => ({
  tokenIdx: index("convites_acesso_token_idx").on(table.token_hash),
  statusIdx: index("convites_acesso_status_idx").on(table.expira_em, table.usado_em, table.revogado_em),
}));

export const auditoriaAdmin = pgTable("auditoria_admin", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  ator_id: text("ator_id").references(() => usuarios.id),
  ator_tipo: varchar("ator_tipo", { length: 20 }).notNull(),
  acao: varchar("acao", { length: 120 }).notNull(),
  entidade: varchar("entidade", { length: 80 }).notNull(),
  entidade_id: text("entidade_id"),
  antes: jsonb("antes"),
  depois: jsonb("depois"),
  ip: varchar("ip", { length: 45 }),
  user_agent: text("user_agent"),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
}, (table) => ({
  atorIdx: index("auditoria_admin_ator_idx").on(table.ator_id, table.criado_em),
  entidadeIdx: index("auditoria_admin_entidade_idx").on(table.entidade, table.entidade_id, table.criado_em),
}));

export const gatewayCredenciais = pgTable("gateway_credenciais", {
  id: text("id").primaryKey().default("cora"),
  provedor: varchar("provedor", { length: 30 }).notNull().default("cora"),
  ambiente: varchar("ambiente", { length: 20 }).notNull().default("stage"),
  ativo: boolean("ativo").notNull().default(false),
  client_id_enc: text("client_id_enc"),
  certificate_enc: text("certificate_enc"),
  private_key_enc: text("private_key_enc"),
  webhook_secret_enc: text("webhook_secret_enc"),
  token_url: varchar("token_url", { length: 500 }),
  api_base: varchar("api_base", { length: 500 }),
  installments_api_base: varchar("installments_api_base", { length: 500 }),
  webhook_public_url: varchar("webhook_public_url", { length: 500 }),
  http_timeout_ms: integer("http_timeout_ms"),
  carne_timeout_ms: integer("carne_timeout_ms"),
  ultimo_teste_em: timestamp("ultimo_teste_em"),
  ultimo_teste_status: varchar("ultimo_teste_status", { length: 30 }),
  ultimo_teste_mensagem: text("ultimo_teste_mensagem"),
  atualizado_por: text("atualizado_por").references(() => usuarios.id),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
}, (table) => ({
  provedorIdx: index("gateway_credenciais_provedor_idx").on(table.provedor),
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
  alt_text: varchar("alt_text", { length: 500 }),
  categoria: varchar("categoria", { length: 80 }).default("evento"),
  ordem: integer("ordem").default(0),
  destaque: boolean("destaque").default(false).notNull(),
  capa: boolean("capa").default(false).notNull(),
  formato: varchar("formato", { length: 30 }),
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
