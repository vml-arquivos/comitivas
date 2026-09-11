import { Router, Request, Response, NextFunction, raw } from "express";
import { authMiddleware, requireRole, isAdminOrDev } from "../middleware/authMiddleware.js";
import { RelatorioService } from "../services/relatorioService.js";
import { EmailService } from "../services/emailService.js";
import { AuthService } from "../services/authService.js";
import { ContratoService } from "../services/contratoService.js";
import { ConfiguracaoService } from "../services/configuracaoService.js";
import { GatewayConfigService } from "../services/gatewayConfigService.js";
import { AuditService } from "../services/auditService.js";
import { CoraPaymentProvider } from "../services/coraPaymentProvider.js";
import { PacoteService, ConfiguracaoPacote } from "../services/pacoteService.js";
import { ClienteExclusaoService, ErroExclusaoCliente } from "../services/clienteExclusaoService.js";
import { OperacaoOnibusService } from "../services/operacaoOnibusService.js";
import { IdentityDocumentService, TipoIdentidade } from "../services/identityDocumentService.js";
import { db } from "../db/index.js";
import { reservas, eventos, lotes, pacotes, usuarios, leads_origem, descontosAdministrativos, pagamentos, contratosDocumentos, contratoValidacoes, pagamentoParcelas, emails_enviados, clienteDocumentos, clienteHistorico, videosEvento, fotos_evento, comissaoRegras, comissoes, convitesAcesso, auditoriaAdmin, inventarioHolds, sessoes, passwordResetTokens, verificacoesEmail, assentoAlocacoes, assentosOnibus, onibusOperacionais, pontosEmbarqueOperacao, saidasOperacionais, checkinsOperacao } from "../db/schema.js";
import { eq, and, inArray, or, sql, desc, isNull, ne } from "drizzle-orm";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import nodePath from "node:path";
import { createId } from "@paralleldrive/cuid2";
import Decimal from "decimal.js";
import { cadastroAprovadoComEvidencia, camposFaltantesCadastroMinimo, motivoBloqueioBoleto, podeExporUsuario } from "../security/governance.js";

const router = Router();

function somenteDigitos(valor: unknown): string {
  return String(valor ?? "").replace(/\D/g, "");
}

function cpfValido(cpf: string): boolean {
  if (!cpf) return true; // CPF é opcional para vendedor/admin cadastrados internamente
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcularDigito = (tamanho: number) => {
    let soma = 0;
    for (let indice = 0; indice < tamanho; indice += 1) {
      soma += Number(cpf[indice]) * (tamanho + 1 - indice);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return calcularDigito(9) === Number(cpf[9]) && calcularDigito(10) === Number(cpf[10]);
}

function erroDeUnicidade(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505");
}

function extrairYoutubeId(url: unknown): string | null {
  const valor = String(url || "").trim();
  const match = valor.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
  return match?.[1] || (/^[A-Za-z0-9_-]{11}$/.test(valor) ? valor : null);
}

function escaparHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function csvCampo(valor: unknown): string {
  return `"${String(valor ?? "").replace(/"/g, '""')}"`;
}

function nomeArquivoSeguro(valor: string): string {
  return valor
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 140) || "documento";
}

async function registrarHistoricoCliente(
  usuarioId: string,
  tipo: string,
  titulo: string,
  descricao: string | null,
  criadoPor?: string | null,
  metadados: Record<string, unknown> = {},
) {
  await db.insert(clienteHistorico).values({
    id: createId(),
    usuario_id: usuarioId,
    tipo: tipo.slice(0, 60),
    titulo: titulo.slice(0, 255),
    descricao: descricao?.slice(0, 5000) || null,
    criado_por: criadoPor || null,
    metadados,
    criado_em: new Date(),
  });
}

async function obterFichaCliente(usuarioId: string) {
  const usuario = (await db.select(CAMPOS_PUBLICOS_USUARIO).from(usuarios).where(and(eq(usuarios.id, usuarioId), eq(usuarios.tipo, "cliente"))).limit(1))[0];
  if (!usuario) return null;

  const reservasLista = await db.select({
    id: reservas.id,
    status: reservas.status,
    checkout_estado: reservas.checkout_estado,
    valor_total: reservas.valor_total,
    valor_total_centavos: reservas.valor_total_centavos,
    forma_pagamento: reservas.forma_pagamento,
    quantidade_parcelas: reservas.quantidade_parcelas,
    valor_parcela: reservas.valor_parcela,
    desconto_aplicado: reservas.desconto_aplicado,
    desconto_pagamento: reservas.desconto_pagamento,
    boleto_liberado_em: reservas.boleto_liberado_em,
    boleto_liberado_por: reservas.boleto_liberado_por,
    contrato_pdf_url: reservas.contrato_pdf_url,
    aceite_timestamp: reservas.aceite_timestamp,
    criado_em: reservas.criado_em,
    atualizado_em: reservas.atualizado_em,
    evento_id: eventos.id,
    evento_nome: eventos.nome,
    evento_local: eventos.local,
    lote_id: lotes.id,
    lote_nome: lotes.nome,
    data_inicio: lotes.data_inicio,
    data_fim: lotes.data_fim,
    data_embarque: lotes.data_embarque,
    data_retorno: lotes.data_retorno,
    local_embarque: lotes.local_embarque,
    pacote_id: pacotes.id,
    pacote_nome: pacotes.nome,
    modalidade_hospedagem: pacotes.modalidade_hospedagem,
  }).from(reservas)
    .innerJoin(lotes, eq(reservas.lote_id, lotes.id))
    .innerJoin(eventos, eq(lotes.evento_id, eventos.id))
    .leftJoin(pacotes, eq(reservas.pacote_id, pacotes.id))
    .where(eq(reservas.usuario_id, usuarioId))
    .orderBy(desc(reservas.criado_em));

  const reservaIds = reservasLista.map((item) => item.id);
  const pagamentosLista = reservaIds.length ? await db.select({
    id: pagamentos.id,
    reserva_id: pagamentos.reserva_id,
    status: pagamentos.status,
    status_reconciliado: pagamentos.status_reconciliado,
    metodo: pagamentos.metodo,
    valor: pagamentos.valor,
    valor_centavos: pagamentos.valor_centavos,
    valor_pago_centavos: pagamentos.valor_pago_centavos,
    gateway_id: pagamentos.gateway_id,
    criado_em: pagamentos.criado_em,
    atualizado_em: pagamentos.atualizado_em,
  }).from(pagamentos).where(inArray(pagamentos.reserva_id, reservaIds)).orderBy(desc(pagamentos.atualizado_em)) : [];

  const parcelasLista = reservaIds.length ? await db.select({
    id: pagamentoParcelas.id,
    pagamento_id: pagamentoParcelas.pagamento_id,
    reserva_id: pagamentoParcelas.reserva_id,
    sequencia: pagamentoParcelas.sequencia,
    valor: pagamentoParcelas.valor,
    vencimento: pagamentoParcelas.vencimento,
    status: pagamentoParcelas.status,
    valor_pago_centavos: pagamentoParcelas.valor_pago_centavos,
    boleto_documento_id: pagamentoParcelas.boleto_documento_id,
    enviado_email_em: pagamentoParcelas.enviado_email_em,
    enviado_whatsapp_em: pagamentoParcelas.enviado_whatsapp_em,
    pago_confirmado_em: pagamentoParcelas.pago_confirmado_em,
    pago_confirmado_por: pagamentoParcelas.pago_confirmado_por,
    comprovante_documento_id: pagamentoParcelas.comprovante_documento_id,
    criado_em: pagamentoParcelas.criado_em,
    atualizado_em: pagamentoParcelas.atualizado_em,
  }).from(pagamentoParcelas).where(inArray(pagamentoParcelas.reserva_id, reservaIds)).orderBy(desc(pagamentoParcelas.vencimento)) : [];

  const contratosLista = reservaIds.length ? await db.select({
    id: contratosDocumentos.id,
    reserva_id: contratosDocumentos.reserva_id,
    versao: contratosDocumentos.versao,
    versao_template: contratosDocumentos.versao_template,
    status: contratosDocumentos.status,
    snapshot_sha256: contratosDocumentos.snapshot_sha256,
    pdf_sha256: contratosDocumentos.pdf_sha256,
    regras_versao: contratosDocumentos.regras_versao,
    visualizado_em: contratosDocumentos.visualizado_em,
    criado_em: contratosDocumentos.criado_em,
    validado_em: contratosDocumentos.validado_em,
    aprovado_admin_em: contratosDocumentos.aprovado_admin_em,
    aprovado_admin_por: contratosDocumentos.aprovado_admin_por,
    invalidado_em: contratosDocumentos.invalidado_em,
  }).from(contratosDocumentos).where(inArray(contratosDocumentos.reserva_id, reservaIds)).orderBy(desc(contratosDocumentos.criado_em)) : [];

  const operacaoLista = reservaIds.length ? await db.select({
    reserva_id: assentoAlocacoes.reserva_id,
    saida_id: saidasOperacionais.id,
    saida_nome: saidasOperacionais.nome,
    data_partida: saidasOperacionais.data_partida,
    data_retorno: saidasOperacionais.data_retorno,
    onibus_nome: onibusOperacionais.nome,
    onibus_identificacao: onibusOperacionais.identificacao,
    poltrona: assentosOnibus.numero,
    ponto_embarque_nome: pontosEmbarqueOperacao.nome,
    ponto_embarque_endereco: pontosEmbarqueOperacao.endereco,
    ponto_embarque_horario: pontosEmbarqueOperacao.horario,
    checkin_status: checkinsOperacao.status,
  }).from(assentoAlocacoes)
    .innerJoin(assentosOnibus, eq(assentoAlocacoes.assento_id, assentosOnibus.id))
    .innerJoin(onibusOperacionais, eq(assentosOnibus.onibus_id, onibusOperacionais.id))
    .innerJoin(saidasOperacionais, eq(onibusOperacionais.saida_id, saidasOperacionais.id))
    .leftJoin(pontosEmbarqueOperacao, eq(assentoAlocacoes.ponto_embarque_id, pontosEmbarqueOperacao.id))
    .leftJoin(checkinsOperacao, and(eq(checkinsOperacao.saida_id, saidasOperacionais.id), eq(checkinsOperacao.reserva_id, assentoAlocacoes.reserva_id)))
    .where(and(inArray(assentoAlocacoes.reserva_id, reservaIds), eq(assentoAlocacoes.status, "ativa"))) : [];
  const operacaoPorReserva = new Map(operacaoLista.map((item) => [item.reserva_id, item]));
  const contratoPorReserva = new Map<string, typeof contratosLista[number]>();
  for (const contrato of contratosLista) if (contrato.status !== "invalidado" && !contratoPorReserva.has(contrato.reserva_id)) contratoPorReserva.set(contrato.reserva_id, contrato);

  const validacoesLista = reservaIds.length ? await db.select({
    id: contratoValidacoes.id,
    protocolo: contratoValidacoes.protocolo,
    contrato_id: contratoValidacoes.contrato_id,
    reserva_id: contratoValidacoes.reserva_id,
    versao: contratoValidacoes.versao,
    canal: contratoValidacoes.canal,
    destinatario_mascarado: contratoValidacoes.destinatario_mascarado,
    confirmado_em: contratoValidacoes.confirmado_em,
    navegador: contratoValidacoes.navegador,
    sistema_operacional: contratoValidacoes.sistema_operacional,
  }).from(contratoValidacoes).where(inArray(contratoValidacoes.reserva_id, reservaIds)).orderBy(desc(contratoValidacoes.confirmado_em)) : [];

  const documentosLista = await db.select({
    id: clienteDocumentos.id,
    usuario_id: clienteDocumentos.usuario_id,
    reserva_id: clienteDocumentos.reserva_id,
    categoria: clienteDocumentos.categoria,
    nome: clienteDocumentos.nome,
    nome_original: clienteDocumentos.nome_original,
    mime_type: clienteDocumentos.mime_type,
    tamanho_bytes: clienteDocumentos.tamanho_bytes,
    sha256: clienteDocumentos.sha256,
    observacoes: clienteDocumentos.observacoes,
    tipo_identidade: clienteDocumentos.tipo_identidade,
    validacao_status: clienteDocumentos.validacao_status,
    validacao_resultado: clienteDocumentos.validacao_resultado,
    validado_em: clienteDocumentos.validado_em,
    erro_validacao: clienteDocumentos.erro_validacao,
    criado_por: clienteDocumentos.criado_por,
    criado_em: clienteDocumentos.criado_em,
  }).from(clienteDocumentos)
    .where(and(eq(clienteDocumentos.usuario_id, usuarioId), isNull(clienteDocumentos.removido_em)))
    .orderBy(desc(clienteDocumentos.criado_em));

  const historicoManual = await db.select({
    id: clienteHistorico.id,
    tipo: clienteHistorico.tipo,
    titulo: clienteHistorico.titulo,
    descricao: clienteHistorico.descricao,
    metadados: clienteHistorico.metadados,
    criado_por: clienteHistorico.criado_por,
    criado_em: clienteHistorico.criado_em,
  }).from(clienteHistorico).where(eq(clienteHistorico.usuario_id, usuarioId)).orderBy(desc(clienteHistorico.criado_em));

  const leadsLista = await db.select({
    id: leads_origem.id,
    codigo_origem: leads_origem.codigo_origem,
    origem: leads_origem.origem,
    status: leads_origem.status,
    vendedor_id: leads_origem.vendedor_id,
    observacoes: leads_origem.observacoes,
    proximo_contato_em: leads_origem.proximo_contato_em,
    criado_em: leads_origem.criado_em,
    atualizado_em: leads_origem.atualizado_em,
  }).from(leads_origem).where(eq(leads_origem.usuario_id, usuarioId)).orderBy(desc(leads_origem.atualizado_em));

  const emailsLista = reservaIds.length ? await db.select({
    id: emails_enviados.id,
    reserva_id: emails_enviados.reserva_id,
    tipo: emails_enviados.tipo,
    destinatario: emails_enviados.destinatario,
    assunto: emails_enviados.assunto,
    enviado_em: emails_enviados.enviado_em,
    erro: emails_enviados.erro,
    criado_em: emails_enviados.criado_em,
  }).from(emails_enviados).where(inArray(emails_enviados.reserva_id, reservaIds)).orderBy(desc(emails_enviados.criado_em)) : [];

  const valorContratado = reservasLista.reduce((total, item) => total + Number(item.valor_total || 0), 0);
  const valorPagoCentavos = pagamentosLista.reduce((total, item) => total + Number(item.valor_pago_centavos || 0), 0);

  const linhaTempo = [
    { id: `cadastro-${usuario.id}`, tipo: "cadastro", titulo: "Cadastro criado", descricao: usuario.email, criado_em: usuario.criado_em, origem: "sistema" },
    ...historicoManual.map((item) => ({ ...item, origem: "historico" })),
    ...reservasLista.map((item) => ({ id: `reserva-${item.id}`, tipo: "reserva", titulo: `Reserva ${item.status || "criada"}`, descricao: `${item.evento_nome} · ${item.lote_nome}${item.pacote_nome ? ` · ${item.pacote_nome}` : ""}`, criado_em: item.criado_em, origem: "sistema", reserva_id: item.id })),
    ...contratosLista.map((item) => ({ id: `contrato-${item.id}`, tipo: "contrato", titulo: `Contrato v${item.versao} · ${item.status}`, descricao: item.validado_em ? `Validado em ${new Date(item.validado_em).toLocaleString("pt-BR")}` : `Template ${item.versao_template}`, criado_em: item.validado_em || item.criado_em, origem: "sistema", reserva_id: item.reserva_id })),
    ...pagamentosLista.map((item) => ({ id: `pagamento-${item.id}`, tipo: "pagamento", titulo: `Pagamento ${item.status_reconciliado || item.status}`, descricao: `${String(item.metodo || "").toUpperCase()} · R$ ${Number(item.valor || 0).toFixed(2)}`, criado_em: item.atualizado_em || item.criado_em, origem: "sistema", reserva_id: item.reserva_id })),
    ...leadsLista.map((item) => ({ id: `lead-${item.id}`, tipo: "crm", titulo: `CRM · ${item.status || "novo"}`, descricao: item.observacoes || item.origem || item.codigo_origem, criado_em: item.atualizado_em || item.criado_em, origem: "sistema" })),
    ...emailsLista.map((item) => ({ id: `email-${item.id}`, tipo: "comunicacao", titulo: item.erro ? "Falha no envio de e-mail" : `E-mail · ${item.tipo}`, descricao: item.assunto, criado_em: item.enviado_em || item.criado_em, origem: "sistema", reserva_id: item.reserva_id })),
  ].sort((a, b) => new Date(String(b.criado_em)).getTime() - new Date(String(a.criado_em)).getTime()).slice(0, 500);

  return {
    usuario,
    resumo: {
      reservas: reservasLista.length,
      reservas_confirmadas: reservasLista.filter((item) => item.status === "cliente_confirmado").length,
      contratos: contratosLista.length,
      documentos: documentosLista.length,
      valor_contratado: valorContratado,
      valor_pago: valorPagoCentavos / 100,
      ultima_interacao_em: linhaTempo[0]?.criado_em || usuario.atualizado_em,
    },
    reservas: reservasLista.map((reserva) => ({
      ...reserva,
      contrato_disponivel: contratoPorReserva.has(reserva.id),
      operacao: operacaoPorReserva.get(reserva.id) || null,
    })),
    pagamentos: pagamentosLista,
    parcelas: parcelasLista,
    contratos: contratosLista,
    validacoes: validacoesLista,
    documentos: documentosLista,
    leads: leadsLista,
    emails: emailsLista,
    historico: linhaTempo,
  };
}

function gerarSenhaTemporaria(): string {
  // Senha temporária forte o suficiente para satisfazer a política de senha
  // (mín. 8 caracteres). O admin deve orientar o usuário a trocá-la no
  // primeiro acesso; não há fluxo de "esqueci minha senha" para isso ainda.
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

// Aplicar middleware de admin em todas as rotas
router.use(authMiddleware);

// Dashboard - resumo geral
router.get("/dashboard", requireRole("admin", "vendedor"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const eventoId = String(req.query.evento_id || "").trim();
    const totalEventos = await db.select().from(eventos);
    const leadsConsultados = isAdminOrDev(req.usuario.tipo)
      ? await db.select().from(leads_origem)
      : await db.select().from(leads_origem)
        .where(eq(leads_origem.vendedor_id, req.usuario.id));
    const todosClientes = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.tipo, "cliente"));
    const idsClientesValidos = new Set(todosClientes.map((cliente) => cliente.id));
    const totalLeads = leadsConsultados.filter((lead) => !lead.usuario_id || idsClientesValidos.has(lead.usuario_id));
    const clienteIds = isAdminOrDev(req.usuario.tipo)
      ? todosClientes.map((cliente) => cliente.id)
      : Array.from(new Set(totalLeads.flatMap((lead) => lead.usuario_id ? [lead.usuario_id] : [])));
    const totalClientes = isAdminOrDev(req.usuario.tipo) ? todosClientes : clienteIds.map((id) => ({ id }));
    const reservasConsultadas = clienteIds.length > 0
      ? await db.select().from(reservas).where(inArray(reservas.usuario_id, clienteIds))
      : [];
    const lotesConsultados = reservasConsultadas.length ? await db.select({ id: lotes.id, evento_id: lotes.evento_id }).from(lotes).where(inArray(lotes.id, Array.from(new Set(reservasConsultadas.map((reserva) => reserva.lote_id))))) : [];
    const eventoPorLote = new Map(lotesConsultados.map((lote) => [lote.id, lote.evento_id]));
    const totalReservas = eventoId ? reservasConsultadas.filter((reserva) => eventoPorLote.get(reserva.lote_id) === eventoId) : reservasConsultadas;
    const reservaIds = totalReservas.map((reserva) => reserva.id);
    const reservasConfirmadas = totalReservas.filter((reserva) => reserva.status === "cliente_confirmado");
    const reservasPendentes = totalReservas.filter((reserva) => reserva.status !== "cliente_confirmado" && reserva.status !== "abandonado");
    const documentos = reservaIds.length ? await db.select({ reserva_id: contratosDocumentos.reserva_id, status: contratosDocumentos.status, versao: contratosDocumentos.versao, criado_em: contratosDocumentos.criado_em }).from(contratosDocumentos).where(and(inArray(contratosDocumentos.reserva_id, reservaIds), ne(contratosDocumentos.status, "invalidado"))).orderBy(desc(contratosDocumentos.versao)) : [];
    const documentoPorReserva = new Map<string, typeof documentos[number]>();
    for (const documento of documentos) if (!documentoPorReserva.has(documento.reserva_id)) documentoPorReserva.set(documento.reserva_id, documento);
    const contratosGerados = Array.from(documentoPorReserva.values());
    const pagamentosLista = reservaIds.length ? await db.select({ reserva_id: pagamentos.reserva_id, valor_centavos: pagamentos.valor_centavos, valor: pagamentos.valor, valor_pago_centavos: pagamentos.valor_pago_centavos, status_reconciliado: pagamentos.status_reconciliado }).from(pagamentos).where(inArray(pagamentos.reserva_id, reservaIds)) : [];
    const parcelasLista = reservaIds.length ? await db.select({ status: pagamentoParcelas.status, vencimento: pagamentoParcelas.vencimento, valor_centavos: pagamentoParcelas.valor_centavos, valor: pagamentoParcelas.valor }).from(pagamentoParcelas).where(inArray(pagamentoParcelas.reserva_id, reservaIds)) : [];
    const clientesComReserva = new Set(totalReservas.map((reserva) => reserva.usuario_id));
    const cadastrosSemReserva = totalClientes.filter((cliente) => !clientesComReserva.has(cliente.id)).length;
    const leadsNovos = totalLeads.filter((l) => l.status === "novo").length;
    const leadsCadastrados = totalLeads.filter((l) => l.status === "cadastrado").length;
    const contratadoCentavos = totalReservas.filter((reserva) => reserva.status !== "abandonado").reduce((total, reserva) => total + Number(reserva.valor_total_centavos || Math.round(Number(reserva.valor_total || 0) * 100)), 0);
    const recebidoCentavos = pagamentosLista.reduce((total, pagamento) => total + Number(pagamento.valor_pago_centavos || 0), 0);
    const hoje = new Date().toISOString().slice(0, 10);
    const vencidas = parcelasLista.filter((parcela) => parcela.status !== "aprovado" && String(parcela.vencimento) < hoje);
    const valorVencidoCentavos = vencidas.reduce((total, parcela) => total + Number(parcela.valor_centavos || Math.round(Number(parcela.valor || 0) * 100)), 0);
    const statusReservas = Object.fromEntries(["visitante", "cadastrado", "pacote_montado", "checkout_iniciado", "aguardando_pagamento", "contrato_gerado", "cliente_confirmado", "abandonado"].map((status) => [status, totalReservas.filter((reserva) => reserva.status === status).length]));
    const operacaoResultado = isAdminOrDev(req.usuario.tipo) ? await db.execute(sql`
      WITH saidas_filtradas AS (
        SELECT s.id, l.vagas_totais FROM saidas_operacionais s JOIN lotes l ON l.id = s.lote_id
        WHERE s.ativa = true ${eventoId ? sql`AND l.evento_id = ${eventoId}` : sql``}
      )
      SELECT
        (SELECT COUNT(*)::int FROM saidas_filtradas) AS saidas,
        (SELECT COUNT(*)::int FROM onibus_operacionais o JOIN saidas_filtradas sf ON sf.id = o.saida_id WHERE o.ativo) AS onibus,
        (SELECT COALESCE(SUM(o.capacidade), 0)::int FROM onibus_operacionais o JOIN saidas_filtradas sf ON sf.id = o.saida_id WHERE o.ativo) AS capacidade,
        (SELECT COUNT(*)::int FROM assento_alocacoes aa JOIN assentos_onibus a ON a.id = aa.assento_id JOIN onibus_operacionais o ON o.id = a.onibus_id JOIN saidas_filtradas sf ON sf.id = o.saida_id WHERE aa.status = 'ativa' AND o.ativo) AS ocupadas,
        (SELECT COUNT(*)::int FROM assentos_onibus a JOIN onibus_operacionais o ON o.id = a.onibus_id JOIN saidas_filtradas sf ON sf.id = o.saida_id WHERE a.status = 'bloqueado' AND o.ativo) AS bloqueadas,
        (SELECT COUNT(*)::int FROM assento_holds h JOIN assentos_onibus a ON a.id = h.assento_id JOIN onibus_operacionais o ON o.id = a.onibus_id JOIN saidas_filtradas sf ON sf.id = o.saida_id WHERE h.status = 'ativo' AND h.expira_em > CURRENT_TIMESTAMP AND o.ativo) AS em_hold,
        (SELECT COUNT(*)::int FROM checkins_operacao c JOIN saidas_filtradas sf ON sf.id = c.saida_id WHERE c.status = 'presente') AS presentes,
        (SELECT COUNT(*)::int FROM saidas_filtradas sf WHERE (SELECT COALESCE(SUM(o.capacidade), 0) FROM onibus_operacionais o WHERE o.saida_id = sf.id AND o.ativo) <> sf.vagas_totais) AS divergencias
    `) : { rows: [] };
    const operacao = (operacaoResultado.rows[0] as any) || { saidas: 0, onibus: 0, capacidade: 0, ocupadas: 0, bloqueadas: 0, em_hold: 0, presentes: 0, divergencias: 0 };
    const ocupacaoVeiculosResultado = isAdminOrDev(req.usuario.tipo) ? await db.execute(sql`
      SELECT o.id, o.nome, o.capacidade, s.nome AS saida_nome, l.nome AS lote_nome,
        COUNT(DISTINCT aa.id) FILTER (WHERE aa.status = 'ativa')::int AS ocupadas,
        COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'bloqueado')::int AS bloqueadas
      FROM onibus_operacionais o
      JOIN saidas_operacionais s ON s.id = o.saida_id AND s.ativa = true
      JOIN lotes l ON l.id = s.lote_id
      LEFT JOIN assentos_onibus a ON a.onibus_id = o.id
      LEFT JOIN assento_alocacoes aa ON aa.assento_id = a.id AND aa.status = 'ativa'
      WHERE o.ativo = true ${eventoId ? sql`AND l.evento_id = ${eventoId}` : sql``}
      GROUP BY o.id, o.nome, o.capacidade, s.nome, l.nome
      ORDER BY ocupadas DESC, o.nome ASC
      LIMIT 6
    `) : { rows: [] };
    const ocupacaoVeiculos = ocupacaoVeiculosResultado.rows.map((linha: any) => ({
      id: String(linha.id),
      nome: String(linha.nome),
      saida_nome: String(linha.saida_nome || linha.lote_nome || "Saída"),
      capacidade: Number(linha.capacidade || 0),
      ocupadas: Number(linha.ocupadas || 0),
      bloqueadas: Number(linha.bloqueadas || 0),
    }));
    const hospedagemResultado = isAdminOrDev(req.usuario.tipo) ? await db.execute(sql`
      WITH quartos_filtrados AS (
        SELECT q.id, q.capacidade FROM quartos_hospedagem q JOIN lotes l ON l.id = q.lote_id
        WHERE q.ativo = true ${eventoId ? sql`AND l.evento_id = ${eventoId}` : sql``}
      )
      SELECT COUNT(*)::int AS quartos, COALESCE(SUM(capacidade), 0)::int AS capacidade,
        (SELECT COUNT(*)::int FROM quarto_alocacoes qa JOIN quartos_filtrados qf ON qf.id = qa.quarto_id WHERE qa.status = 'ativa') AS ocupadas
      FROM quartos_filtrados
    `) : { rows: [] };
    const hospedagem = (hospedagemResultado.rows[0] as any) || { quartos: 0, capacidade: 0, ocupadas: 0 };
    const solicitacoesPendentes = isAdminOrDev(req.usuario.tipo) ? Number(((await db.execute(sql`SELECT COUNT(*)::int AS total FROM reserva_solicitacoes WHERE status IN ('pendente', 'em_analise', 'aprovada')`)).rows[0] as any)?.total || 0) : 0;
    const inicioSerie = new Date();
    inicioSerie.setUTCHours(0, 0, 0, 0);
    inicioSerie.setUTCDate(inicioSerie.getUTCDate() - 29);
    const vendasPorDia = new Map<string, { valor_centavos: number; reservas: number }>();
    for (const reserva of totalReservas) {
      if (reserva.status === "abandonado" || !reserva.criado_em) continue;
      const dataReserva = new Date(reserva.criado_em);
      if (dataReserva < inicioSerie) continue;
      const chave = dataReserva.toISOString().slice(0, 10);
      const atual = vendasPorDia.get(chave) || { valor_centavos: 0, reservas: 0 };
      atual.valor_centavos += Number(reserva.valor_total_centavos || Math.round(Number(reserva.valor_total || 0) * 100));
      atual.reservas += 1;
      vendasPorDia.set(chave, atual);
    }
    const serieVendas = Array.from({ length: 30 }, (_, indice) => {
      const data = new Date(inicioSerie);
      data.setUTCDate(inicioSerie.getUTCDate() + indice);
      const chave = data.toISOString().slice(0, 10);
      const registro = vendasPorDia.get(chave) || { valor_centavos: 0, reservas: 0 };
      return { data: chave, label: `${String(data.getUTCDate()).padStart(2, "0")}/${String(data.getUTCMonth() + 1).padStart(2, "0")}`, ...registro };
    });
    const aprovacaoInconsistente = isAdminOrDev(req.usuario.tipo) ? Number(((await db.execute(sql`SELECT COUNT(*)::int AS total FROM usuarios WHERE tipo = 'cliente' AND cadastro_status = 'aprovado' AND (aprovado_em IS NULL OR aprovado_por IS NULL OR ativo = false)`)).rows[0] as any)?.total || 0) : 0;
    const aguardandoCliente = contratosGerados.filter((contrato) => ["rascunho", "preparado", "aguardando_validacao"].includes(contrato.status)).length;
    const aguardandoAdmin = contratosGerados.filter((contrato) => ["validado", "aguardando_aprovacao_admin"].includes(contrato.status)).length;

    res.json({
      resumo: {
        total_eventos: eventoId ? totalEventos.filter((evento) => evento.id === eventoId).length : totalEventos.length,
        total_clientes: totalClientes.length,
        total_leads_crm: totalLeads.length,
        total_leads: totalLeads.length,
        leads_novos: leadsNovos,
        leads_cadastrados: leadsCadastrados,
        cadastros_sem_reserva: cadastrosSemReserva,
        total_reservas: totalReservas.length,
        reservas_confirmadas: reservasConfirmadas.length,
        reservas_pendentes: reservasPendentes.length,
        contratos_gerados: contratosGerados.length,
        taxa_conversao: totalReservas.length > 0
          ? ((reservasConfirmadas.length / totalReservas.length) * 100).toFixed(2)
          : 0,
      },
      financeiro: { contratado_centavos: contratadoCentavos, recebido_centavos: recebidoCentavos, a_receber_centavos: Math.max(0, contratadoCentavos - recebidoCentavos), vencido_centavos: valorVencidoCentavos, parcelas_vencidas: vencidas.length },
      contratos: { total: contratosGerados.length, aguardando_cliente: aguardandoCliente, aguardando_admin: aguardandoAdmin, aprovados: contratosGerados.filter((contrato) => contrato.status === "aprovado_admin").length },
      serie_vendas: serieVendas,
      funil: [
        { label: "Contatos", valor: totalLeads.length },
        { label: "Cadastros", valor: totalClientes.length },
        { label: "Reservas", valor: totalReservas.length },
        { label: "Contratos", valor: contratosGerados.length },
        { label: "Confirmadas", valor: reservasConfirmadas.length },
      ],
      reservas_status: statusReservas,
      operacao: { saidas: Number(operacao.saidas || 0), onibus: Number(operacao.onibus || 0), capacidade: Number(operacao.capacidade || 0), ocupadas: Number(operacao.ocupadas || 0), bloqueadas: Number(operacao.bloqueadas || 0), em_hold: Number(operacao.em_hold || 0), livres: Math.max(0, Number(operacao.capacidade || 0) - Number(operacao.ocupadas || 0) - Number(operacao.bloqueadas || 0) - Number(operacao.em_hold || 0)), presentes: Number(operacao.presentes || 0), divergencias: Number(operacao.divergencias || 0) },
      ocupacao_onibus: ocupacaoVeiculos,
      hospedagem: { quartos: Number(hospedagem.quartos || 0), capacidade: Number(hospedagem.capacidade || 0), ocupadas: Number(hospedagem.ocupadas || 0), livres: Math.max(0, Number(hospedagem.capacidade || 0) - Number(hospedagem.ocupadas || 0)) },
      alertas: { cadastros_sem_reserva: cadastrosSemReserva, aprovacoes_inconsistentes: aprovacaoInconsistente, contratos_aguardando_cliente: aguardandoCliente, contratos_aguardando_admin: aguardandoAdmin, parcelas_vencidas: vencidas.length, divergencias_capacidade: Number(operacao.divergencias || 0), solicitacoes_pendentes: solicitacoesPendentes },
      filtros: { eventos: totalEventos.map((evento) => ({ id: evento.id, nome: evento.nome })), evento_id: eventoId || null },
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro no dashboard:", error);
    res.status(500).json({ erro: "Erro ao carregar dashboard" });
  }
});

// Vendedores podem consultar reservas atribuídas e operar somente o módulo
// interno de vendas. As demais operações administrativas continuam exclusivas
// do administrador.
router.use((req: Request, res: Response, next) => {
  if (req.usuario?.tipo === "vendedor" && (
    (req.method === "GET" && req.path === "/reservas") ||
    req.path.startsWith("/vendas") ||
    req.path.startsWith("/contratos")
  )) return next();
  return requireRole("admin")(req, res, next);
});

function clientePodeSerOperado(req: Request, usuarioId: string): boolean {
  return Boolean(req.usuario && usuarioId && req.usuario.tipo !== "cliente");
}

async function resolverOrigemVenda(req: Request, usuarioId: string, vendedorSolicitado?: string, leadSolicitado?: string) {
  if (!req.usuario || !clientePodeSerOperado(req, usuarioId)) throw new Error("Cliente inválido para venda interna");

  const vendedorId = req.usuario.tipo === "vendedor" ? req.usuario.id : (vendedorSolicitado || undefined);
  if (vendedorId) {
    const vendedor = (await db.select({ id: usuarios.id, tipo: usuarios.tipo, ativo: usuarios.ativo }).from(usuarios).where(eq(usuarios.id, vendedorId)).limit(1))[0];
    if (!vendedor || vendedor.tipo !== "vendedor" || vendedor.ativo === false) throw new Error("Vendedor inválido ou inativo");
  }

  const condicoes = [eq(leads_origem.usuario_id, usuarioId)];
  if (leadSolicitado) condicoes.push(eq(leads_origem.id, leadSolicitado));
  if (vendedorId) condicoes.push(eq(leads_origem.vendedor_id, vendedorId));
  const lead = (await db.select({ id: leads_origem.id, vendedor_id: leads_origem.vendedor_id, codigo_origem: leads_origem.codigo_origem })
    .from(leads_origem)
    .where(and(...condicoes))
    .orderBy(desc(leads_origem.atualizado_em))
    .limit(1))[0];

  if (req.usuario.tipo === "vendedor" && !lead) throw new Error("O cliente não pertence à sua carteira comercial");
  return {
    lead_id: lead?.id,
    vendedor_id: lead?.vendedor_id || vendedorId,
    codigo_origem: lead?.codigo_origem || (vendedorId ? `interno-${vendedorId}` : undefined),
  };
}

async function vendedorPodeOperarReserva(req: Request, reserva: { usuario_id: string; vendedor_id: string | null }): Promise<boolean> {
  if (!req.usuario) return false;
  if (req.usuario.tipo !== "dev") {
    const alvo = (await db.select({ tipo: usuarios.tipo }).from(usuarios).where(eq(usuarios.id, reserva.usuario_id)).limit(1))[0];
    if (!alvo || alvo.tipo !== "cliente") return false;
  }
  return isAdminOrDev(req.usuario.tipo) || reserva.usuario_id === req.usuario.id || (req.usuario.tipo === "vendedor" && reserva.vendedor_id === req.usuario.id);
}

router.get("/vendas/clientes", async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const busca = String(req.query.busca || "").trim();
    const pagina = Math.max(1, Number(req.query.pagina || 1));
    const limite = Math.min(50, Math.max(1, Number(req.query.limite || 20)));
    const condicoes = [eq(usuarios.tipo, "cliente" as const), eq(usuarios.ativo, true)];

    if (req.usuario.tipo === "vendedor") {
      const leads = await db.select({ usuario_id: leads_origem.usuario_id }).from(leads_origem).where(and(eq(leads_origem.vendedor_id, req.usuario.id), sql`${leads_origem.usuario_id} IS NOT NULL`));
      const ids = Array.from(new Set(leads.map((lead) => lead.usuario_id).filter((id): id is string => Boolean(id))));
      if (ids.length === 0) return res.json({ total: 0, pagina, limite, clientes: [] });
      condicoes.push(inArray(usuarios.id, ids));
    }
    if (busca) {
      const termo = `%${busca}%`;
      const digitos = somenteDigitos(busca);
      condicoes.push(or(sql`${usuarios.nome} ILIKE ${termo}`, sql`${usuarios.email} ILIKE ${termo}`, digitos ? sql`regexp_replace(COALESCE(${usuarios.cpf}, ''), '\\D', '', 'g') LIKE ${`%${digitos}%`}` : sql`false`)!);
    }

    const clientes = await db.select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, cpf: usuarios.cpf, telefone: usuarios.telefone, criado_em: usuarios.criado_em })
      .from(usuarios)
      .where(and(...condicoes))
      .orderBy(desc(usuarios.criado_em))
      .limit(limite)
      .offset((pagina - 1) * limite);
    return res.json({ total: clientes.length, pagina, limite, clientes });
  } catch (error: any) {
    console.error("[ADMIN/VENDAS] Erro ao buscar clientes:", error);
    return res.status(500).json({ erro: "Erro ao buscar clientes para venda" });
  }
});

