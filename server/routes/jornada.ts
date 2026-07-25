import { Router, Request, Response } from "express";
import { authMiddleware, requireRole } from "../middleware/authMiddleware.js";
import { db } from "../db/index.js";
import { leads_origem, pacotes, reservas, usuarios } from "../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

const router = Router();

// Gerar link de rastreio para vendedor
router.post("/gerar-link", authMiddleware, requireRole("vendedor", "admin"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({ erro: "Não autenticado" });
    }

    const { evento_id } = req.body;

    // Gerar código único
    const codigo_origem = `${req.usuario.id}-${createId()}`;

    // Salvar lead_origem
    const lead = await db
      .insert(leads_origem)
      .values({
        codigo_origem,
        vendedor_id: req.usuario.id,
        evento_id: evento_id || null,
        origem: "link_vendedor",
        status: "novo",
        atualizado_em: new Date(),
      })
      .returning();

    // Gerar URL de rastreio
    const urlRastreio = `${process.env.WEB_URL}?ref=${codigo_origem}`;

    res.json({
      codigo_origem,
      url_rastreio: urlRastreio,
      lead_id: lead[0].id,
    });
  } catch (error: any) {
    console.error("[JORNADA] Erro ao gerar link:", error);
    res.status(500).json({ erro: "Erro ao gerar link de rastreio" });
  }
});

// Listar leads reais para o Kanban do CRM.
router.get("/leads", authMiddleware, requireRole("admin", "vendedor"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });

    const registros = req.usuario.tipo === "admin"
      ? await db.select().from(leads_origem).orderBy(desc(leads_origem.atualizado_em))
      : await db.select().from(leads_origem)
        .where(eq(leads_origem.vendedor_id, req.usuario.id))
        .orderBy(desc(leads_origem.atualizado_em));

    const leads = await Promise.all(registros.map(async (lead) => {
      const usuario = lead.usuario_id
        ? await db.select({
          nome: usuarios.nome,
          email: usuarios.email,
          telefone: usuarios.telefone,
        }).from(usuarios).where(eq(usuarios.id, lead.usuario_id)).limit(1)
        : [];

      const ultimaReserva = lead.usuario_id
        ? await db.select({
          id: reservas.id,
          status: reservas.status,
          valor_total: reservas.valor_total,
          atualizado_em: reservas.atualizado_em,
        }).from(reservas)
          .where(eq(reservas.usuario_id, lead.usuario_id))
          .orderBy(desc(reservas.atualizado_em))
          .limit(1)
        : [];

      const pacote = lead.pacote_id
        ? await db.select({
          nome: pacotes.nome,
          modalidade_hospedagem: pacotes.modalidade_hospedagem,
        }).from(pacotes).where(eq(pacotes.id, lead.pacote_id)).limit(1)
        : [];

      const statusReserva = ultimaReserva[0]?.status;
      const status = statusReserva === "cliente_confirmado"
        ? "cliente_confirmado"
        : statusReserva === "aguardando_pagamento"
          ? "aguardando_pagamento"
          : statusReserva === "checkout_iniciado" || statusReserva === "pacote_montado"
            ? "checkout_iniciado"
            : lead.status || (lead.usuario_id ? "cadastrado" : "novo");

      return {
        id: lead.id,
        nome: lead.nome || usuario[0]?.nome || "Contato sem nome",
        whatsapp: lead.whatsapp || usuario[0]?.telefone || null,
        email: lead.email || usuario[0]?.email || null,
        origem: lead.origem || "site",
        status,
        pacote_nome: pacote[0]?.nome || null,
        modalidade_hospedagem: pacote[0]?.modalidade_hospedagem || null,
        reserva: ultimaReserva[0] || null,
        criado_em: lead.criado_em,
        atualizado_em: lead.atualizado_em,
      };
    }));

    res.json({ total: leads.length, leads });
  } catch (error: any) {
    console.error("[JORNADA] Erro ao listar leads:", error);
    res.status(500).json({ erro: "Erro ao carregar a esteira comercial" });
  }
});

// Vincular uma origem ao próprio usuário autenticado. O id do cliente nunca
// é aceito do corpo para impedir que terceiros alterem atribuições comerciais.
router.post("/registrar-origem", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { codigo_origem } = req.body;
    const usuarioId = req.usuario?.id;

    if (!codigo_origem || !usuarioId) {
      return res.status(400).json({ erro: "codigo_origem é obrigatório" });
    }

    // Buscar lead_origem
    const leadResult = await db
      .select()
      .from(leads_origem)
      .where(eq(leads_origem.codigo_origem, codigo_origem))
      .limit(1);

    if (leadResult.length === 0) {
      return res.status(404).json({ erro: "Link de rastreio inválido" });
    }

    // Atualizar com usuario_id
    await db
      .update(leads_origem)
      .set({ usuario_id: usuarioId, status: "cadastrado", atualizado_em: new Date() })
      .where(eq(leads_origem.id, leadResult[0].id));

    res.json({
      mensagem: "Origem registrada com sucesso",
      lead_id: leadResult[0].id,
    });
  } catch (error: any) {
    console.error("[JORNADA] Erro ao registrar origem:", error);
    res.status(500).json({ erro: "Erro ao registrar origem" });
  }
});

