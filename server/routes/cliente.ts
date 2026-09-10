import { Router, Request, Response } from "express";
import path from "node:path";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { db } from "../db/index.js";
import {
  clienteDocumentos,
  clienteHistorico,
  contratoValidacoes,
  contratosDocumentos,
  emails_enviados,
  eventos,
  lotes,
  pacotes,
  pagamentoParcelas,
  pagamentos,
  reservas,
  usuarios,
  assentoAlocacoes,
  assentosOnibus,
  onibusOperacionais,
  pontosEmbarqueOperacao,
  saidasOperacionais,
  checkinsOperacao,
  quartoAlocacoes,
  quartosHospedagem,
} from "../db/schema.js";
import { EmailService } from "../services/emailService.js";
import { ReservaSolicitacaoService } from "../services/reservaSolicitacaoService.js";

const router = Router();
router.use(authMiddleware);

const TIPOS_HISTORICO_CLIENTE = [
  "cliente_cancelamento",
  "cliente_troca_pacote",
  "cliente_reinicio",
  "cliente_atendimento",
  "analise_solicitacao",
];

function escaparHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function obterReservaDoCliente(reservaId: string, usuarioId: string) {
  return (await db.select({
    id: reservas.id,
    usuario_id: reservas.usuario_id,
    lote_id: reservas.lote_id,
    pacote_id: reservas.pacote_id,
    status: reservas.status,
    checkout_estado: reservas.checkout_estado,
    valor_total: reservas.valor_total,
    forma_pagamento: reservas.forma_pagamento,
    inventario_hold_id: reservas.inventario_hold_id,
  }).from(reservas).where(and(eq(reservas.id, reservaId), eq(reservas.usuario_id, usuarioId))).limit(1))[0];
}

async function registrarSolicitacao(params: {
  usuarioId: string;
  reservaId?: string | null;
  tipo: string;
  titulo: string;
  descricao?: string | null;
  metadados?: Record<string, unknown>;
}) {
  const criado = (await db.insert(clienteHistorico).values({
    id: createId(),
    usuario_id: params.usuarioId,
    tipo: params.tipo,
    titulo: params.titulo,
    descricao: params.descricao || null,
    metadados: { reserva_id: params.reservaId || null, ...(params.metadados || {}) },
    criado_por: params.usuarioId,
    criado_em: new Date(),
  }).returning({ id: clienteHistorico.id, criado_em: clienteHistorico.criado_em }))[0];
  return criado;
}

async function avisarEquipe(params: { assunto: string; clienteNome: string; clienteEmail: string; mensagem: string }) {
  const inbox = process.env.EMAIL_SUPPORT_INBOX?.trim() || "excursaodascomitivas@gmail.com";
  const html = `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#182D3B;padding:24px"><div style="max-width:680px;margin:auto"><h1 style="color:#851F32;font-size:22px">${escaparHtml(params.assunto)}</h1><p><strong>Cliente:</strong> ${escaparHtml(params.clienteNome)} (${escaparHtml(params.clienteEmail)})</p><div style="white-space:pre-wrap;background:#F8F5EF;border:1px solid #eadfd8;border-radius:12px;padding:16px">${escaparHtml(params.mensagem)}</div><p style="font-size:12px;color:#64748b">Solicitação registrada automaticamente na Ficha 360º do cliente.</p></div></body></html>`;
  return EmailService.enviarEmail({
    destinatario: inbox,
    assunto: params.assunto,
    corpo_html: html,
    remetente: "support",
  }).catch(() => false);
}

