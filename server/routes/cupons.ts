import { Router, Request, Response } from "express";
import { authMiddleware, requireRole } from "../middleware/authMiddleware.js";
import { db } from "../db/index.js";
import { cupons, eventos } from "../db/schema.js";
import { eq, and, lt } from "drizzle-orm";

const router = Router();

function numeroOpcional(valor: unknown): number | null {
  if (valor === undefined || valor === null || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

// Listar cupons de um evento (admin)
router.get("/evento/:evento_id", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { evento_id } = req.params;

    const cuponsList = await db
      .select()
      .from(cupons)
      .where(eq(cupons.evento_id, evento_id));

    res.json({
      evento_id,
      total: cuponsList.length,
      cupons: cuponsList,
    });
  } catch (error: any) {
    console.error("[CUPONS] Erro ao listar:", error);
    res.status(500).json({ erro: "Erro ao listar cupons" });
  }
});

// Criar cupom (admin)
router.post("/criar", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { evento_id, codigo, desconto_percentual, desconto_fixo, uso_maximo, limite_por_cliente, pacote_id, vendedor_id, campanha, valor_minimo, validade } = req.body;

    if (!evento_id || !codigo) {
      return res.status(400).json({ erro: "evento_id e codigo são obrigatórios" });
    }

    const percentual = numeroOpcional(desconto_percentual);
    const fixo = numeroOpcional(desconto_fixo);
    if ((percentual === null && fixo === null) || (percentual !== null && fixo !== null)) {
      return res.status(400).json({ erro: "Forneça desconto_percentual ou desconto_fixo" });
    }
    if (percentual !== null && (percentual <= 0 || percentual > 100)) return res.status(400).json({ erro: "desconto_percentual deve estar entre 0 e 100" });
    if (fixo !== null && fixo <= 0) return res.status(400).json({ erro: "desconto_fixo deve ser maior que zero" });

    // Verificar se código já existe
    const existente = await db
      .select()
      .from(cupons)
      .where(eq(cupons.codigo, codigo))
      .limit(1);

    if (existente.length > 0) {
      return res.status(409).json({ erro: "Código de cupom já existe" });
    }

    // Criar cupom
    const novoCupom = await db
      .insert(cupons)
      .values({
        evento_id,
        codigo: codigo.toUpperCase(),
        desconto_percentual: percentual !== null ? percentual.toFixed(2) : null,
        desconto_fixo: fixo !== null ? fixo.toFixed(2) : null,
        uso_maximo: uso_maximo || null,
        limite_por_cliente: limite_por_cliente || null,
        pacote_id: pacote_id || null,
        vendedor_id: vendedor_id || null,
        campanha: campanha ? String(campanha).trim().slice(0, 120) : null,
        valor_minimo: valor_minimo !== undefined && valor_minimo !== null ? String(valor_minimo) : null,
        validade: validade ? new Date(validade) : null,
        ativo: true,
      })
      .returning();

    res.status(201).json({
      mensagem: "Cupom criado com sucesso",
      cupom: novoCupom[0],
    });
  } catch (error: any) {
    console.error("[CUPONS] Erro ao criar:", error);
    res.status(500).json({ erro: error.message || "Erro ao criar cupom" });
  }
});

// Atualizar cupom (admin)
router.put("/:cupom_id", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { cupom_id } = req.params;
    const { desconto_percentual, desconto_fixo, uso_maximo, limite_por_cliente, pacote_id, vendedor_id, campanha, valor_minimo, validade, ativo } = req.body;

    // Buscar cupom
    const cupomResult = await db
      .select()
      .from(cupons)
      .where(eq(cupons.id, cupom_id))
      .limit(1);

    if (cupomResult.length === 0) {
      return res.status(404).json({ erro: "Cupom não encontrado" });
    }

    const percentual = numeroOpcional(desconto_percentual);
    const fixo = numeroOpcional(desconto_fixo);
    if (percentual !== null && (percentual <= 0 || percentual > 100)) return res.status(400).json({ erro: "desconto_percentual deve estar entre 0 e 100" });
    if (fixo !== null && fixo <= 0) return res.status(400).json({ erro: "desconto_fixo deve ser maior que zero" });

    // Atualizar
    const atualizado = await db
      .update(cupons)
      .set({
        desconto_percentual: desconto_percentual !== undefined ? (percentual === null ? null : percentual.toFixed(2)) : undefined,
        desconto_fixo: desconto_fixo !== undefined ? (fixo === null ? null : fixo.toFixed(2)) : undefined,
        uso_maximo: uso_maximo !== undefined ? uso_maximo : undefined,
        limite_por_cliente: limite_por_cliente !== undefined ? limite_por_cliente : undefined,
        pacote_id: pacote_id !== undefined ? (pacote_id || null) : undefined,
        vendedor_id: vendedor_id !== undefined ? (vendedor_id || null) : undefined,
        campanha: campanha !== undefined ? (campanha ? String(campanha).trim().slice(0, 120) : null) : undefined,
        valor_minimo: valor_minimo !== undefined ? (valor_minimo === null || valor_minimo === "" ? null : String(valor_minimo)) : undefined,
        validade: validade ? new Date(validade) : undefined,
        ativo: ativo !== undefined ? ativo : undefined,
      })
      .where(eq(cupons.id, cupom_id))
      .returning();

    res.json({
      mensagem: "Cupom atualizado com sucesso",
      cupom: atualizado[0],
    });
  } catch (error: any) {
    console.error("[CUPONS] Erro ao atualizar:", error);
    res.status(500).json({ erro: "Erro ao atualizar cupom" });
  }
});

// Desativar cupom (admin)
router.delete("/:cupom_id", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { cupom_id } = req.params;

    const resultado = await db
      .update(cupons)
      .set({ ativo: false })
      .where(eq(cupons.id, cupom_id))
      .returning();

    if (resultado.length === 0) {
      return res.status(404).json({ erro: "Cupom não encontrado" });
    }

    res.json({ mensagem: "Cupom desativado com sucesso" });
  } catch (error: any) {
    console.error("[CUPONS] Erro ao desativar:", error);
    res.status(500).json({ erro: "Erro ao desativar cupom" });
  }
});

export default router;
