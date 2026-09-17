import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(process.cwd());
const ler = (arquivo: string) => fs.readFileSync(path.join(raiz, arquivo), "utf8");

describe("campos editoriais da excursão", () => {
  it("mantém migration forward-only para conteúdo comercial da excursão", () => {
    const migration = ler("drizzle/0035_campos_editoriais_eventos.sql");
    const schema = ler("server/db/schema.ts");
    const journal = ler("drizzle/meta/_journal.json");
    expect(migration).toContain("ALTER TABLE eventos");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS subtitulo");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS atracoes_programacao");
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i);
    expect(schema).toContain('subtitulo: varchar("subtitulo"');
    expect(schema).toContain('informacoes_praticas: text("informacoes_praticas")');
    expect(journal).toContain('"tag": "0035_campos_editoriais_eventos"');
  });

  it("salva os campos no admin e os apresenta na vitrine pública", () => {
    const rotas = ler("server/routes/eventos.ts");
    const admin = ler("apps/web/src/pages/admin/Eventos.tsx");
    const publico = ler("apps/web/src/pages/Eventos.tsx");
    expect(rotas).toContain("atracoes_programacao");
    expect(rotas).toContain("informacoes_praticas");
    expect(admin).toContain("Título de destaque");
    expect(admin).toContain("Atrações e programação");
    expect(admin).toContain("Informações práticas");
    expect(publico).toContain("evento.subtitulo");
    expect(publico).toContain("evento.atracoes_programacao");
    expect(publico).toContain("evento.informacoes_praticas");
    expect(publico).toContain("Detalhes da excursão");
    expect(publico).toContain("object-contain");
    expect(publico).toContain("CapacidadesResumo");
    expect(publico).toContain("capacidades_por_forma");
  });

  it("permite abrir uma excursão pelo nome a partir da home", () => {
    const home = ler("apps/web/src/pages/publico/Home.tsx");
    expect(home).toContain("Ver detalhes da excursão");
    expect(home).toContain("/excursao/${slugify(oferta.evento.nome)}");
  });
});
