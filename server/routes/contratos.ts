import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { ContratoService } from "../services/contratoService.js";
import { db } from "../db/index.js";
import { reservas } from "../db/schema.js";
import { eq } from "drizzle-orm";
import fs from "fs/promises";

const router = Router();

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

    const ip = req.ip || req.socket.remoteAddress || "desconhecido";

    // Registrar aceite e gerar contrato
    await ContratoService.registrarAceiteContrato(reserva_id, ip);

    res.json({
      mensagem: "Contrato aceito e gerado com sucesso",
      reserva_id,
      status: "contrato_gerado",
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
