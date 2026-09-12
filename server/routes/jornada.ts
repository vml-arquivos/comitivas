import { Router, Request, Response } from "express";
import { authMiddleware, requireRole, isAdminOrDev } from "../middleware/authMiddleware.js";
import { db } from "../db/index.js";
import { auditoriaAdmin, leads_origem, pacotes, reservas, usuarios } from "../db/schema.js";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { AuthService } from "../services/authService.js";

const router = Router();

// Gerar link de rastreio para vendedor
router.post("/gerar-link", authMiddleware, requireRole("vendedor", "admin"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({ erro: "Não autenticado" });
    }

    const { evento_id } = req.body;
    const vendedorId = req.usuario.tipo === "vendedor" ? req.usuario.id : String(req.body?.vendedor_id || req.usuario.id);
    const vendedor = (await db.select({ id: usuarios.id, tipo: usuarios.tipo, ativo: usuarios.ativo }).from(usuarios).where(eq(usuarios.id, vendedorId)).limit(1))[0];
    if (!vendedor || vendedor.tipo !== "vendedor" || vendedor.ativo === false) return res.status(400).json({ erro: "Selecione um vendedor ativo para gerar o link" });

    // O token assinado identifica o vendedor sem expor um id manipulável e é
    // reutilizável por clientes diferentes. Cada acesso/cadastro cria seu
    // próprio lead; o link nunca representa um lead compartilhado.
    const codigo_origem = AuthService.generateSellerReferralToken(vendedorId);

    // Gerar URL de rastreio
    const baseUrl = (process.env.WEB_URL || "http://localhost:5173").replace(/\/$/, "");
    const urlRastreio = `${baseUrl}/?ref=${encodeURIComponent(codigo_origem)}`;

    res.json({
      codigo_origem,
      url_rastreio: urlRastreio,
      evento_id: evento_id || null,
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

    const registros = isAdminOrDev(req.usuario.tipo)
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
          tipo: usuarios.tipo,
        }).from(usuarios).where(and(eq(usuarios.id, lead.usuario_id), eq(usuarios.tipo, "cliente"))).limit(1)
        : [];

      if (lead.usuario_id && !usuario[0]) return null;

      const ultimaReserva = lead.usuario_id
        ? await db.select({
          id: reservas.id,
          status: reservas.status,
          valor_total: reservas.valor_total,
          atualizado_em: reservas.atualizado_em,
        }).from(reservas)
          .where(isAdminOrDev(req.usuario!.tipo)
            ? eq(reservas.usuario_id, lead.usuario_id)
            : and(eq(reservas.usuario_id, lead.usuario_id), eq(reservas.vendedor_id, req.usuario!.id)))
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
      const status = lead.status === "lead_frio"
        ? "lead_frio"
        : statusReserva === "cliente_confirmado"
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
        observacoes: lead.observacoes || "",
        proximo_contato_em: lead.proximo_contato_em,
        criado_em: lead.criado_em,
        atualizado_em: lead.atualizado_em,
      };
    }));

    const leadsVisiveis = leads.filter((lead): lead is NonNullable<typeof lead> => lead !== null);
    res.json({ total: leadsVisiveis.length, leads: leadsVisiveis });
  } catch (error: any) {
    console.error("[JORNADA] Erro ao listar leads:", error);
    res.status(500).json({ erro: "Erro ao carregar a esteira comercial" });
  }
});

