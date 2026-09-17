import { Router, Request, Response, NextFunction, raw } from "express";
import { authMiddleware, requireRole } from "../middleware/authMiddleware.js";
import { db } from "../db/index.js";
import { eventos, fotos_evento, lotes, pacotes } from "../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import fs from "node:fs/promises";
import path from "node:path";
import { CatalogoExclusaoService } from "../services/catalogoExclusaoService.js";
import { PeriodoExcursaoService } from "../services/periodoExcursaoService.js";

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
    const eventosList = await db.select().from(eventos).where(eq(eventos.ativo, true));
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
      .where(and(eq(eventos.id, evento_id), eq(eventos.ativo, true)))
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

// Períodos são a segunda etapa do catálogo: pertencem à excursão e podem ser
// escolhidos depois por qualquer pacote, sem duplicar a janela operacional.
router.get("/:evento_id/periodos", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    return res.json({ evento_id: req.params.evento_id, periodos: await PeriodoExcursaoService.listar(req.params.evento_id) });
  } catch (error: any) {
    console.error("[EVENTOS] Erro ao listar períodos centrais:", error);
    return res.status(500).json({ erro: error?.message || "Não foi possível listar os períodos da excursão" });
  }
});

router.post("/:evento_id/periodos", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const periodo = await PeriodoExcursaoService.criar(req.params.evento_id, req.body);
    return res.status(201).json({ mensagem: "Período criado na excursão", periodo });
  } catch (error: any) {
    console.error("[EVENTOS] Erro ao criar período central:", error);
    return res.status(400).json({ erro: error?.message || "Não foi possível criar o período" });
  }
});

router.put("/:evento_id/periodos/:periodo_id", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const periodo = await PeriodoExcursaoService.atualizar(req.params.evento_id, req.params.periodo_id, req.body);
    return res.json({ mensagem: "Período da excursão atualizado", periodo });
  } catch (error: any) {
    console.error("[EVENTOS] Erro ao atualizar período central:", error);
    return res.status(400).json({ erro: error?.message || "Não foi possível atualizar o período" });
  }
});

router.delete("/:evento_id/periodos/:periodo_id", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    return res.json(await PeriodoExcursaoService.excluir(req.params.evento_id, req.params.periodo_id));
  } catch (error: any) {
    console.error("[EVENTOS] Erro ao excluir período central:", error);
    return res.status(409).json({ erro: error?.message || "Não foi possível excluir o período" });
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
    const foto = (await db.select({ id: fotos_evento.id, formato: fotos_evento.formato })
      .from(fotos_evento)
      .innerJoin(eventos, eq(eventos.id, fotos_evento.evento_id))
      .where(and(
        eq(fotos_evento.id, req.params.foto_id),
        eq(fotos_evento.evento_id, req.params.evento_id),
        eq(eventos.ativo, true),
      )).limit(1))[0];
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

    const novoEvento = await db.transaction(async (tx) => {
      const agora = new Date();
      const evento = (await tx.insert(eventos).values({
        id: `evento-${Date.now()}`,
        nome,
        descricao: descricao || "",
        data_inicio: new Date(data_inicio),
        data_fim: new Date(data_fim),
        local: local || "",
        ativo: true,
        criado_em: agora,
        atualizado_em: agora,
      }).returning())[0];

      // Compatibilidade estrutural: o administrador configura apenas pacote,
      // período, operação e lote comercial. Esta linha não é um lote de venda.
      await tx.insert(lotes).values({
        id: createId(), evento_id: evento.id, nome: nome.trim(),
        descricao: "Estrutura operacional interna da excursão",
        vagas_totais: 0, "vagas_disponíveis": 0, operacional_interno: true,
        data_inicio: new Date(data_inicio), data_fim: new Date(data_fim),
        valor_base: "0", ativo: true, criado_em: agora, atualizado_em: agora,
      });
      return [evento];
    });

    res.status(201).json({
      mensagem: "Evento criado com sucesso",
      evento: novoEvento[0],
    });
  } catch (error: any) {
    console.error("[EVENTOS] Erro ao criar:", error);
    res.status(500).json({ erro: error.message || "Erro ao criar evento" });
  }
});

