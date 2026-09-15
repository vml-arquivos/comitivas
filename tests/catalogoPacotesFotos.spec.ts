import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(process.cwd());
const ler = (arquivo: string) => fs.readFileSync(path.join(raiz, arquivo), "utf8");

describe("catálogo simples de excursões, lotes e pacotes", () => {
  it("mantém o preço no pacote e não exige preço na criação da excursão", () => {
    const tela = ler("apps/web/src/pages/admin/Eventos.tsx");
    const lotes = ler("server/routes/lotes.ts");
    const pacotes = ler("server/routes/pacotes.ts");
    expect(tela).toContain("Preço por pessoa (R$)");
    expect(tela).toContain("O preço é cadastrado dentro do pacote");
    expect(tela).not.toContain("Valor-base");
    expect(lotes).not.toContain("valor_base === undefined) {");
    expect(lotes).toContain("valor_base === undefined || valor_base === null || valor_base === \"\"");
    expect(pacotes).toContain("valor_total");
  });

  it("preserva a criação de faixas opcionais para primeiro e segundo lote", () => {
    const tela = ler("apps/web/src/pages/admin/Eventos.tsx");
    expect(tela).toContain("Adicionar faixa");
    expect(tela).toContain("1º lote");
    expect(tela).toContain("2º lote");
    expect(tela).toContain("Criar novo pacote");
  });

  it("tem galeria separada para excursão e pacote, com limite de cinco no pacote", () => {
    const schema = ler("server/db/schema.ts");
    const migration = ler("drizzle/0023_galeria_fotos_pacotes.sql");
    const rotas = ler("server/routes/pacotes.ts");
    const publico = ler("server/routes/publico.ts");
    const tela = ler("apps/web/src/pages/admin/Eventos.tsx");
    expect(schema).toContain('pgTable("fotos_pacote"');
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS fotos_pacote");
    expect(rotas).toContain('router.post("/:pacote_id/fotos"');
    expect(rotas).toContain("existentes.length >= 5");
    expect(publico).toContain("fotosPacote");
    expect(tela).toContain("Imagens da excursão");
    expect(tela).toContain("Imagens do pacote");
    expect(tela).toContain("fotos.length >= 5");
  });
});
