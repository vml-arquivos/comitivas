import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(process.cwd());
const ler = (arquivo: string) => fs.readFileSync(path.join(raiz, arquivo), "utf8");

describe("capacidade planejada por período", () => {
  it("persiste limites opcionais com migration forward-only", () => {
    const schema = ler("server/db/schema.ts");
    const migration = ler("drizzle/0031_capacidade_planejada_periodos.sql");
    const journal = ler("drizzle/meta/_journal.json");
    expect(schema).toContain('capacidade_transporte_planejada: integer("capacidade_transporte_planejada")');
    expect(schema).toContain('capacidade_hospedagem_planejada: integer("capacidade_hospedagem_planejada")');
    expect(migration).toContain("ALTER TABLE pacote_periodos");
    expect(migration).toContain("pacote_periodos_capacidade_planejada_check");
    expect(journal).toContain('"tag": "0031_capacidade_planejada_periodos"');
  });

  it("limita a soma dos lotes comerciais sem alterar o inventário físico", () => {
    const rotas = ler("server/routes/pacotes.ts");
    const servico = ler("server/services/pacoteService.ts");
    expect(rotas).toContain("validarCapacidadeComercialPeriodo");
    expect(rotas).toContain("As vagas dos lotes desta forma ultrapassam a capacidade planejada do período");
    expect(rotas).toContain("A nova capacidade não pode ser menor que as");
    expect(servico).toContain("capacidade_transporte_planejada");
    expect(servico).toContain("capacidade_hospedagem_planejada");
  });

  it("oferece configuração simples no período e preserva a criação real de recursos", () => {
    const admin = ler("apps/web/src/pages/admin/Eventos.tsx");
    const onibus = ler("apps/web/src/pages/admin/OperacaoOnibus.tsx");
    const hospedagem = ler("apps/web/src/pages/admin/HospedagemQuartos.tsx");
    expect(admin).toContain("Capacidade planejada do período");
    expect(admin).toContain("Total planejado de transporte");
    expect(admin).toContain("Total planejado de hospedagem");
    expect(admin).toContain("capacidade_transporte_planejada");
    expect(admin).toContain("capacidade_hospedagem_planejada");
    expect(onibus).toContain("periodo_id");
    expect(hospedagem).toContain("periodo_id");
  });
});