router.post("/vendas/clientes", async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const nome = String(req.body?.nome || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const cpf = somenteDigitos(req.body?.cpf);
    const telefone = somenteDigitos(req.body?.telefone);
    const endereco = String(req.body?.endereco || "").trim();
    const dataNascimento = req.body?.data_nascimento ? new Date(req.body.data_nascimento) : null;
    const faltantes = camposFaltantesCadastroMinimo({ nome, email, cpf, telefone, data_nascimento: dataNascimento, endereco });
    if (faltantes.length) return res.status(400).json({ erro: `Complete os dados essenciais do cliente: ${faltantes.join(", ")}` });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ erro: "Informe um e-mail válido" });
    if (!cpfValido(cpf)) return res.status(400).json({ erro: "Informe um CPF válido" });
    if (telefone.length < 10 || telefone.length > 13) return res.status(400).json({ erro: "Informe um telefone com DDD válido" });
    if (!dataNascimento || Number.isNaN(dataNascimento.getTime()) || dataNascimento.getTime() >= Date.now()) return res.status(400).json({ erro: "Data de nascimento inválida" });

    const senhaTemporaria = String(req.body?.senha || "").trim() || gerarSenhaTemporaria();
    if (senhaTemporaria.length < 8) return res.status(400).json({ erro: "Senha deve ter no mínimo 8 caracteres" });
    const vendedorId = req.usuario.tipo === "vendedor" ? req.usuario.id : String(req.body?.vendedor_id || "").trim() || undefined;
    if (vendedorId) {
      const vendedor = (await db.select({ id: usuarios.id, tipo: usuarios.tipo, ativo: usuarios.ativo }).from(usuarios).where(eq(usuarios.id, vendedorId)).limit(1))[0];
      if (!vendedor || vendedor.tipo !== "vendedor" || vendedor.ativo === false) return res.status(400).json({ erro: "Vendedor inválido ou inativo" });
    }

    const criado = await db.transaction(async (tx) => {
      const usuario = (await tx.insert(usuarios).values({
        nome,
        email,
        cpf,
        telefone,
        data_nascimento: dataNascimento,
        endereco,
        tipo: "cliente",
        senha_hash: await AuthService.hashPassword(senhaTemporaria),
        email_confirmado: true,
        cadastro_status: "pendente",
      }).returning(CAMPOS_PUBLICOS_USUARIO))[0];
      if (!usuario) throw new Error("Não foi possível criar o cliente");

      let lead = null;
      if (vendedorId) {
        lead = (await tx.insert(leads_origem).values({
          id: createId(),
          codigo_origem: `interno-${vendedorId}`,
          vendedor_id: vendedorId,
          usuario_id: usuario.id,
          nome,
          email,
          whatsapp: telefone,
          origem: "venda_interna",
          status: "cadastrado",
          atualizado_em: new Date(),
          criado_em: new Date(),
        }).returning({ id: leads_origem.id }))[0] || null;
      }
      return { usuario, lead };
    });
    await registrarHistoricoCliente(criado.usuario.id, "cadastro", "Cliente criado em venda interna", "Cadastro criado pelo módulo de vendas internas", req.usuario.id, { lead_id: criado.lead?.id || null, vendedor_id: vendedorId || null });
    return res.status(201).json({ ...criado, senha_gerada: req.body?.senha ? undefined : senhaTemporaria });
  } catch (error: any) {
    if (erroDeUnicidade(error)) return res.status(409).json({ erro: "E-mail ou CPF já cadastrado" });
    console.error("[ADMIN/VENDAS] Erro ao criar cliente:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível criar o cliente" });
  }
});

router.post("/vendas/calcular", async (req: Request, res: Response) => {
  try {
    const usuarioId = String(req.body?.usuario_id || "").trim();
    const cliente = (await db.select({ id: usuarios.id, ativo: usuarios.ativo }).from(usuarios).where(and(eq(usuarios.id, usuarioId), eq(usuarios.tipo, "cliente"))).limit(1))[0];
    if (!cliente || !cliente.ativo) return res.status(404).json({ erro: "Cliente ativo não encontrado" });
    const origem = await resolverOrigemVenda(req, usuarioId, req.body?.vendedor_id, req.body?.lead_id);
    const config: ConfiguracaoPacote = { ...req.body, usuario_id: usuarioId, vendedor_id: origem.vendedor_id };
    return res.json(await PacoteService.calcularValorPacote(config));
  } catch (error: any) {
    console.error("[ADMIN/VENDAS] Erro ao calcular:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível calcular a venda" });
  }
});

router.post("/vendas/reservar", async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const usuarioId = String(req.body?.usuario_id || "").trim();
    const cliente = (await db.select().from(usuarios).where(and(eq(usuarios.id, usuarioId), eq(usuarios.tipo, "cliente"), eq(usuarios.ativo, true))).limit(1))[0];
    if (!cliente) return res.status(404).json({ erro: "Cliente ativo não encontrado" });
    const origem = await resolverOrigemVenda(req, usuarioId, req.body?.vendedor_id, req.body?.lead_id);
    let origemFinal = origem;
    if (isAdminOrDev(req.usuario.tipo) && req.body?.vendedor_id && !origem.lead_id) {
      const lead = (await db.insert(leads_origem).values({
        id: createId(),
        codigo_origem: `interno-${req.body.vendedor_id}`,
        vendedor_id: origem.vendedor_id || null,
        usuario_id: usuarioId,
        nome: cliente.nome,
        email: cliente.email,
        whatsapp: cliente.telefone,
        origem: "venda_interna",
        status: "checkout_iniciado",
        atualizado_em: new Date(),
        criado_em: new Date(),
      }).returning({ id: leads_origem.id }))[0];
      origemFinal = { ...origem, lead_id: lead?.id };
    }
    const config: ConfiguracaoPacote = { ...req.body, usuario_id: usuarioId, vendedor_id: origemFinal.vendedor_id };
    const resultado = await PacoteService.reservarPacote(usuarioId, String(req.body?.lote_id || ""), config, req.ip || req.socket.remoteAddress || "desconhecido", origemFinal);
    const alocacaoOperacional = await OperacaoOnibusService.alocarPrimeiroDisponivel(String(req.body?.lote_id || ""), resultado.reserva.id, req.usuario.id);
    return res.status(201).json({ mensagem: "Venda interna registrada e vaga reservada", reserva_id: resultado.reserva.id, status: resultado.reserva.status, calculo: resultado.calculo, aguardando_cliente: true, operacao: alocacaoOperacional ? { poltrona_atribuida: true, alocacao_id: alocacaoOperacional.id } : { poltrona_atribuida: false, motivo: "Atribuição pendente no mapa operacional" } });
  } catch (error: any) {
    console.error("[ADMIN/VENDAS] Erro ao reservar:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível registrar a venda" });
  }
});

