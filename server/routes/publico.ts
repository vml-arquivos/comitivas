import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import { eventos, lotes, pacotes, fotos_evento, avaliacoes, reservas, leads_origem, usuarios } from "../db/schema.js";
import { eq, and, gt, lt, desc, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

const router = Router();

// GET /api/publico/stats - Números reais para prova social da landing page
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const agora = new Date();

    const [{ count: clientesConfirmados }] = await db
      .select({ count: sql<number>`count(distinct ${reservas.usuario_id})` })
      .from(reservas)
      .where(eq(reservas.status, "cliente_confirmado"));

    const [{ count: excursoesRealizadas }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(eventos)
      .where(lt(eventos.data_fim, agora));

    const [{ media }] = await db
      .select({ media: sql<number>`coalesce(avg(${avaliacoes.nota}), 0)` })
      .from(avaliacoes)
      .where(eq(avaliacoes.aprovado, true));

    const notaNumerica = Number(media);
    res.json({
      clientesConfirmados: Number(clientesConfirmados) || 0,
      excursoesRealizadas: Number(excursoesRealizadas) || 0,
      notaMedia: Number.isFinite(notaNumerica) && notaNumerica > 0
        ? Number(notaNumerica.toFixed(1))
        : null,
    });
  } catch (error: any) {
    console.error("[PUBLICO] Erro ao calcular estatísticas:", error);
    res.status(500).json({ erro: "Erro ao calcular estatísticas" });
  }
});

// GET /api/publico/eventos-ativos - Eventos abertos para reserva
router.get("/eventos-ativos", async (req: Request, res: Response) => {
  try {
    const agora = new Date();
    const eventosAtivos = await db
      .select()
      .from(eventos)
      .where(and(
        eq(eventos.ativo, true),
        gt(eventos.data_fim, agora)
      ))
      .orderBy(eventos.data_inicio);

    res.json({ eventos: eventosAtivos });
  } catch (error: any) {
    console.error("[PUBLICO] Erro ao listar eventos ativos:", error);
    res.status(500).json({ erro: "Erro ao listar eventos" });
  }
});

// GET /api/publico/ofertas - vitrine sem preços para navegação livre.
// Os valores só são retornados no configurador, depois que o visitante abre
// uma oferta específica e escolhe a modalidade.
router.get("/ofertas", async (_req: Request, res: Response) => {
  try {
    const agora = new Date();
    const eventosAtivos = await db
      .select()
      .from(eventos)
      .where(and(eq(eventos.ativo, true), gt(eventos.data_fim, agora)))
      .orderBy(eventos.data_inicio);

    const ofertas = await Promise.all(eventosAtivos.map(async (evento) => {
      const lotesAtivos = await db
        .select({
          id: lotes.id,
          nome: lotes.nome,
          descricao: lotes.descricao,
          vagas_totais: lotes.vagas_totais,
          vagas_disponiveis: lotes.vagas_disponíveis,
          data_inicio: lotes.data_inicio,
          data_fim: lotes.data_fim,
        })
        .from(lotes)
        .where(and(eq(lotes.evento_id, evento.id), eq(lotes.ativo, true)))
        .orderBy(lotes.data_inicio);

      const lotesComModalidades = await Promise.all(lotesAtivos.map(async (lote) => {
        const modalidades = await db
          .select({
            id: pacotes.id,
            nome: pacotes.nome,
            descricao: pacotes.descricao,
            modalidade_hospedagem: pacotes.modalidade_hospedagem,
            disponibilidade: pacotes.disponibilidade,
          })
          .from(pacotes)
          .where(and(eq(pacotes.lote_id, lote.id), eq(pacotes.ativo, true)));

        return {
          ...lote,
          vagas_disponiveis: Number(lote.vagas_disponiveis),
          vagas_totais: Number(lote.vagas_totais),
          modalidades,
        };
      }));

      return { ...evento, lotes: lotesComModalidades };
    }));

    res.json({ eventos: ofertas });
  } catch (error: any) {
    console.error("[PUBLICO] Erro ao montar vitrine de ofertas:", error);
    res.status(500).json({ erro: "Não foi possível carregar as excursões disponíveis" });
  }
});

