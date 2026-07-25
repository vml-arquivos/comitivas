import { Router, Request, Response } from "express";
import { authMiddleware, requireRole } from "../middleware/authMiddleware.js";
import { RelatorioService } from "../services/relatorioService.js";
import { EmailService } from "../services/emailService.js";
import { db } from "../db/index.js";
import { reservas, eventos, lotes, usuarios, leads_origem } from "../db/schema.js";
import { eq, and, inArray } from "drizzle-orm";

const router = Router();

// Aplicar middleware de admin em todas as rotas
router.use(authMiddleware);
router.use(requireRole("admin"));

// Dashboard - resumo geral
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    // Total de eventos
    const totalEventos = await db.select().from(eventos);

    // Total de reservas
    const totalReservas = await db.select().from(reservas);

    // Reservas confirmadas
    const reservasConfirmadas = await db
      .select()
      .from(reservas)
      .where(eq(reservas.status, "cliente_confirmado"));

    // Reservas pendentes
    const reservasPendentes = await db
      .select()
      .from(reservas)
      .where(eq(reservas.status, "aguardando_pagamento"));

    // Total de leads/cadastros (inclui quem só se cadastrou e ainda não
    // montou uma reserva — sem isso o dashboard fica cego pra topo de funil)
    const totalLeads = await db.select().from(leads_origem);
    const leadsNovos = totalLeads.filter((l) => l.status === "novo").length;
    const leadsCadastrados = totalLeads.filter((l) => l.status === "cadastrado").length;

    res.json({
      resumo: {
        total_eventos: totalEventos.length,
        total_leads: totalLeads.length,
        leads_novos: leadsNovos,
        leads_cadastrados: leadsCadastrados,
        total_reservas: totalReservas.length,
        reservas_confirmadas: reservasConfirmadas.length,
        reservas_pendentes: reservasPendentes.length,
        taxa_conversao: totalReservas.length > 0
          ? ((reservasConfirmadas.length / totalReservas.length) * 100).toFixed(2)
          : 0,
      },
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro no dashboard:", error);
    res.status(500).json({ erro: "Erro ao carregar dashboard" });
  }
});

// Listar reservas com filtros
router.get("/reservas", async (req: Request, res: Response) => {
  try {
    const { evento_id, status, pagina = "1", limite = "20" } = req.query;

    const condicoes = [];

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
      condicoes.push(eq(reservas.status, status as string));
    }

    let query = db.select().from(reservas);
    if (condicoes.length > 0) {
      query = query.where(and(...condicoes));
    }

    const offset = (parseInt(pagina as string) - 1) * parseInt(limite as string);
    const resultado = await query.limit(parseInt(limite as string)).offset(offset);

    res.json({
      total: resultado.length,
      pagina: parseInt(pagina as string),
      limite: parseInt(limite as string),
      reservas: resultado,
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
    let query = db.select().from(reservas);
    if (loteIds.length > 0) {
      query = query.where(inArray(reservas.lote_id, loteIds));
    }

    const reservasResult = await query;

    // Gerar CSV
    const headers = ["ID", "Usuário", "Email", "Status", "Valor Total", "Data Criação"];
    const rows = [];

    for (const reserva of reservasResult) {
      const usuario = await db
        .select()
        .from(usuarios)
        .where(eq(usuarios.id, reserva.usuario_id))
        .limit(1);

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

export default router;