router.get("/vendas/reservas", async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const condicoes = [eq(usuarios.tipo, "cliente")];
    if (req.usuario.tipo === "vendedor") condicoes.push(eq(reservas.vendedor_id, req.usuario.id));
    if (req.query.status) condicoes.push(eq(reservas.status, String(req.query.status) as any));
    if (req.query.usuario_id) condicoes.push(eq(reservas.usuario_id, String(req.query.usuario_id)));
    if (req.query.busca) {
      const termo = `%${String(req.query.busca).trim()}%`;
      condicoes.push(or(sql`${usuarios.nome} ILIKE ${termo}`, sql`${usuarios.email} ILIKE ${termo}`, sql`${eventos.nome} ILIKE ${termo}`)!);
    }
    const linhas = await db.select({
      id: reservas.id,
      status: reservas.status,
      checkout_estado: reservas.checkout_estado,
      valor_total: reservas.valor_total,
      forma_pagamento: reservas.forma_pagamento,
      desconto_pagamento: reservas.desconto_pagamento,
      criado_em: reservas.criado_em,
      atualizado_em: reservas.atualizado_em,
      vendedor_id: reservas.vendedor_id,
      cliente_id: usuarios.id,
      cliente_nome: usuarios.nome,
      cliente_email: usuarios.email,
      cliente_telefone: usuarios.telefone,
      evento_id: eventos.id,
      evento_nome: eventos.nome,
      lote_id: lotes.id,
      lote_nome: lotes.nome,
      pacote_id: pacotes.id,
      pacote_nome: pacotes.nome,
      modalidade_hospedagem: pacotes.modalidade_hospedagem,
    }).from(reservas)
      .innerJoin(usuarios, eq(reservas.usuario_id, usuarios.id))
      .innerJoin(lotes, eq(reservas.lote_id, lotes.id))
      .innerJoin(eventos, eq(lotes.evento_id, eventos.id))
      .leftJoin(pacotes, eq(reservas.pacote_id, pacotes.id))
      .where(condicoes.length ? and(...condicoes) : undefined)
      .orderBy(desc(reservas.criado_em))
      .limit(100);

    const ids = linhas.map((linha) => linha.id);
    const vendedorIds = Array.from(new Set(linhas.map((linha) => linha.vendedor_id).filter((id): id is string => Boolean(id))));
    const vendedoresDaLista = vendedorIds.length
      ? await db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(and(inArray(usuarios.id, vendedorIds), eq(usuarios.tipo, "vendedor")))
      : [];
    const vendedorMap = new Map(vendedoresDaLista.map((vendedor) => [vendedor.id, vendedor.nome]));
    const pagamentosRecentes = ids.length ? await db.select({ reserva_id: pagamentos.reserva_id, status: pagamentos.status, status_reconciliado: pagamentos.status_reconciliado, metodo: pagamentos.metodo, valor_centavos: pagamentos.valor_centavos, valor_pago_centavos: pagamentos.valor_pago_centavos, atualizado_em: pagamentos.atualizado_em }).from(pagamentos).where(inArray(pagamentos.reserva_id, ids)).orderBy(desc(pagamentos.atualizado_em)) : [];
    const documentos = ids.length ? await db.select({ reserva_id: contratosDocumentos.reserva_id, versao: contratosDocumentos.versao, status: contratosDocumentos.status, snapshot_sha256: contratosDocumentos.snapshot_sha256, pdf_sha256: contratosDocumentos.pdf_sha256, criado_em: contratosDocumentos.criado_em }).from(contratosDocumentos).where(inArray(contratosDocumentos.reserva_id, ids)).orderBy(desc(contratosDocumentos.versao)) : [];
    const pagamentoMap = new Map<string, typeof pagamentosRecentes[number]>();
    for (const pagamento of pagamentosRecentes) if (!pagamentoMap.has(pagamento.reserva_id)) pagamentoMap.set(pagamento.reserva_id, pagamento);
    const documentoMap = new Map<string, typeof documentos[number]>();
    for (const documento of documentos) if (!documentoMap.has(documento.reserva_id)) documentoMap.set(documento.reserva_id, documento);
    return res.json({ total: linhas.length, reservas: linhas.map((linha) => ({ ...linha, vendedor_nome: linha.vendedor_id ? vendedorMap.get(linha.vendedor_id) || null : null, pagamento: pagamentoMap.get(linha.id) || null, contrato: documentoMap.get(linha.id) || null })) });
  } catch (error) {
    console.error("[ADMIN/VENDAS] Erro ao listar vendas:", error);
    return res.status(500).json({ erro: "Erro ao listar vendas internas" });
  }
});

router.get("/vendas/reservas/:reserva_id", async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const filtroReserva = req.usuario.tipo === "dev" ? eq(reservas.id, req.params.reserva_id) : and(eq(reservas.id, req.params.reserva_id), eq(usuarios.tipo, "cliente"));
    const reserva = (await db.select({ id: reservas.id, usuario_id: reservas.usuario_id, vendedor_id: reservas.vendedor_id, status: reservas.status, checkout_estado: reservas.checkout_estado, valor_total: reservas.valor_total, forma_pagamento: reservas.forma_pagamento, quantidade_parcelas: reservas.quantidade_parcelas, valor_parcela: reservas.valor_parcela, criado_em: reservas.criado_em, cliente_nome: usuarios.nome, cliente_email: usuarios.email, cliente_cpf: usuarios.cpf, cliente_telefone: usuarios.telefone, evento_nome: eventos.nome, lote_nome: lotes.nome, pacote_nome: pacotes.nome }).from(reservas).innerJoin(usuarios, eq(reservas.usuario_id, usuarios.id)).innerJoin(lotes, eq(reservas.lote_id, lotes.id)).innerJoin(eventos, eq(lotes.evento_id, eventos.id)).leftJoin(pacotes, eq(reservas.pacote_id, pacotes.id)).where(filtroReserva).limit(1))[0];
    if (!reserva) return res.status(404).json({ erro: "Venda não encontrada" });
    if (req.usuario.tipo === "vendedor" && reserva.vendedor_id !== req.usuario.id) return res.status(403).json({ erro: "Venda fora da sua carteira" });
    const vendedor = reserva.vendedor_id
      ? (await db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(and(eq(usuarios.id, reserva.vendedor_id), eq(usuarios.tipo, "vendedor"))).limit(1))[0] || null
      : null;
    const [pagamentosDaReserva, contratosDaReserva] = await Promise.all([
      db.select({ id: pagamentos.id, status: pagamentos.status, status_reconciliado: pagamentos.status_reconciliado, metodo: pagamentos.metodo, valor: pagamentos.valor, valor_pago_centavos: pagamentos.valor_pago_centavos, gateway_id: pagamentos.gateway_id, atualizado_em: pagamentos.atualizado_em }).from(pagamentos).where(eq(pagamentos.reserva_id, reserva.id)).orderBy(desc(pagamentos.atualizado_em)),
      db.select({ id: contratosDocumentos.id, versao: contratosDocumentos.versao, status: contratosDocumentos.status, snapshot_sha256: contratosDocumentos.snapshot_sha256, pdf_sha256: contratosDocumentos.pdf_sha256, criado_em: contratosDocumentos.criado_em }).from(contratosDocumentos).where(eq(contratosDocumentos.reserva_id, reserva.id)).orderBy(desc(contratosDocumentos.versao)),
    ]);
    return res.json({ reserva: { ...reserva, vendedor_nome: vendedor?.nome || null }, pagamentos: pagamentosDaReserva, contratos: contratosDaReserva });
  } catch (error) {
    console.error("[ADMIN/VENDAS] Erro ao detalhar venda:", error);
    return res.status(500).json({ erro: "Erro ao detalhar venda" });
  }
});

