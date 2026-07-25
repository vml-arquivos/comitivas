import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeFile } from "node:fs/promises";

const banco = vi.hoisted(() => ({
  resultados: [] as any[][],
}));

vi.mock("../server/db/index.js", () => ({
  db: {
    select: () => {
      const chain: any = {};
      chain.from = () => chain;
      chain.where = () => chain;
      chain.limit = async () => banco.resultados.shift() || [];
      return chain;
    },
    // ConfiguracaoService faz um select + (se vazio) um insert para garantir
    // a linha singleton de configurações. Nos testes de contrato, a fila de
    // resultados é dedicada aos dados da reserva/usuário/lote/evento/pacote,
    // então o select de configurações sempre vem vazio — este insert mock
    // apenas evita logs de erro, o fallback para os valores padrão já é
    // coberto pelo próprio ConfiguracaoService.
    insert: () => {
      const chain: any = {};
      chain.values = () => chain;
      chain.onConflictDoNothing = () => chain;
      chain.returning = async () => [];
      return chain;
    },
  },
}));

import { ContratoService } from "../server/services/contratoService.js";

function prepararDados(modalidade: "camping" | "quarto_ventilador" | "quarto_ar_condicionado") {
  banco.resultados = [
    [{
      id: "reserva-validacao",
      usuario_id: "cliente-validacao",
      lote_id: "lote-validacao",
      pacote_id: `pacote-${modalidade}`,
      itens_selecionados: [],
      desconto_aplicado: "0.00",
      desconto_pagamento: "0.00",
      valor_total: modalidade === "camping" ? "1900.00" : modalidade === "quarto_ventilador" ? "2200.00" : "2600.00",
      forma_pagamento: "boleto",
      quantidade_parcelas: 2,
      valor_parcela: modalidade === "camping" ? "950.00" : modalidade === "quarto_ventilador" ? "1100.00" : "1300.00",
      aceite_timestamp: new Date("2026-07-25T12:00:00-03:00"),
      aceite_ip: "127.0.0.1",
    }],
    [{
      nome: "Cliente de Validação",
      email: "cliente@exemplo.com",
      cpf: "12345678909",
      rg: "RG-VALIDACAO",
      telefone: "61999990000",
      data_nascimento: new Date("1990-01-10T12:00:00-03:00"),
      estado_civil: "Solteiro(a)",
      profissao: "Profissional",
      endereco: "Brasília/DF",
      nacionalidade: "Brasileira",
    }],
    [{
      id: "lote-validacao",
      evento_id: "evento-validacao",
      nome: "1º Fim de Semana — 20 a 23/08/2026",
      data_inicio: new Date("2026-08-20T00:00:00-03:00"),
      data_fim: new Date("2026-08-23T23:59:00-03:00"),
      data_embarque: new Date("2026-08-19T23:59:00-03:00"),
      data_retorno: new Date("2026-08-23T23:59:00-03:00"),
      local_embarque: "Brasília/DF, com embarque adicional em Goiânia/GO",
      local_hospedagem: "Chácara Recanto Novo Encantado ou Santa Thereza — Barretos/SP",
      valor_base: "1900.00",
    }],
    [{
      id: "evento-validacao",
      nome: "Excursão das Comitivas — Festa do Peão de Barretos 2026",
      local: "Parque do Peão — Barretos/SP",
      data_inicio: new Date("2026-08-20T00:00:00-03:00"),
      data_fim: new Date("2026-08-30T23:59:00-03:00"),
    }],
    [{
      id: `pacote-${modalidade}`,
      nome: modalidade === "camping" ? "Camping" : modalidade === "quarto_ventilador" ? "Quarto com ventilador" : "Quarto com ar-condicionado",
      modalidade_hospedagem: modalidade,
      valor_total: modalidade === "camping" ? "1900.00" : modalidade === "quarto_ventilador" ? "2200.00" : "2600.00",
    }],
  ];
}

describe("ContratoService.gerarContratoHTML", () => {
  beforeEach(() => prepararDados("camping"));

  it("usa o período e o itinerário do fim de semana", async () => {
    const html = await ContratoService.gerarContratoHTML({
      reserva_id: "reserva-validacao",
      usuario_id: "cliente-validacao",
      lote_id: "lote-validacao",
      aceite_ip: "127.0.0.1",
    });

    expect(html).toContain("20/08/2026 a 23/08/2026");
    expect(html).toContain("19/08/2026");
    expect(html).toContain("Brasília/DF, com embarque adicional em Goiânia/GO");
    expect(html).not.toContain("20/08/2026 a 30/08/2026");
    if (process.env.CONTRATO_HTML_OUTPUT) {
      await writeFile(process.env.CONTRATO_HTML_OUTPUT, html, "utf8");
    }
  });

  it("registra inclusões, CPF formatado e modalidade específica", async () => {
    const html = await ContratoService.gerarContratoHTML({
      reserva_id: "reserva-validacao",
      usuario_id: "cliente-validacao",
      lote_id: "lote-validacao",
      aceite_ip: "127.0.0.1",
    });

    expect(html).toContain("123.456.789-09");
    expect(html).toContain("10 horas de open bar");
    expect(html).toContain("Paratudo");
    expect(html).toContain("translado chácara ⇄ Parque do Peão");
    expect(html).toContain("O CONTRATANTE deverá levar seu próprio material de camping");
    expect(html).toMatch(/☒<\/span> CAMPING/);
    expect(html).toMatch(/☐<\/span> QUARTO COM VENTILADOR/);
  });
});
