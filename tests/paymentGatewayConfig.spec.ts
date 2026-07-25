import { afterEach, describe, expect, it } from "vitest";
import { PaymentGatewayAdapter } from "../server/services/paymentGatewayAdapter.js";

const ambienteOriginal = {
  NODE_ENV: process.env.NODE_ENV,
  PAYMENT_GATEWAY: process.env.PAYMENT_GATEWAY,
  MERCADOPAGO_ACCESS_TOKEN: process.env.MERCADOPAGO_ACCESS_TOKEN,
  API_URL: process.env.API_URL,
};

afterEach(() => {
  for (const [chave, valor] of Object.entries(ambienteOriginal)) {
    if (valor === undefined) delete process.env[chave];
    else process.env[chave] = valor;
  }
});

describe("PaymentGatewayAdapter.validarConfiguracaoSegura", () => {
  it("rejeita modo mock em produção", () => {
    process.env.NODE_ENV = "production";
    process.env.PAYMENT_GATEWAY = "mock";

    expect(() => PaymentGatewayAdapter.validarConfiguracaoSegura())
      .toThrow("PAYMENT_GATEWAY=mock não é permitido em produção");
  });

  it("exige token real do Mercado Pago e webhook HTTPS", () => {
    process.env.NODE_ENV = "production";
    process.env.PAYMENT_GATEWAY = "mercadopago";
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    process.env.API_URL = "https://api.exemplo.com";

    expect(() => PaymentGatewayAdapter.validarConfiguracaoSegura())
      .toThrow("MERCADOPAGO_ACCESS_TOKEN é obrigatório em produção");

    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-token-real";
    process.env.API_URL = "http://api.exemplo.com";
    expect(() => PaymentGatewayAdapter.validarConfiguracaoSegura())
      .toThrow("API_URL com HTTPS é obrigatória em produção");
  });

  it("aceita Mercado Pago configurado para produção", () => {
    process.env.NODE_ENV = "production";
    process.env.PAYMENT_GATEWAY = "mercadopago";
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-token-real";
    process.env.API_URL = "https://api.exemplo.com";

    expect(() => PaymentGatewayAdapter.validarConfiguracaoSegura()).not.toThrow();
  });
});