// Listar reservas com filtros
router.get("/reservas", async (req: Request, res: Response) => {
  try {
    const { evento_id, status, pagina = "1", limite = "20" } = req.query;
    const statusValidos: Array<NonNullable<typeof reservas.$inferSelect.status>> = [
      "visitante",
      "cadastrado",
      "pacote_montado",
      "checkout_iniciado",
      "aguardando_pagamento",
      "contrato_gerado",
      "cliente_confirmado",
      "abandonado",
    ];

    const condicoes = [];
    if (req.usuario?.tipo !== "dev") condicoes.push(sql`EXISTS (SELECT 1 FROM usuarios AS cliente_reserva WHERE cliente_reserva.id = ${reservas.usuario_id} AND cliente_reserva.tipo = 'cliente')`);

    if (evento_id) {
      // reservas não tem evento_id direto, só lote_id — buscar os lotes do evento primeiro
      const lotesDoEvento = await db
        .select()
        .from(lotes)
        .where(eq(lotes.evento_id, evento_id as string));
      const loteIds = lotesDoEvento.map((l) => l.id);
      condicoes.push(
        loteIds.length > 0 ? inArray(reservas.lote_id, loteIds) : eq(reservas.id, "__nenhum__")
      );
    }

    if (status) {
      if (!statusValidos.includes(status as NonNullable<typeof reservas.$inferSelect.status>)) {
        return res.status(400).json({ erro: "Status de reserva inválido" });
      }
      condicoes.push(eq(reservas.status, status as NonNullable<typeof reservas.$inferSelect.status>));
    }

    if (req.usuario?.tipo === "vendedor") {
      condicoes.push(eq(reservas.vendedor_id, req.usuario.id));
    }

    let query = db.select().from(reservas).$dynamic();
    if (condicoes.length > 0) {
      query = query.where(and(...condicoes));
    }

    const offset = (parseInt(pagina as string) - 1) * parseInt(limite as string);
    const resultado = await query.limit(parseInt(limite as string)).offset(offset);
    const reservaIds = resultado.map((reserva) => reserva.id);
    const documentos = reservaIds.length ? await db.select({ reserva_id: contratosDocumentos.reserva_id })
      .from(contratosDocumentos)
      .where(and(inArray(contratosDocumentos.reserva_id, reservaIds), ne(contratosDocumentos.status, "invalidado"))) : [];
    const reservasComContrato = new Set(documentos.map((documento) => documento.reserva_id));
    const alocacoes = reservaIds.length ? await db.select({
      reserva_id: assentoAlocacoes.reserva_id,
      onibus_nome: onibusOperacionais.nome,
      onibus_identificacao: onibusOperacionais.identificacao,
      poltrona: assentosOnibus.numero,
      ponto_embarque: pontosEmbarqueOperacao.nome,
    }).from(assentoAlocacoes)
      .innerJoin(assentosOnibus, eq(assentoAlocacoes.assento_id, assentosOnibus.id))
      .innerJoin(onibusOperacionais, eq(assentosOnibus.onibus_id, onibusOperacionais.id))
      .leftJoin(pontosEmbarqueOperacao, eq(assentoAlocacoes.ponto_embarque_id, pontosEmbarqueOperacao.id))
      .where(and(inArray(assentoAlocacoes.reserva_id, reservaIds), eq(assentoAlocacoes.status, "ativa"))) : [];
    const alocacaoPorReserva = new Map(alocacoes.map((alocacao) => [alocacao.reserva_id, alocacao]));

    res.json({
      total: resultado.length,
      pagina: parseInt(pagina as string),
      limite: parseInt(limite as string),
      reservas: resultado.map((reserva) => ({
        ...reserva,
        contrato_disponivel: reservasComContrato.has(reserva.id),
        operacao: alocacaoPorReserva.get(reserva.id) || null,
      })),
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao listar reservas:", error);
    res.status(500).json({ erro: "Erro ao listar reservas" });
  }
});

// Relatório de ocupação
router.get("/relatorios/ocupacao/:evento_id", async (req: Request, res: Response) => {
  try {
    const { evento_id } = req.params;

    const relatorio = await RelatorioService.relatorioOcupacao(evento_id);

    res.json({
      evento_id,
      relatorio,
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao gerar relatório:", error);
    res.status(500).json({ erro: "Erro ao gerar relatório" });
  }
});

// Relatório de faturamento
router.get("/relatorios/faturamento/:evento_id", async (req: Request, res: Response) => {
  try {
    const { evento_id } = req.params;

    const relatorio = await RelatorioService.relatorioFaturamento(evento_id);

    res.json({
      evento_id,
      ...relatorio,
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao gerar relatório:", error);
    res.status(500).json({ erro: "Erro ao gerar relatório" });
  }
});

// Relatório de pacotes mais vendidos
router.get("/relatorios/pacotes/:evento_id", async (req: Request, res: Response) => {
  try {
    const { evento_id } = req.params;

    const relatorio = await RelatorioService.relatorioPacotesMaisVendidos(evento_id);

    res.json({
      evento_id,
      relatorio,
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao gerar relatório:", error);
    res.status(500).json({ erro: "Erro ao gerar relatório" });
  }
});

// Relatório de uso de cupons
router.get("/relatorios/cupons/:evento_id", async (req: Request, res: Response) => {
  try {
    const { evento_id } = req.params;

    const relatorio = await RelatorioService.relatorioUsoCupons(evento_id);

    res.json({
      evento_id,
      relatorio,
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao gerar relatório:", error);
    res.status(500).json({ erro: "Erro ao gerar relatório" });
  }
});

// Reenviar contrato manualmente
router.post("/reenviar-contrato/:reserva_id", async (req: Request, res: Response) => {
  try {
    const { reserva_id } = req.params;
    const reserva = (await db.select({ usuario_id: reservas.usuario_id, vendedor_id: reservas.vendedor_id }).from(reservas).where(eq(reservas.id, reserva_id)).limit(1))[0];
    if (!reserva || !(await vendedorPodeOperarReserva(req, reserva))) return res.status(404).json({ erro: "Contrato não encontrado" });

    const enviado = await EmailService.reenviarContrato(reserva_id);

    if (enviado) {
      res.json({ mensagem: "Contrato reenviado com sucesso" });
    } else {
      res.status(500).json({ erro: "Erro ao enviar e-mail" });
    }
  } catch (error: any) {
    console.error("[ADMIN] Erro ao reenviar:", error);
    res.status(500).json({ erro: "Erro ao reenviar contrato" });
  }
});

// Exportar reservas em CSV
router.get("/exportar/reservas/:evento_id", async (req: Request, res: Response) => {
  try {
    const { evento_id } = req.params;

    // Buscar lotes do evento
    const lotesResult = await db
      .select()
      .from(lotes)
      .where(eq(lotes.evento_id, evento_id));

    const loteIds = lotesResult.map((l) => l.id);

    // Buscar reservas
    const reservasResult = loteIds.length > 0
      ? await db.select().from(reservas).where(inArray(reservas.lote_id, loteIds))
      : [];

    // Gerar CSV
    const headers = ["ID", "Usuário", "Email", "Status", "Valor Total", "Data Criação"];
    const rows = [];

    for (const reserva of reservasResult) {
      const usuario = await db
        .select({ nome: usuarios.nome, email: usuarios.email, tipo: usuarios.tipo })
        .from(usuarios)
        .where(eq(usuarios.id, reserva.usuario_id))
        .limit(1);

      if (!usuario[0] || !podeExporUsuario(req.usuario?.tipo, usuario[0].tipo)) continue;

      rows.push([
        reserva.id,
        usuario[0]?.nome || "Desconhecido",
        usuario[0]?.email || "Desconhecido",
        reserva.status,
        reserva.valor_total,
        reserva.criado_em.toISOString(),
      ]);
    }

    // Montar CSV
    const csv = [
      headers.join(","),
      ...rows.map((r) => r.map((v) => `"${v}"`).join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="reservas-${evento_id}.csv"`);
    res.send(csv);
  } catch (error: any) {
    console.error("[ADMIN] Erro ao exportar:", error);
    res.status(500).json({ erro: "Erro ao exportar dados" });
  }
});

// ==========================================================================
// Cadastro de clientes/usuários (clientes, vendedores e administradores)
// ==========================================================================

const CAMPOS_PUBLICOS_USUARIO = {
  id: usuarios.id,
  nome: usuarios.nome,
  email: usuarios.email,
  cpf: usuarios.cpf,
  telefone: usuarios.telefone,
  tipo: usuarios.tipo,
  data_nascimento: usuarios.data_nascimento,
  endereco: usuarios.endereco,
  ativo: usuarios.ativo,
  cadastro_status: usuarios.cadastro_status,
  aprovado_em: usuarios.aprovado_em,
  aprovado_por: usuarios.aprovado_por,
  gestor_id: usuarios.gestor_id,
  equipe_nome: usuarios.equipe_nome,
  ultimo_acesso_em: usuarios.ultimo_acesso_em,
  criado_em: usuarios.criado_em,
  atualizado_em: usuarios.atualizado_em,
};

router.get("/usuarios", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { tipo, busca, pagina = "1", limite = "20" } = req.query;

    const condicoes = [];
    const solicitanteDev = req.usuario?.tipo === "dev";
    if (!solicitanteDev) condicoes.push(ne(usuarios.tipo, "dev"));
    const tiposPermitidos = solicitanteDev ? ["cliente", "vendedor", "admin", "dev"] : ["cliente", "vendedor", "admin"];
    if (tipo && tiposPermitidos.includes(String(tipo))) {
      condicoes.push(eq(usuarios.tipo, String(tipo) as any));
    }
    if (busca) {
      const termo = `%${String(busca).trim()}%`;
      const buscaDigitos = somenteDigitos(busca);
      condicoes.push(
        or(
          sql`${usuarios.nome} ILIKE ${termo}`,
          sql`${usuarios.email} ILIKE ${termo}`,
          buscaDigitos ? sql`regexp_replace(COALESCE(${usuarios.cpf}, ''), '\\D', '', 'g') LIKE ${`%${buscaDigitos}%`}` : sql`false`,
        )
      );
    }

    let query = db.select(CAMPOS_PUBLICOS_USUARIO).from(usuarios).$dynamic();
    if (condicoes.length > 0) {
      query = query.where(and(...condicoes));
    }

    const offset = (parseInt(pagina as string) - 1) * parseInt(limite as string);
    const resultado = (await query
      .orderBy(desc(usuarios.criado_em))
      .limit(parseInt(limite as string))
      .offset(offset))
      .filter((usuario) => podeExporUsuario(req.usuario?.tipo, usuario.tipo));

    res.json({
      total: resultado.length,
      pagina: parseInt(pagina as string),
      limite: parseInt(limite as string),
      usuarios: resultado,
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao listar usuários:", error);
    res.status(500).json({ erro: "Erro ao listar usuários" });
  }
});

router.get("/usuarios/:id", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const usuarioResult = await db
      .select(CAMPOS_PUBLICOS_USUARIO)
      .from(usuarios)
      .where(eq(usuarios.id, id))
      .limit(1);

    if (usuarioResult.length === 0 || !podeExporUsuario(req.usuario?.tipo, usuarioResult[0]?.tipo) || (usuarioResult[0]?.tipo === "admin" && req.usuario?.tipo !== "dev")) {
      return res.status(404).json({ erro: "Usuário não encontrado" });
    }

    const reservasDoUsuario = await db
      .select()
      .from(reservas)
      .where(eq(reservas.usuario_id, id))
      .orderBy(desc(reservas.criado_em));

    res.json({ usuario: usuarioResult[0], reservas: reservasDoUsuario });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao buscar usuário:", error);
    res.status(500).json({ erro: "Erro ao buscar usuário" });
  }
});

router.post("/usuarios", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const {
      nome, email, cpf, telefone, tipo,
      data_nascimento, endereco,
      senha, equipe_nome, gestor_id,
    } = req.body ?? {};

    const nomeNormalizado = String(nome || "").trim();
    const emailNormalizado = String(email || "").trim().toLowerCase();
    const cpfNormalizado = somenteDigitos(cpf);
    const telefoneNormalizado = somenteDigitos(telefone);
    const tiposCriaveis = req.usuario?.tipo === "dev" ? ["cliente", "vendedor", "admin", "dev"] : ["cliente", "vendedor"];
    const tipoNormalizado: "cliente" | "vendedor" | "admin" | "dev" = tiposCriaveis.includes(String(tipo)) ? String(tipo) as "cliente" | "vendedor" | "admin" | "dev" : "cliente";
    if ((tipo === "admin" || tipo === "dev") && req.usuario?.tipo !== "dev") return res.status(403).json({ erro: "Somente DEV pode criar administradores ou outro DEV" });

    if (!nomeNormalizado || !emailNormalizado) {
      return res.status(400).json({ erro: "Nome e e-mail são obrigatórios" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
      return res.status(400).json({ erro: "Informe um e-mail válido" });
    }
    if (cpfNormalizado && !cpfValido(cpfNormalizado)) {
      return res.status(400).json({ erro: "Informe um CPF válido" });
    }
    if (tipoNormalizado === "cliente" && !cpfNormalizado) {
      return res.status(400).json({ erro: "CPF é obrigatório para cadastro de cliente" });
    }

    const dataNascimento = data_nascimento ? new Date(data_nascimento) : null;
    if (data_nascimento && (Number.isNaN(dataNascimento?.getTime()) || dataNascimento!.getTime() >= Date.now())) {
      return res.status(400).json({ erro: "Data de nascimento inválida" });
    }
    const enderecoNormalizado = String(endereco || "").trim();
    if (telefoneNormalizado && (telefoneNormalizado.length < 10 || telefoneNormalizado.length > 13)) return res.status(400).json({ erro: "Informe um telefone com DDD válido" });
    if (tipoNormalizado === "cliente") {
      const faltantes = camposFaltantesCadastroMinimo({ nome: nomeNormalizado, email: emailNormalizado, cpf: cpfNormalizado, telefone: telefoneNormalizado, data_nascimento: dataNascimento, endereco: enderecoNormalizado });
      if (faltantes.length) return res.status(400).json({ erro: `Complete os dados essenciais do cliente: ${faltantes.join(", ")}` });
    }

    const senhaTemporaria = String(senha || "").trim() || gerarSenhaTemporaria();
    if (senhaTemporaria.length < 8) {
      return res.status(400).json({ erro: "Senha deve ter no mínimo 8 caracteres" });
    }
    const senhaHash = await AuthService.hashPassword(senhaTemporaria);
    let gestorId: string | null = null;
    if (tipoNormalizado === "vendedor") {
      gestorId = req.usuario?.tipo === "dev" && gestor_id ? String(gestor_id) : (req.usuario?.id || null);
      if (gestorId) {
        const gestor = (await db.select({ id: usuarios.id, tipo: usuarios.tipo, ativo: usuarios.ativo }).from(usuarios).where(eq(usuarios.id, gestorId)).limit(1))[0];
        if (!gestor || !["admin", "dev"].includes(String(gestor.tipo)) || gestor.ativo === false || (gestor.tipo === "dev" && req.usuario?.tipo !== "dev")) return res.status(400).json({ erro: "Gestor inválido" });
      }
    }

    try {
      const criado = await db
        .insert(usuarios)
        .values({
          nome: nomeNormalizado,
          email: emailNormalizado,
          cpf: cpfNormalizado || null,
          telefone: telefoneNormalizado || null,
          tipo: tipoNormalizado,
          data_nascimento: dataNascimento,
          endereco: enderecoNormalizado || null,
          senha_hash: senhaHash,
          cadastro_status: tipoNormalizado === "cliente" ? "pendente" : "aprovado",
          aprovado_em: tipoNormalizado === "cliente" ? null : new Date(),
          aprovado_por: tipoNormalizado === "cliente" ? null : (req.usuario?.id || null),
          gestor_id: gestorId,
          equipe_nome: tipoNormalizado === "vendedor" ? String(equipe_nome || "").trim().slice(0, 120) || null : null,
        })
        .returning(CAMPOS_PUBLICOS_USUARIO);

      if (criado[0]?.tipo === "cliente" && req.usuario) {
        await registrarHistoricoCliente(criado[0].id, "cadastro", "Cliente cadastrado", "Cadastro criado pelo painel administrativo", req.usuario.id);
      }
      res.status(201).json({
        usuario: criado[0],
        senha_gerada: senha ? undefined : senhaTemporaria,
      });
    } catch (error: any) {
      if (erroDeUnicidade(error)) {
        return res.status(409).json({ erro: "E-mail ou CPF já cadastrado" });
      }
      throw error;
    }
  } catch (error: any) {
    console.error("[ADMIN] Erro ao criar usuário:", error);
    res.status(500).json({ erro: "Erro ao criar usuário" });
  }
});

router.put("/usuarios/:id", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      nome, email, cpf, telefone, tipo,
      data_nascimento, endereco,
      senha, equipe_nome, gestor_id,
    } = req.body ?? {};

    const existente = await db.select().from(usuarios).where(eq(usuarios.id, id)).limit(1);
    if (existente.length === 0 || !podeExporUsuario(req.usuario?.tipo, existente[0]?.tipo) || (existente[0]?.tipo === "admin" && req.usuario?.tipo !== "dev")) {
      return res.status(404).json({ erro: "Usuário não encontrado" });
    }

    const atualizacoes: Partial<typeof usuarios.$inferInsert> = { atualizado_em: new Date() };
    let revogarSessoes = false;

    if (nome !== undefined) {
      const nomeNormalizado = String(nome).trim();
      if (!nomeNormalizado) return res.status(400).json({ erro: "Nome não pode ser vazio" });
      atualizacoes.nome = nomeNormalizado;
    }
    if (email !== undefined) {
      const emailNormalizado = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
        return res.status(400).json({ erro: "Informe um e-mail válido" });
      }
      atualizacoes.email = emailNormalizado;
    }
    if (cpf !== undefined) {
      const cpfNormalizado = somenteDigitos(cpf);
      if (cpfNormalizado && !cpfValido(cpfNormalizado)) {
        return res.status(400).json({ erro: "Informe um CPF válido" });
      }
      atualizacoes.cpf = cpfNormalizado || null;
    }
    if (telefone !== undefined) {
      const telefoneNormalizado = somenteDigitos(telefone);
      if (telefoneNormalizado && (telefoneNormalizado.length < 10 || telefoneNormalizado.length > 13)) return res.status(400).json({ erro: "Informe um telefone com DDD válido" });
      atualizacoes.telefone = telefoneNormalizado || null;
    }
    if (tipo !== undefined) {
      const permitido = req.usuario?.tipo === "dev" ? ["cliente", "vendedor", "admin", "dev"].includes(String(tipo)) : ["cliente", "vendedor"].includes(String(tipo));
      if (!permitido) return res.status(403).json({ erro: "Você não pode atribuir este nível de acesso" });
      atualizacoes.tipo = String(tipo) as any;
      revogarSessoes = tipo !== existente[0].tipo;
    }
    if (data_nascimento !== undefined) {
      const dataNascimento = data_nascimento ? new Date(data_nascimento) : null;
      if (data_nascimento && (Number.isNaN(dataNascimento?.getTime()) || dataNascimento!.getTime() >= Date.now())) {
        return res.status(400).json({ erro: "Data de nascimento inválida" });
      }
      atualizacoes.data_nascimento = dataNascimento;
    }
    if (endereco !== undefined) atualizacoes.endereco = String(endereco).trim() || null;
    if (existente[0].tipo === "vendedor" && equipe_nome !== undefined) atualizacoes.equipe_nome = String(equipe_nome).trim().slice(0, 120) || null;
    if (existente[0].tipo === "vendedor" && gestor_id !== undefined) {
      const gestorId = req.usuario?.tipo === "dev" ? String(gestor_id || "").trim() || null : req.usuario?.id || null;
      if (gestorId) {
        const gestor = (await db.select({ id: usuarios.id, tipo: usuarios.tipo, ativo: usuarios.ativo }).from(usuarios).where(eq(usuarios.id, gestorId)).limit(1))[0];
        if (!gestor || !["admin", "dev"].includes(String(gestor.tipo)) || gestor.ativo === false || (gestor.tipo === "dev" && req.usuario?.tipo !== "dev")) return res.status(400).json({ erro: "Gestor inválido" });
      }
      atualizacoes.gestor_id = gestorId;
    }
    const tipoFinal = atualizacoes.tipo || existente[0].tipo;
    if (tipoFinal === "cliente") {
      const faltantes = camposFaltantesCadastroMinimo({
        nome: atualizacoes.nome ?? existente[0].nome,
        email: atualizacoes.email ?? existente[0].email,
        cpf: atualizacoes.cpf === undefined ? existente[0].cpf : atualizacoes.cpf,
        telefone: atualizacoes.telefone === undefined ? existente[0].telefone : atualizacoes.telefone,
        data_nascimento: atualizacoes.data_nascimento === undefined ? existente[0].data_nascimento : atualizacoes.data_nascimento,
        endereco: atualizacoes.endereco === undefined ? existente[0].endereco : atualizacoes.endereco,
      });
      if (faltantes.length) return res.status(400).json({ erro: `Complete os dados essenciais do cliente: ${faltantes.join(", ")}` });
    }
    if (senha) {
      if (String(senha).length < 8) {
        return res.status(400).json({ erro: "Senha deve ter no mínimo 8 caracteres" });
      }
      atualizacoes.senha_hash = await AuthService.hashPassword(String(senha));
      revogarSessoes = true;
    }

    try {
      const atualizado = await db
        .update(usuarios)
        .set({
          ...atualizacoes,
          ...(revogarSessoes ? { session_version: sql`COALESCE(${usuarios.session_version}, 1) + 1` } : {}),
        })
        .where(eq(usuarios.id, id))
        .returning(CAMPOS_PUBLICOS_USUARIO);

      if (atualizado[0]?.tipo === "cliente" && req.usuario) {
        await registrarHistoricoCliente(id, "cadastro_atualizado", "Cadastro atualizado", "Dados cadastrais alterados pelo painel administrativo", req.usuario.id);
      }
      res.json({ usuario: atualizado[0] });
    } catch (error: any) {
      if (erroDeUnicidade(error)) {
        return res.status(409).json({ erro: "E-mail ou CPF já cadastrado para outro usuário" });
      }
      throw error;
    }
  } catch (error: any) {
    console.error("[ADMIN] Erro ao atualizar usuário:", error);
    res.status(500).json({ erro: "Erro ao atualizar usuário" });
  }
});

router.patch("/usuarios/:id/status", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { ativo } = req.body ?? {};

    if (typeof ativo !== "boolean") {
      return res.status(400).json({ erro: "Informe o campo 'ativo' (true/false)" });
    }
    if (id === req.usuario?.id && !ativo) return res.status(409).json({ erro: "Não é possível desativar o próprio acesso" });
    const alvo = (await db.select({ tipo: usuarios.tipo }).from(usuarios).where(eq(usuarios.id, id)).limit(1))[0];
    if (!alvo || !podeExporUsuario(req.usuario?.tipo, alvo.tipo) || (alvo.tipo === "admin" && req.usuario?.tipo !== "dev")) return res.status(404).json({ erro: "Usuário não encontrado" });

    const atualizado = await db
      .update(usuarios)
      .set({
        ativo,
        atualizado_em: new Date(),
        session_version: sql`COALESCE(${usuarios.session_version}, 1) + 1`,
      })
      .where(eq(usuarios.id, id))
      .returning(CAMPOS_PUBLICOS_USUARIO);

    if (atualizado.length === 0) {
      return res.status(404).json({ erro: "Usuário não encontrado" });
    }

    if (atualizado[0]?.tipo === "cliente" && req.usuario) {
      await registrarHistoricoCliente(id, "status", ativo ? "Cliente reativado" : "Cliente desativado", ativo ? "Acesso reativado pelo painel" : "Acesso desativado pelo painel", req.usuario.id);
    }
    res.json({ usuario: atualizado[0] });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao atualizar status do usuário:", error);
    res.status(500).json({ erro: "Erro ao atualizar status do usuário" });
  }
});

router.delete("/usuarios/:id", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    if (req.params.id === req.usuario.id) return res.status(409).json({ erro: "Não é possível excluir ou arquivar o próprio acesso" });

    const alvo = (await db.select(CAMPOS_PUBLICOS_USUARIO).from(usuarios).where(eq(usuarios.id, req.params.id)).limit(1))[0];
    if (!alvo || !podeExporUsuario(req.usuario.tipo, alvo.tipo) || (alvo.tipo === "admin" && req.usuario.tipo !== "dev")) return res.status(404).json({ erro: "Usuário não encontrado" });

    const dependencias = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM reservas WHERE usuario_id = ${alvo.id} OR vendedor_id = ${alvo.id} OR boleto_liberado_por = ${alvo.id}
        UNION ALL SELECT 1 FROM leads_origem WHERE usuario_id = ${alvo.id} OR vendedor_id = ${alvo.id}
        UNION ALL SELECT 1 FROM contratos_documentos WHERE aprovado_admin_por = ${alvo.id}
        UNION ALL SELECT 1 FROM contrato_validacoes WHERE usuario_id = ${alvo.id}
        UNION ALL SELECT 1 FROM otp_desafios WHERE usuario_id = ${alvo.id}
        UNION ALL SELECT 1 FROM contrato_eventos WHERE ator_id = ${alvo.id}
        UNION ALL SELECT 1 FROM consentimentos_imagem WHERE usuario_id = ${alvo.id}
        UNION ALL SELECT 1 FROM precos_ledger WHERE criado_por = ${alvo.id}
        UNION ALL SELECT 1 FROM descontos_administrativos WHERE administrador_id = ${alvo.id}
        UNION ALL SELECT 1 FROM comissao_regras WHERE vendedor_id = ${alvo.id}
        UNION ALL SELECT 1 FROM comissoes WHERE vendedor_id = ${alvo.id}
        UNION ALL SELECT 1 FROM cupons_utilizacoes WHERE usuario_id = ${alvo.id}
        UNION ALL SELECT 1 FROM cupons WHERE vendedor_id = ${alvo.id}
        UNION ALL SELECT 1 FROM cliente_documentos WHERE usuario_id = ${alvo.id} OR criado_por = ${alvo.id} OR removido_por = ${alvo.id}
        UNION ALL SELECT 1 FROM cliente_historico WHERE usuario_id = ${alvo.id} OR criado_por = ${alvo.id}
        UNION ALL SELECT 1 FROM convites_acesso WHERE criado_por = ${alvo.id} OR usado_por = ${alvo.id}
        UNION ALL SELECT 1 FROM auditoria_admin WHERE ator_id = ${alvo.id}
        UNION ALL SELECT 1 FROM gateway_credenciais WHERE atualizado_por = ${alvo.id}
        UNION ALL SELECT 1 FROM pagamento_parcelas WHERE pago_confirmado_por = ${alvo.id}
        UNION ALL SELECT 1 FROM avaliacoes WHERE usuario_id = ${alvo.id}
        UNION ALL SELECT 1 FROM usuarios WHERE aprovado_por = ${alvo.id} OR gestor_id = ${alvo.id}
        UNION ALL SELECT 1 FROM saidas_operacionais WHERE criado_por = ${alvo.id}
        UNION ALL SELECT 1 FROM assento_alocacoes WHERE usuario_id = ${alvo.id} OR alocado_por = ${alvo.id}
        UNION ALL SELECT 1 FROM checkins_operacao WHERE confirmado_por = ${alvo.id}
        UNION ALL SELECT 1 FROM operacao_historico WHERE ator_id = ${alvo.id}
      ) AS possui_dependencias
    `);
    let arquivar = Boolean((dependencias.rows[0] as { possui_dependencias?: boolean } | undefined)?.possui_dependencias);

    if (!arquivar) {
      try {
        await db.transaction(async (tx) => {
          await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.usuario_id, alvo.id));
          await tx.delete(verificacoesEmail).where(eq(verificacoesEmail.usuario_id, alvo.id));
          await tx.delete(sessoes).where(eq(sessoes.usuario_id, alvo.id));
          const removido = await tx.delete(usuarios).where(eq(usuarios.id, alvo.id)).returning({ id: usuarios.id });
          if (!removido[0]) throw new Error("Usuário não encontrado");
          await tx.insert(auditoriaAdmin).values({ id: createId(), ator_id: req.usuario!.id, ator_tipo: req.usuario!.tipo, acao: "usuario_excluido", entidade: "usuario", entidade_id: alvo.id, antes: { tipo: alvo.tipo, ativo: alvo.ativo }, depois: { modo: "exclusao_definitiva" }, ip: req.ip || null, user_agent: req.get("user-agent") || null, criado_em: new Date() });
        });
        return res.json({ modo: "excluido", mensagem: "Usuário excluído com segurança." });
      } catch (error: any) {
        if (error?.code !== "23503") throw error;
        arquivar = true;
      }
    }

    if (arquivar) {
      await db.transaction(async (tx) => {
        const agora = new Date();
        await tx.update(usuarios).set({ ativo: false, atualizado_em: agora, session_version: sql`COALESCE(${usuarios.session_version}, 1) + 1` }).where(eq(usuarios.id, alvo.id));
        if (alvo.tipo === "cliente") {
          await tx.insert(clienteHistorico).values({ id: createId(), usuario_id: alvo.id, tipo: "arquivamento", titulo: "Cliente arquivado", descricao: "Acesso desativado para preservar os registros existentes", criado_por: req.usuario!.id, criado_em: agora });
        }
        await tx.insert(auditoriaAdmin).values({ id: createId(), ator_id: req.usuario!.id, ator_tipo: req.usuario!.tipo, acao: "usuario_arquivado", entidade: "usuario", entidade_id: alvo.id, antes: { ativo: alvo.ativo }, depois: { ativo: false }, ip: req.ip || null, user_agent: req.get("user-agent") || null, criado_em: agora });
      });
      return res.json({ modo: "arquivado", mensagem: "Este usuário possui registros no sistema e foi arquivado para preservar o histórico." });
    }
  } catch (error: any) {
    console.error("[ADMIN] Erro ao excluir ou arquivar usuário:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível excluir ou arquivar o usuário" });
  }
});

router.delete("/usuarios/:id/definitivo", requireRole("dev"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const resultado = await ClienteExclusaoService.excluirDefinitivamente(
      req.params.id,
      req.body?.confirmacao,
      {
        id: req.usuario.id,
        tipo: req.usuario.tipo,
        ip: req.ip || null,
        userAgent: req.get("user-agent") || null,
      },
    );
    return res.json(resultado);
  } catch (error) {
    console.error("[ADMIN] Erro ao excluir cliente definitivamente:", error);
    if (error instanceof ErroExclusaoCliente) return res.status(error.status).json({ erro: error.message });
    return res.status(409).json({ erro: "Não foi possível excluir definitivamente. Nenhum dado foi removido." });
  }
});

// ==========================================================================
// Ficha 360º de clientes: dados, histórico, documentos, contratos e relatórios
// ==========================================================================

router.get("/clientes/exportar", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const busca = String(req.query.busca || "").trim();
    const condicoes = [eq(usuarios.tipo, "cliente")];
    if (busca) {
      const termo = `%${busca}%`;
      const digitos = somenteDigitos(busca);
      condicoes.push(or(
        sql`${usuarios.nome} ILIKE ${termo}`,
        sql`${usuarios.email} ILIKE ${termo}`,
        digitos ? sql`regexp_replace(COALESCE(${usuarios.cpf}, ''), '\\D', '', 'g') LIKE ${`%${digitos}%`}` : sql`false`,
      )!);
    }
    const clientes = await db.select(CAMPOS_PUBLICOS_USUARIO).from(usuarios).where(and(...condicoes)).orderBy(desc(usuarios.criado_em));
    const linhas = [
      ["Nome", "E-mail", "CPF", "Telefone", "Nascimento", "Endereço", "Status", "Criado em"],
      ...clientes.map((cliente) => [cliente.nome, cliente.email, cliente.cpf, cliente.telefone, cliente.data_nascimento?.toISOString?.() || cliente.data_nascimento, cliente.endereco, cliente.ativo ? "Ativo" : "Inativo", cliente.criado_em?.toISOString?.() || cliente.criado_em]),
    ];
    const csv = `\uFEFF${linhas.map((linha) => linha.map(csvCampo).join(";")).join("\n")}`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="clientes.csv"');
    return res.send(csv);
  } catch (error) {
    console.error("[ADMIN/CLIENTES] Erro ao exportar clientes:", error);
    return res.status(500).json({ erro: "Erro ao exportar clientes" });
  }
});

router.get("/clientes/:id/ficha", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const ficha = await obterFichaCliente(req.params.id);
    if (!ficha) return res.status(404).json({ erro: "Cliente não encontrado" });
    return res.json(ficha);
  } catch (error) {
    console.error("[ADMIN/CLIENTES] Erro ao carregar ficha:", error);
    return res.status(500).json({ erro: "Erro ao carregar ficha do cliente" });
  }
});

router.post("/clientes/:id/historico", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const cliente = (await db.select({ id: usuarios.id }).from(usuarios).where(and(eq(usuarios.id, req.params.id), eq(usuarios.tipo, "cliente"))).limit(1))[0];
    if (!cliente) return res.status(404).json({ erro: "Cliente não encontrado" });
    const titulo = String(req.body?.titulo || "Anotação").trim().slice(0, 255);
    const descricao = String(req.body?.descricao || "").trim();
    if (!descricao) return res.status(400).json({ erro: "Informe a anotação" });
    await registrarHistoricoCliente(cliente.id, "anotacao", titulo || "Anotação", descricao, req.usuario.id, { origem: "painel_admin" });
    return res.status(201).json({ mensagem: "Anotação registrada" });
  } catch (error) {
    console.error("[ADMIN/CLIENTES] Erro ao registrar histórico:", error);
    return res.status(500).json({ erro: "Erro ao registrar anotação" });
  }
});

const parserDocumentoCliente = raw({ type: "application/octet-stream", limit: "12mb" });

function uploadDocumentoCliente(req: Request, res: Response, next: NextFunction) {
  parserDocumentoCliente(req, res, (error?: any) => {
    if (error?.type === "entity.too.large") return res.status(413).json({ erro: "Arquivo excede o limite de 12 MB" });
    if (error) return next(error);
    return next();
  });
}

function detectarMimeDocumento(buffer: Buffer, extensao: string): string | null {
  const pdf = buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (extensao === ".pdf" && pdf) return "application/pdf";
  if ([".jpg", ".jpeg"].includes(extensao) && jpeg) return "image/jpeg";
  if (extensao === ".png" && png) return "image/png";
  if (extensao === ".webp" && webp) return "image/webp";
  return null;
}

router.post("/clientes/:id/documentos", requireRole("admin"), uploadDocumentoCliente, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const cliente = (await db.select({ id: usuarios.id }).from(usuarios).where(and(eq(usuarios.id, req.params.id), eq(usuarios.tipo, "cliente"))).limit(1))[0];
    if (!cliente) return res.status(404).json({ erro: "Cliente não encontrado" });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ erro: "Arquivo não recebido" });

    const nomeOriginal = decodeURIComponent(String(req.get("x-file-name") || "documento"));
    const extensao = nodePath.extname(nomeOriginal).toLowerCase();
    const extensoesPermitidas = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp"]);
    if (!extensoesPermitidas.has(extensao)) return res.status(415).json({ erro: "Extensão não permitida. Envie PDF, JPG, JPEG, PNG ou WEBP" });
    const mimeType = detectarMimeDocumento(req.body, extensao);
    if (!mimeType) return res.status(415).json({ erro: "O conteúdo do arquivo não corresponde a um PDF ou imagem permitida" });
    const mimeInformado = String(req.get("x-file-mime") || "").trim().toLowerCase();
    if (mimeInformado && mimeInformado !== mimeType) return res.status(415).json({ erro: "Tipo do arquivo inconsistente com o conteúdo enviado" });

    const hash = createHash("sha256").update(req.body).digest("hex");
    const duplicado = (await db.select({ id: clienteDocumentos.id }).from(clienteDocumentos).where(and(eq(clienteDocumentos.usuario_id, cliente.id), eq(clienteDocumentos.sha256, hash), isNull(clienteDocumentos.removido_em))).limit(1))[0];
    if (duplicado) return res.status(409).json({ erro: "Este mesmo arquivo já consta na ficha do cliente" });

    const base = nodePath.resolve(process.env.STORAGE_PATH || "./uploads");
    const pasta = nodePath.resolve(base, "clientes", cliente.id);
    if (!pasta.startsWith(`${base}${nodePath.sep}`)) return res.status(400).json({ erro: "Caminho de armazenamento inválido" });
    await fs.mkdir(pasta, { recursive: true });
    const id = createId();
    const nomeFisico = `${Date.now()}-${id}-${nomeArquivoSeguro(nodePath.basename(nomeOriginal, extensao))}${extensao}`;
    const arquivo = nodePath.join(pasta, nomeFisico);
    await fs.writeFile(arquivo, req.body, { mode: 0o600 });

    const categoriasPermitidas = new Set(["identidade", "cpf", "comprovante_residencia", "autorizacao", "comprovante_pagamento", "saude", "outros"]);
    const categoriaBruta = String(req.query.categoria || "outros").trim().slice(0, 60) || "outros";
    const categoria = categoriasPermitidas.has(categoriaBruta) ? categoriaBruta : "outros";
    const tiposIdentidade = new Set<TipoIdentidade>(["rg", "cnh", "passaporte", "outro"]);
    const tipoIdentidadeBruto = String(req.query.tipo_identidade || "").trim().toLocaleLowerCase("pt-BR") as TipoIdentidade;
    const tipoIdentidade = categoria === "identidade" ? (tiposIdentidade.has(tipoIdentidadeBruto) ? tipoIdentidadeBruto : "outro") : null;
    const nome = String(req.query.nome || nodePath.basename(nomeOriginal, extensao)).trim().slice(0, 255) || "Documento";
    const observacoes = String(req.query.observacoes || "").trim().slice(0, 5000) || null;
    const reservaId = String(req.query.reserva_id || "").trim() || null;
    if (reservaId) {
      const pertence = (await db.select({ id: reservas.id }).from(reservas).where(and(eq(reservas.id, reservaId), eq(reservas.usuario_id, cliente.id))).limit(1))[0];
      if (!pertence) {
        await fs.unlink(arquivo).catch(() => undefined);
        return res.status(400).json({ erro: "A reserva informada não pertence ao cliente" });
      }
    }

    const documento = (await db.insert(clienteDocumentos).values({
      id,
      usuario_id: cliente.id,
      reserva_id: reservaId,
      categoria,
      nome,
      nome_original: nomeOriginal.slice(0, 255),
      mime_type: mimeType,
      tamanho_bytes: req.body.length,
      sha256: hash,
      arquivo,
      observacoes,
      tipo_identidade: tipoIdentidade,
      validacao_status: "nao_iniciada",
      criado_por: req.usuario.id,
      criado_em: new Date(),
      atualizado_em: new Date(),
    }).returning({
      id: clienteDocumentos.id,
      usuario_id: clienteDocumentos.usuario_id,
      reserva_id: clienteDocumentos.reserva_id,
      categoria: clienteDocumentos.categoria,
      nome: clienteDocumentos.nome,
      nome_original: clienteDocumentos.nome_original,
      mime_type: clienteDocumentos.mime_type,
      tamanho_bytes: clienteDocumentos.tamanho_bytes,
      sha256: clienteDocumentos.sha256,
      observacoes: clienteDocumentos.observacoes,
      tipo_identidade: clienteDocumentos.tipo_identidade,
      validacao_status: clienteDocumentos.validacao_status,
      criado_em: clienteDocumentos.criado_em,
    }))[0];

    await registrarHistoricoCliente(cliente.id, "documento", "Documento adicionado", `${categoria}: ${nome}`, req.usuario.id, { documento_id: id, sha256: hash, reserva_id: reservaId });
    const validacao = categoria === "identidade" ? await IdentityDocumentService.validar(documento.id) : null;
    return res.status(201).json({ documento: { ...documento, ...(validacao || {}) } });
  } catch (error: any) {
    console.error("[ADMIN/CLIENTES] Erro ao anexar documento:", error);
    return res.status(500).json({ erro: "Erro ao anexar documento" });
  }
});

