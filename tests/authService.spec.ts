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
});
