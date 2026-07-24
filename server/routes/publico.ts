import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import { eventos, lotes, fotos_evento, avaliacoes, reservas } from "../db/schema.js";
import { eq, and, gt, lt, desc, sql } from "drizzle-orm";

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

    res.json({
      clientesConfirmados: Number(clientesConfirmados) || 0,
      excursoesRealizadas: Number(excursoesRealizadas) || 0,
      notaMedia: media ? Number(Number(media).toFixed(1)) : null,
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

    let query = db
      .select()
      .from(avaliacoes)
      .where(eq(avaliacoes.aprovado, true));

    if (evento_id) {
      query = db
        .select()
        .from(avaliacoes)
        .where(and(
          eq(avaliacoes.evento_id, evento_id as string),
          eq(avaliacoes.aprovado, true)
        ));
    }

    const avaliacoesAprovadas = await query.orderBy(desc(avaliacoes.criado_em));

    res.json({ avaliacoes: avaliacoesAprovadas });
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
