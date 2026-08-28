import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { AuthService } from "../services/authService.js";
import { db } from "../db/index.js";
import { usuarios } from "../db/schema.js";
import { UsuarioPayload } from "../types/index.js";

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioPayload;
    }
  }
}

function cookieToken(req: Request): string | null {
  const cookie = req.headers.cookie || "";
  const match = cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("auth_token="));
  return match ? decodeURIComponent(match.slice("auth_token=".length)) : null;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const bearer = AuthService.extractTokenFromHeader(req.headers.authorization);
  const token = bearer || cookieToken(req);
  if (!token) return res.status(401).json({ erro: "Sessão não fornecida" });
  const payload = AuthService.verifyToken(token);
  if (!payload) return res.status(401).json({ erro: "Sessão inválida ou expirada" });

  try {
    const usuario = (await db.select({ ativo: usuarios.ativo, session_version: usuarios.session_version }).from(usuarios).where(eq(usuarios.id, payload.id)).limit(1))[0];
    if (!usuario || !usuario.ativo) return res.status(401).json({ erro: "Sessão inválida" });
    if (payload.session_version !== undefined && Number(usuario.session_version || 1) !== Number(payload.session_version)) return res.status(401).json({ erro: "Sessão revogada; faça login novamente" });
    req.usuario = payload;
    return next();
  } catch {
    console.error("[AUTH] Falha ao validar sessão");
    return res.status(503).json({ erro: "Não foi possível validar a sessão" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    if (!roles.includes(req.usuario.tipo)) return res.status(403).json({ erro: "Acesso negado" });
    return next();
  };
}