router.post("/clientes/:id/documentos/:documentoId/validar", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const documento = (await db.select({ id: clienteDocumentos.id }).from(clienteDocumentos).where(and(
      eq(clienteDocumentos.id, req.params.documentoId),
      eq(clienteDocumentos.usuario_id, req.params.id),
      eq(clienteDocumentos.categoria, "identidade"),
      isNull(clienteDocumentos.removido_em),
    )).limit(1))[0];
    if (!documento) return res.status(404).json({ erro: "Documento de identificação não encontrado" });
    const validacao = await IdentityDocumentService.validar(documento.id, { forcar: true });
    return res.json({ documento: { id: documento.id, ...validacao } });
  } catch (error) {
    console.error("[ADMIN/CLIENTES] Erro ao repetir validação documental");
    return res.status(500).json({ erro: "Não foi possível validar o documento" });
  }
});

router.patch("/clientes/:id/documentos/:documentoId/validacao", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const status = String(req.body?.status || "");
    const motivo = String(req.body?.motivo || "").trim().slice(0, 1000);
    if (!["aprovado", "rejeitado"].includes(status) || motivo.length < 5) return res.status(400).json({ erro: "Informe a decisão e o motivo da conferência" });
    const documento = (await db.select({ id: clienteDocumentos.id, nome: clienteDocumentos.nome }).from(clienteDocumentos).where(and(
      eq(clienteDocumentos.id, req.params.documentoId),
      eq(clienteDocumentos.usuario_id, req.params.id),
      eq(clienteDocumentos.categoria, "identidade"),
      isNull(clienteDocumentos.removido_em),
    )).limit(1))[0];
    if (!documento) return res.status(404).json({ erro: "Documento de identificação não encontrado" });
    const agora = new Date();
    await db.update(clienteDocumentos).set({
      validacao_status: status,
      validacao_provedor: "manual",
      validacao_modelo: null,
      validado_em: status === "aprovado" ? agora : null,
      erro_validacao: status === "rejeitado" ? motivo : null,
      validacao_resultado: { decisao_manual: true, motivo, responsavel_id: req.usuario.id },
      atualizado_em: agora,
    }).where(eq(clienteDocumentos.id, documento.id));
    await registrarHistoricoCliente(req.params.id, "documento_validado", status === "aprovado" ? "Documento conferido" : "Documento recusado", motivo, req.usuario.id, { documento_id: documento.id, status });
    return res.json({ mensagem: status === "aprovado" ? "Documento aprovado após conferência" : "Documento recusado", status });
  } catch (error) {
    console.error("[ADMIN/CLIENTES] Erro ao registrar decisão documental");
    return res.status(500).json({ erro: "Não foi possível registrar a decisão" });
  }
});

router.get("/clientes/:id/documentos/:documentoId", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const cliente = (await db.select({ id: usuarios.id }).from(usuarios).where(and(eq(usuarios.id, req.params.id), eq(usuarios.tipo, "cliente"))).limit(1))[0];
    if (!cliente) return res.status(404).json({ erro: "Cliente não encontrado" });
    const documento = (await db.select().from(clienteDocumentos).where(and(eq(clienteDocumentos.id, req.params.documentoId), eq(clienteDocumentos.usuario_id, req.params.id), isNull(clienteDocumentos.removido_em))).limit(1))[0];
    if (!documento) return res.status(404).json({ erro: "Documento não encontrado" });
    const base = nodePath.resolve(process.env.STORAGE_PATH || "./uploads");
    const arquivo = nodePath.resolve(documento.arquivo);
    if (!arquivo.startsWith(`${base}${nodePath.sep}`)) return res.status(403).json({ erro: "Arquivo inválido" });
    const conteudo = await fs.readFile(arquivo);
    const inline = req.query.inline === "1";
    res.setHeader("Content-Type", documento.mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${nomeArquivoSeguro(documento.nome_original)}"`);
    await registrarHistoricoCliente(documento.usuario_id, inline ? "documento_visualizado" : "documento_baixado", inline ? "Documento visualizado" : "Documento baixado", documento.nome, req.usuario.id, { documento_id: documento.id, sha256: documento.sha256 });
    return res.send(conteudo);
  } catch (error) {
    console.error("[ADMIN/CLIENTES] Erro ao abrir documento:", error);
    return res.status(500).json({ erro: "Erro ao abrir documento" });
  }
});

router.delete("/clientes/:id/documentos/:documentoId", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const cliente = (await db.select({ id: usuarios.id }).from(usuarios).where(and(eq(usuarios.id, req.params.id), eq(usuarios.tipo, "cliente"))).limit(1))[0];
    if (!cliente) return res.status(404).json({ erro: "Cliente não encontrado" });
    const documento = (await db.select().from(clienteDocumentos).where(and(eq(clienteDocumentos.id, req.params.documentoId), eq(clienteDocumentos.usuario_id, req.params.id), isNull(clienteDocumentos.removido_em))).limit(1))[0];
    if (!documento) return res.status(404).json({ erro: "Documento não encontrado" });
    await db.update(clienteDocumentos).set({ removido_em: new Date(), removido_por: req.usuario.id, atualizado_em: new Date() }).where(eq(clienteDocumentos.id, documento.id));
    await registrarHistoricoCliente(documento.usuario_id, "documento_removido", "Documento removido", documento.nome, req.usuario.id, { documento_id: documento.id, sha256: documento.sha256 });
    return res.status(204).send();
  } catch (error) {
    console.error("[ADMIN/CLIENTES] Erro ao remover documento:", error);
    return res.status(500).json({ erro: "Erro ao remover documento" });
  }
});