router.get("/portal", async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const usuarioId = req.usuario.id;

    const usuario = (await db.select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      cpf: usuarios.cpf,
      telefone: usuarios.telefone,
      data_nascimento: usuarios.data_nascimento,
      endereco: usuarios.endereco,
      cadastro_status: usuarios.cadastro_status,
      criado_em: usuarios.criado_em,
      atualizado_em: usuarios.atualizado_em,
    }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1))[0];
    if (!usuario) return res.status(404).json({ erro: "Cliente não encontrado" });

    const reservasLista = await db.select({
      id: reservas.id,
      lote_id: reservas.lote_id,
      pacote_id: reservas.pacote_id,
      status: reservas.status,
      checkout_estado: reservas.checkout_estado,
      valor_total: reservas.valor_total,
      valor_total_centavos: reservas.valor_total_centavos,
      forma_pagamento: reservas.forma_pagamento,
      quantidade_parcelas: reservas.quantidade_parcelas,
      valor_parcela: reservas.valor_parcela,
      desconto_aplicado: reservas.desconto_aplicado,
      desconto_pagamento: reservas.desconto_pagamento,
      criado_em: reservas.criado_em,
      atualizado_em: reservas.atualizado_em,
      evento_id: eventos.id,
      evento_nome: eventos.nome,
      evento_local: eventos.local,
      evento_data_inicio: eventos.data_inicio,
      evento_data_fim: eventos.data_fim,
      lote_nome: lotes.nome,
      lote_data_embarque: lotes.data_embarque,
      lote_data_retorno: lotes.data_retorno,
      lote_local_embarque: lotes.local_embarque,
      lote_ativo: lotes.ativo,
      pacote_nome: pacotes.nome,
      pacote_descricao: pacotes.descricao,
      modalidade_hospedagem: pacotes.modalidade_hospedagem,
    }).from(reservas)
      .innerJoin(lotes, eq(reservas.lote_id, lotes.id))
      .innerJoin(eventos, eq(lotes.evento_id, eventos.id))
      .leftJoin(pacotes, eq(reservas.pacote_id, pacotes.id))
      .where(eq(reservas.usuario_id, usuarioId))
      .orderBy(desc(reservas.criado_em));

    const reservaIds = reservasLista.map((item) => item.id);
    const operacaoLista = reservaIds.length ? await db.select({
      reserva_id: assentoAlocacoes.reserva_id,
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
    const hospedagemLista = reservaIds.length ? await db.select({
      reserva_id: quartoAlocacoes.reserva_id,
      quarto_nome: quartosHospedagem.nome,
      grupo: quartosHospedagem.genero,
      vaga: quartoAlocacoes.numero_vaga,
    }).from(quartoAlocacoes)
      .innerJoin(quartosHospedagem, eq(quartoAlocacoes.quarto_id, quartosHospedagem.id))
      .where(and(inArray(quartoAlocacoes.reserva_id, reservaIds), eq(quartoAlocacoes.status, "ativa"))) : [];
    const hospedagemPorReserva = new Map(hospedagemLista.map((item) => [item.reserva_id, item]));
    const pagamentosLista = reservaIds.length ? await db.select({
      id: pagamentos.id,
      reserva_id: pagamentos.reserva_id,
      status: pagamentos.status,
      status_reconciliado: pagamentos.status_reconciliado,
      metodo: pagamentos.metodo,
      valor: pagamentos.valor,
      valor_centavos: pagamentos.valor_centavos,
      valor_pago_centavos: pagamentos.valor_pago_centavos,
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
      comprovante_documento_id: pagamentoParcelas.comprovante_documento_id,
      enviado_email_em: pagamentoParcelas.enviado_email_em,
      enviado_whatsapp_em: pagamentoParcelas.enviado_whatsapp_em,
      pago_confirmado_em: pagamentoParcelas.pago_confirmado_em,
      criado_em: pagamentoParcelas.criado_em,
      atualizado_em: pagamentoParcelas.atualizado_em,
    }).from(pagamentoParcelas).where(inArray(pagamentoParcelas.reserva_id, reservaIds)).orderBy(pagamentoParcelas.reserva_id, pagamentoParcelas.sequencia) : [];

    const contratosLista = reservaIds.length ? await db.select({
      id: contratosDocumentos.id,
      reserva_id: contratosDocumentos.reserva_id,
      versao: contratosDocumentos.versao,
      status: contratosDocumentos.status,
      snapshot_sha256: contratosDocumentos.snapshot_sha256,
      pdf_sha256: contratosDocumentos.pdf_sha256,
      visualizado_em: contratosDocumentos.visualizado_em,
      criado_em: contratosDocumentos.criado_em,
      validado_em: contratosDocumentos.validado_em,
      aprovado_admin_em: contratosDocumentos.aprovado_admin_em,
      invalidado_em: contratosDocumentos.invalidado_em,
    }).from(contratosDocumentos).where(inArray(contratosDocumentos.reserva_id, reservaIds)).orderBy(desc(contratosDocumentos.criado_em)) : [];

    const validacoesLista = reservaIds.length ? await db.select({
      id: contratoValidacoes.id,
      contrato_id: contratoValidacoes.contrato_id,
      reserva_id: contratoValidacoes.reserva_id,
      protocolo: contratoValidacoes.protocolo,
      canal: contratoValidacoes.canal,
      confirmado_em: contratoValidacoes.confirmado_em,
    }).from(contratoValidacoes).where(inArray(contratoValidacoes.reserva_id, reservaIds)).orderBy(desc(contratoValidacoes.confirmado_em)) : [];

    const documentosLista = await db.select({
      id: clienteDocumentos.id,
      reserva_id: clienteDocumentos.reserva_id,
      categoria: clienteDocumentos.categoria,
      nome: clienteDocumentos.nome,
      nome_original: clienteDocumentos.nome_original,
      mime_type: clienteDocumentos.mime_type,
      tamanho_bytes: clienteDocumentos.tamanho_bytes,
      sha256: clienteDocumentos.sha256,
      observacoes: clienteDocumentos.observacoes,
      criado_em: clienteDocumentos.criado_em,
    }).from(clienteDocumentos)
      .where(and(eq(clienteDocumentos.usuario_id, usuarioId), isNull(clienteDocumentos.removido_em)))
      .orderBy(desc(clienteDocumentos.criado_em));

    const historicoCliente = await db.select({
      id: clienteHistorico.id,
      tipo: clienteHistorico.tipo,
      titulo: clienteHistorico.titulo,
      descricao: clienteHistorico.descricao,
      metadados: clienteHistorico.metadados,
      criado_em: clienteHistorico.criado_em,
    }).from(clienteHistorico)
      .where(and(eq(clienteHistorico.usuario_id, usuarioId), inArray(clienteHistorico.tipo, TIPOS_HISTORICO_CLIENTE)))
      .orderBy(desc(clienteHistorico.criado_em));

    const emailsLista = reservaIds.length ? await db.select({
      id: emails_enviados.id,
      reserva_id: emails_enviados.reserva_id,
      tipo: emails_enviados.tipo,
      assunto: emails_enviados.assunto,
      enviado_em: emails_enviados.enviado_em,
      erro: emails_enviados.erro,
      criado_em: emails_enviados.criado_em,
    }).from(emails_enviados).where(inArray(emails_enviados.reserva_id, reservaIds)).orderBy(desc(emails_enviados.criado_em)) : [];

    const reservasEnriquecidas = reservasLista.map((reserva) => {
      const pagamentosDaReserva = pagamentosLista.filter((item) => item.reserva_id === reserva.id);
      const contratosDaReserva = contratosLista.filter((item) => item.reserva_id === reserva.id);
      const contratoValidado = contratosDaReserva.some((item) => Boolean(item.validado_em) || ["validado", "aprovado"].includes(String(item.status || "").toLowerCase()));
      const pagamentoConfirmado = pagamentosDaReserva.some((item) => item.status === "aprovado" || Number(item.valor_pago_centavos || 0) > 0 || ["parcial", "quitado"].includes(String(item.status_reconciliado || "").toLowerCase()));
      return {
        ...reserva,
        operacao: operacaoPorReserva.get(reserva.id) || null,
        hospedagem_operacional: hospedagemPorReserva.get(reserva.id) || null,
        contrato_validado: contratoValidado,
        pagamento_confirmado: pagamentoConfirmado,
        cancelamento_imediato_permitido: false,
      };
    });

    const solicitacoes = await ReservaSolicitacaoService.listar({ id: usuarioId, tipo: "cliente" });

    const linhaTempo = [
      { id: `cadastro-${usuario.id}`, tipo: "cadastro", titulo: "Conta criada", descricao: usuario.email, criado_em: usuario.criado_em },
      ...reservasLista.map((item) => ({ id: `reserva-${item.id}`, tipo: "reserva", titulo: item.checkout_estado === "cancelado_cliente" ? "Reserva cancelada" : `Reserva · ${item.status || "criada"}`, descricao: `${item.evento_nome}${item.pacote_nome ? ` · ${item.pacote_nome}` : ""}`, criado_em: item.atualizado_em || item.criado_em, reserva_id: item.id })),
      ...contratosLista.map((item) => ({ id: `contrato-${item.id}`, tipo: "contrato", titulo: `Contrato v${item.versao} · ${item.status}`, descricao: item.validado_em ? "Contrato validado eletronicamente" : "Documento contratual gerado", criado_em: item.validado_em || item.criado_em, reserva_id: item.reserva_id })),
      ...pagamentosLista.map((item) => ({ id: `pagamento-${item.id}`, tipo: "pagamento", titulo: `Pagamento · ${item.status_reconciliado || item.status}`, descricao: `${String(item.metodo || "").toUpperCase()} · R$ ${Number(item.valor || 0).toFixed(2)}`, criado_em: item.atualizado_em || item.criado_em, reserva_id: item.reserva_id })),
      ...emailsLista.map((item) => ({ id: `email-${item.id}`, tipo: "comunicacao", titulo: item.erro ? "Falha no envio de e-mail" : `E-mail · ${item.tipo}`, descricao: item.assunto, criado_em: item.enviado_em || item.criado_em, reserva_id: item.reserva_id })),
      ...historicoCliente,
    ].sort((a, b) => new Date(String(b.criado_em)).getTime() - new Date(String(a.criado_em)).getTime()).slice(0, 300);

    const valorContratado = reservasLista.reduce((total, item) => total + Number(item.valor_total || 0), 0);
    const valorPagoCentavos = pagamentosLista.reduce((total, item) => total + Number(item.valor_pago_centavos || 0), 0);
    const parcelasPendentes = parcelasLista.filter((item) => !["aprovado", "pago", "cancelado"].includes(String(item.status || "").toLowerCase())).length;

    return res.json({
      usuario,
      resumo: {
        reservas: reservasLista.length,
        viagens_confirmadas: reservasLista.filter((item) => item.status === "cliente_confirmado").length,
        contratos_validos: contratosLista.filter((item) => Boolean(item.validado_em)).length,
        parcelas_pendentes: parcelasPendentes,
        documentos: documentosLista.length,
        valor_contratado: valorContratado,
        valor_pago: valorPagoCentavos / 100,
        ultima_interacao_em: linhaTempo[0]?.criado_em || usuario.atualizado_em,
      },
      reservas: reservasEnriquecidas,
      pagamentos: pagamentosLista,
      parcelas: parcelasLista,
      contratos: contratosLista,
      validacoes: validacoesLista,
      documentos: documentosLista,
      historico: linhaTempo,
      solicitacoes,
    });
  } catch (error) {
    console.error("[CLIENTE] Erro ao montar portal:", error);
    return res.status(500).json({ erro: "Não foi possível carregar sua área do cliente" });
  }
});

