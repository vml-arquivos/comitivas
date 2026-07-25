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

  it("permite parcelamento em até dez vezes no cartão", () => {
    expect(ContratoService.calcularCondicaoPagamento("1800.00", "credito", 10)).toEqual({
      forma_pagamento: "credito",
      quantidade_parcelas: 10,
      valor_total: "1800.00",
      valor_parcela: "180.00",
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
    expect(() => ContratoService.calcularCondicaoPagamento("1000.00", "credito", 11))
      .toThrow("O cartão de crédito pode ser parcelado em até 10 vezes");
  });

  it("rejeita valores de reserva não positivos", () => {
    expect(() => ContratoService.calcularCondicaoPagamento("0", "boleto", 1))
      .toThrow("O valor da reserva deve ser maior que zero");
  });

  it("aceita um teto de parcelas de boleto calculado dinamicamente", () => {
    // 4 parcelas liberadas nesta data (ex.: contratação com boa antecedência)
    expect(ContratoService.calcularCondicaoPagamento("2000.00", "boleto", 4, 4)).toEqual({
      forma_pagamento: "boleto",
      quantidade_parcelas: 4,
      valor_total: "2000.00",
      valor_parcela: "500.00",
      desconto_pagamento: "0.00",
    });

    expect(() => ContratoService.calcularCondicaoPagamento("2000.00", "boleto", 5, 4))
      .toThrow("O boleto pode ser parcelado em até 4 vezes nesta data");
  });

  it("bloqueia o boleto parcelado quando a viagem está muito próxima", () => {
    expect(() => ContratoService.calcularCondicaoPagamento("2000.00", "boleto", 2, 1))
      .toThrow("o boleto só pode ser emitido à vista");
  });
});

describe("ContratoService.calcularParcelasMaximasBoleto", () => {
  it("libera mais parcelas quanto maior a antecedência, respeitando o teto absoluto", () => {
    const referencia = new Date("2026-01-01T00:00:00Z");

    // ~212 dias de antecedência: acima do teto de 6 parcelas (janela de 30 dias)
    expect(ContratoService.calcularParcelasMaximasBoleto("2026-08-01T00:00:00Z", referencia)).toBe(6);

    // 90 dias de antecedência: 3 janelas de 30 dias
    expect(ContratoService.calcularParcelasMaximasBoleto("2026-04-01T00:00:00Z", referencia)).toBe(3);

    // 40 dias de antecedência: 1 janela completa de 30 dias
    expect(ContratoService.calcularParcelasMaximasBoleto("2026-02-10T00:00:00Z", referencia)).toBe(1);
  });

  it("nunca libera menos de 1 parcela (à vista), mesmo em cima da data do evento", () => {
    const referencia = new Date("2026-08-15T00:00:00Z");
    expect(ContratoService.calcularParcelasMaximasBoleto("2026-08-20T00:00:00Z", referencia)).toBe(1);
    expect(ContratoService.calcularParcelasMaximasBoleto("2026-08-10T00:00:00Z", referencia)).toBe(1); // data já passada
  });

  it("retorna 1 quando não há data-limite de pagamento informada", () => {
    expect(ContratoService.calcularParcelasMaximasBoleto(null)).toBe(1);
    expect(ContratoService.calcularParcelasMaximasBoleto(undefined)).toBe(1);
    expect(ContratoService.calcularParcelasMaximasBoleto("data-invalida")).toBe(1);
  });
});