// Listar jornada do cliente (admin/vendedor)
router.get("/cliente/:usuario_id", authMiddleware, requireRole("admin", "vendedor"), async (req: Request, res: Response) => {
  try {
    const { usuario_id } = req.params;

    // Buscar origem
    const leadResult = await db
      .select()
      .from(leads_origem)
      .where(eq(leads_origem.usuario_id, usuario_id))
      .limit(1);

    // Buscar reservas
    const reservasResult = await db
      .select()
      .from(reservas)
      .where(eq(reservas.usuario_id, usuario_id));

    // Buscar usuário
    const usuarioResult = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, usuario_id))
      .limit(1);

    if (usuarioResult.length === 0) {
      return res.status(404).json({ erro: "Usuário não encontrado" });
    }

    const usuario = usuarioResult[0];
    const lead = leadResult[0];

    // Calcular status da jornada
    let statusJornada = "visitante";
    if (usuario.ativo) {
      if (reservasResult.length === 0) {
        statusJornada = "cadastrado";
      } else {
        const ultimaReserva = reservasResult[reservasResult.length - 1];
        statusJornada = ultimaReserva.status;
      }
    }

    res.json({
      usuario_id,
      usuario: {
        nome: usuario.nome,
        email: usuario.email,
        criado_em: usuario.criado_em,
      },
      origem: lead ? {
        codigo_origem: lead.codigo_origem,
        vendedor_id: lead.vendedor_id,
        criado_em: lead.criado_em,
      } : null,
      status_jornada: statusJornada,
      total_reservas: reservasResult.length,
      reservas: reservasResult.map((r) => ({
        id: r.id,
        status: r.status,
        valor_total: r.valor_total,
        criado_em: r.criado_em,
        atualizado_em: r.atualizado_em,
      })),
    });
  } catch (error: any) {
    console.error("[JORNADA] Erro ao listar jornada:", error);
    res.status(500).json({ erro: "Erro ao listar jornada" });
  }
});

// Listar clientes do vendedor (vendedor/admin)
router.get("/vendedor/clientes", authMiddleware, requireRole("vendedor", "admin"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({ erro: "Não autenticado" });
    }

    // Buscar leads do vendedor
    const leadsResult = await db
      .select()
      .from(leads_origem)
      .where(eq(leads_origem.vendedor_id, req.usuario.id));

    const clientes = [];

    for (const lead of leadsResult) {
      if (lead.usuario_id) {
        const usuarioResult = await db
          .select()
          .from(usuarios)
          .where(eq(usuarios.id, lead.usuario_id))
          .limit(1);

        if (usuarioResult.length > 0) {
          const usuario = usuarioResult[0];

          // Buscar última reserva
          const ultimaReservaResult = await db
            .select()
            .from(reservas)
            .where(eq(reservas.usuario_id, lead.usuario_id))
            .limit(1);

          clientes.push({
            usuario_id: usuario.id,
            nome: usuario.nome,
            email: usuario.email,
            status: ultimaReservaResult.length > 0 ? ultimaReservaResult[0].status : "cadastrado",
            criado_em: lead.criado_em,
          });
        }
      }
    }

    res.json({
      vendedor_id: req.usuario.id,
      total_clientes: clientes.length,
      clientes,
    });
  } catch (error: any) {
    console.error("[JORNADA] Erro ao listar clientes:", error);
    res.status(500).json({ erro: "Erro ao listar clientes" });
  }
});

// Ranking de vendedores (admin)
router.get("/admin/ranking", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    // Buscar todos os leads
    const leadsResult = await db.select().from(leads_origem);

    const vendedoresMap = new Map<string, { nome: string; total_leads: number; clientes_confirmados: number }>();

    for (const lead of leadsResult) {
      if (lead.vendedor_id) {
        const vendedorResult = await db
          .select()
          .from(usuarios)
          .where(eq(usuarios.id, lead.vendedor_id))
          .limit(1);

        if (vendedorResult.length > 0) {
          const vendedor = vendedorResult[0];
          const chave = vendedor.id;

          if (!vendedoresMap.has(chave)) {
            vendedoresMap.set(chave, {
              nome: vendedor.nome,
              total_leads: 0,
              clientes_confirmados: 0,
            });
          }

          const stats = vendedoresMap.get(chave)!;
          stats.total_leads++;

          // Verificar se cliente confirmou
          if (lead.usuario_id) {
            const reservasConfirmadas = await db
              .select()
              .from(reservas)
              .where(
                and(
                  eq(reservas.usuario_id, lead.usuario_id),
                  eq(reservas.status, "cliente_confirmado")
                )
              );

            if (reservasConfirmadas.length > 0) {
              stats.clientes_confirmados++;
            }
          }
        }
      }
    }

    // Converter para array e ordenar
    const ranking = Array.from(vendedoresMap.entries())
      .map(([vendedor_id, stats]) => ({
        vendedor_id,
        nome: stats.nome,
        total_leads: stats.total_leads,
        clientes_confirmados: stats.clientes_confirmados,
        taxa_conversao: stats.total_leads > 0
          ? ((stats.clientes_confirmados / stats.total_leads) * 100).toFixed(2)
          : 0,
      }))
      .sort((a, b) => b.clientes_confirmados - a.clientes_confirmados);

    res.json({
      total_vendedores: ranking.length,
      ranking,
    });
  } catch (error: any) {
    console.error("[JORNADA] Erro ao gerar ranking:", error);
    res.status(500).json({ erro: "Erro ao gerar ranking" });
  }
});

export default router;
