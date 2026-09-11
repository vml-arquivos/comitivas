import { afterEach, describe, expect, it } from "vitest";
import { AuthService } from "../server/services/authService.js";

const ambienteOriginal = process.env.NODE_ENV;
const jwtOriginal = process.env.JWT_SECRET;

afterEach(() => {
  if (ambienteOriginal === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ambienteOriginal;

  if (jwtOriginal === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = jwtOriginal;
});

describe("AuthService.validarConfiguracaoSegura", () => {
  it("rejeita a inicialização em produção sem JWT_SECRET", () => {
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;

    expect(() => AuthService.validarConfiguracaoSegura())
      .toThrow("JWT_SECRET é obrigatório em produção");
  });

  it("aceita uma chave JWT explícita em produção", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "segredo-de-teste-com-tamanho-suficiente";

    expect(() => AuthService.validarConfiguracaoSegura()).not.toThrow();
  });

  it("emite e valida token de intenção somente para o lead correto", () => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "segredo-de-teste-com-tamanho-suficiente";
    const token = AuthService.generateLeadIntentToken("lead-123");

    expect(AuthService.verifyLeadIntentToken(token, "lead-123")).toBe(true);
    expect(AuthService.verifyLeadIntentToken(token, "lead-456")).toBe(false);
    expect(AuthService.verifyLeadIntentToken("token-inválido", "lead-123")).toBe(false);
  });
});
