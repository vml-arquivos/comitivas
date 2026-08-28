import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { ContratoService, REGRAS_CONVIVENCIA_OFICIAIS, REGRAS_CONVIVENCIA_VERSION } from "../services/contratoService.js";
import { ConfiguracaoService } from "../services/configuracaoService.js";
import { db } from "../db/index.js";
import { eventos, lotes, pacotes, reservas, usuarios, pagamentos, contratosDocumentos, contratoValidacoes } from "../db/schema.js";
import { desc, eq } from "drizzle-orm";
import fs from "fs/promises";
import path from "node:path";
import { generateBrandedPdfBuffer } from "../../packages/contract-engine/brandedPdfLayout.js";
import { OtpService } from "../services/otpService.js";

const router = Router();

function escaparHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatarData(valor: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(valor);
}

function formatarDataHora(valor: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(valor);
}

// Preparar a versão contratual que será exibida e validada pelo cliente.
router.post("/preparar/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const reserva = (await db.select().from(reservas).where(eq(reservas.id, req.params.reserva_id)).limit(1))[0];
    if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    if (reserva.usuario_id !== req.usuario.id && req.usuario.tipo !== "admin") return res.status(403).json({ erro: "Acesso negado" });
    const documento = await ContratoService.prepararContrato(req.params.reserva_id);
    return res.json({ documento });
  } catch (error: any) {
    console.error("[CONTRATOS] Erro ao preparar:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível preparar o contrato" });
  }
});

router.get("/regras-convivencia", (_req: Request, res: Response) => {
  res.json({ versao: REGRAS_CONVIVENCIA_VERSION, titulo: "Regras de Convivência — Excursão das Comitivas", conteudo: REGRAS_CONVIVENCIA_OFICIAIS });
});

router.post("/otp/solicitar/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const resultado = await OtpService.solicitar({ usuario_id: req.usuario.id, reserva_id: req.params.reserva_id, contrato_id: req.body?.contrato_id, canal: req.body?.canal });
    if (!resultado.enviado) return res.status(503).json({ erro: resultado.motivo || "Canal de validação não configurado", ...resultado });
    return res.json(resultado);
  } catch (error: any) {
    console.error("[CONTRATOS] Erro ao solicitar OTP:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível enviar o código" });
  }
});

router.post("/otp/confirmar/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const resultado = await OtpService.confirmar({
      usuario_id: req.usuario.id,
      reserva_id: req.params.reserva_id,
      codigo: req.body?.codigo,
      aceite_contrato: req.body?.aceite_contrato === true,
      aceite_regras: req.body?.aceite_regras === true,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get("user-agent"),
      idioma: req.body?.idioma || req.get("accept-language")?.split(",")[0],
      timezone: req.body?.timezone,
      geolocalizacao: req.body?.geolocalizacao,
    });
    return res.json({ mensagem: "Contrato validado com sucesso", ...resultado });
  } catch (error: any) {
    console.error("[CONTRATOS] Erro ao confirmar OTP:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível validar o contrato" });
  }
});

router.get("/estado/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const reserva = (await db.select().from(reservas).where(eq(reservas.id, req.params.reserva_id)).limit(1))[0];
    if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    if (reserva.usuario_id !== req.usuario.id && req.usuario.tipo !== "admin") return res.status(403).json({ erro: "Acesso negado" });
    const documento = (await db.select({ id: contratosDocumentos.id, versao: contratosDocumentos.versao, status: contratosDocumentos.status, snapshot_sha256: contratosDocumentos.snapshot_sha256, pdf_sha256: contratosDocumentos.pdf_sha256, arquivo: contratosDocumentos.arquivo }).from(contratosDocumentos).where(eq(contratosDocumentos.reserva_id, reserva.id)).orderBy(desc(contratosDocumentos.versao)).limit(1))[0] || null;
    const pagamento = (await db.select().from(pagamentos).where(eq(pagamentos.reserva_id, reserva.id)).orderBy(desc(pagamentos.criado_em)).limit(1))[0] || null;
    const checkoutEstado = reserva.checkout_estado || (reserva.status === "cliente_confirmado" ? "primeira_parcela_confirmada" : reserva.status === "aguardando_pagamento" ? "aguardando_pagamento" : reserva.status === "contrato_gerado" ? "contrato_validado" : reserva.status);
    return res.json({ reserva_id: reserva.id, status: reserva.status, checkout_estado: checkoutEstado, contrato: documento, pagamento: pagamento ? { id: pagamento.id, status: pagamento.status, gateway_id: pagamento.gateway_id, valor: pagamento.valor, valor_pago_centavos: pagamento.valor_pago_centavos, resposta: pagamento.gateway_resposta } : null });
  } catch (error) {
    console.error("[CONTRATOS] Erro ao consultar estado:", error);
    return res.status(500).json({ erro: "Erro ao consultar estado do checkout" });
  }
});

