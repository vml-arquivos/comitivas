import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/authService.js";
import { UsuarioPayload } from "../types/index.js";

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = AuthService.extractTokenFromHeader(req.headers.authorization);

  if (!token) {
    return res.status(401).json({ erro: "Token não fornecido" });
  }

  const payload = AuthService.verifyToken(token);
  if (!payload) {
    return res.status(401).json({ erro: "Token inválido ou expirado" });
  }

  req.usuario = payload;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario) {
      return res.status(401).json({ erro: "Não autenticado" });
    }

    if (!roles.includes(req.usuario.tipo)) {
      return res.status(403).json({ erro: "Acesso negado" });
    }

    next();
  };
}