router.get("/documentos/:documentoId", async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const documento = (await db.select({
      id: clienteDocumentos.id,
      arquivo: clienteDocumentos.arquivo,
      nome_original: clienteDocumentos.nome_original,
      mime_type: clienteDocumentos.mime_type,
    }).from(clienteDocumentos).where(and(
      eq(clienteDocumentos.id, req.params.documentoId),
      eq(clienteDocumentos.usuario_id, req.usuario.id),
      isNull(clienteDocumentos.removido_em),
    )).limit(1))[0];
    if (!documento) return res.status(404).json({ erro: "Documento não encontrado" });

    const base = path.resolve(process.env.STORAGE_PATH || "./uploads");
    const arquivo = path.resolve(documento.arquivo);
    if (!arquivo.startsWith(`${base}${path.sep}`)) return res.status(404).json({ erro: "Documento não encontrado" });
    const inline = req.query.inline === "1";
    res.setHeader("Content-Type", documento.mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(documento.nome_original)}"`);
    return res.sendFile(arquivo, (error) => {
      if (error && !res.headersSent) res.status(404).json({ erro: "Arquivo do documento não encontrado" });
    });
  } catch (error) {
    console.error("[CLIENTE] Erro ao abrir documento:", error);
    return res.status(500).json({ erro: "Não foi possível abrir o documento" });
  }
});

