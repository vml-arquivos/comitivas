import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { normalizarConfiguracoesQuartos } from "../server/services/hospedagemService.js";
import { iniciaisPessoa } from "../apps/web/src/utils/nome.js";

async function fonte(caminho: string) {
  return readFile(new URL(caminho, import.meta.url), "utf8");
}

describe("cadastro em lote e identificação visual", () => {
  it("normaliza diferentes capacidades, grupos e estruturas", () => {
    expect(normalizarConfiguracoesQuartos([
      { quantidade: 3, capacidade: 4, genero: "feminino", estrutura: "ar_condicionado" },
      { quantidade: 2, capacidade: 2, genero: "masculino", estrutura: "ventilador" },
      { quantidade: 1, capacidade: 1, genero: "feminino", estrutura: "outro" },
    ])).toEqual([
      { quantidade: 3, capacidade: 4, genero: "feminino", estrutura: "ar_condicionado" },
      { quantidade: 2, capacidade: 2, genero: "masculino", estrutura: "ventilador" },
      { quantidade: 1, capacidade: 1, genero: "feminino", estrutura: "outro" },
    ]);
  });

  it("bloqueia lotes excessivos e capacidades inválidas", () => {
    expect(() => normalizarConfiguracoesQuartos([{ quantidade: 101, capacidade: 4, genero: "feminino", estrutura: "ar_condicionado" }])).toThrow();
    expect(() => normalizarConfiguracoesQuartos([{ quantidade: 1, capacidade: 0, genero: "masculino", estrutura: "ventilador" }])).toThrow();
  });

  it("gera iniciais legíveis sem usar conectivos", () => {
    expect(iniciaisPessoa("Patrícia Alves dias")).toBe("PD");
    expect(iniciaisPessoa("João da Silva")).toBe("JS");
    expect(iniciaisPessoa("Ana")).toBe("AN");
  });

  it("liga o endpoint idempotente e os detalhes por toque", async () => {
    const [rota, hospedagem, onibus] = await Promise.all([
      fonte("../server/routes/hospedagem.ts"),
      fonte("../apps/web/src/pages/admin/HospedagemQuartos.tsx"),
      fonte("../apps/web/src/pages/admin/OperacaoOnibus.tsx"),
    ]);
    expect(rota).toContain('router.post("/lotes/:loteId/quartos/lote"');
    expect(hospedagem).toContain("chave_idempotencia");
    expect(hospedagem).toContain("Incluir mais");
    expect(hospedagem).toContain("setHospedeDetalhe");
    expect(hospedagem).toContain("2xl:grid-cols-3");
    expect(hospedagem).toContain("Lotado");
    expect(onibus).toContain("iniciaisPessoa(assento.cliente_nome)");
  });
});
