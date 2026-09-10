import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { UsuarioPayload, JWTPayload } from "../types/index.js";

const JWT_EXPIRY = "7d";

export interface OAuthFlowPayload {
  state: string;
  verifier: string;
  provider: "google" | "microsoft";
  redirect: string;
  vendedor_ref?: string;
  lead_id?: string;
  lead_intent_token?: string;
}

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

  static generateLeadIntentToken(leadId: string): string {
    if (!leadId) throw new Error("leadId é obrigatório");
    return jwt.sign(
      { lead_id: leadId, purpose: "lead-intent" },
      obterJwtSecret(),
      { expiresIn: "30m" },
    );
  }

  static verifyLeadIntentToken(token: string, leadId: string): boolean {
    if (!token || !leadId) return false;
    try {
      const payload = jwt.verify(token, obterJwtSecret()) as { lead_id?: string; purpose?: string };
      return payload.purpose === "lead-intent" && payload.lead_id === leadId;
    } catch {
      return false;
    }
  }

  static generateSellerReferralToken(vendedorId: string): string {
    if (!vendedorId) throw new Error("vendedorId é obrigatório");
    return jwt.sign(
      { vendedor_id: vendedorId, purpose: "seller-referral" },
      obterJwtSecret(),
      { expiresIn: "365d" },
    );
  }

  static verifySellerReferralToken(token: string): string | null {
    if (!token) return null;
    try {
      const payload = jwt.verify(token, obterJwtSecret()) as { vendedor_id?: string; purpose?: string };
      return payload.purpose === "seller-referral" && payload.vendedor_id
        ? payload.vendedor_id
        : null;
    } catch {
      return null;
    }
  }

  static generateOAuthFlowToken(payload: OAuthFlowPayload): string {
    return jwt.sign(
      { ...payload, purpose: "oauth-login" },
      obterJwtSecret(),
      { expiresIn: "10m" },
    );
  }

  static verifyOAuthFlowToken(token: string): OAuthFlowPayload | null {
    if (!token) return null;
    try {
      const payload = jwt.verify(token, obterJwtSecret()) as OAuthFlowPayload & { purpose?: string };
      if (payload.purpose !== "oauth-login") return null;
      if (!payload.state || !payload.verifier || !["google", "microsoft"].includes(payload.provider)) return null;
      return payload;
    } catch {
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