// POST /api/publico/leads - captura consentida para a esteira comercial.
router.post("/leads", async (req: Request, res: Response) => {
  try {
    const nome = String(req.body.nome || "").trim();
    const whatsapp = String(req.body.whatsapp || "").replace(/\D/g, "");
    const email = req.body.email ? String(req.body.email).trim().toLowerCase() : null;
    const origem = String(req.body.origem || "site").trim().slice(0, 80);
    const codigoOrigem = req.body.codigo_origem ? String(req.body.codigo_origem).trim() : "";
    const consentimento = req.body.consentimento_whatsapp === true;

    if (nome.length < 2) {
      return res.status(400).json({ erro: "Informe seu nome para continuar" });
    }
    if (whatsapp.length < 10 || whatsapp.length > 13) {
      return res.status(400).json({ erro: "Informe um WhatsApp válido com DDD" });
    }
    if (!consentimento) {
      return res.status(400).json({ erro: "É necessário autorizar o contato pelo WhatsApp" });
    }

    const contexto = {
      pacote_interesse: req.body.pacote_interesse || null,
      pagina: req.body.pagina || null,
      campanha: req.body.campanha || null,
    };

    let leadExistente = codigoOrigem
      ? await db.select().from(leads_origem)
        .where(eq(leads_origem.codigo_origem, codigoOrigem))
        .orderBy(desc(leads_origem.criado_em))
        .limit(1)
      : [];

    if (leadExistente.length === 0) {
      leadExistente = await db.select().from(leads_origem)
        .where(eq(leads_origem.whatsapp, whatsapp))
        .orderBy(desc(leads_origem.criado_em))
        .limit(1);
    }

    const lead = leadExistente[0]
      ? await db.update(leads_origem).set({
        nome,
        whatsapp,
        email,
        origem,
        status: leadExistente[0].status === "cliente_confirmado" ? "cliente_confirmado" : "interessado",
        consentimento_whatsapp: true,
        dados_contexto: contexto,
        atualizado_em: new Date(),
      }).where(eq(leads_origem.id, leadExistente[0].id)).returning()
      : await db.insert(leads_origem).values({
        id: createId(),
        codigo_origem: `captura-${createId()}`,
        nome,
        whatsapp,
        email,
        origem,
        status: "interessado",
        consentimento_whatsapp: true,
        dados_contexto: contexto,
        atualizado_em: new Date(),
      }).returning();

    res.status(201).json({
      mensagem: "Contato registrado. Nossa equipe já pode acompanhar seu interesse.",
      lead_id: lead[0].id,
    });
  } catch (error: any) {
    console.error("[PUBLICO] Erro ao captar lead:", error);
    res.status(500).json({ erro: "Não foi possível registrar seu contato agora" });
  }
});

// PATCH /api/publico/leads/:lead_id/intencao - persiste a escolha feita antes
// do login, sem expor dados pessoais na resposta.
router.patch("/leads/:lead_id/intencao", async (req: Request, res: Response) => {
  try {
    const { lote_id, pacote_id, status } = req.body;
    const statusPermitidos = ["interessado", "checkout_iniciado", "abandonado"];
    const proximoStatus = statusPermitidos.includes(status) ? status : "interessado";

    if (!lote_id || !pacote_id) {
      return res.status(400).json({ erro: "Lote e pacote são obrigatórios" });
    }

    const pacote = await db.select({ id: pacotes.id })
      .from(pacotes)
      .where(and(eq(pacotes.id, pacote_id), eq(pacotes.lote_id, lote_id), eq(pacotes.ativo, true)))
      .limit(1);
    if (pacote.length === 0) {
      return res.status(404).json({ erro: "Pacote não encontrado" });
    }

    const atualizado = await db.update(leads_origem).set({
      lote_id,
      pacote_id,
      status: proximoStatus,
      atualizado_em: new Date(),
    }).where(eq(leads_origem.id, req.params.lead_id)).returning({ id: leads_origem.id });

    if (atualizado.length === 0) {
      return res.status(404).json({ erro: "Lead não encontrado" });
    }
    res.json({ mensagem: "Intenção registrada" });
  } catch (error: any) {
    console.error("[PUBLICO] Erro ao registrar intenção:", error);
    res.status(500).json({ erro: "Não foi possível registrar a intenção" });
  }
});

