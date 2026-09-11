import { Router, Request, Response } from "express";
import { authMiddleware, requireRole } from "../middleware/authMiddleware.js";
import { db } from "../db/index.js";
import { lotes, eventos } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

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
    const {
      evento_id,
      nome,
      descricao,
      vagas_totais,
      vagas_disponiveis,
      data_inicio,
      data_fim,
      data_embarque,
      data_retorno,
      local_embarque,
      local_hospedagem,
      valor_base,
    } = req.body;

    if (!evento_id || !nome || !vagas_totais || !data_inicio || !data_fim || valor_base === undefined) {
      return res.status(400).json({
        erro: "evento_id, nome, vagas_totais, data_inicio, data_fim e valor_base são obrigatórios",
      });
    }
    const inicio = new Date(data_inicio);
    const fim = new Date(data_fim);
    const embarque = data_embarque ? new Date(data_embarque) : null;
    const retorno = data_retorno ? new Date(data_retorno) : null;
    const vagasTotais = Number(vagas_totais);
    const vagasDisponiveis = Number(vagas_disponiveis ?? vagas_totais);
    if ([inicio, fim, embarque, retorno].some((data) => data && Number.isNaN(data.getTime()))) {
      return res.status(400).json({ erro: "Informe datas válidas para o lote e o itinerário" });
    }
    if (inicio > fim || (embarque && retorno && embarque > retorno)) {
      return res.status(400).json({ erro: "O início/embarque deve ocorrer antes do fim/retorno" });
    }
    if (!Number.isInteger(vagasTotais) || vagasTotais < 1 || !Number.isInteger(vagasDisponiveis) || vagasDisponiveis < 0 || vagasDisponiveis > vagasTotais) {
      return res.status(400).json({ erro: "A quantidade de vagas é inválida" });
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
        id: createId(),
        evento_id,
        nome,
        descricao: descricao || "",
        vagas_totais: vagasTotais,
        "vagas_disponíveis": vagasDisponiveis,
        data_inicio: inicio,
        data_fim: fim,
        data_embarque: embarque,
        data_retorno: retorno,
        local_embarque: local_embarque || null,
        local_hospedagem: local_hospedagem || null,
        valor_base: valor_base.toString(),
        ativo: true,
        criado_em: new Date(),
        atualizado_em: new Date(),
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
    const {
      nome,
      descricao,
      vagas_totais,
      vagas_disponiveis,
      data_inicio,
      data_fim,
      data_embarque,
      data_retorno,
      local_embarque,
      local_hospedagem,
      valor_base,
      ativo,
    } = req.body;

    const loteAtualizado = await db
      .update(lotes)
      .set({
        nome: nome || undefined,
        descricao: descricao !== undefined ? descricao : undefined,
        vagas_totais: vagas_totais !== undefined ? parseInt(vagas_totais) : undefined,
        "vagas_disponíveis": vagas_disponiveis !== undefined ? parseInt(vagas_disponiveis) : undefined,
        data_inicio: data_inicio ? new Date(data_inicio) : undefined,
        data_fim: data_fim ? new Date(data_fim) : undefined,
        data_embarque: data_embarque !== undefined ? (data_embarque ? new Date(data_embarque) : null) : undefined,
        data_retorno: data_retorno !== undefined ? (data_retorno ? new Date(data_retorno) : null) : undefined,
        local_embarque: local_embarque !== undefined ? (local_embarque || null) : undefined,
        local_hospedagem: local_hospedagem !== undefined ? (local_hospedagem || null) : undefined,
        valor_base: valor_base !== undefined ? valor_base.toString() : undefined,
        ativo: ativo !== undefined ? ativo : undefined,
        atualizado_em: new Date(),
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
