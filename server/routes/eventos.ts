import { Router, Request, Response, NextFunction, raw } from "express";
import { authMiddleware, requireRole } from "../middleware/authMiddleware.js";
import { db } from "../db/index.js";
import { eventos, fotos_evento, lotes } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import fs from "node:fs/promises";
import path from "node:path";

const router = Router();

const parserFoto = raw({ type: "application/octet-stream", limit: "10mb" });

function uploadFoto(req: Request, res: Response, next: NextFunction) {
  parserFoto(req, res, (error?: any) => {
    if (error?.type === "entity.too.large") return res.status(413).json({ erro: "A foto excede o limite de 10 MB" });
    if (error) return next(error);
    return next();
  });
}

function detectarFoto(buffer: Buffer, extensao: string): string | null {
  const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if ([".jpg", ".jpeg"].includes(extensao) && jpeg) return "image/jpeg";
  if (extensao === ".png" && png) return "image/png";
  if (extensao === ".webp" && webp) return "image/webp";
  return null;
}

function caminhoFoto(eventoId: string, fotoId: string, mime: string): string {
  const extensao = mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg";
  const base = path.resolve(process.env.STORAGE_PATH || "./uploads");
  return path.resolve(base, "eventos", eventoId, `${fotoId}${extensao}`);
}

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

router.post("/:evento_id/fotos", authMiddleware, requireRole("admin"), uploadFoto, async (req: Request, res: Response) => {
  let arquivoGravado: string | null = null;
  try {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ erro: "Selecione uma foto para enviar" });
    const nomeOriginal = decodeURIComponent(String(req.get("x-file-name") || "foto"));
    const extensao = path.extname(nomeOriginal).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(extensao)) return res.status(415).json({ erro: "Formato não permitido. Envie JPG, PNG ou WEBP" });
    const mime = detectarFoto(req.body, extensao);
    if (!mime) return res.status(415).json({ erro: "O conteúdo do arquivo não corresponde a uma imagem permitida" });
    const mimeInformado = String(req.get("x-file-mime") || "").toLowerCase();
    if (mimeInformado && mimeInformado !== mime) return res.status(415).json({ erro: "Tipo da foto inconsistente com o arquivo enviado" });
    const legenda = decodeURIComponent(String(req.get("x-file-caption") || "")).trim().slice(0, 500);
    const textoAlternativo = decodeURIComponent(String(req.get("x-file-alt") || "")).trim().slice(0, 500);

    const evento = await db.select({ id: eventos.id })
      .from(eventos)
      .where(eq(eventos.id, req.params.evento_id))
      .limit(1);
    if (!evento[0]) return res.status(404).json({ erro: "Evento não encontrado" });

    const existentes = await db.select({ ordem: fotos_evento.ordem })
      .from(fotos_evento)
      .where(eq(fotos_evento.evento_id, req.params.evento_id));
    const proximaOrdem = existentes.reduce((maior, foto) => Math.max(maior, foto.ordem || 0), -1) + 1;

    const fotoId = createId();
    const urlFoto = `/api/eventos/${encodeURIComponent(req.params.evento_id)}/fotos/${encodeURIComponent(fotoId)}/arquivo`;
    const arquivo = caminhoFoto(req.params.evento_id, fotoId, mime);
    const base = path.resolve(process.env.STORAGE_PATH || "./uploads");
    if (!arquivo.startsWith(`${base}${path.sep}`)) return res.status(400).json({ erro: "Caminho de armazenamento inválido" });
    await fs.mkdir(path.dirname(arquivo), { recursive: true });
    await fs.writeFile(arquivo, req.body, { flag: "wx" });
    arquivoGravado = arquivo;

    const criada = await db.insert(fotos_evento).values({
      id: fotoId,
      evento_id: req.params.evento_id,
      url_foto: urlFoto,
      legenda: legenda || null,
      alt_text: textoAlternativo || legenda || `Foto de ${req.params.evento_id}`,
      formato: mime,
      ordem: proximaOrdem,
    }).returning();

    res.status(201).json({ mensagem: "Foto enviada com sucesso", foto: criada[0] });
  } catch (error) {
    if (arquivoGravado) await fs.unlink(arquivoGravado).catch(() => undefined);
    console.error("[EVENTOS] Erro ao enviar foto:", error);
    res.status(500).json({ erro: "Erro ao enviar foto do evento" });
  }
});

// As fotos da galeria são públicas, mas o caminho físico nunca é exposto.
router.get("/:evento_id/fotos/:foto_id/arquivo", async (req: Request, res: Response) => {
  try {
    const foto = (await db.select({ id: fotos_evento.id, formato: fotos_evento.formato }).from(fotos_evento)
      .where(and(eq(fotos_evento.id, req.params.foto_id), eq(fotos_evento.evento_id, req.params.evento_id))).limit(1))[0];
    if (!foto?.formato?.startsWith("image/")) return res.status(404).json({ erro: "Foto não encontrada" });
    const arquivo = caminhoFoto(req.params.evento_id, foto.id, foto.formato);
    await fs.access(arquivo);
    res.setHeader("Content-Type", foto.formato);
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    return res.sendFile(arquivo);
  } catch {
    return res.status(404).json({ erro: "Foto não encontrada" });
  }
});

router.delete("/:evento_id/fotos/:foto_id", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const existente = (await db.select({ id: fotos_evento.id, url_foto: fotos_evento.url_foto, formato: fotos_evento.formato }).from(fotos_evento)
      .where(and(eq(fotos_evento.id, req.params.foto_id), eq(fotos_evento.evento_id, req.params.evento_id))).limit(1))[0];
    const removida = await db.delete(fotos_evento)
      .where(and(eq(fotos_evento.id, req.params.foto_id), eq(fotos_evento.evento_id, req.params.evento_id)))
      .returning({ id: fotos_evento.id });
    if (!removida[0]) return res.status(404).json({ erro: "Foto não encontrada" });
    if (existente?.url_foto.startsWith("/api/eventos/") && existente.formato?.startsWith("image/")) {
      await fs.unlink(caminhoFoto(req.params.evento_id, existente.id, existente.formato)).catch(() => undefined);
    }
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
