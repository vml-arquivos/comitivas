import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { renderizarContratoModeloPadrao } from "../packages/contract-engine/contratoModeloPadrao.js";
import { resolverRecursosContratacao } from "../server/services/contratacaoRecursos.js";

async function fonte(caminho: string) {
  return readFile(new URL(caminho, import.meta.url), "utf8");
}

function snapshot(recursos: "transporte" | "hospedagem" | "completo") {
  const transporte = recursos !== "hospedagem";
  const hospedagem = recursos !== "transporte";
  return {
    cliente: { nome: "Cliente Teste", cpf: "00000000000", nascimento: "1990-01-01", endereco: "Endereço", telefone: "61999999999", email: "cliente@teste.com" },
    evento: { nome: "Excursão Teste", local: "Barretos/SP" },
    lote: { nome: "Primeiro período" },
    periodo: { check_in: "2027-08-20", check_out: "2027-08-23" },
    pacote: { nome: "Pacote Teste" },
    hospedagem: { modalidade: hospedagem ? "quarto_ventilador" : null, local: hospedagem ? "Hospedagem Teste" : "" },
    transporte: { rodoviario_incluido: transporte, local_embarque: "Brasília/DF", data_saida: "2027-08-20", data_retorno: "2027-08-23", horario_saida: "10:00", horario_retorno: "12:00", veiculo: "Ônibus" },
    financeiro: { total: "1900.00", desconto_pagamento: "0.00", forma_pagamento: "pix", parcelas: 1, cronograma: [] },
    servicos_inclusos: hospedagem ? ["Hospedagem"] : ["Transporte rodoviário"],
  } as any;
}

describe("capacidade integrada da contratação", () => {
  it("amarra cada modalidade somente aos recursos contratados", () => {
    expect(resolverRecursosContratacao("hospedagem", "camping")).toEqual({ transporte: true, hospedagem: false, estrutura_quarto: null });
    expect(resolverRecursosContratacao("hospedagem", "quarto_ventilador")).toEqual({ transporte: false, hospedagem: true, estrutura_quarto: "ventilador" });
    expect(resolverRecursosContratacao("onibus_hospedagem", "quarto_ar_condicionado")).toEqual({ transporte: true, hospedagem: true, estrutura_quarto: "ar_condicionado" });
    expect(resolverRecursosContratacao("onibus", "quarto_ar_condicionado")).toEqual({ transporte: true, hospedagem: false, estrutura_quarto: null });
  });

  it("gera contrato de camping sem cláusulas de hospedagem", () => {
    const html = renderizarContratoModeloPadrao({ reservaId: "reserva-1", snapshot: snapshot("transporte") });
    expect(html).toContain("sem contratação de hospedagem");
    expect(html).toContain("DO TRANSPORTE RODOVIÁRIO");
    expect(html).not.toContain("DOS DADOS DA HOSPEDAGEM");
  });

  it("gera contrato de hospedagem sem adicionar transporte", () => {
    const html = renderizarContratoModeloPadrao({ reservaId: "reserva-2", snapshot: snapshot("hospedagem") });
    expect(html).toContain("sem contratação de transporte rodoviário interestadual");
    expect(html).toContain("DOS DADOS DA HOSPEDAGEM");
    expect(html).not.toContain("DO TRANSPORTE RODOVIÁRIO");
  });

  it("mantém a migration aditiva e a alocação dentro da transação da reserva", async () => {
    const [migration, pacote, rota] = await Promise.all([
      fonte("../drizzle/0017_capacidade_contratacao.sql"),
      fonte("../server/services/pacoteService.ts"),
      fonte("../server/routes/pacotes.ts"),
    ]);
    expect(migration).toContain("recursos_contratados");
    expect(migration).toContain("estrutura");
    expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
    expect(pacote).toContain("alocarRecursosNaTransacao(tx");
    expect(pacote).toContain("capacidade-transporte:");
    expect(pacote).toContain("capacidade-hospedagem:");
    expect(rota).not.toContain("OperacaoOnibusService.alocarPrimeiroDisponivel");
  });

  it("protege redução de capacidade e libera recursos ao expirar o checkout", async () => {
    const [onibus, inventario] = await Promise.all([
      fonte("../server/services/operacaoOnibusService.ts"),
      fonte("../server/services/inventoryService.ts"),
    ]);
    expect(onibus).toContain("A capacidade não pode ser reduzida");
    expect(onibus).toContain("Fora da capacidade atual");
    expect(inventario).toContain("liberarRecursosFisicosNaTransacao");
    expect(inventario).toContain("UPDATE quarto_alocacoes SET status = 'cancelada'");
  });
});