router.get("/clientes/:id/relatorio", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const ficha = await obterFichaCliente(req.params.id);
    if (!ficha) return res.status(404).json({ erro: "Cliente não encontrado" });
    const { usuario, resumo } = ficha;
    if (String(req.query.formato || "").toLowerCase() === "csv") {
      const linhas: unknown[][] = [
        ["FICHA DO CLIENTE", usuario.nome],
        ["E-mail", usuario.email], ["CPF", usuario.cpf], ["Telefone", usuario.telefone],
        ["Nascimento", usuario.data_nascimento], ["Endereço", usuario.endereco],
        [], ["RESUMO"], ["Reservas", resumo.reservas], ["Reservas confirmadas", resumo.reservas_confirmadas], ["Contratos", resumo.contratos], ["Documentos", resumo.documentos], ["Valor contratado", resumo.valor_contratado], ["Valor pago", resumo.valor_pago],
        [], ["RESERVAS"], ["ID", "Evento", "Lote", "Pacote", "Status", "Valor", "Criado em"],
        ...ficha.reservas.map((item) => [item.id, item.evento_nome, item.lote_nome, item.pacote_nome, item.status, item.valor_total, item.criado_em]),
        [], ["PAGAMENTOS"], ["Reserva", "Método", "Status", "Valor", "Valor pago", "Atualizado em"],
        ...ficha.pagamentos.map((item) => [item.reserva_id, item.metodo, item.status_reconciliado || item.status, item.valor, Number(item.valor_pago_centavos || 0) / 100, item.atualizado_em]),
        [], ["DOCUMENTOS"], ["Categoria", "Nome", "Arquivo", "SHA-256", "Criado em"],
        ...ficha.documentos.map((item) => [item.categoria, item.nome, item.nome_original, item.sha256, item.criado_em]),
      ];
      const csv = `\uFEFF${linhas.map((linha) => linha.map(csvCampo).join(";")).join("\n")}`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="ficha-${nomeArquivoSeguro(usuario.nome)}.csv"`);
      return res.send(csv);
    }

    const linhasReservas = ficha.reservas.map((item) => `<tr><td>${escaparHtml(item.evento_nome)}</td><td>${escaparHtml(item.lote_nome)}</td><td>${escaparHtml(item.pacote_nome || "—")}</td><td>${escaparHtml(item.status || "—")}</td><td>R$ ${Number(item.valor_total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td><td>${new Date(item.criado_em).toLocaleDateString("pt-BR")}</td></tr>`).join("") || '<tr><td colspan="6">Nenhuma reserva.</td></tr>';
    const linhasContratos = ficha.contratos.map((item) => `<tr><td>${escaparHtml(item.reserva_id)}</td><td>v${item.versao}</td><td>${escaparHtml(item.status)}</td><td>${item.validado_em ? new Date(item.validado_em).toLocaleString("pt-BR") : "—"}</td><td>${escaparHtml(item.pdf_sha256 || "—")}</td></tr>`).join("") || '<tr><td colspan="5">Nenhum contrato.</td></tr>';
    const linhasDocumentos = ficha.documentos.map((item) => `<tr><td>${escaparHtml(item.categoria)}</td><td>${escaparHtml(item.nome)}</td><td>${escaparHtml(item.nome_original)}</td><td>${new Date(item.criado_em).toLocaleString("pt-BR")}</td></tr>`).join("") || '<tr><td colspan="4">Nenhum documento adicional.</td></tr>';
    const linhasHistorico = ficha.historico.slice(0, 80).map((item: any) => `<tr><td>${new Date(item.criado_em).toLocaleString("pt-BR")}</td><td>${escaparHtml(item.tipo)}</td><td>${escaparHtml(item.titulo)}</td><td>${escaparHtml(item.descricao || "")}</td></tr>`).join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ficha de ${escaparHtml(usuario.nome)}</title><style>body{font-family:Arial,sans-serif;color:#182d3b;margin:32px;font-size:12px}h1{font-family:Georgia,serif;font-size:28px;margin:0 0 4px}h2{font-family:Georgia,serif;font-size:18px;margin-top:26px;border-bottom:1px solid #ddd;padding-bottom:6px}.muted{color:#667085}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.box{border:1px solid #ddd;border-radius:10px;padding:12px}.box strong{display:block;font-size:18px;color:#851f32}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border-bottom:1px solid #e5e7eb;text-align:left;padding:7px;vertical-align:top}th{background:#f8f5ef}.dados{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px}.dados div{padding:4px 0}.label{font-size:10px;text-transform:uppercase;color:#667085}@media print{body{margin:10mm}}</style></head><body><h1>${escaparHtml(usuario.nome)}</h1><p class="muted">Ficha completa do cliente · gerada em ${new Date().toLocaleString("pt-BR")}</p><section class="dados"><div><span class="label">E-mail</span><br>${escaparHtml(usuario.email)}</div><div><span class="label">Telefone</span><br>${escaparHtml(usuario.telefone || "—")}</div><div><span class="label">CPF</span><br>${escaparHtml(usuario.cpf || "—")}</div><div><span class="label">Nascimento</span><br>${usuario.data_nascimento ? new Date(usuario.data_nascimento).toLocaleDateString("pt-BR") : "—"}</div><div><span class="label">Endereço</span><br>${escaparHtml(usuario.endereco || "—")}</div><div><span class="label">Cliente desde</span><br>${new Date(usuario.criado_em).toLocaleDateString("pt-BR")}</div></section><h2>Resumo</h2><div class="grid"><div class="box"><span>Reservas</span><strong>${resumo.reservas}</strong></div><div class="box"><span>Contratos</span><strong>${resumo.contratos}</strong></div><div class="box"><span>Documentos</span><strong>${resumo.documentos}</strong></div><div class="box"><span>Valor contratado</span><strong>R$ ${Number(resumo.valor_contratado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></div><div class="box"><span>Valor pago</span><strong>R$ ${Number(resumo.valor_pago).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></div><div class="box"><span>Status</span><strong>${usuario.ativo ? "Ativo" : "Inativo"}</strong></div></div><h2>Reservas e viagens</h2><table><thead><tr><th>Evento</th><th>Lote</th><th>Pacote</th><th>Status</th><th>Valor</th><th>Data</th></tr></thead><tbody>${linhasReservas}</tbody></table><h2>Contratos</h2><table><thead><tr><th>Reserva</th><th>Versão</th><th>Status</th><th>Validação</th><th>Hash PDF</th></tr></thead><tbody>${linhasContratos}</tbody></table><h2>Documentos</h2><table><thead><tr><th>Categoria</th><th>Nome</th><th>Arquivo</th><th>Data</th></tr></thead><tbody>${linhasDocumentos}</tbody></table><h2>Histórico</h2><table><thead><tr><th>Quando</th><th>Tipo</th><th>Evento</th><th>Detalhe</th></tr></thead><tbody>${linhasHistorico}</tbody></table></body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (error) {
    console.error("[ADMIN/CLIENTES] Erro ao gerar relatório:", error);
    return res.status(500).json({ erro: "Erro ao gerar relatório do cliente" });
  }
});

// ==========================================================================
// Vídeos do YouTube — administração sem embed automático
router.get("/videos", requireRole("admin"), async (_req: Request, res: Response) => {
  try { return res.json({ videos: await db.select().from(videosEvento).orderBy(videosEvento.ordem, desc(videosEvento.criado_em)) }); }
  catch (error) { console.error("[ADMIN] Erro ao listar vídeos:", error); return res.status(500).json({ erro: "Erro ao listar vídeos" }); }
});

router.post("/videos", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const youtubeId = extrairYoutubeId(req.body?.url);
    if (!youtubeId || !req.body?.evento_id) return res.status(400).json({ erro: "Informe URL do YouTube válida e evento" });
    const video = (await db.insert(videosEvento).values({ id: randomUUID(), evento_id: String(req.body.evento_id), url: String(req.body.url), youtube_id: youtubeId, titulo: req.body.titulo ? String(req.body.titulo).slice(0, 255) : null, descricao: req.body.descricao ? String(req.body.descricao) : null, ordem: Number(req.body.ordem || 0), ativo: req.body.ativo !== false, destaque: req.body.destaque === true }).returning())[0];
    return res.status(201).json({ video });
  } catch (error: any) { console.error("[ADMIN] Erro ao criar vídeo:", error); return res.status(400).json({ erro: "Não foi possível salvar o vídeo" }); }
});

router.patch("/videos/:id", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const youtubeId = req.body?.url ? extrairYoutubeId(req.body.url) : undefined;
    if (req.body?.url && !youtubeId) return res.status(400).json({ erro: "URL do YouTube inválida" });
    const video = (await db.update(videosEvento).set({ ...(youtubeId ? { url: String(req.body.url), youtube_id: youtubeId } : {}), ...(req.body.titulo !== undefined ? { titulo: String(req.body.titulo).slice(0, 255) } : {}), ...(req.body.descricao !== undefined ? { descricao: String(req.body.descricao) } : {}), ...(req.body.ordem !== undefined ? { ordem: Number(req.body.ordem) } : {}), ...(req.body.ativo !== undefined ? { ativo: Boolean(req.body.ativo) } : {}), ...(req.body.destaque !== undefined ? { destaque: Boolean(req.body.destaque) } : {}), atualizado_em: new Date() }).where(eq(videosEvento.id, req.params.id)).returning())[0];
    if (!video) return res.status(404).json({ erro: "Vídeo não encontrado" });
    return res.json({ video });
  } catch (error) { console.error("[ADMIN] Erro ao atualizar vídeo:", error); return res.status(400).json({ erro: "Não foi possível atualizar o vídeo" }); }
});

router.delete("/videos/:id", requireRole("admin"), async (req: Request, res: Response) => {
  try { const excluido = await db.delete(videosEvento).where(eq(videosEvento.id, req.params.id)).returning({ id: videosEvento.id }); if (!excluido[0]) return res.status(404).json({ erro: "Vídeo não encontrado" }); return res.status(204).send(); }
  catch (error) { console.error("[ADMIN] Erro ao remover vídeo:", error); return res.status(400).json({ erro: "Não foi possível remover o vídeo" }); }
});

// Fotos da galeria — metadados editoriais acessíveis e controláveis
router.get("/fotos", requireRole("admin"), async (_req: Request, res: Response) => {
  try { return res.json({ fotos: await db.select().from(fotos_evento).orderBy(desc(fotos_evento.ordem), desc(fotos_evento.criado_em)) }); }
  catch (error) { console.error("[ADMIN] Erro ao listar fotos:", error); return res.status(500).json({ erro: "Erro ao listar fotos" }); }
});

router.post("/fotos", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const url = String(req.body?.url_foto || req.body?.url || "").trim();
    if (!req.body?.evento_id || !url || !req.body?.alt_text?.trim()) return res.status(400).json({ erro: "evento_id, url e alt_text são obrigatórios" });
    if (!url.startsWith("/") && !url.toLowerCase().startsWith("https://")) return res.status(400).json({ erro: "A URL da foto deve usar HTTPS" });
    const foto = (await db.insert(fotos_evento).values({ id: randomUUID(), evento_id: String(req.body.evento_id), url_foto: url, legenda: req.body.legenda ? String(req.body.legenda).slice(0, 500) : null, alt_text: String(req.body.alt_text).slice(0, 500), categoria: req.body.categoria ? String(req.body.categoria).slice(0, 80) : "evento", destaque: req.body.destaque === true, capa: req.body.capa === true, formato: req.body.formato ? String(req.body.formato).slice(0, 30) : null, ordem: Number(req.body.ordem || 0) }).returning())[0];
    return res.status(201).json({ foto });
  } catch (error) { console.error("[ADMIN] Erro ao criar foto:", error); return res.status(400).json({ erro: "Não foi possível salvar a foto" }); }
});

router.patch("/fotos/:id", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const foto = (await db.update(fotos_evento).set({ ...(req.body?.url_foto || req.body?.url ? { url_foto: String(req.body.url_foto || req.body.url) } : {}), ...(req.body?.legenda !== undefined ? { legenda: String(req.body.legenda).slice(0, 500) } : {}), ...(req.body?.alt_text !== undefined ? { alt_text: String(req.body.alt_text).slice(0, 500) } : {}), ...(req.body?.categoria !== undefined ? { categoria: String(req.body.categoria).slice(0, 80) } : {}), ...(req.body?.destaque !== undefined ? { destaque: Boolean(req.body.destaque) } : {}), ...(req.body?.capa !== undefined ? { capa: Boolean(req.body.capa) } : {}), ...(req.body?.ordem !== undefined ? { ordem: Number(req.body.ordem) } : {}), ...(req.body?.formato !== undefined ? { formato: String(req.body.formato).slice(0, 30) } : {}) }).where(eq(fotos_evento.id, req.params.id)).returning())[0];
    if (!foto) return res.status(404).json({ erro: "Foto não encontrada" });
    return res.json({ foto });
  } catch (error) { console.error("[ADMIN] Erro ao atualizar foto:", error); return res.status(400).json({ erro: "Não foi possível atualizar a foto" }); }
});

router.delete("/fotos/:id", requireRole("admin"), async (req: Request, res: Response) => {
  try { const removida = await db.delete(fotos_evento).where(eq(fotos_evento.id, req.params.id)).returning({ id: fotos_evento.id }); if (!removida[0]) return res.status(404).json({ erro: "Foto não encontrada" }); return res.status(204).send(); }
  catch (error) { console.error("[ADMIN] Erro ao remover foto:", error); return res.status(400).json({ erro: "Não foi possível remover a foto" }); }
});

// Configurações de pagamento (regras de negócio, editáveis sem redeploy)
// ==========================================================================

// Devolve as regras configuráveis (desconto PIX, teto de parcelas do
// cartão, teto de meses de antecedência do boleto) e o status do gateway
// ativo — lido de variável de ambiente, nunca do banco. O token do gateway
// nunca é devolvido, mesmo que definido, apenas se está configurado ou não.
router.get("/configuracoes/pagamento", async (_req: Request, res: Response) => {
  try {
    const configuracoes = await ConfiguracaoService.obterConfiguracoesPagamento();
    const gatewayRuntime = process.env.PAYMENT_GATEWAY === "mock" && process.env.NODE_ENV !== "production" ? "mock" : "cora";
    const gatewayPainel = gatewayRuntime === "cora" ? await GatewayConfigService.obterMascara().catch(() => null) : null;
    const gatewayConfiguradoPorAmbiente = gatewayRuntime === "mock"
      ? true
      : Boolean(process.env.CORA_CLIENT_ID?.trim() && process.env.CORA_CERT_PATH?.trim() && process.env.CORA_PRIVATE_KEY_PATH?.trim());

    res.json({
      configuracoes,
      gateway: {
        ativo: gatewayRuntime,
        nome: gatewayRuntime === "cora" ? "Banco Cora" : "Mock de testes locais",
        ambiente: gatewayPainel?.ambiente || (process.env.CORA_ENV === "production" ? "production" : "stage"),
        configurado: Boolean(gatewayPainel?.configurado || gatewayConfiguradoPorAmbiente),
        painel_configurado: Boolean(gatewayPainel?.configurado),
        painel_ativo: Boolean(gatewayPainel?.ativo),
        metodos: ["pix", "boleto", "boleto_pix", "carne"],
      },
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao ler configurações de pagamento:", error);
    res.status(500).json({ erro: "Erro ao ler configurações de pagamento" });
  }
});

router.put("/configuracoes/pagamento", async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });

    const { pix_desconto_percentual, credito_parcelas_maximo, boleto_meses_maximo_antecedencia, boleto_modo } = req.body ?? {};
    const dados: Record<string, number | string> = {};
    if (pix_desconto_percentual !== undefined) dados.pix_desconto_percentual = Number(pix_desconto_percentual);
    if (credito_parcelas_maximo !== undefined) dados.credito_parcelas_maximo = Number(credito_parcelas_maximo);
    if (boleto_meses_maximo_antecedencia !== undefined) dados.boleto_meses_maximo_antecedencia = Number(boleto_meses_maximo_antecedencia);
    if (boleto_modo !== undefined) dados.boleto_modo = String(boleto_modo);

    if (Object.keys(dados).length === 0) {
      return res.status(400).json({ erro: "Informe ao menos um campo para atualizar" });
    }

    const configuracoes = await ConfiguracaoService.atualizarConfiguracoesPagamento(dados as any, req.usuario.id);
    res.json({ configuracoes });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao atualizar configurações de pagamento:", error);
    res.status(400).json({ erro: error.message || "Erro ao atualizar configurações de pagamento" });
  }
});

// ==========================================================================
// Desconto administrativo controlado e auditável
router.post("/reservas/:reserva_id/desconto", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const motivo = String(req.body?.motivo || "").trim();
    const tipo = String(req.body?.tipo || "").trim().toLowerCase();
    const informado = new Decimal(String(req.body?.valor ?? "0"));
    if (motivo.length < 5) return res.status(400).json({ erro: "Motivo obrigatório para desconto administrativo" });
    if (!["fixo", "percentual"].includes(tipo)) return res.status(400).json({ erro: "Tipo deve ser fixo ou percentual" });
    if (!informado.isFinite() || informado.lessThanOrEqualTo(0)) return res.status(400).json({ erro: "Informe um desconto maior que zero" });

    const reserva = (await db.select().from(reservas).where(eq(reservas.id, req.params.reserva_id)).limit(1))[0];
    if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    const pagamentoExistente = (await db.select({ id: pagamentos.id }).from(pagamentos).where(eq(pagamentos.reserva_id, reserva.id)).limit(1))[0];
    if (pagamentoExistente) return res.status(409).json({ erro: "Não é permitido alterar o total depois de criar uma cobrança" });
    const subtotalOriginal = new Decimal(reserva.valor_total.toString());
    if (tipo === "percentual" && informado.greaterThan(100)) return res.status(400).json({ erro: "Percentual não pode exceder 100%" });
    const desconto = tipo === "percentual" ? subtotalOriginal.times(informado).div(100) : informado;
    const valorDesconto = Decimal.min(desconto, subtotalOriginal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const totalFinal = subtotalOriginal.minus(valorDesconto).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const resultado = await db.transaction(async (tx) => {
      const atualizado = await tx.update(reservas).set({ valor_total: totalFinal.toFixed(2), valor_total_centavos: totalFinal.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(), atualizado_em: new Date() }).where(and(eq(reservas.id, reserva.id), sql`${reservas.status} IN ('pacote_montado', 'checkout_iniciado', 'contrato_gerado')`)).returning({ id: reservas.id, valor_total: reservas.valor_total, valor_total_centavos: reservas.valor_total_centavos });
      if (!atualizado[0]) throw new Error("A reserva não está em uma etapa que permita desconto");
      const registro = await tx.insert(descontosAdministrativos).values({ reserva_id: reserva.id, administrador_id: req.usuario!.id, motivo, tipo, valor_informado: informado.toFixed(2), subtotal_original: subtotalOriginal.toFixed(2), valor_desconto: valorDesconto.toFixed(2), total_final: totalFinal.toFixed(2) }).returning();
      return registro[0];
    });
    return res.status(201).json({ desconto: resultado, total_final: totalFinal.toFixed(2) });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao aplicar desconto:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível aplicar o desconto" });
  }
});

// Geração de contrato diretamente pelo painel administrativo
// ==========================================================================

router.post("/contratos/preview/:reserva_id", async (req: Request, res: Response) => {
  try {
    const reserva = (await db.select({ id: reservas.id, usuario_id: reservas.usuario_id, vendedor_id: reservas.vendedor_id }).from(reservas).where(eq(reservas.id, req.params.reserva_id)).limit(1))[0];
    if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    if (!(await vendedorPodeOperarReserva(req, reserva))) return res.status(403).json({ erro: "Reserva fora da sua carteira" });
    const snapshot = await ContratoService.gerarSnapshot({ reserva_id: reserva.id, formulario: req.body?.formulario });
    const html = await ContratoService.gerarContratoHTML({ reserva_id: reserva.id, snapshot });
    return res.json({ snapshot, html, template: "2026.1-oficial", editavel: ["contratante", "hospedagem", "transporte", "bagagem", "seguro", "uso_imagem", "observacoes_especificas"] });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao visualizar preview contratual:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível gerar o preview" });
  }
});

// Lista reservas com e sem contrato gerado, já com nome do cliente e do
// evento/lote, para alimentar a página "Contratos" do painel.
router.get("/contratos", async (req: Request, res: Response) => {
  try {
    const { status } = req.query; // "gerados" | "pendentes" | (vazio = todos)

    const query = db
      .select({
        reserva_id: reservas.id,
        status_reserva: reservas.status,
        valor_total: reservas.valor_total,
        forma_pagamento: reservas.forma_pagamento,
        quantidade_parcelas: reservas.quantidade_parcelas,
        vendedor_id: reservas.vendedor_id,
        contrato_pdf_url: reservas.contrato_pdf_url,
        aceite_timestamp: reservas.aceite_timestamp,
        aceite_ip: reservas.aceite_ip,
        criado_em: reservas.criado_em,
        cliente_nome: usuarios.nome,
        cliente_email: usuarios.email,
        cliente_cpf: usuarios.cpf,
        evento_nome: eventos.nome,
        lote_nome: lotes.nome,
      })
      .from(reservas)
      .innerJoin(usuarios, eq(reservas.usuario_id, usuarios.id))
      .innerJoin(lotes, eq(reservas.lote_id, lotes.id))
      .innerJoin(eventos, eq(lotes.evento_id, eventos.id))
      .$dynamic();

    if (req.usuario?.tipo === "vendedor") query.where(and(eq(reservas.vendedor_id, req.usuario.id), eq(usuarios.tipo, "cliente")));
    else if (req.usuario?.tipo !== "dev") query.where(eq(usuarios.tipo, "cliente"));
    const linhas = await query.orderBy(desc(reservas.criado_em));
    const reservaIds = linhas.map((linha) => linha.reserva_id);
    const vendedorIds = Array.from(new Set(linhas.flatMap((linha) => linha.vendedor_id ? [linha.vendedor_id] : [])));
    const vendedores = vendedorIds.length ? await db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(and(inArray(usuarios.id, vendedorIds), eq(usuarios.tipo, "vendedor"))) : [];
    const vendedorPorId = new Map(vendedores.map((vendedor) => [vendedor.id, vendedor.nome]));
    const alocacoes = reservaIds.length ? await db.select({ reserva_id: assentoAlocacoes.reserva_id, onibus_nome: onibusOperacionais.nome, poltrona: assentosOnibus.numero, ponto_embarque: pontosEmbarqueOperacao.nome })
      .from(assentoAlocacoes)
      .innerJoin(assentosOnibus, eq(assentoAlocacoes.assento_id, assentosOnibus.id))
      .innerJoin(onibusOperacionais, eq(assentosOnibus.onibus_id, onibusOperacionais.id))
      .leftJoin(pontosEmbarqueOperacao, eq(assentoAlocacoes.ponto_embarque_id, pontosEmbarqueOperacao.id))
      .where(and(inArray(assentoAlocacoes.reserva_id, reservaIds), eq(assentoAlocacoes.status, "ativa"))) : [];
    const alocacaoPorReserva = new Map(alocacoes.map((alocacao) => [alocacao.reserva_id, alocacao]));
    const documentos = reservaIds.length
      ? await db.select({
        id: contratosDocumentos.id,
        reserva_id: contratosDocumentos.reserva_id,
        versao: contratosDocumentos.versao,
        status: contratosDocumentos.status,
        validado_em: contratosDocumentos.validado_em,
        aprovado_admin_em: contratosDocumentos.aprovado_admin_em,
        pdf_sha256: contratosDocumentos.pdf_sha256,
        arquivo: contratosDocumentos.arquivo,
      }).from(contratosDocumentos)
        .where(and(inArray(contratosDocumentos.reserva_id, reservaIds), ne(contratosDocumentos.status, "invalidado")))
        .orderBy(desc(contratosDocumentos.versao))
      : [];
    const documentoPorReserva = new Map<string, typeof documentos[number]>();
    for (const documento of documentos) {
      if (!documentoPorReserva.has(documento.reserva_id)) documentoPorReserva.set(documento.reserva_id, documento);
    }

    const filtradas = status === "gerados"
      ? linhas.filter((linha) => documentoPorReserva.has(linha.reserva_id) || Boolean(linha.contrato_pdf_url))
      : status === "pendentes"
        ? linhas.filter((linha) => !documentoPorReserva.has(linha.reserva_id) && !linha.contrato_pdf_url)
        : linhas;

    res.json({
      total: filtradas.length,
      contratos: filtradas.map((linha) => {
        const documento = documentoPorReserva.get(linha.reserva_id);
        return {
          ...linha,
          vendedor_nome: linha.vendedor_id ? vendedorPorId.get(linha.vendedor_id) || null : null,
          operacao: alocacaoPorReserva.get(linha.reserva_id) || null,
          contrato_gerado: Boolean(documento || linha.contrato_pdf_url),
          pdf_disponivel: Boolean(documento?.arquivo || linha.contrato_pdf_url),
          documento: documento ? {
            id: documento.id,
            versao: documento.versao,
            status: documento.status,
            validado_em: documento.validado_em,
            aprovado_admin_em: documento.aprovado_admin_em,
            pdf_sha256: documento.pdf_sha256,
          } : null,
        };
      }),
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao listar contratos:", error);
    res.status(500).json({ erro: "Erro ao listar contratos" });
  }
});

router.post("/contratos/gerar/:reserva_id", async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });

    const { reserva_id } = req.params;

    const reservaResult = await db.select().from(reservas).where(eq(reservas.id, reserva_id)).limit(1);
    if (reservaResult.length === 0) {
      return res.status(404).json({ erro: "Reserva não encontrada" });
    }
    const reserva = reservaResult[0];
    if (!(await vendedorPodeOperarReserva(req, reserva))) return res.status(403).json({ erro: "Reserva fora da sua carteira" });
    const cliente = (await db.select({ ativo: usuarios.ativo, cadastro_status: usuarios.cadastro_status, aprovado_em: usuarios.aprovado_em, aprovado_por: usuarios.aprovado_por, nome: usuarios.nome, email: usuarios.email, cpf: usuarios.cpf, telefone: usuarios.telefone, data_nascimento: usuarios.data_nascimento, endereco: usuarios.endereco }).from(usuarios).where(eq(usuarios.id, reserva.usuario_id)).limit(1))[0];
    if (!cadastroAprovadoComEvidencia(cliente)) return res.status(409).json({ erro: "O cadastro do cliente precisa de aprovação registrada antes da geração do contrato" });
    const faltantes = camposFaltantesCadastroMinimo(cliente);
    if (faltantes.length) return res.status(409).json({ erro: `Complete os dados essenciais antes do contrato: ${faltantes.join(", ")}` });

    const metodoPagamento = req.body?.metodo_pagamento ?? reserva.forma_pagamento;
    const quantidadeParcelas = req.body?.quantidade_parcelas ?? reserva.quantidade_parcelas;
    if (!metodoPagamento) {
      return res.status(400).json({ erro: "Informe a forma de pagamento para gerar o contrato" });
    }
    if (!["pix", "boleto"].includes(String(metodoPagamento))) {
      return res.status(400).json({ erro: "O checkout Cora oferece somente PIX e boleto" });
    }

    let condicaoPagamento;
    try {
      const loteResult = await db
        .select({ data_embarque: lotes.data_embarque, data_inicio: lotes.data_inicio })
        .from(lotes)
        .where(eq(lotes.id, reserva.lote_id))
        .limit(1);
      const pacote = reserva.pacote_id ? (await db.select({ data_limite_pagamento: pacotes.data_limite_pagamento, configuracao_pagamento: pacotes.configuracao_pagamento }).from(pacotes).where(eq(pacotes.id, reserva.pacote_id)).limit(1))[0] : undefined;
      const regrasPacote = pacote?.configuracao_pagamento && typeof pacote.configuracao_pagamento === "object" ? pacote.configuracao_pagamento as Record<string, unknown> : {};
      const formasPermitidas = Array.isArray(regrasPacote.formas_permitidas) ? regrasPacote.formas_permitidas.map(String) : ["pix", "boleto"];
      if (!formasPermitidas.includes(String(metodoPagamento))) throw new Error("A forma de pagamento não está disponível para este pacote");
      const prazoSegurancaDias = Number.isInteger(Number(regrasPacote.prazo_seguranca_dias)) ? Math.max(0, Number(regrasPacote.prazo_seguranca_dias)) : 0;
      const dataLimitePagamento = ContratoService.calcularDataLimiteEfetiva(pacote?.data_limite_pagamento, loteResult[0]?.data_embarque || loteResult[0]?.data_inicio, prazoSegurancaDias);
      const configPagamento = await ConfiguracaoService.obterConfiguracoesPagamento();
      const parcelasPorData = ContratoService.calcularParcelasMaximasBoleto(
        dataLimitePagamento,
        new Date(),
        configPagamento.boleto_meses_maximo_antecedencia,
      );
      const tetoPacote = Number(regrasPacote.boleto_parcelas_maximo);
      const parcelasMaximasBoleto = Math.min(parcelasPorData, Number.isInteger(tetoPacote) && tetoPacote > 0 ? tetoPacote : parcelasPorData);
      const tetoCredito = Number(regrasPacote.credito_parcelas_maximo);
      const parcelasMaximasCredito = Math.min(parcelasPorData, Number.isInteger(tetoCredito) && tetoCredito > 0 ? tetoCredito : configPagamento.credito_parcelas_maximo, configPagamento.credito_parcelas_maximo);

      const valorBaseSemDescontoPagamento = Number(reserva.valor_total) + Number(reserva.desconto_pagamento || 0);
      condicaoPagamento = ContratoService.calcularCondicaoPagamento(
        valorBaseSemDescontoPagamento.toFixed(2),
        metodoPagamento,
        quantidadeParcelas,
        parcelasMaximasBoleto,
        {
          percentualDescontoPix: configPagamento.pix_desconto_percentual,
          parcelasMaximasCredito,
          percentualTaxaCredito: Number(regrasPacote.credito_taxa_percentual) || 0,
          percentualJurosMensalCredito: Number(regrasPacote.credito_juros_mensal_percentual) || 0,
        },
      );
    } catch (error: any) {
      return res.status(400).json({ erro: error.message || "Condição de pagamento inválida" });
    }

    await db
      .update(reservas)
      .set({
        forma_pagamento: condicaoPagamento.forma_pagamento,
        quantidade_parcelas: condicaoPagamento.quantidade_parcelas,
        valor_parcela: condicaoPagamento.valor_parcela,
        desconto_pagamento: condicaoPagamento.desconto_pagamento,
        valor_total: condicaoPagamento.valor_total,
        valor_total_centavos: Math.round(Number(condicaoPagamento.valor_total) * 100),
        atualizado_em: new Date(),
      })
      .where(eq(reservas.id, reserva_id));

    await ContratoService.registrarAceiteContrato(reserva_id, `gerado-pelo-admin:${req.usuario.id}`, req.body?.formulario, condicaoPagamento);

    res.json({
      mensagem: "Contrato preparado e aguardando validação eletrônica do cliente",
      reserva_id,
      status: "aguardando_validacao",
      condicao_pagamento: condicaoPagamento,
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao gerar contrato:", error);
    res.status(500).json({ erro: error.message || "Erro ao gerar contrato" });
  }
});

async function aprovarContratoAdministrativamente(contratoId: string, req: Request) {
  if (!req.usuario) throw new Error("Não autenticado");
  return db.transaction(async (tx) => {
    const referencia = (await tx.select({ reserva_id: contratosDocumentos.reserva_id, perfil_cliente: usuarios.tipo }).from(contratosDocumentos).innerJoin(reservas, eq(contratosDocumentos.reserva_id, reservas.id)).innerJoin(usuarios, eq(reservas.usuario_id, usuarios.id)).where(eq(contratosDocumentos.id, contratoId)).limit(1))[0];
    if (!referencia) throw new Error("Contrato não encontrado");
    if (req.usuario!.tipo !== "dev" && referencia.perfil_cliente !== "cliente") throw new Error("Contrato não encontrado");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`contrato-admin:${referencia.reserva_id}`}))`);

    const contrato = (await tx.select().from(contratosDocumentos).where(eq(contratosDocumentos.id, contratoId)).for("update").limit(1))[0];
    if (!contrato || contrato.status === "invalidado") throw new Error("Contrato não encontrado");
    const vigente = (await tx.select({ id: contratosDocumentos.id }).from(contratosDocumentos)
      .where(and(eq(contratosDocumentos.reserva_id, contrato.reserva_id), ne(contratosDocumentos.status, "invalidado")))
      .orderBy(desc(contratosDocumentos.versao)).limit(1))[0];
    if (!vigente || vigente.id !== contrato.id) throw new Error("Apenas a versão vigente do contrato pode ser aprovada");

    const validacao = (await tx.select().from(contratoValidacoes)
      .where(and(eq(contratoValidacoes.reserva_id, contrato.reserva_id), eq(contratoValidacoes.contrato_id, contrato.id)))
      .orderBy(desc(contratoValidacoes.confirmado_em)).limit(1))[0];
    const evidenciasValidas = Boolean(
      contrato.validado_em
        && validacao?.aceite_contrato
        && validacao.aceite_regras
        && validacao.snapshot_sha256 === contrato.snapshot_sha256
        && (!contrato.pdf_sha256 || validacao.pdf_sha256 === contrato.pdf_sha256),
    );
    if (!evidenciasValidas) throw new Error("O cliente precisa concluir a validação eletrônica da versão vigente antes da aprovação administrativa");

    const jaAprovado = contrato.status === "aprovado_admin" && Boolean(contrato.aprovado_admin_em && contrato.aprovado_admin_por);
    if (!jaAprovado) {
      const agora = new Date();
      await tx.update(contratosDocumentos).set({ status: "aprovado_admin", aprovado_admin_em: agora, aprovado_admin_por: req.usuario!.id }).where(eq(contratosDocumentos.id, contrato.id));
      await tx.update(reservas).set({ checkout_estado: "contrato_aprovado_admin", atualizado_em: agora }).where(eq(reservas.id, contrato.reserva_id));
      await tx.insert(clienteHistorico).values({ id: createId(), usuario_id: validacao!.usuario_id, tipo: "contrato_aprovado_admin", titulo: "Contrato aprovado pela administração", descricao: `Versão ${contrato.versao} aprovada sob protocolo ${validacao!.protocolo}.`, criado_por: req.usuario!.id, metadados: { reserva_id: contrato.reserva_id, contrato_id: contrato.id, protocolo: validacao!.protocolo }, criado_em: agora });
      await tx.insert(auditoriaAdmin).values({ id: createId(), ator_id: req.usuario!.id, ator_tipo: req.usuario!.tipo, acao: "contrato_aprovado_admin", entidade: "contrato", entidade_id: contrato.id, depois: { reserva_id: contrato.reserva_id, versao: contrato.versao, protocolo: validacao!.protocolo }, ip: req.ip || null, user_agent: req.get("user-agent") || null, criado_em: agora });
    }
    return { contrato, validacao: validacao!, jaAprovado };
  });
}

router.post("/contratos/:contratoId/aprovar", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const resultado = await aprovarContratoAdministrativamente(req.params.contratoId, req);
    return res.json({ mensagem: resultado.jaAprovado ? "Contrato já estava aprovado" : "Contrato aprovado pela administração", contrato_id: resultado.contrato.id, protocolo: resultado.validacao.protocolo });
  } catch (error: any) {
    console.error("[CONTRATOS] Erro ao aprovar administrativamente:", error);
    return res.status(409).json({ erro: error.message || "Não foi possível aprovar o contrato" });
  }
});

router.get("/contratos/modelos", async (_req: Request, res: Response) => {
  return res.json({
    modelos: [
      {
        id: "hospedagem-2026",
        nome: "Contrato de pacote — hospedagem",
        versao: "2026",
        status: "oficial",
        fonte: "Contrato HOSPEDAGEM EXCMTV 2026 - papel timbrado.docx",
        descricao: "Fonte oficial enviada para hospedagem, serviços inclusos, pagamento e regras da excursão.",
      },
      {
        id: "transporte-2026",
        nome: "Contrato de pacote — transporte",
        versao: "2026",
        status: "oficial",
        fonte: "TRANSPORTE EXCMTV 2026 - papel timbrado.docx",
        descricao: "Fonte oficial enviada para transporte e cláusulas operacionais do pacote.",
      },
    ],
    regra: "O sistema gera o documento a partir do snapshot da venda e não altera o conteúdo jurídico sem nova fonte versionada.",
  });
});

router.get("/pagamentos", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const condicoes = [];
    if (req.usuario?.tipo !== "dev") condicoes.push(eq(usuarios.tipo, "cliente"));
    if (req.query.status) condicoes.push(eq(pagamentos.status, String(req.query.status) as any));
    if (req.query.reconciliado) condicoes.push(eq(pagamentos.status_reconciliado, String(req.query.reconciliado)));
    if (req.query.busca) {
      const termo = `%${String(req.query.busca).trim()}%`;
      condicoes.push(or(sql`${usuarios.nome} ILIKE ${termo}`, sql`${usuarios.email} ILIKE ${termo}`, sql`${eventos.nome} ILIKE ${termo}`)!);
    }
    const linhas = await db.select({
      id: pagamentos.id,
      reserva_id: pagamentos.reserva_id,
      status: pagamentos.status,
      status_reconciliado: pagamentos.status_reconciliado,
      metodo: pagamentos.metodo,
      valor: pagamentos.valor,
      valor_centavos: pagamentos.valor_centavos,
      valor_pago_centavos: pagamentos.valor_pago_centavos,
      gateway_id: pagamentos.gateway_id,
      criado_em: pagamentos.criado_em,
      atualizado_em: pagamentos.atualizado_em,
      cliente_nome: usuarios.nome,
      cliente_email: usuarios.email,
      evento_nome: eventos.nome,
      lote_nome: lotes.nome,
    }).from(pagamentos)
      .innerJoin(reservas, eq(pagamentos.reserva_id, reservas.id))
      .innerJoin(usuarios, eq(reservas.usuario_id, usuarios.id))
      .innerJoin(lotes, eq(reservas.lote_id, lotes.id))
      .innerJoin(eventos, eq(lotes.evento_id, eventos.id))
      .where(condicoes.length ? and(...condicoes) : undefined)
      .orderBy(desc(pagamentos.atualizado_em))
      .limit(200);
    return res.json({ total: linhas.length, pagamentos: linhas });
  } catch (error) {
    console.error("[ADMIN] Erro ao listar pagamentos:", error);
    return res.status(500).json({ erro: "Erro ao carregar pagamentos" });
  }
});

router.get("/comissoes/regras", authMiddleware, requireRole("admin"), async (_req: Request, res: Response) => {
  try {
    const regras = await db.select().from(comissaoRegras).orderBy(desc(comissaoRegras.criado_em));
    return res.json({ regras });
  } catch (error) {
    console.error("[ADMIN] Erro ao listar regras de comissão:", error);
    return res.status(500).json({ erro: "Erro ao listar regras de comissão" });
  }
});