// GET /api/publico/eventos-realizados - Histórico de excursões já feitas
router.get("/eventos-realizados", async (req: Request, res: Response) => {
  try {
    const agora = new Date();
    const eventosRealizados = await db
      .select()
      .from(eventos)
      .where(lt(eventos.data_fim, agora))
      .orderBy(desc(eventos.data_fim));

    // Para cada evento, buscar fotos e avaliações aprovadas
    const eventosComDados = await Promise.all(
      eventosRealizados.map(async (evento) => {
        const fotos = await db
          .select()
          .from(fotos_evento)
          .where(eq(fotos_evento.evento_id, evento.id))
          .orderBy(fotos_evento.ordem);

        const avaliacoesAprovadas = await db
          .select()
          .from(avaliacoes)
          .where(and(
            eq(avaliacoes.evento_id, evento.id),
            eq(avaliacoes.aprovado, true)
          ))
          .orderBy(desc(avaliacoes.criado_em));

        return {
          ...evento,
          fotos,
          avaliacoes: avaliacoesAprovadas,
        };
      })
    );

    res.json({ eventos: eventosComDados });
  } catch (error: any) {
    console.error("[PUBLICO] Erro ao listar eventos realizados:", error);
    res.status(500).json({ erro: "Erro ao listar eventos" });
  }
});

// GET /api/publico/avaliacoes - Avaliações aprovadas com filtro por evento
router.get("/avaliacoes", async (req: Request, res: Response) => {
  try {
    const { evento_id } = req.query;
    const filtro = evento_id
      ? and(eq(avaliacoes.evento_id, evento_id as string), eq(avaliacoes.aprovado, true))
      : eq(avaliacoes.aprovado, true);

    const avaliacoesAprovadas = await db
      .select({
        id: avaliacoes.id,
        evento_id: avaliacoes.evento_id,
        nota: avaliacoes.nota,
        comentario: avaliacoes.comentario,
        criado_em: avaliacoes.criado_em,
        usuario_nome: usuarios.nome,
      })
      .from(avaliacoes)
      .leftJoin(usuarios, eq(avaliacoes.usuario_id, usuarios.id))
      .where(filtro)
      .orderBy(desc(avaliacoes.criado_em));

    res.json({
      avaliacoes: avaliacoesAprovadas.map(({ usuario_nome, ...avaliacao }) => ({
        ...avaliacao,
        usuario: usuario_nome ? { nome: usuario_nome } : null,
      })),
    });
  } catch (error: any) {
    console.error("[PUBLICO] Erro ao listar avaliações:", error);
    res.status(500).json({ erro: "Erro ao listar avaliações" });
  }
});

// GET /api/publico/fotos/:evento_id - Fotos de um evento
router.get("/fotos/:evento_id", async (req: Request, res: Response) => {
  try {
    const { evento_id } = req.params;

    const fotos = await db
      .select()
      .from(fotos_evento)
      .where(eq(fotos_evento.evento_id, evento_id))
      .orderBy(fotos_evento.ordem);

    res.json({ fotos });
  } catch (error: any) {
    console.error("[PUBLICO] Erro ao listar fotos:", error);
    res.status(500).json({ erro: "Erro ao listar fotos" });
  }
});

export default router;