// Registrar acompanhamento comercial sem alterar reserva ou pagamento.
router.patch("/leads/:lead_id", authMiddleware, requireRole("admin", "vendedor"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });

    const { lead_id } = req.params;
    const observacoes = req.body?.observacoes !== undefined
      ? String(req.body.observacoes).trim()
      : undefined;
    const statusPermitidos = new Set(["novo", "interessado", "visitante", "cadastrado", "pacote_montado", "checkout_iniciado", "aguardando_pagamento", "cliente_confirmado", "contrato_gerado", "abandonado", "lead_frio"]);
    const status = req.body?.status !== undefined ? String(req.body.status).trim() : undefined;
    if (status !== undefined && !statusPermitidos.has(status)) return res.status(400).json({ erro: "Etapa comercial inválida" });
    if (observacoes !== undefined && observacoes.length > 4000) {
      return res.status(400).json({ erro: "As observações devem ter no máximo 4.000 caracteres" });
    }

    let proximoContato: Date | null | undefined;
    if (req.body?.proximo_contato_em !== undefined) {
      if (!req.body.proximo_contato_em) {
        proximoContato = null;
      } else {
        proximoContato = new Date(req.body.proximo_contato_em);
        if (Number.isNaN(proximoContato.getTime())) {
          return res.status(400).json({ erro: "Data do próximo contato inválida" });
        }
      }
    }

    const condicao = isAdminOrDev(req.usuario.tipo)
      ? eq(leads_origem.id, lead_id)
      : and(eq(leads_origem.id, lead_id), eq(leads_origem.vendedor_id, req.usuario.id));
    const atualizado = await db.update(leads_origem).set({
      observacoes,
      proximo_contato_em: proximoContato,
      status,
      atualizado_em: new Date(),
    }).where(condicao).returning({
      id: leads_origem.id,
      observacoes: leads_origem.observacoes,
      proximo_contato_em: leads_origem.proximo_contato_em,
      status: leads_origem.status,
      atualizado_em: leads_origem.atualizado_em,
    });

    if (!atualizado[0]) {
      return res.status(404).json({ erro: "Contato não encontrado na sua carteira" });
    }

    res.json({ mensagem: "Acompanhamento salvo", lead: atualizado[0] });
  } catch (error: any) {
    console.error("[JORNADA] Erro ao atualizar acompanhamento:", error);
    res.status(500).json({ erro: "Erro ao salvar acompanhamento" });
  }
});