router.get("/validacao/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const reserva = (await db.select().from(reservas).where(eq(reservas.id, req.params.reserva_id)).limit(1))[0];
    if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    if (reserva.usuario_id !== req.usuario.id && req.usuario.tipo !== "admin") return res.status(403).json({ erro: "Acesso negado" });
    const validacao = (await db.select().from(contratoValidacoes).where(eq(contratoValidacoes.reserva_id, req.params.reserva_id)).orderBy(desc(contratoValidacoes.confirmado_em)).limit(1))[0];
    if (!validacao) return res.status(404).json({ erro: "Validação ainda não registrada" });
    return res.json({ validacao });
  } catch (error) {
    console.error("[CONTRATOS] Erro ao consultar validação:", error);
    return res.status(500).json({ erro: "Erro ao consultar validação" });
  }
});

// Compatibilidade: o endpoint antigo agora apenas prepara uma versão aguardando validação OTP.
router.post("/aceitar/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({ erro: "Não autenticado" });
    }

    const { reserva_id } = req.params;

    // Buscar reserva
    const reservaResult = await db
      .select()
      .from(reservas)
      .where(eq(reservas.id, reserva_id))
      .limit(1);

    if (reservaResult.length === 0) {
      return res.status(404).json({ erro: "Reserva não encontrada" });
    }

    const reserva = reservaResult[0];

    // Verificar se é do usuário
    if (reserva.usuario_id !== req.usuario.id) {
      return res.status(403).json({ erro: "Acesso negado" });
    }

    // Verificar status
    if (reserva.status !== "pacote_montado" && reserva.status !== "checkout_iniciado") {
      return res.status(400).json({ erro: "Reserva não pode aceitar contrato neste status" });
    }

    // O contrato deve registrar a condição selecionada no checkout antes de ser
    // gerado. Não inferimos a modalidade, pois isso poderia produzir um PDF com
    // forma de pagamento diferente daquela aceita pelo cliente.
    const metodoPagamento = req.body?.metodo_pagamento ?? reserva.forma_pagamento;
    const quantidadeParcelas = req.body?.quantidade_parcelas ?? reserva.quantidade_parcelas;
    if (!metodoPagamento) {
      return res.status(400).json({ erro: "Selecione a forma de pagamento antes de aceitar o contrato" });
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
      const dataLimitePagamento = loteResult[0]?.data_embarque || loteResult[0]?.data_inicio;
      const configPagamento = await ConfiguracaoService.obterConfiguracoesPagamento();
      const parcelasMaximasBoleto = ContratoService.calcularParcelasMaximasBoleto(
        dataLimitePagamento,
        new Date(),
        configPagamento.boleto_meses_maximo_antecedencia,
      );

      condicaoPagamento = ContratoService.calcularCondicaoPagamento(
        reserva.valor_total.toString(),
        metodoPagamento,
        quantidadeParcelas,
        parcelasMaximasBoleto,
        {
          percentualDescontoPix: configPagamento.pix_desconto_percentual,
          parcelasMaximasCredito: configPagamento.credito_parcelas_maximo,
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
        checkout_estado: "contrato_preparado",
        atualizado_em: new Date(),
      })
      .where(eq(reservas.id, reserva_id));

    const documento = await ContratoService.prepararContrato(reserva_id);
    res.json({
      mensagem: "Contrato preparado e aguardando validação eletrônica",
      reserva_id,
      status: "aguardando_validacao",
      documento,
      condicao_pagamento: condicaoPagamento,
    });
  } catch (error: any) {
    console.error("[CONTRATOS] Erro ao aceitar:", error);
    res.status(500).json({ erro: error.message || "Erro ao aceitar contrato" });
  }
});

// Baixar contrato
router.get("/download/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({ erro: "Não autenticado" });
    }

    const { reserva_id } = req.params;

    // Buscar reserva
    const reservaResult = await db
      .select()
      .from(reservas)
      .where(eq(reservas.id, reserva_id))
      .limit(1);

    if (reservaResult.length === 0) {
      return res.status(404).json({ erro: "Reserva não encontrada" });
    }

    const reserva = reservaResult[0];

    // Verificar se é do usuário ou admin
    if (reserva.usuario_id !== req.usuario.id && req.usuario.tipo !== "admin") {
      return res.status(403).json({ erro: "Acesso negado" });
    }

    if (!reserva.contrato_pdf_url) {
      return res.status(404).json({ erro: "Contrato não disponível" });
    }

    const caminhoBase = path.resolve(process.env.STORAGE_PATH || "./uploads");
    const caminhoArquivo = path.resolve(reserva.contrato_pdf_url);
    if (caminhoArquivo !== caminhoBase && !caminhoArquivo.startsWith(`${caminhoBase}${path.sep}`)) return res.status(403).json({ erro: "Arquivo contratual inválido" });
    const pdfBuffer = await fs.readFile(caminhoArquivo);

    // Enviar arquivo
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="contrato-${reserva_id}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error("[CONTRATOS] Erro ao baixar:", error);
    res.status(500).json({ erro: "Erro ao baixar contrato" });
  }
});

