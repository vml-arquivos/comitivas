import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(process.cwd());
const ler = (arquivo: string) => fs.readFileSync(path.join(raiz, arquivo), "utf8");

describe("períodos múltiplos dentro do pacote", () => {
  it("mantém migration forward-only e vínculo opcional na reserva", () => {
    const schema = ler("server/db/schema.ts");
    const migration = ler("drizzle/0024_periodos_por_pacote.sql");
    const journal = ler("drizzle/meta/_journal.json");
    expect(schema).toContain('pgTable("pacote_periodos"');
    expect(schema).toContain("periodo_id: text(\"periodo_id\")");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS pacote_periodos");
    expect(migration).toContain("ALTER TABLE reservas ADD COLUMN IF NOT EXISTS periodo_id TEXT");
    expect(journal).toContain('"tag": "0024_periodos_por_pacote"');
  });

  it("valida, publica e persiste o período escolhido sem mudar a unidade de inventário", () => {
    const rotas = ler("server/routes/pacotes.ts");
    const servico = ler("server/services/pacoteService.ts");
    const publico = ler("server/routes/publico.ts");
    expect(rotas).toContain('router.post("/:pacote_id/periodos"');
    expect(rotas).toContain('router.delete("/:pacote_id/periodos/:periodo_id"');
    expect(rotas).toContain("periodos");
    expect(servico).toContain("periodo_id: config.periodo_id || null");
    expect(servico).toContain("O período escolhido não pertence a este pacote");
    expect(publico).toContain("pacotePeriodos");
    expect(servico).toContain("lotes SET \"vagas_disponíveis\"");
  });

  it("faz o cliente escolher e retomar o período e remove o card após arquivamento/exclusão", () => {
    const configurador = ler("apps/web/src/pages/cliente/ConfiguradorPacote.tsx");
    const intent = ler("apps/web/src/utils/checkoutIntent.ts");
    const admin = ler("apps/web/src/pages/admin/Eventos.tsx");
    const exclusao = ler("server/services/catalogoExclusaoService.ts");
    expect(configurador).toContain("Escolha o período");
    expect(configurador).toContain("periodo_id: periodoId || undefined");
    expect(intent).toContain("periodoId?: string");
    expect(admin).toContain("Períodos do pacote");
    expect(admin).toContain("setPacotesPorLote");
    expect(exclusao).toContain("DELETE FROM pacote_periodos");
  });
});
