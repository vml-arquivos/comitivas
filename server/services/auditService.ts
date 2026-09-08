import { Request } from "express";
import { db } from "../db/index.js";
import { auditoriaAdmin } from "../db/schema.js";
import { createId } from "@paralleldrive/cuid2";

function sanitizar(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitizar);
  const blocked = /senha|password|secret|private.?key|certificate|certificado|token|api.?key|client.?secret/i;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, blocked.test(key) ? "[REDACTED]" : sanitizar(item)]));
}

export class AuditService {
  static async registrar(req: Request, acao: string, entidade: string, entidadeId?: string | null, antes?: unknown, depois?: unknown): Promise<void> {
    await db.insert(auditoriaAdmin).values({
      id: createId(),
      ator_id: req.usuario?.id || null,
      ator_tipo: req.usuario?.tipo || "sistema",
      acao: acao.slice(0, 120),
      entidade: entidade.slice(0, 80),
      entidade_id: entidadeId || null,
      antes: antes === undefined ? null : sanitizar(antes),
      depois: depois === undefined ? null : sanitizar(depois),
      ip: req.ip || req.socket.remoteAddress || null,
      user_agent: req.get("user-agent") || null,
      criado_em: new Date(),
    });
  }
}