router.get("/evidencias/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const reserva = (await db.select({ id: reservas.id, usuario_id: reservas.usuario_id }).from(reservas).where(eq(reservas.id, req.params.reserva_id)).limit(1))[0];
    if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    if (reserva.usuario_id !== req.usuario.id && req.usuario.tipo !== "admin") return res.status(403).json({ erro: "Acesso negado" });
    const validacao = (await db.select().from(contratoValidacoes).where(eq(contratoValidacoes.reserva_id, reserva.id)).orderBy(desc(contratoValidacoes.confirmado_em)).limit(1))[0];
    if (!validacao) return res.status(404).json({ erro: "Relatório de evidências não disponível" });
    return res.json({ protocolo: validacao.protocolo, contrato_id: validacao.contrato_id, reserva_id: validacao.reserva_id, versao: validacao.versao, snapshot_sha256: validacao.snapshot_sha256, pdf_sha256: validacao.pdf_sha256, aceite_contrato: validacao.aceite_contrato, aceite_regras: validacao.aceite_regras, aceite_contrato_texto: validacao.aceite_contrato_texto, aceite_regras_texto: validacao.aceite_regras_texto, regras_versao: validacao.regras_versao, aviso_privacidade_versao: validacao.aviso_privacidade_versao, canal: validacao.canal, destinatario_mascarado: validacao.destinatario_mascarado, confirmado_em: validacao.confirmado_em, servidor_utc: validacao.servidor_utc, navegador: validacao.navegador, sistema_operacional: validacao.sistema_operacional, idioma: validacao.idioma, timezone: validacao.timezone, geolocalizacao_consentida: validacao.geolocalizacao_consentida });
  } catch (error) {
    console.error("[CONTRATOS] Erro ao baixar evidências:", error);
    return res.status(500).json({ erro: "Erro ao consultar evidências" });
  }
});

