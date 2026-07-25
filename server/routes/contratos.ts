import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { ContratoService } from "../services/contratoService.js";
import { ConfiguracaoService } from "../services/configuracaoService.js";
import { db } from "../db/index.js";
import { eventos, lotes, pacotes, reservas, usuarios } from "../db/schema.js";
import { eq } from "drizzle-orm";
import fs from "fs/promises";
import { generateBrandedPdfBuffer } from "../../packages/contract-engine/brandedPdfLayout.js";

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

// Aceitar contrato e gerar PDF
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
        atualizado_em: new Date(),
      })
      .where(eq(reservas.id, reserva_id));

    const ip = req.ip || req.socket.remoteAddress || "desconhecido";

    // Registrar aceite e gerar contrato já com os dados persistidos acima.
    await ContratoService.registrarAceiteContrato(reserva_id, ip);

    res.json({
      mensagem: "Contrato aceito e gerado com sucesso",
      reserva_id,
      status: "contrato_gerado",
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

    // Ler arquivo
    const pdfBuffer = await fs.readFile(reserva.contrato_pdf_url);

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
    const html = await ContratoService.gerarContratoHTML({
      reserva_id,
      usuario_id: reserva.usuario_id,
      lote_id: reserva.lote_id,
      aceite_ip: reserva.aceite_ip || "desconhecido",
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error: any) {
    console.error("[CONTRATOS] Erro ao visualizar:", error);
    res.status(500).json({ erro: "Erro ao visualizar contrato" });
  }
});

export default router;
