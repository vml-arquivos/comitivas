import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { UsuarioPayload, JWTPayload } from "../types/index.js";

const JWT_EXPIRY = "7d";

function obterJwtSecret(): string {
  const secretConfigurado = process.env.JWT_SECRET?.trim();
  if (secretConfigurado) return secretConfigurado;

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET é obrigatório em produção");
  }

  return "dev-secret-change-in-production";
}

export class AuthService {
  static validarConfiguracaoSegura(): void {
    obterJwtSecret();
  }

  static async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static generateToken(payload: UsuarioPayload): string {
    return jwt.sign(payload, obterJwtSecret(), { expiresIn: JWT_EXPIRY });
  }

  static verifyToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, obterJwtSecret()) as JWTPayload;
    } catch (error) {
      console.error("[AuthService] Token inválido:", error);
      return null;
    }
  }

  static extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }
    return authHeader.slice(7);
  }
}