router.post("/comissoes/regras", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const vendedorId = String(req.body?.vendedor_id || "").trim();
    const tipo = String(req.body?.tipo || "").trim().toLowerCase();
    const valor = Number(req.body?.valor);
    if (!vendedorId || !["percentual", "fixo"].includes(tipo) || !Number.isFinite(valor) || valor < 0) return res.status(400).json({ erro: "vendedor_id, tipo percentual/fixo e valor válido são obrigatórios" });
    const vendedor = await db.select({ id: usuarios.id, tipo: usuarios.tipo }).from(usuarios).where(eq(usuarios.id, vendedorId)).limit(1);
    if (vendedor[0]?.tipo !== "vendedor") return res.status(400).json({ erro: "A regra só pode ser atribuída a um usuário vendedor" });
    if (tipo === "percentual" && valor > 100) return res.status(400).json({ erro: "A comissão percentual não pode exceder 100%" });
    const criado = await db.insert(comissaoRegras).values({ id: randomUUID(), vendedor_id: vendedorId, evento_id: req.body?.evento_id ? String(req.body.evento_id) : null, pacote_id: req.body?.pacote_id ? String(req.body.pacote_id) : null, tipo, valor: valor.toFixed(4), ativo: req.body?.ativo !== false, criado_em: new Date(), atualizado_em: new Date() }).returning();
    return res.status(201).json({ regra: criado[0] });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao criar regra de comissão:", error);
    return res.status(400).json({ erro: error.message || "Erro ao criar regra de comissão" });
  }
});

router.get("/comissoes", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const vendedorId = req.query.vendedor_id ? String(req.query.vendedor_id) : undefined;
    const lista = await db.select().from(comissoes).where(vendedorId ? eq(comissoes.vendedor_id, vendedorId) : undefined).orderBy(desc(comissoes.criado_em));
    return res.json({ total: lista.length, comissoes: lista });
  } catch (error) {
    console.error("[ADMIN] Erro ao listar comissões:", error);
    return res.status(500).json({ erro: "Erro ao listar comissões" });
  }
});


// ==========================================================================
// Governança DEV, convites, gateway administrável e boleto manual
// ==========================================================================

function hashConvite(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function garantirInventarioBoletoManual(reserva: typeof reservas.$inferSelect): Promise<void> {
  const agora = new Date();
  await db.transaction(async (tx) => {
    // Um hold por reserva é UNIQUE. Trava a linha existente para impedir dupla
    // liberação concorrente e nunca cria um segundo hold para a mesma reserva.
    const holdQuery = await tx.execute(sql`
      SELECT id, status, expira_em, quantidade
      FROM inventario_holds
      WHERE reserva_id = ${reserva.id}
      FOR UPDATE
    `);
    const hold = holdQuery.rows[0] as { id: string; status: string; expira_em: Date | string; quantidade: number } | undefined;

    if (hold?.status === "convertido") {
      if (reserva.inventario_hold_id !== hold.id) await tx.update(reservas).set({ inventario_hold_id: hold.id, atualizado_em: agora }).where(eq(reservas.id, reserva.id));
      return;
    }

    if (hold?.status === "ativo") {
      // A vaga já foi debitada quando o hold foi criado. Mesmo se o relógio do
      // hold venceu, enquanto o scheduler ainda não o liberou não se debita
      // novamente; a validação contratual + aprovação administrativa converte
      // o hold existente e preserva exatamente uma vaga.
      await tx.update(inventarioHolds).set({ status: "convertido", convertido_em: agora }).where(eq(inventarioHolds.id, hold.id));
      await tx.update(reservas).set({ inventario_hold_id: hold.id, atualizado_em: agora }).where(eq(reservas.id, reserva.id));
      return;
    }

    // Hold liberado (ou inexistente): a vaga já está disponível novamente e
    // precisa ser debitada uma única vez antes de converter/recriar o vínculo.
    const vaga = await tx.execute(sql`UPDATE lotes SET "vagas_disponíveis" = "vagas_disponíveis" - 1, atualizado_em = ${agora} WHERE id = ${reserva.lote_id} AND "vagas_disponíveis" > 0 RETURNING id`);
    if (!vaga.rows.length) throw new Error("Não há vaga disponível para liberar o boleto desta reserva");

    if (hold) {
      await tx.update(inventarioHolds).set({ status: "convertido", convertido_em: agora, liberado_em: null, motivo_liberacao: null, expira_em: agora }).where(eq(inventarioHolds.id, hold.id));
      await tx.update(reservas).set({ inventario_hold_id: hold.id, atualizado_em: agora }).where(eq(reservas.id, reserva.id));
      return;
    }

    const novoId = createId();
    await tx.insert(inventarioHolds).values({ id: novoId, reserva_id: reserva.id, lote_id: reserva.lote_id, modalidade: null, quantidade: 1, status: "convertido", expira_em: agora, criado_em: agora, convertido_em: agora });
    await tx.update(reservas).set({ inventario_hold_id: novoId, atualizado_em: agora }).where(eq(reservas.id, reserva.id));
  });
}

async function atualizarEstadoEnvioBoletos(reservaId: string): Promise<void> {
  const parcelas = await db.select({
    id: pagamentoParcelas.id,
    boleto_documento_id: pagamentoParcelas.boleto_documento_id,
    enviado_email_em: pagamentoParcelas.enviado_email_em,
    enviado_whatsapp_em: pagamentoParcelas.enviado_whatsapp_em,
  }).from(pagamentoParcelas).where(eq(pagamentoParcelas.reserva_id, reservaId));
  if (!parcelas.length) return;
  const todasProntas = parcelas.every((item) => Boolean(item.boleto_documento_id));
  const todasEnviadas = todasProntas && parcelas.every((item) => Boolean(item.enviado_email_em || item.enviado_whatsapp_em));
  if (todasEnviadas) {
    await db.update(reservas).set({ checkout_estado: "boletos_enviados", atualizado_em: new Date() }).where(eq(reservas.id, reservaId));
  }
}

async function reconciliarPagamentoManual(pagamentoId: string): Promise<{ quitado: boolean; pagoCentavos: number }> {
  return db.transaction(async (tx) => {
    const pagamento = (await tx.select().from(pagamentos).where(eq(pagamentos.id, pagamentoId)).limit(1))[0];
    if (!pagamento) throw new Error("Pagamento não encontrado");
    const reserva = (await tx.select().from(reservas).where(eq(reservas.id, pagamento.reserva_id)).limit(1))[0];
    if (!reserva) throw new Error("Reserva não encontrada");
    const parcelas = await tx.select().from(pagamentoParcelas).where(eq(pagamentoParcelas.pagamento_id, pagamento.id));
    const totalCentavos = Number(pagamento.valor_centavos || Math.round(Number(pagamento.valor) * 100));
    const pagoCentavos = parcelas.filter((item) => item.status === "aprovado").reduce((total, item) => total + Number(item.valor_pago_centavos || item.valor_centavos || Math.round(Number(item.valor) * 100)), 0);
    const quitado = totalCentavos > 0 && pagoCentavos >= totalCentavos;
    const parcial = pagoCentavos > 0;
    await tx.update(pagamentos).set({ status: parcial ? "aprovado" : "pendente", status_reconciliado: quitado ? "quitado" : parcial ? "parcial" : "pendente", valor_pago_centavos: pagoCentavos, atualizado_em: new Date() }).where(eq(pagamentos.id, pagamento.id));
    await tx.update(reservas).set({ status: quitado ? "cliente_confirmado" : "aguardando_pagamento", checkout_estado: quitado ? "quitado" : parcial ? "primeira_parcela_confirmada" : "boletos_enviados", atualizado_em: new Date() }).where(eq(reservas.id, reserva.id));
    await tx.update(leads_origem).set({ status: quitado ? "cliente_confirmado" : parcial ? "pagamento_parcial" : "cobranca_pendente", atualizado_em: new Date() }).where(eq(leads_origem.usuario_id, reserva.usuario_id));
    if (quitado) await tx.update(comissoes).set({ status: "elegivel", atualizado_em: new Date() }).where(eq(comissoes.reserva_id, reserva.id));
    return { quitado, pagoCentavos };
  });
}

router.post("/dev/bootstrap", requireRole("dev"), (_req: Request, res: Response) => {
  return res.status(410).json({ erro: "Bootstrap remoto desativado. O acesso DEV deve ser provisionado por procedimento operacional seguro." });
});

router.get("/dev/equipe", requireRole("admin"), async (req: Request, res: Response) => {
  const solicitanteDev = req.usuario?.tipo === "dev";
  const equipe = await db.select(CAMPOS_PUBLICOS_USUARIO).from(usuarios).where(inArray(usuarios.tipo, (solicitanteDev ? ["dev", "admin", "vendedor"] : ["admin", "vendedor"]) as any)).orderBy(desc(usuarios.criado_em));
  const convites = await db.select({
    id: convitesAcesso.id,
    papel: convitesAcesso.papel,
    email_destino: convitesAcesso.email_destino,
    criado_por: convitesAcesso.criado_por,
    expira_em: convitesAcesso.expira_em,
    usado_em: convitesAcesso.usado_em,
    revogado_em: convitesAcesso.revogado_em,
    criado_em: convitesAcesso.criado_em,
  }).from(convitesAcesso).where(solicitanteDev ? undefined : ne(convitesAcesso.papel, "dev")).orderBy(desc(convitesAcesso.criado_em)).limit(200);
  return res.json({ equipe, convites });
});

router.post("/dev/convites", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const papel = String(req.body?.papel || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase() || null;
    const horas = Math.min(168, Math.max(1, Number(req.body?.horas_validade || 72)));
    const papeisPermitidos = req.usuario.tipo === "dev" ? ["dev", "admin", "vendedor"] : ["vendedor"];
    if (!papeisPermitidos.includes(papel)) return res.status(403).json({ erro: req.usuario.tipo === "dev" ? "Perfil de convite inválido" : "Administradores podem convidar somente vendedores" });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ erro: "E-mail do convite inválido" });
    const token = randomBytes(32).toString("base64url");
    const convite = (await db.insert(convitesAcesso).values({ id: createId(), token_hash: hashConvite(token), papel, email_destino: email, criado_por: req.usuario.id, expira_em: new Date(Date.now() + horas * 3600_000), criado_em: new Date() }).returning())[0];
    await AuditService.registrar(req, "convite_criado", "convite_acesso", convite.id, undefined, { papel, email_destino: email, expira_em: convite.expira_em });
    const base = String(process.env.WEB_URL || "https://excursaodascomitivas.com.br").split(",")[0].replace(/\/$/, "");
    return res.status(201).json({ convite: { id: convite.id, papel, email_destino: email, expira_em: convite.expira_em, link: `${base}/convite/${token}` } });
  } catch (error: any) {
    console.error("[DEV] Erro ao criar convite:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível criar convite" });
  }
});

router.patch("/dev/convites/:id/revogar", requireRole("admin"), async (req: Request, res: Response) => {
  const condicoes = [eq(convitesAcesso.id, req.params.id), isNull(convitesAcesso.usado_em)];
  if (req.usuario?.tipo !== "dev") condicoes.push(eq(convitesAcesso.papel, "vendedor"));
  const convite = (await db.update(convitesAcesso).set({ revogado_em: new Date() }).where(and(...condicoes)).returning())[0];
  if (!convite) return res.status(404).json({ erro: "Convite não encontrado ou já utilizado" });
  await AuditService.registrar(req, "convite_revogado", "convite_acesso", convite.id);
  return res.json({ convite });
});

router.post("/dev/convites/:id/reemitir", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const anterior = (await db.select().from(convitesAcesso).where(eq(convitesAcesso.id, req.params.id)).limit(1))[0];
    if (!anterior || anterior.usado_em) return res.status(404).json({ erro: "Convite não encontrado ou já utilizado" });
    if (req.usuario.tipo !== "dev" && anterior.papel !== "vendedor") return res.status(403).json({ erro: "Administradores podem reemitir somente convites de vendedor" });
    const token = randomBytes(32).toString("base64url");
    const horas = Math.min(168, Math.max(1, Number(req.body?.horas_validade || 72)));
    const novo = await db.transaction(async (tx) => {
      await tx.update(convitesAcesso).set({ revogado_em: new Date() }).where(and(eq(convitesAcesso.id, anterior.id), isNull(convitesAcesso.usado_em)));
      return (await tx.insert(convitesAcesso).values({ id: createId(), token_hash: hashConvite(token), papel: anterior.papel, email_destino: anterior.email_destino, criado_por: req.usuario!.id, expira_em: new Date(Date.now() + horas * 3600_000), criado_em: new Date() }).returning())[0];
    });
    await AuditService.registrar(req, "convite_reemitido", "convite_acesso", novo.id, { convite_anterior_id: anterior.id }, { papel: novo.papel, email_destino: novo.email_destino, expira_em: novo.expira_em });
    const base = String(process.env.WEB_URL || "https://excursaodascomitivas.com.br").split(",")[0].replace(/\/$/, "");
    return res.status(201).json({ convite: { id: novo.id, papel: novo.papel, email_destino: novo.email_destino, expira_em: novo.expira_em, criado_em: novo.criado_em, link: `${base}/convite/${token}` } });
  } catch (error: any) {
    return res.status(400).json({ erro: error.message || "Não foi possível reemitir o convite" });
  }
});

router.get("/dev/auditoria", requireRole("dev"), async (_req: Request, res: Response) => {
  const registros = await db.select().from(auditoriaAdmin).orderBy(desc(auditoriaAdmin.criado_em)).limit(500);
  return res.json({ registros });
});

router.get("/dev/gateway/cora", requireRole("dev"), async (_req: Request, res: Response) => {
  try { return res.json({ gateway: await GatewayConfigService.obterMascara() }); }
  catch (error: any) { return res.status(400).json({ erro: error.message || "Não foi possível ler o gateway" }); }
});

router.put("/dev/gateway/cora", requireRole("dev"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const antes = await GatewayConfigService.obterMascara();
    const gateway = await GatewayConfigService.salvar({
      ambiente: req.body?.ambiente,
      ativo: req.body?.ativo,
      client_id: req.body?.client_id,
      certificate_pem: req.body?.certificate_pem,
      private_key_pem: req.body?.private_key_pem,
      webhook_secret: req.body?.webhook_secret,
      token_url: req.body?.token_url,
      api_base: req.body?.api_base,
      installments_api_base: req.body?.installments_api_base,
      webhook_public_url: req.body?.webhook_public_url,
      http_timeout_ms: req.body?.http_timeout_ms,
      carne_timeout_ms: req.body?.carne_timeout_ms,
    }, req.usuario.id);
    if (req.body?.ativo === true && !gateway.configurado) {
      await GatewayConfigService.salvar({ ativo: false }, req.usuario.id);
      return res.status(400).json({ erro: "Cadastre Client ID, certificado e chave privada antes de ativar o gateway" });
    }
    await AuditService.registrar(req, "gateway_atualizado", "gateway", "cora", antes, gateway);
    return res.json({ gateway });
  } catch (error: any) {
    console.error("[DEV] Erro ao salvar gateway:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível salvar o gateway" });
  }
});

router.post("/dev/gateway/cora/testar", requireRole("dev"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const aplicado = await GatewayConfigService.aplicarRuntime();
    if (!aplicado) throw new Error("Gateway desativado ou credenciais incompletas");
    await CoraPaymentProvider.testarConexao();
    await GatewayConfigService.registrarTeste("ok", "Autenticação mTLS concluída com sucesso", req.usuario.id);
    await AuditService.registrar(req, "gateway_testado", "gateway", "cora", undefined, { status: "ok" });
    return res.json({ status: "ok", mensagem: "Conexão com a Cora validada" });
  } catch (error: any) {
    if (req.usuario) await GatewayConfigService.registrarTeste("erro", error.message || "Falha de conexão", req.usuario.id).catch(() => undefined);
    return res.status(400).json({ erro: error.message || "Falha ao testar gateway" });
  }
});

router.patch("/clientes/:id/aprovacao", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const status = String(req.body?.status || "").trim();
    if (!["aprovado", "pendente", "rejeitado"].includes(status)) return res.status(400).json({ erro: "Status de aprovação inválido" });
    const resultado = await db.transaction(async (tx) => {
      const cliente = (await tx.select().from(usuarios).where(and(eq(usuarios.id, req.params.id), eq(usuarios.tipo, "cliente"))).for("update").limit(1))[0];
      if (!cliente) return null;
      const aprovacaoJaRegistrada = status !== "aprovado" || Boolean(cliente.aprovado_em && String(cliente.aprovado_por || "").trim());
      if (cliente.cadastro_status === status && aprovacaoJaRegistrada) {
        const atual = (await tx.select(CAMPOS_PUBLICOS_USUARIO).from(usuarios).where(eq(usuarios.id, cliente.id)).limit(1))[0];
        return { cliente, atualizado: atual, alterado: false };
      }
      const atualizado = (await tx.update(usuarios).set({ cadastro_status: status, aprovado_em: status === "aprovado" ? new Date() : null, aprovado_por: status === "aprovado" ? req.usuario!.id : null, atualizado_em: new Date() }).where(eq(usuarios.id, cliente.id)).returning(CAMPOS_PUBLICOS_USUARIO))[0];
      return { cliente, atualizado, alterado: true };
    });
    if (!resultado) return res.status(404).json({ erro: "Cliente não encontrado" });
    if (!resultado.alterado) return res.json({ usuario: resultado.atualizado, mensagem: "O cadastro já estava com esse status." });
    await registrarHistoricoCliente(resultado.cliente.id, "aprovacao_cadastro", status === "aprovado" ? "Cadastro aprovado" : status === "rejeitado" ? "Cadastro rejeitado" : "Cadastro retornado para análise", String(req.body?.observacao || "").trim() || null, req.usuario.id, { status });
    await AuditService.registrar(req, "cliente_aprovacao", "usuario", resultado.cliente.id, { cadastro_status: resultado.cliente.cadastro_status }, { cadastro_status: status });
    return res.json({ usuario: resultado.atualizado });
  } catch (error: any) { return res.status(400).json({ erro: error.message || "Não foi possível atualizar a aprovação" }); }
});

router.get("/boletos", requireRole("admin"), async (_req: Request, res: Response) => {
  try {
    const linhas = await db.select({
      reserva_id: reservas.id, usuario_id: usuarios.id, cliente_nome: usuarios.nome, cliente_email: usuarios.email, cliente_telefone: usuarios.telefone, cliente_ativo: usuarios.ativo, cadastro_status: usuarios.cadastro_status, aprovado_em: usuarios.aprovado_em, aprovado_por: usuarios.aprovado_por,
      evento_nome: eventos.nome, lote_nome: lotes.nome, forma_pagamento: reservas.forma_pagamento, quantidade_parcelas: reservas.quantidade_parcelas, valor_total: reservas.valor_total, checkout_estado: reservas.checkout_estado, status_reserva: reservas.status, boleto_liberado_em: reservas.boleto_liberado_em,
    }).from(reservas).innerJoin(usuarios, eq(reservas.usuario_id, usuarios.id)).innerJoin(lotes, eq(reservas.lote_id, lotes.id)).innerJoin(eventos, eq(lotes.evento_id, eventos.id)).where(and(eq(reservas.forma_pagamento, "boleto"), eq(usuarios.tipo, "cliente"))).orderBy(desc(reservas.criado_em));
    const reservaIds = linhas.map((item) => item.reserva_id);
    const parcelas = reservaIds.length ? await db.select().from(pagamentoParcelas).where(inArray(pagamentoParcelas.reserva_id, reservaIds)).orderBy(pagamentoParcelas.reserva_id, pagamentoParcelas.sequencia) : [];
    const contratos = reservaIds.length ? await db.select({ id: contratosDocumentos.id, reserva_id: contratosDocumentos.reserva_id, versao: contratosDocumentos.versao, status: contratosDocumentos.status, snapshot_sha256: contratosDocumentos.snapshot_sha256, pdf_sha256: contratosDocumentos.pdf_sha256, validado_em: contratosDocumentos.validado_em, aprovado_admin_em: contratosDocumentos.aprovado_admin_em, aprovado_admin_por: contratosDocumentos.aprovado_admin_por }).from(contratosDocumentos).where(and(inArray(contratosDocumentos.reserva_id, reservaIds), ne(contratosDocumentos.status, "invalidado"))).orderBy(desc(contratosDocumentos.versao)) : [];
    const validacoes = reservaIds.length ? await db.select({ reserva_id: contratoValidacoes.reserva_id, contrato_id: contratoValidacoes.contrato_id, protocolo: contratoValidacoes.protocolo, confirmado_em: contratoValidacoes.confirmado_em, aceite_contrato: contratoValidacoes.aceite_contrato, aceite_regras: contratoValidacoes.aceite_regras, snapshot_sha256: contratoValidacoes.snapshot_sha256, pdf_sha256: contratoValidacoes.pdf_sha256 }).from(contratoValidacoes).where(inArray(contratoValidacoes.reserva_id, reservaIds)).orderBy(desc(contratoValidacoes.confirmado_em)) : [];
    const pagamentosLista = reservaIds.length ? await db.select({ id: pagamentos.id, reserva_id: pagamentos.reserva_id, status_reconciliado: pagamentos.status_reconciliado, valor_pago_centavos: pagamentos.valor_pago_centavos }).from(pagamentos).where(inArray(pagamentos.reserva_id, reservaIds)).orderBy(desc(pagamentos.criado_em)) : [];
    return res.json({ boletos: linhas.map((item) => {
      const contrato = contratos.find((c) => c.reserva_id === item.reserva_id);
      const validacao = contrato ? validacoes.find((v) => v.reserva_id === item.reserva_id && v.contrato_id === contrato.id && v.aceite_contrato && v.aceite_regras && v.snapshot_sha256 === contrato.snapshot_sha256 && (!contrato.pdf_sha256 || v.pdf_sha256 === contrato.pdf_sha256)) : undefined;
      const cadastroAprovado = cadastroAprovadoComEvidencia({ ativo: item.cliente_ativo, cadastro_status: item.cadastro_status, aprovado_em: item.aprovado_em, aprovado_por: item.aprovado_por });
      const contratoValidado = Boolean(contrato?.validado_em && validacao);
      const contratoAprovadoAdmin = Boolean(contrato?.status === "aprovado_admin" && contrato.aprovado_admin_em && contrato.aprovado_admin_por);
      const bloqueioMotivo = motivoBloqueioBoleto({ clienteAtivo: Boolean(item.cliente_ativo), cadastroStatus: item.cadastro_status, cadastroAprovadoComEvidencia: cadastroAprovado, contratoExiste: Boolean(contrato), contratoValidado, contratoAprovadoAdmin, formaPagamento: item.forma_pagamento });
      return { ...item, cadastro_aprovado: cadastroAprovado, contrato_validado: contratoValidado, contrato_aprovado_admin: contratoAprovadoAdmin, contrato_aprovado_admin_em: contrato?.aprovado_admin_em || null, bloqueio_motivo: bloqueioMotivo, protocolo: validacao?.protocolo || null, pagamento: pagamentosLista.find((p) => p.reserva_id === item.reserva_id) || null, parcelas: parcelas.filter((p) => p.reserva_id === item.reserva_id) };
    }) });
  } catch (error: any) {
    console.error("[BOLETOS] Erro ao listar:", error);
    return res.status(500).json({ erro: "Não foi possível carregar os boletos" });
  }
});