router.post("/reservas/:reservaId/cancelar", async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const reserva = await obterReservaDoCliente(req.params.reservaId, req.usuario.id);
    if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    const motivo = String(req.body?.motivo || "").trim().slice(0, 2000);
    const solicitacao = await ReservaSolicitacaoService.criar(reserva.id, req.usuario, { tipo: "cancelamento", motivo });

    const usuario = (await db.select({ nome: usuarios.nome, email: usuarios.email }).from(usuarios).where(eq(usuarios.id, req.usuario.id)).limit(1))[0];
    if (usuario) void avisarEquipe({
      assunto: `Cancelamento solicitado · reserva ${reserva.id}`,
      clienteNome: usuario.nome,
      clienteEmail: usuario.email,
      mensagem: `O cliente solicitou cancelamento da reserva ${reserva.id}.\nMotivo: ${motivo}`,
    });
    return res.status(201).json({ efetivado: false, pendente: true, solicitacao, mensagem: "Solicitação registrada para análise. A reserva, o contrato e os pagamentos permanecem inalterados até a decisão." });
  } catch (error: any) {
    console.error("[CLIENTE] Erro ao cancelar reserva:", error);
    return res.status(409).json({ erro: error.message || "Não foi possível processar o cancelamento" });
  }
});

router.post("/reservas/:reservaId/reconfigurar", async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const reserva = await obterReservaDoCliente(req.params.reservaId, req.usuario.id);
    if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    const acao = req.body?.acao === "reinicio" ? "reinicio" : "troca_pacote";
    const motivo = String(req.body?.motivo || "").trim().slice(0, 2000);
    const solicitacao = await ReservaSolicitacaoService.criar(reserva.id, req.usuario, {
      tipo: acao,
      motivo,
      pacote_destino_id: req.body?.pacote_destino_id,
    });

    const usuario = (await db.select({ nome: usuarios.nome, email: usuarios.email }).from(usuarios).where(eq(usuarios.id, req.usuario.id)).limit(1))[0];
    if (usuario) void avisarEquipe({
      assunto: `${acao === "reinicio" ? "Reinício" : "Troca de pacote"} solicitado · reserva ${reserva.id}`,
      clienteNome: usuario.nome,
      clienteEmail: usuario.email,
      mensagem: `Reserva ${reserva.id}. Motivo: ${motivo}`,
    });
    return res.status(201).json({ efetivado: false, pendente: true, solicitacao, mensagem: "Solicitação registrada para análise. Nenhum contrato ou pagamento foi alterado." });
  } catch (error: any) {
    console.error("[CLIENTE] Erro ao reconfigurar reserva:", error);
    return res.status(409).json({ erro: error.message || "Não foi possível iniciar a alteração da contratação" });
  }
});

