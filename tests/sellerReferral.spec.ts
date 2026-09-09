import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "../server/services/authService.js";

describe("referência assinada de vendedor", () => {
  const segredoAnterior = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = "segredo-de-teste-com-tamanho-suficiente";
  });

  afterEach(() => {
    if (segredoAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredoAnterior;
  });

  it("recupera somente o vendedor registrado no token", () => {
    const token = AuthService.generateSellerReferralToken("vendedor-123");
    expect(AuthService.verifySellerReferralToken(token)).toBe("vendedor-123");
  });

  it("rejeita manipulação e tokens de outra finalidade", () => {
    const token = AuthService.generateSellerReferralToken("vendedor-123");
    const adulterado = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    expect(AuthService.verifySellerReferralToken(adulterado)).toBeNull();
    expect(AuthService.verifySellerReferralToken(AuthService.generateLeadIntentToken("lead-1"))).toBeNull();
  });
});