// Voucher de embarque: emitido somente após a confirmação real do pagamento.
router.get("/voucher/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });

    const dados = await db.select({
      reserva_id: reservas.id,
      usuario_id: reservas.usuario_id,
      status: reservas.status,
      valor_total: reservas.valor_total,
      passageiro: usuarios.nome,
      cpf: usuarios.cpf,
      telefone: usuarios.telefone,
      evento: eventos.nome,
      local: eventos.local,
      data_inicio: lotes.data_inicio,
      data_fim: lotes.data_fim,
      data_embarque: lotes.data_embarque,
      data_retorno: lotes.data_retorno,
      local_embarque: lotes.local_embarque,
      lote: lotes.nome,
      pacote: pacotes.nome,
      modalidade: pacotes.modalidade_hospedagem,
    })
      .from(reservas)
      .innerJoin(usuarios, eq(reservas.usuario_id, usuarios.id))
      .innerJoin(lotes, eq(reservas.lote_id, lotes.id))
      .innerJoin(eventos, eq(lotes.evento_id, eventos.id))
      .leftJoin(pacotes, eq(reservas.pacote_id, pacotes.id))
      .where(eq(reservas.id, req.params.reserva_id))
      .limit(1);

    const voucher = dados[0];
    if (!voucher) return res.status(404).json({ erro: "Reserva não encontrada" });
    if (voucher.usuario_id !== req.usuario.id && req.usuario.tipo !== "admin") {
      return res.status(403).json({ erro: "Acesso negado" });
    }
    if (voucher.status !== "cliente_confirmado") {
      return res.status(409).json({ erro: "O voucher será liberado após a confirmação do pagamento" });
    }

    const modalidades: Record<string, string> = {
      camping: "Camping",
      quarto_ventilador: "Quarto com ventilador",
      quarto_ar_condicionado: "Quarto com ar-condicionado",
    };
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #1f2937; }
    .voucher { border: 2px solid #991b1b; border-radius: 18px; overflow: hidden; }
    .topo { padding: 22px 26px; background: #7f1d1d; color: white; }
    .topo p { margin: 0 0 5px; font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
    .topo h1 { margin: 0; font-size: 28px; }
    .conteudo { padding: 26px; }
    .confirmado { display: inline-block; border-radius: 999px; padding: 7px 12px; background: #dcfce7; color: #166534; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .evento { margin: 18px 0 22px; font-size: 24px; color: #7f1d1d; }
    dl { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 24px; margin: 0; }
    dt { margin-bottom: 4px; color: #6b7280; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    dd { margin: 0; font-size: 14px; font-weight: 700; }
    .codigo { margin-top: 24px; border-top: 1px dashed #d1d5db; padding-top: 18px; text-align: center; }
    .codigo strong { display: block; margin-top: 5px; font-family: monospace; font-size: 18px; letter-spacing: .08em; }
    .aviso { margin: 20px 0 0; border-radius: 10px; background: #fff7ed; padding: 12px; color: #7c2d12; font-size: 11px; line-height: 1.5; }
  </style>
</head>
<body>
  <section class="voucher">
    <header class="topo"><p>Documento de embarque</p><h1>Voucher confirmado</h1></header>
    <div class="conteudo">
      <span class="confirmado">Pagamento confirmado</span>
      <h2 class="evento">${escaparHtml(voucher.evento)}</h2>
      <dl>
        <div><dt>Passageiro</dt><dd>${escaparHtml(voucher.passageiro)}</dd></div>
        <div><dt>CPF</dt><dd>${escaparHtml(voucher.cpf || "Não informado")}</dd></div>
        <div><dt>Período</dt><dd>${formatarData(voucher.data_inicio)} a ${formatarData(voucher.data_fim)}</dd></div>
        <div><dt>Destino / local</dt><dd>${escaparHtml(voucher.local)}</dd></div>
        <div><dt>Lote</dt><dd>${escaparHtml(voucher.lote)}</dd></div>
        <div><dt>Hospedagem</dt><dd>${escaparHtml(modalidades[voucher.modalidade || ""] || voucher.pacote || "Conforme contrato")}</dd></div>
        <div><dt>Embarque</dt><dd>${voucher.data_embarque ? formatarDataHora(voucher.data_embarque) : "A confirmar"} · ${escaparHtml(voucher.local_embarque || "Local comunicado pela organização")}</dd></div>
        <div><dt>Retorno</dt><dd>${voucher.data_retorno ? formatarDataHora(voucher.data_retorno) : "A confirmar"}</dd></div>
      </dl>
      <div class="codigo"><span>Código da reserva</span><strong>${escaparHtml(voucher.reserva_id)}</strong></div>
      <p class="aviso">Apresente este voucher e um documento oficial com foto no embarque. Horários e ponto de encontro são comunicados pela equipe responsável.</p>
    </div>
  </section>
</body>
</html>`;

    const pdf = await generateBrandedPdfBuffer(html, { brand: "comitiva" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="voucher-${voucher.reserva_id}.pdf"`);
    res.send(pdf);
  } catch (error: any) {
    console.error("[CONTRATOS] Erro ao gerar voucher:", error);
    res.status(500).json({ erro: "Erro ao gerar voucher" });
  }
});

// Visualizar contrato (HTML)
router.get("/visualizar/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({ erro: "Não autenticado" });
    }

    const { reserva_id } = req.params;

    // Buscar reserva
    const reservaResult = await db
      .select()
      .from(reservas)
      .where(eq(reservas.id, reserva_id))
      .limit(1);

    if (reservaResult.length === 0) {
      return res.status(404).json({ erro: "Reserva não encontrada" });
    }

    const reserva = reservaResult[0];

    // Verificar se é do usuário ou admin
    if (reserva.usuario_id !== req.usuario.id && req.usuario.tipo !== "admin") {
      return res.status(403).json({ erro: "Acesso negado" });
    }

    // Gerar HTML do contrato
    const documento = (await db.select().from(contratosDocumentos).where(eq(contratosDocumentos.reserva_id, reserva_id)).orderBy(desc(contratosDocumentos.versao)).limit(1))[0];
    if (!documento || documento.status === "invalidado") return res.status(404).json({ erro: "Versão contratual não disponível" });
    await ContratoService.marcarVisualizacao(documento.id, reserva_id, req.usuario.id, req.ip || req.socket.remoteAddress, req.get("user-agent"));
    const html = await ContratoService.gerarContratoHTML({ reserva_id, contrato_id: documento.id, snapshot: documento.snapshot as any, aceite_ip: reserva.aceite_ip || "desconhecido" });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error: any) {
    console.error("[CONTRATOS] Erro ao visualizar:", error);
    res.status(500).json({ erro: "Erro ao visualizar contrato" });
  }
});

export default router;
