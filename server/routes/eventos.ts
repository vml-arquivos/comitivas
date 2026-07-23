import { Router, Request, Response } from "express";
import { authMiddleware, requireRole } from "../middleware/authMiddleware.js";
import { db } from "../db/index.js";
import { eventos, lotes } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

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
