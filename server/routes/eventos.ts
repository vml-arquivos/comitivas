import { Router, Request, Response } from "express";
import { authMiddleware, requireRole } from "../middleware/authMiddleware.js";
import { db } from "../db/index.js";
import { eventos, fotos_evento, lotes } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

const router = Router();

// Listar todos os eventos (público)
router.get("/", async (req: Request, res: Response) => {
  try {
    const eventosList = await db.select().from(eventos);
    res.json({ eventos: eventosList });
  } catch (error: any) {
    console.error("[EVENTOS] Erro ao listar:", error);
    res.status(500).json({ erro: "Erro ao listar eventos" });
  }
});

// Obter evento por ID (público)
router.get("/:evento_id", async (req: Request, res: Response) => {
  try {
    const { evento_id } = req.params;
    const evento = await db
      .select()
      .from(eventos)
      .where(eq(eventos.id, evento_id))
      .limit(1);

    if (evento.length === 0) {
      return res.status(404).json({ erro: "Evento não encontrado" });
    }

    res.json({ evento: evento[0] });
  } catch (error: any) {
    console.error("[EVENTOS] Erro ao obter:", error);
    res.status(500).json({ erro: "Erro ao obter evento" });
  }
});

// Fotos vinculadas ao evento, exibidas na História e na Galeria pública.
router.get("/:evento_id/fotos", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const fotos = await db.select()
      .from(fotos_evento)
      .where(eq(fotos_evento.evento_id, req.params.evento_id))
      .orderBy(fotos_evento.ordem);
    res.json({ fotos });
  } catch (error) {
    console.error("[EVENTOS] Erro ao listar fotos:", error);
    res.status(500).json({ erro: "Erro ao listar fotos do evento" });
  }
});

router.post("/:evento_id/fotos", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const urlFoto = String(req.body.url_foto || "").trim();
    const legenda = String(req.body.legenda || "").trim();
    const urlPermitida = /^https?:\/\//i.test(urlFoto) || urlFoto.startsWith("/images/");
    if (!urlFoto || !urlPermitida) {
      return res.status(400).json({ erro: "Informe uma URL HTTPS ou um caminho iniciado por /images/" });
    }

    const evento = await db.select({ id: eventos.id })
      .from(eventos)
      .where(eq(eventos.id, req.params.evento_id))
      .limit(1);
    if (!evento[0]) return res.status(404).json({ erro: "Evento não encontrado" });

    const existentes = await db.select({ ordem: fotos_evento.ordem })
      .from(fotos_evento)
      .where(eq(fotos_evento.evento_id, req.params.evento_id));
    const proximaOrdem = existentes.reduce((maior, foto) => Math.max(maior, foto.ordem || 0), -1) + 1;

    const criada = await db.insert(fotos_evento).values({
      id: createId(),
      evento_id: req.params.evento_id,
      url_foto: urlFoto,
      legenda: legenda || null,
      ordem: Number.isInteger(req.body.ordem) ? req.body.ordem : proximaOrdem,
    }).returning();

    res.status(201).json({ mensagem: "Foto vinculada com sucesso", foto: criada[0] });
  } catch (error) {
    console.error("[EVENTOS] Erro ao vincular foto:", error);
    res.status(500).json({ erro: "Erro ao vincular foto ao evento" });
  }
});

router.delete("/:evento_id/fotos/:foto_id", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const removida = await db.delete(fotos_evento)
      .where(and(eq(fotos_evento.id, req.params.foto_id), eq(fotos_evento.evento_id, req.params.evento_id)))
      .returning({ id: fotos_evento.id });
    if (!removida[0]) return res.status(404).json({ erro: "Foto não encontrada" });
    res.json({ mensagem: "Foto removida do evento" });
  } catch (error) {
    console.error("[EVENTOS] Erro ao remover foto:", error);
    res.status(500).json({ erro: "Erro ao remover foto do evento" });
  }
});

// Criar evento (admin)
router.post("/", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { nome, descricao, data_inicio, data_fim, local } = req.body;

    if (!nome || !data_inicio || !data_fim) {
      return res.status(400).json({ erro: "Nome, data_inicio e data_fim são obrigatórios" });
    }

    const novoEvento = await db
      .insert(eventos)
      .values({
        id: `evento-${Date.now()}`,
        nome,
        descricao: descricao || "",
        data_inicio: new Date(data_inicio),
        data_fim: new Date(data_fim),
        local: local || "",
        ativo: true,
        criado_em: new Date(),
        atualizado_em: new Date(),
      })
      .returning();

    res.status(201).json({
      mensagem: "Evento criado com sucesso",
      evento: novoEvento[0],
    });
  } catch (error: any) {
    console.error("[EVENTOS] Erro ao criar:", error);
    res.status(500).json({ erro: error.message || "Erro ao criar evento" });
  }
});

// Atualizar evento (admin)
router.put("/:evento_id", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { evento_id } = req.params;
    const { nome, descricao, data_inicio, data_fim, local, ativo } = req.body;

    const eventoAtualizado = await db
      .update(eventos)
      .set({
        nome: nome || undefined,
        descricao: descricao !== undefined ? descricao : undefined,
        data_inicio: data_inicio ? new Date(data_inicio) : undefined,
        data_fim: data_fim ? new Date(data_fim) : undefined,
        local: local !== undefined ? local : undefined,
        ativo: ativo !== undefined ? ativo : undefined,
        atualizado_em: new Date(),
      })
      .where(eq(eventos.id, evento_id))
      .returning();

    if (eventoAtualizado.length === 0) {
      return res.status(404).json({ erro: "Evento não encontrado" });
    }

    res.json({
      mensagem: "Evento atualizado com sucesso",
      evento: eventoAtualizado[0],
    });
  } catch (error: any) {
    console.error("[EVENTOS] Erro ao atualizar:", error);
    res.status(500).json({ erro: error.message || "Erro ao atualizar evento" });
  }
});

// Deletar evento (admin)
router.delete("/:evento_id", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { evento_id } = req.params;

    // Verificar se existem lotes vinculados
    const lotesVinculados = await db
      .select()
      .from(lotes)
      .where(eq(lotes.evento_id, evento_id));

    if (lotesVinculados.length > 0) {
      return res.status(409).json({
        erro: "Não é possível deletar evento com lotes vinculados",
        lotes_count: lotesVinculados.length,
      });
    }

    const deletado = await db
      .delete(eventos)
      .where(eq(eventos.id, evento_id))
      .returning();

    if (deletado.length === 0) {
      return res.status(404).json({ erro: "Evento não encontrado" });
    }

    res.json({ mensagem: "Evento deletado com sucesso" });
  } catch (error: any) {
    console.error("[EVENTOS] Erro ao deletar:", error);
    res.status(500).json({ erro: error.message || "Erro ao deletar evento" });
  }
});

export default router;