router.post("/atendimento", async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const assunto = String(req.body?.assunto || "Atendimento").trim().slice(0, 180);
    const mensagem = String(req.body?.mensagem || "").trim().slice(0, 4000);
    const reservaId = req.body?.reserva_id ? String(req.body.reserva_id) : null;
    if (mensagem.length < 5) return res.status(400).json({ erro: "Escreva uma mensagem para a equipe" });
    if (reservaId) {
      const reserva = await obterReservaDoCliente(reservaId, req.usuario.id);
      if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    }

    await registrarSolicitacao({
      usuarioId: req.usuario.id,
      reservaId,
      tipo: "cliente_atendimento",
      titulo: assunto,
      descricao: mensagem,
      metadados: { status: "enviado" },
    });

    const usuario = (await db.select({ nome: usuarios.nome, email: usuarios.email }).from(usuarios).where(eq(usuarios.id, req.usuario.id)).limit(1))[0];
    if (usuario) void avisarEquipe({
      assunto: `Atendimento · ${assunto}${reservaId ? ` · reserva ${reservaId}` : ""}`,
      clienteNome: usuario.nome,
      clienteEmail: usuario.email,
      mensagem,
    });

    return res.status(201).json({ mensagem: "Mensagem registrada e encaminhada para a equipe." });
  } catch (error) {
    console.error("[CLIENTE] Erro no atendimento:", error);
    return res.status(500).json({ erro: "Não foi possível enviar sua mensagem" });
  }
});

export default router;