router.post("/boletos/:reservaId/validar-contrato", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const reserva = (await db.select().from(reservas).where(eq(reservas.id, req.params.reservaId)).limit(1))[0];
    if (!reserva || reserva.forma_pagamento !== "boleto") return res.status(404).json({ erro: "Reserva por boleto não encontrada" });
    const contrato = (await db.select({ id: contratosDocumentos.id }).from(contratosDocumentos).where(and(eq(contratosDocumentos.reserva_id, reserva.id), ne(contratosDocumentos.status, "invalidado"))).orderBy(desc(contratosDocumentos.versao)).limit(1))[0];
    if (!contrato) return res.status(409).json({ erro: "O contrato ainda não foi gerado" });
    const resultado = await aprovarContratoAdministrativamente(contrato.id, req);
    return res.json({ mensagem: resultado.jaAprovado ? "Contrato já estava aprovado" : "Contrato conferido e aprovado pela administração para o fluxo financeiro", contrato_id: resultado.contrato.id, protocolo: resultado.validacao.protocolo });
  } catch (error: any) {
    console.error("[BOLETOS] Erro ao validar contrato administrativamente:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível validar o contrato" });
  }
});

router.post("/boletos/:reservaId/liberar", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const reserva = (await db.select().from(reservas).where(eq(reservas.id, req.params.reservaId)).limit(1))[0];
    if (!reserva || reserva.forma_pagamento !== "boleto") return res.status(404).json({ erro: "Reserva por boleto não encontrada" });
    const cliente = (await db.select().from(usuarios).where(eq(usuarios.id, reserva.usuario_id)).limit(1))[0];
    const contrato = (await db.select().from(contratosDocumentos).where(and(eq(contratosDocumentos.reserva_id, reserva.id), ne(contratosDocumentos.status, "invalidado"))).orderBy(desc(contratosDocumentos.versao)).limit(1))[0];
    const validacao = contrato ? (await db.select().from(contratoValidacoes).where(and(eq(contratoValidacoes.reserva_id, reserva.id), eq(contratoValidacoes.contrato_id, contrato.id))).orderBy(desc(contratoValidacoes.confirmado_em)).limit(1))[0] : null;
    const contratoValidado = Boolean(contrato?.validado_em && validacao?.aceite_contrato && validacao.aceite_regras && validacao.snapshot_sha256 === contrato.snapshot_sha256 && (!contrato.pdf_sha256 || validacao.pdf_sha256 === contrato.pdf_sha256));
    const contratoAprovadoAdmin = Boolean(contrato?.status === "aprovado_admin" && contrato.aprovado_admin_em && contrato.aprovado_admin_por);
    const bloqueio = motivoBloqueioBoleto({ clienteAtivo: Boolean(cliente?.ativo), cadastroStatus: cliente?.cadastro_status, cadastroAprovadoComEvidencia: cadastroAprovadoComEvidencia(cliente), contratoExiste: Boolean(contrato), contratoValidado, contratoAprovadoAdmin, formaPagamento: reserva.forma_pagamento });
    if (bloqueio) return res.status(409).json({ erro: bloqueio });

    await garantirInventarioBoletoManual(reserva);
    const liberacao = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`boleto-manual:${reserva.id}`}))`);
      const reservaAtual = (await tx.select().from(reservas).where(eq(reservas.id, reserva.id)).for("update").limit(1))[0];
      if (!reservaAtual) throw new Error("Reserva não encontrada");
      let pagamento = (await tx.select().from(pagamentos).where(and(eq(pagamentos.reserva_id, reserva.id), eq(pagamentos.metodo, "boleto"))).orderBy(desc(pagamentos.criado_em)).limit(1))[0];
      if (!pagamento) {
        pagamento = (await tx.insert(pagamentos).values({ id: createId(), reserva_id: reserva.id, status: "pendente", valor: reservaAtual.valor_total, metodo: "boleto", gateway_id: null, gateway_resposta: { modo: "manual", contrato_protocolo: validacao!.protocolo }, idempotency_key: `boleto-manual:${reserva.id}`, valor_centavos: Number(reservaAtual.valor_total_centavos || Math.round(Number(reservaAtual.valor_total) * 100)), valor_pago_centavos: 0, status_reconciliado: "pendente", criado_em: new Date(), atualizado_em: new Date() }).returning())[0];
      }
      if (!pagamento) throw new Error("Não foi possível criar o controle financeiro do boleto");
      let parcelas = await tx.select().from(pagamentoParcelas).where(eq(pagamentoParcelas.pagamento_id, pagamento.id)).orderBy(pagamentoParcelas.sequencia);
      if (!parcelas.length) {
        const cronograma = Array.isArray(reservaAtual.cronograma_pagamento) ? reservaAtual.cronograma_pagamento as Array<any> : [];
        const qtd = Math.max(1, Number(reservaAtual.quantidade_parcelas || cronograma.length || 1));
        const totalCentavos = Number(reservaAtual.valor_total_centavos || Math.round(Number(reservaAtual.valor_total) * 100));
        const base = Math.floor(totalCentavos / qtd);
        const resto = totalCentavos - base * qtd;
        const inicio = new Date();
        parcelas = await tx.insert(pagamentoParcelas).values(Array.from({ length: qtd }, (_, index) => {
          const item = cronograma[index] || {};
          const venc = item.vencimento || new Date(inicio.getFullYear(), inicio.getMonth() + index + 1, Math.min(28, inicio.getDate())).toISOString().slice(0, 10);
          const valorCentavos = Number(item.valor_centavos || (base + (index === qtd - 1 ? resto : 0)));
          return { id: createId(), pagamento_id: pagamento!.id, reserva_id: reserva.id, sequencia: index + 1, valor: (valorCentavos / 100).toFixed(2), vencimento: venc, valor_centavos: valorCentavos, valor_pago_centavos: 0, status: "pendente", criado_em: new Date(), atualizado_em: new Date() };
        })).returning();
      }
      const primeiraLiberacao = !reservaAtual.boleto_liberado_em;
      if (primeiraLiberacao) {
        const agora = new Date();
        await tx.update(reservas).set({ boleto_liberado_em: agora, boleto_liberado_por: req.usuario!.id, checkout_estado: "boletos_em_preparacao", status: "aguardando_pagamento", atualizado_em: agora }).where(eq(reservas.id, reserva.id));
        await tx.insert(clienteHistorico).values({ id: createId(), usuario_id: reserva.usuario_id, tipo: "boleto_liberado", titulo: "Boleto liberado para emissão manual", descricao: `Contrato validado sob protocolo ${validacao!.protocolo}. Parcelas liberadas para anexação e envio pela administração.`, criado_por: req.usuario!.id, metadados: { reserva_id: reserva.id, pagamento_id: pagamento.id }, criado_em: agora });
        await tx.insert(auditoriaAdmin).values({ id: createId(), ator_id: req.usuario!.id, ator_tipo: req.usuario!.tipo, acao: "boleto_liberado", entidade: "reserva", entidade_id: reserva.id, depois: { pagamento_id: pagamento.id, protocolo: validacao!.protocolo }, ip: req.ip || null, user_agent: req.get("user-agent") || null, criado_em: agora });
      }
      return { pagamento, parcelas, primeiraLiberacao };
    });
    return res.json({ mensagem: liberacao.primeiraLiberacao ? "Financeiro por boleto liberado" : "Financeiro por boleto já estava liberado", pagamento_id: liberacao.pagamento.id, parcelas: liberacao.parcelas });
  } catch (error: any) {
    console.error("[BOLETOS] Erro ao liberar:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível liberar os boletos" });
  }
});

router.post("/boletos/:reservaId/parcelas/:parcelaId/arquivo", requireRole("admin"), uploadDocumentoCliente, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ erro: "Arquivo PDF não recebido" });
    const parcela = (await db.select().from(pagamentoParcelas).where(and(eq(pagamentoParcelas.id, req.params.parcelaId), eq(pagamentoParcelas.reserva_id, req.params.reservaId))).limit(1))[0];
    const reserva = (await db.select().from(reservas).where(eq(reservas.id, req.params.reservaId)).limit(1))[0];
    if (!parcela || !reserva || reserva.forma_pagamento !== "boleto" || !reserva.boleto_liberado_em) return res.status(404).json({ erro: "Parcela de boleto não liberada" });
    const nomeOriginal = decodeURIComponent(String(req.get("x-file-name") || `boleto-parcela-${parcela.sequencia}.pdf`));
    const extensao = nodePath.extname(nomeOriginal).toLowerCase();
    if (extensao !== ".pdf" || detectarMimeDocumento(req.body, extensao) !== "application/pdf") return res.status(415).json({ erro: "Envie o boleto em PDF válido" });
    const hash = createHash("sha256").update(req.body).digest("hex");
    const duplicado = (await db.select({ id: clienteDocumentos.id }).from(clienteDocumentos).where(and(eq(clienteDocumentos.usuario_id, reserva.usuario_id), eq(clienteDocumentos.sha256, hash), isNull(clienteDocumentos.removido_em))).limit(1))[0];
    if (duplicado) return res.status(409).json({ erro: "Este boleto já consta na ficha do cliente" });
    const base = nodePath.resolve(process.env.STORAGE_PATH || "./uploads");
    const pasta = nodePath.resolve(base, "clientes", reserva.usuario_id, "boletos");
    await fs.mkdir(pasta, { recursive: true });
    const docId = createId();
    const arquivo = nodePath.join(pasta, `${Date.now()}-${docId}.pdf`);
    await fs.writeFile(arquivo, req.body, { mode: 0o600 });
    const documento = (await db.insert(clienteDocumentos).values({ id: docId, usuario_id: reserva.usuario_id, reserva_id: reserva.id, categoria: "boleto", nome: `Boleto parcela ${parcela.sequencia}`, nome_original: nomeOriginal.slice(0, 255), mime_type: "application/pdf", tamanho_bytes: req.body.length, sha256: hash, arquivo, observacoes: `Vencimento ${parcela.vencimento} · Valor R$ ${parcela.valor}`, criado_por: req.usuario.id, criado_em: new Date(), atualizado_em: new Date() }).returning())[0];
    const boletoAnterior = parcela.boleto_documento_id;
    await db.update(pagamentoParcelas).set({ boleto_documento_id: documento.id, boleto_url: null, enviado_email_em: null, enviado_whatsapp_em: null, atualizado_em: new Date() }).where(eq(pagamentoParcelas.id, parcela.id));
    if (boletoAnterior && boletoAnterior !== documento.id) {
      await db.update(clienteDocumentos).set({ removido_em: new Date(), removido_por: req.usuario.id, atualizado_em: new Date() }).where(eq(clienteDocumentos.id, boletoAnterior));
    }
    await registrarHistoricoCliente(reserva.usuario_id, "boleto_anexado", `Boleto da parcela ${parcela.sequencia} anexado`, `Vencimento ${parcela.vencimento} · R$ ${parcela.valor}`, req.usuario.id, { reserva_id: reserva.id, parcela_id: parcela.id, documento_id: documento.id });
    await AuditService.registrar(req, "boleto_anexado", "pagamento_parcela", parcela.id, undefined, { documento_id: documento.id, sha256: hash });
    return res.status(201).json({ documento: { id: documento.id, nome: documento.nome, sha256: documento.sha256 } });
  } catch (error: any) { return res.status(400).json({ erro: error.message || "Não foi possível anexar o boleto" }); }
});

router.post("/boletos/:reservaId/parcelas/:parcelaId/email", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const parcela = (await db.select().from(pagamentoParcelas).where(and(eq(pagamentoParcelas.id, req.params.parcelaId), eq(pagamentoParcelas.reserva_id, req.params.reservaId))).limit(1))[0];
    if (!parcela?.boleto_documento_id) return res.status(409).json({ erro: "Anexe o PDF do boleto antes de enviar" });
    const documento = (await db.select().from(clienteDocumentos).where(eq(clienteDocumentos.id, parcela.boleto_documento_id)).limit(1))[0];
    const reserva = (await db.select().from(reservas).where(eq(reservas.id, req.params.reservaId)).limit(1))[0];
    const cliente = reserva ? (await db.select().from(usuarios).where(eq(usuarios.id, reserva.usuario_id)).limit(1))[0] : null;
    if (!documento || !reserva || !cliente) return res.status(404).json({ erro: "Dados do boleto não encontrados" });
    const enviado = await EmailService.enviarBoletoManual({ reserva_id: reserva.id, parcela: parcela.sequencia, vencimento: String(parcela.vencimento), valor: String(parcela.valor), arquivo: documento.arquivo, nomeArquivo: documento.nome_original, destinatario: cliente.email, clienteNome: cliente.nome });
    if (!enviado) return res.status(503).json({ erro: "O SMTP não confirmou o envio do boleto" });
    await db.update(pagamentoParcelas).set({ enviado_email_em: new Date(), atualizado_em: new Date() }).where(eq(pagamentoParcelas.id, parcela.id));
    await atualizarEstadoEnvioBoletos(reserva.id);
    await registrarHistoricoCliente(cliente.id, "boleto_enviado_email", `Boleto da parcela ${parcela.sequencia} enviado por e-mail`, cliente.email, req.usuario.id, { reserva_id: reserva.id, parcela_id: parcela.id });
    await AuditService.registrar(req, "boleto_email", "pagamento_parcela", parcela.id);
    return res.json({ mensagem: "Boleto enviado por e-mail" });
  } catch (error: any) { return res.status(400).json({ erro: error.message || "Não foi possível enviar o boleto" }); }
});

router.post("/boletos/:reservaId/parcelas/:parcelaId/whatsapp", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const parcela = (await db.select().from(pagamentoParcelas).where(and(eq(pagamentoParcelas.id, req.params.parcelaId), eq(pagamentoParcelas.reserva_id, req.params.reservaId))).limit(1))[0];
    if (!parcela?.boleto_documento_id) return res.status(409).json({ erro: "Anexe o PDF do boleto antes do envio pelo WhatsApp" });
    const reserva = (await db.select().from(reservas).where(eq(reservas.id, req.params.reservaId)).limit(1))[0];
    const cliente = reserva ? (await db.select().from(usuarios).where(eq(usuarios.id, reserva.usuario_id)).limit(1))[0] : null;
    if (!cliente?.telefone) return res.status(409).json({ erro: "Cliente sem WhatsApp cadastrado" });
    const telefone = String(cliente.telefone).replace(/\D/g, "");
    const mensagem = `Olá, ${cliente.nome}. Segue o boleto da parcela ${parcela.sequencia} da sua reserva ${reserva!.id}, no valor de R$ ${parcela.valor}, com vencimento em ${parcela.vencimento}. O PDF está disponível com a equipe da Excursão das Comitivas.`;
    const url = `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`;
    if (req.body?.confirmado !== true) {
      return res.json({ url, confirmado: false, mensagem: "Conversa preparada. Anexe o PDF e envie; depois confirme o envio no painel para registrar a evidência operacional." });
    }
    const agora = new Date();
    await db.update(pagamentoParcelas).set({ enviado_whatsapp_em: agora, atualizado_em: agora }).where(eq(pagamentoParcelas.id, parcela.id));
    await atualizarEstadoEnvioBoletos(reserva!.id);
    await registrarHistoricoCliente(cliente.id, "boleto_enviado_whatsapp", `Envio do boleto da parcela ${parcela.sequencia} confirmado no WhatsApp`, telefone, req.usuario.id, { reserva_id: reserva!.id, parcela_id: parcela.id });
    await AuditService.registrar(req, "boleto_whatsapp_confirmado", "pagamento_parcela", parcela.id);
    return res.json({ url, confirmado: true, mensagem: "Envio por WhatsApp confirmado e registrado." });
  } catch (error: any) { return res.status(400).json({ erro: error.message || "Não foi possível preparar o WhatsApp" }); }
});

router.post("/boletos/:reservaId/parcelas/:parcelaId/comprovante", requireRole("admin"), uploadDocumentoCliente, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ erro: "Arquivo de comprovante não recebido" });
    const parcela = (await db.select().from(pagamentoParcelas).where(and(eq(pagamentoParcelas.id, req.params.parcelaId), eq(pagamentoParcelas.reserva_id, req.params.reservaId))).limit(1))[0];
    const reserva = (await db.select().from(reservas).where(eq(reservas.id, req.params.reservaId)).limit(1))[0];
    if (!parcela || !reserva || reserva.forma_pagamento !== "boleto") return res.status(404).json({ erro: "Parcela de boleto não encontrada" });
    const nomeOriginal = decodeURIComponent(String(req.get("x-file-name") || `comprovante-parcela-${parcela.sequencia}.pdf`));
    const extensao = nodePath.extname(nomeOriginal).toLowerCase();
    if (![".pdf", ".jpg", ".jpeg", ".png", ".webp"].includes(extensao)) return res.status(415).json({ erro: "Envie comprovante em PDF, JPG, PNG ou WEBP" });
    const mimeType = detectarMimeDocumento(req.body, extensao);
    if (!mimeType) return res.status(415).json({ erro: "O conteúdo do arquivo não corresponde a um formato permitido" });
    const hash = createHash("sha256").update(req.body).digest("hex");
    const duplicado = (await db.select({ id: clienteDocumentos.id }).from(clienteDocumentos).where(and(eq(clienteDocumentos.usuario_id, reserva.usuario_id), eq(clienteDocumentos.sha256, hash), isNull(clienteDocumentos.removido_em))).limit(1))[0];
    if (duplicado) return res.status(409).json({ erro: "Este comprovante já consta na ficha do cliente" });
    const base = nodePath.resolve(process.env.STORAGE_PATH || "./uploads");
    const pasta = nodePath.resolve(base, "clientes", reserva.usuario_id, "comprovantes");
    await fs.mkdir(pasta, { recursive: true });
    const docId = createId();
    const arquivo = nodePath.join(pasta, `${Date.now()}-${docId}${extensao}`);
    await fs.writeFile(arquivo, req.body, { mode: 0o600 });
    const documento = (await db.insert(clienteDocumentos).values({
      id: docId,
      usuario_id: reserva.usuario_id,
      reserva_id: reserva.id,
      categoria: "comprovante_pagamento",
      nome: `Comprovante de pagamento — parcela ${parcela.sequencia}`,
      nome_original: nomeOriginal.slice(0, 255),
      mime_type: mimeType,
      tamanho_bytes: req.body.length,
      sha256: hash,
      arquivo,
      observacoes: `Parcela ${parcela.sequencia} · Vencimento ${parcela.vencimento} · Valor R$ ${parcela.valor}`,
      criado_por: req.usuario.id,
      criado_em: new Date(),
      atualizado_em: new Date(),
    }).returning())[0];
    const anterior = parcela.comprovante_documento_id;
    await db.update(pagamentoParcelas).set({ comprovante_documento_id: documento.id, atualizado_em: new Date() }).where(eq(pagamentoParcelas.id, parcela.id));
    if (anterior && anterior !== documento.id) {
      await db.update(clienteDocumentos).set({ removido_em: new Date(), removido_por: req.usuario.id, atualizado_em: new Date() }).where(eq(clienteDocumentos.id, anterior));
    }
    await registrarHistoricoCliente(reserva.usuario_id, "comprovante_pagamento", `Comprovante da parcela ${parcela.sequencia} anexado`, `R$ ${parcela.valor} · vencimento ${parcela.vencimento}`, req.usuario.id, { reserva_id: reserva.id, parcela_id: parcela.id, documento_id: documento.id });
    await AuditService.registrar(req, "comprovante_pagamento_anexado", "pagamento_parcela", parcela.id, anterior ? { documento_id: anterior } : undefined, { documento_id: documento.id, sha256: hash });
    return res.status(201).json({ documento: { id: documento.id, nome: documento.nome, sha256: documento.sha256 } });
  } catch (error: any) {
    console.error("[BOLETOS] Erro ao anexar comprovante:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível anexar o comprovante" });
  }
});

router.patch("/boletos/:reservaId/parcelas/:parcelaId/pagamento", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const pago = req.body?.pago !== false;
    const parcela = (await db.select().from(pagamentoParcelas).where(and(eq(pagamentoParcelas.id, req.params.parcelaId), eq(pagamentoParcelas.reserva_id, req.params.reservaId))).limit(1))[0];
    if (!parcela) return res.status(404).json({ erro: "Parcela não encontrada" });
    const valorPago = pago ? Number(req.body?.valor_pago_centavos || parcela.valor_centavos || Math.round(Number(parcela.valor) * 100)) : 0;
    const statusDesejado = pago ? "aprovado" : "pendente";
    const alterado = parcela.status !== statusDesejado || Number(parcela.valor_pago_centavos || 0) !== valorPago;
    if (alterado) {
      await db.update(pagamentoParcelas).set({ status: statusDesejado, valor_pago_centavos: valorPago, pago_confirmado_em: pago ? new Date() : null, pago_confirmado_por: pago ? req.usuario.id : null, atualizado_em: new Date() }).where(eq(pagamentoParcelas.id, parcela.id));
    }
    const reconciliado = await reconciliarPagamentoManual(parcela.pagamento_id);
    const reserva = (await db.select().from(reservas).where(eq(reservas.id, req.params.reservaId)).limit(1))[0];
    if (alterado && reserva) await registrarHistoricoCliente(reserva.usuario_id, pago ? "pagamento_confirmado" : "pagamento_reaberto", `${pago ? "Pagamento confirmado" : "Pagamento reaberto"} — parcela ${parcela.sequencia}`, `R$ ${(valorPago / 100).toFixed(2)}`, req.usuario.id, { reserva_id: reserva.id, parcela_id: parcela.id, quitado: reconciliado.quitado });
    if (alterado) await AuditService.registrar(req, pago ? "pagamento_manual_confirmado" : "pagamento_manual_reaberto", "pagamento_parcela", parcela.id, undefined, { valor_pago_centavos: valorPago, quitado: reconciliado.quitado });
    if (alterado && reconciliado.quitado) await EmailService.enviarConfirmacaoPagamento(req.params.reservaId).catch(() => false);
    return res.json({ mensagem: alterado ? (pago ? "Pagamento confirmado" : "Parcela reaberta") : "Pagamento já estava atualizado", reconciliado, duplicado: !alterado });
  } catch (error: any) { return res.status(400).json({ erro: error.message || "Não foi possível atualizar o pagamento" }); }
});

export default router;
