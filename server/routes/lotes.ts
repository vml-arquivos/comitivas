import { Router, Request, Response } from "express";
import { authMiddleware, requireRole } from "../middleware/authMiddleware.js";
import { db } from "../db/index.js";
import { lotes, eventos } from "../db/schema.js";
import { eq } from "drizzle-orm";

const router = Router();

// Listar lotes de um evento (público)
router.get("/evento/:evento_id", async (req: Request, res: Response) => {
  try {
    const { evento_id } = req.params;
    const lotesList = await db
      .select()
      .from(lotes)
      .where(eq(lotes.evento_id, evento_id));

    res.json({ evento_id, lotes: lotesList });
  } catch (error: any) {
    console.error("[LOTES] Erro ao listar:", error);
    res.status(500).json({ erro: "Erro ao listar lotes" });
  }
});

// Obter lote por ID (público)
router.get("/:lote_id", async (req: Request, res: Response) => {
  try {
    const { lote_id } = req.params;
    const lote = await db
      .select()
      .from(lotes)
      .where(eq(lotes.id, lote_id))
      .limit(1);

    if (lote.length === 0) {
      return res.status(404).json({ erro: "Lote não encontrado" });
    }

    res.json({ lote: lote[0] });
  } catch (error: any) {
    console.error("[LOTES] Erro ao obter:", error);
    res.status(500).json({ erro: "Erro ao obter lote" });
  }
});

// Criar lote (admin)
router.post("/", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { evento_id, nome, vagas_totais, vagas_disponiveis, data_abertura, data_fechamento } = req.body;

    if (!evento_id || !nome || !vagas_totais) {
      return res.status(400).json({ erro: "evento_id, nome e vagas_totais são obrigatórios" });
    }

    // Verificar se evento existe
    const eventoExiste = await db
      .select()
      .from(eventos)
      .where(eq(eventos.id, evento_id))
      .limit(1);

    if (eventoExiste.length === 0) {
      return res.status(404).json({ erro: "Evento não encontrado" });
    }

    const novoLote = await db
      .insert(lotes)
      .values({
        id: `lote-${Date.now()}`,
        evento_id,
        nome,
        vagas_totais: parseInt(vagas_totais),
        vagas_disponiveis: parseInt(vagas_disponiveis || vagas_totais),
        data_abertura: data_abertura ? new Date(data_abertura) : new Date(),
        data_fechamento: data_fechamento ? new Date(data_fechamento) : null,
        ativo: true,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .returning();

    res.status(201).json({
      mensagem: "Lote criado com sucesso",
      lote: novoLote[0],
    });
  } catch (error: any) {
    console.error("[LOTES] Erro ao criar:", error);
    res.status(500).json({ erro: error.message || "Erro ao criar lote" });
  }
});

// Atualizar lote (admin)
router.put("/:lote_id", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { lote_id } = req.params;
    const { nome, vagas_totais, vagas_disponiveis, data_abertura, data_fechamento, ativo } = req.body;

    const loteAtualizado = await db
      .update(lotes)
      .set({
        nome: nome || undefined,
        vagas_totais: vagas_totais ? parseInt(vagas_totais) : undefined,
        vagas_disponiveis: vagas_disponiveis ? parseInt(vagas_disponiveis) : undefined,
        data_abertura: data_abertura ? new Date(data_abertura) : undefined,
        data_fechamento: data_fechamento ? new Date(data_fechamento) : undefined,
        ativo: ativo !== undefined ? ativo : undefined,
        atualizado_em: new Date().toISOString(),
      })
      .where(eq(lotes.id, lote_id))
      .returning();

    if (loteAtualizado.length === 0) {
      return res.status(404).json({ erro: "Lote não encontrado" });
    }

    res.json({
      mensagem: "Lote atualizado com sucesso",
      lote: loteAtualizado[0],
    });
  } catch (error: any) {
    console.error("[LOTES] Erro ao atualizar:", error);
    res.status(500).json({ erro: error.message || "Erro ao atualizar lote" });
  }
});

// Deletar lote (admin)
router.delete("/:lote_id", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { lote_id } = req.params;

    const deletado = await db
      .delete(lotes)
      .where(eq(lotes.id, lote_id))
      .returning();

    if (deletado.length === 0) {
      return res.status(404).json({ erro: "Lote não encontrado" });
    }

    res.json({ mensagem: "Lote deletado com sucesso" });
  } catch (error: any) {
    console.error("[LOTES] Erro ao deletar:", error);
    res.status(500).json({ erro: error.message || "Erro ao deletar lote" });
  }
});

export default router;
