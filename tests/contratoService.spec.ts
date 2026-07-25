import { describe, expect, it } from "vitest";
import { ContratoService } from "../server/services/contratoService.js";

describe("ContratoService.calcularCondicaoPagamento", () => {
  it("aplica 5% de desconto para PIX à vista", () => {
    expect(ContratoService.calcularCondicaoPagamento("1000.00", "pix", 1)).toEqual({
      forma_pagamento: "pix",
      quantidade_parcelas: 1,
      valor_total: "950.00",
      valor_parcela: "950.00",
      desconto_pagamento: "50.00",
    });
  });

  it("preserva o total e calcula até duas parcelas para boleto", () => {
    expect(ContratoService.calcularCondicaoPagamento("1400.00", "boleto", 2)).toEqual({
      forma_pagamento: "boleto",
      quantidade_parcelas: 2,
      valor_total: "1400.00",
      valor_parcela: "700.00",
      desconto_pagamento: "0.00",
    });
  });

  it("permite parcelamento em até doze vezes no cartão", () => {
    expect(ContratoService.calcularCondicaoPagamento("1800.00", "credito", 12)).toEqual({
      forma_pagamento: "credito",
      quantidade_parcelas: 12,
      valor_total: "1800.00",
      valor_parcela: "150.00",
      desconto_pagamento: "0.00",
    });
  });

  it("rejeita uma forma de pagamento não reconhecida", () => {
    expect(() => ContratoService.calcularCondicaoPagamento("1000.00", "debito", 1))
      .toThrow("Forma de pagamento inválida");
  });

  it("rejeita PIX parcelado e parcelamento acima do limite", () => {
    expect(() => ContratoService.calcularCondicaoPagamento("1000.00", "pix", 2))
      .toThrow("O pagamento via PIX deve ser feito à vista");
    expect(() => ContratoService.calcularCondicaoPagamento("1000.00", "boleto", 3))
      .toThrow("O boleto pode ser parcelado em até 2 vezes");
    expect(() => ContratoService.calcularCondicaoPagamento("1000.00", "credito", 13))
      .toThrow("O cartão de crédito pode ser parcelado em até 12 vezes");
  });

  it("rejeita valores de reserva não positivos", () => {
    expect(() => ContratoService.calcularCondicaoPagamento("0", "boleto", 1))
      .toThrow("O valor da reserva deve ser maior que zero");
  });
});