router.delete("/leads/:lead_id", authMiddleware, requireRole("admin", "vendedor"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const condicao = isAdminOrDev(req.usuario.tipo)
      ? eq(leads_origem.id, req.params.lead_id)
      : and(eq(leads_origem.id, req.params.lead_id), eq(leads_origem.vendedor_id, req.usuario.id));
    const lead = (await db.select().from(leads_origem).where(condicao).limit(1))[0];
    if (!lead) return res.status(404).json({ erro: "Contato não encontrado na sua carteira" });
    const possuiReserva = lead.usuario_id
      ? (await db.select({ id: reservas.id }).from(reservas).where(eq(reservas.usuario_id, lead.usuario_id)).limit(1))[0]
      : null;
    if (possuiReserva) return res.status(409).json({ erro: "Este contato já possui reserva; exclua a reserva incompleta antes de remover o lead" });
    await db.transaction(async (tx) => {
      await tx.insert(auditoriaAdmin).values({
        id: createId(), ator_id: req.usuario!.id, ator_tipo: req.usuario!.tipo,
        acao: "lead_excluido", entidade: "lead", entidade_id: lead.id,
        antes: { nome: lead.nome, email: lead.email, whatsapp: lead.whatsapp, status: lead.status },
        depois: { motivo: "exclusao_manual_do_crm" }, ip: req.ip || null,
        user_agent: req.get("user-agent") || null, criado_em: new Date(),
      });
      await tx.delete(leads_origem).where(eq(leads_origem.id, lead.id));
    });
    return res.json({ mensagem: "Lead excluído" });
  } catch (error: any) {
    console.error("[JORNADA] Erro ao excluir lead:", error);
    return res.status(409).json({ erro: error.message || "Não foi possível excluir o lead" });
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

    const vendedorToken = AuthService.verifySellerReferralToken(String(codigo_origem));
    if (vendedorToken) {
      const vendedor = (await db.select({ id: usuarios.id }).from(usuarios)
        .where(and(eq(usuarios.id, vendedorToken), eq(usuarios.tipo, "vendedor"), eq(usuarios.ativo, true)))
        .limit(1))[0];
      if (!vendedor) return res.status(404).json({ erro: "Link de vendedor inválido ou inativo" });

      const existente = (await db.select({ id: leads_origem.id, vendedor_id: leads_origem.vendedor_id })
        .from(leads_origem)
        .where(eq(leads_origem.usuario_id, usuarioId))
        .orderBy(desc(sql`${leads_origem.vendedor_id} IS NOT NULL`), desc(leads_origem.atualizado_em))
        .limit(1))[0];
      if (existente) {
        await db.update(leads_origem).set({
          vendedor_id: existente.vendedor_id || vendedor.id,
          status: "cadastrado",
          atualizado_em: new Date(),
        }).where(eq(leads_origem.id, existente.id));
        return res.json({ mensagem: "Origem registrada com sucesso", lead_id: existente.id });
      }

      const novo = (await db.insert(leads_origem).values({
        id: createId(),
        codigo_origem: `ref-${createId()}`,
        vendedor_id: vendedor.id,
        usuario_id: usuarioId,
        origem: "link_vendedor",
        status: "cadastrado",
        dados_contexto: { origem: "link_vendedor" },
        atualizado_em: new Date(),
      }).returning({ id: leads_origem.id }))[0];
      return res.json({ mensagem: "Origem registrada com sucesso", lead_id: novo.id });
    }

    // Compatibilidade com links legados já enviados antes dos tokens assinados.
    const leadResult = await db
      .select()
      .from(leads_origem)
      .where(eq(leads_origem.codigo_origem, codigo_origem))
      .limit(1);

    if (leadResult.length === 0) {
      return res.status(404).json({ erro: "Link de rastreio inválido" });
    }

    // Atualizar com usuario_id
    const atualizado = await db
      .update(leads_origem)
      .set({ usuario_id: usuarioId, status: "cadastrado", atualizado_em: new Date() })
      .where(and(eq(leads_origem.id, leadResult[0].id), isNull(leads_origem.usuario_id)))
      .returning({ id: leads_origem.id });

    if (!atualizado[0] && leadResult[0].usuario_id !== usuarioId) {
      return res.status(409).json({ erro: "Este link já foi vinculado a outro cadastro" });
    }

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

    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const usuario = (await db.select().from(usuarios).where(and(eq(usuarios.id, usuario_id), eq(usuarios.tipo, "cliente"))).limit(1))[0];
    if (!usuario) return res.status(404).json({ erro: "Cliente não encontrado" });

    // A jornada comercial só pode ser consultada pelo admin ou pelo vendedor
    // responsável pela origem vinculada ao cliente. O filtro é aplicado no
    // banco para impedir acesso por manipulação direta do endpoint.
    const filtroOrigem = isAdminOrDev(req.usuario.tipo)
      ? eq(leads_origem.usuario_id, usuario_id)
      : and(
        eq(leads_origem.usuario_id, usuario_id),
        eq(leads_origem.vendedor_id, req.usuario.id),
      );

    const leadResult = await db
      .select()
      .from(leads_origem)
      .where(filtroOrigem)
      .limit(1);

    if (!isAdminOrDev(req.usuario.tipo) && leadResult.length === 0) {
      return res.status(404).json({ erro: "Usuário não encontrado na sua carteira" });
    }

    // Buscar reservas
    const reservasResult = await db
      .select()
      .from(reservas)
      .where(isAdminOrDev(req.usuario.tipo)
        ? eq(reservas.usuario_id, usuario_id)
        : and(eq(reservas.usuario_id, usuario_id), eq(reservas.vendedor_id, req.usuario.id)));

    const lead = leadResult[0];

    // Calcular status da jornada
    let statusJornada = "visitante";
    if (usuario.ativo) {
      if (reservasResult.length === 0) {
        statusJornada = "cadastrado";
      } else {
        const ultimaReserva = reservasResult[reservasResult.length - 1];
        statusJornada = ultimaReserva.status || "visitante";
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
          .where(and(eq(usuarios.id, lead.usuario_id), eq(usuarios.tipo, "cliente")))
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

        if (vendedorResult[0]?.tipo === "vendedor") {
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
