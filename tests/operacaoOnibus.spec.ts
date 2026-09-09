import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { gerarLayoutAssentos } from "../server/services/operacaoOnibusService.js";

describe("mapa físico de ônibus", () => {
  it("gera todas as poltronas em fileiras de quatro posições", () => {
    const layout = gerarLayoutAssentos(44);

    expect(layout).toHaveLength(44);
    expect(layout[0]).toEqual({ numero: 1, fileira: 1, posicao: "A" });
    expect(layout[3]).toEqual({ numero: 4, fileira: 1, posicao: "D" });
    expect(layout[43]).toEqual({ numero: 44, fileira: 11, posicao: "D" });
  });

  it("rejeita capacidades fora do limite operacional", () => {
    expect(() => gerarLayoutAssentos(0)).toThrow("entre 1 e 100");
    expect(() => gerarLayoutAssentos(101)).toThrow("entre 1 e 100");
    expect(() => gerarLayoutAssentos(44.5)).toThrow("número inteiro");
  });

  it("mantém a migration operacional aditiva e protege alocações ativas", async () => {
    const migration = await readFile(new URL("../drizzle/0013_operacao_onibus_equipe.sql", import.meta.url), "utf8");

    expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN)\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).toContain("assento_alocacoes_assento_ativo_unico");
    expect(migration).toContain("assento_alocacoes_reserva_ativa_unico");
    expect(migration).toContain("assento_holds_ativo_unico");
  });
});