// Garante uma única estrutura operacional para excursões antigas que ainda
// não possuem a linha técnica criada automaticamente nas novas excursões.
router.post("/:evento_id/estrutura-operacional", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const evento = (await db.select().from(eventos).where(eq(eventos.id, req.params.evento_id)).limit(1))[0];
    if (!evento) return res.status(404).json({ erro: "Excursão não encontrada" });

    const interno = (await db.select().from(lotes)
      .where(and(eq(lotes.evento_id, evento.id), eq(lotes.operacional_interno, true)))
      .orderBy(desc(lotes.criado_em)).limit(1))[0];
    if (interno) return res.json({ modo: "existente", lote: interno });

    // Se a excursão já foi usada pelo modelo legado, reaproveita o lote que
    // contém pacotes; não cria uma segunda estrutura nem altera dados antigos.
    const loteComPacotes = (await db.select({ lote: lotes })
      .from(lotes)
      .innerJoin(pacotes, eq(pacotes.lote_id, lotes.id))
      .where(and(eq(lotes.evento_id, evento.id), eq(lotes.ativo, true)))
      .orderBy(desc(lotes.criado_em)).limit(1))[0]?.lote;
    if (loteComPacotes) return res.json({ modo: "legado", lote: loteComPacotes });

    const agora = new Date();
    const criado = (await db.insert(lotes).values({
      id: createId(), evento_id: evento.id, nome: evento.nome,
      descricao: "Estrutura operacional interna da excursão",
      vagas_totais: 0, "vagas_disponíveis": 0, operacional_interno: true,
      data_inicio: evento.data_inicio, data_fim: evento.data_fim,
      valor_base: "0", ativo: true, criado_em: agora, atualizado_em: agora,
    }).returning())[0];
    return res.status(201).json({ modo: "criado", lote: criado });
  } catch (error) {
    console.error("[EVENTOS] Erro ao garantir estrutura operacional:", error);
    return res.status(500).json({ erro: "Não foi possível preparar a estrutura operacional da excursão" });
  }
});

// Atualizar evento (admin)
router.put("/:evento_id", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { evento_id } = req.params;
    const { nome, descricao, data_inicio, data_fim, local, ativo } = req.body;

    const eventoAtualizado = await db.transaction(async (tx) => {
      const agora = new Date();
      const atualizado = await tx.update(eventos).set({
        nome: nome || undefined,
        descricao: descricao !== undefined ? descricao : undefined,
        data_inicio: data_inicio ? new Date(data_inicio) : undefined,
        data_fim: data_fim ? new Date(data_fim) : undefined,
        local: local !== undefined ? local : undefined,
        ativo: ativo !== undefined ? ativo : undefined,
        atualizado_em: agora,
      }).where(eq(eventos.id, evento_id)).returning();
      if (atualizado[0]) {
        await tx.update(lotes).set({
          nome: nome || undefined,
          data_inicio: data_inicio ? new Date(data_inicio) : undefined,
          data_fim: data_fim ? new Date(data_fim) : undefined,
          atualizado_em: agora,
        }).where(and(eq(lotes.evento_id, evento_id), eq(lotes.operacional_interno, true)));
      }
      return atualizado;
    });

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

// Excluir definitivamente quando não há histórico; caso contrário, arquivar.
router.delete("/:evento_id", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { evento_id } = req.params;
    const resultado = await CatalogoExclusaoService.evento(evento_id, {
      id: req.usuario!.id,
      tipo: req.usuario!.tipo,
    });
    if (resultado.modo === "excluido") {
      const base = path.resolve(process.env.STORAGE_PATH || "./uploads");
      const pasta = path.resolve(base, "eventos", evento_id);
      if (pasta.startsWith(`${base}${path.sep}`)) {
        await fs.rm(pasta, { recursive: true, force: true }).catch(() => undefined);
      }
    }
    return res.json(resultado);
  } catch (error: any) {
    console.error("[EVENTOS] Falha ao excluir ou arquivar excursão:", error);
    if (error?.message === "Excursão não encontrada") return res.status(404).json({ erro: error.message });
    return res.status(500).json({ erro: "Não foi possível excluir ou arquivar a excursão" });
  }
});

export default router;
