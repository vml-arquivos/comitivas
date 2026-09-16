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

  it("preserva a configuração de lotes opcionais para primeiro e segundo lote", () => {
    const tela = ler("apps/web/src/pages/admin/Eventos.tsx");
    expect(tela).toContain("Configurar lotes");
    expect(tela).toContain("Configurar Pacotes");
    expect(tela).not.toContain("Gerir pacotes");
    expect(tela).toContain("1º lote");
    expect(tela).toContain("2º lote");
    expect(tela).toContain("Criar novo pacote");
    expect(tela).toContain("Configurar lote");
    expect(tela).toContain("scrollIntoView");
    expect(tela).toContain("order-2");
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

  it("arquiva pacote apenas quando existe uso real que exige preservar histórico", () => {
    const exclusao = ler("server/services/catalogoExclusaoService.ts");
    expect(exclusao).toContain("FROM contratos_documentos cd");
    expect(exclusao).toContain("FROM pagamentos pg");
    expect(exclusao).toContain("FROM quarto_alocacoes qa");
    expect(exclusao).toContain("UPDATE leads_origem SET pacote_id = NULL");
    expect(exclusao).toContain("UPDATE reserva_solicitacoes SET pacote_destino_id = NULL");
    expect(exclusao).toContain("UPDATE pacotes SET ativo = false");
  });

  it("permite configurar destaque do pacote e exibe foto da excursão e período na vitrine", () => {
    const schema = ler("server/db/schema.ts");
    const migration = ler("drizzle/0025_destaques_comerciais_pacotes.sql");
    const journal = ler("drizzle/meta/_journal.json");
    const rotas = ler("server/routes/pacotes.ts");
    const publico = ler("server/routes/publico.ts");
    const home = ler("apps/web/src/pages/publico/Home.tsx");
    const eventos = ler("apps/web/src/pages/Eventos.tsx");
    const configurador = ler("apps/web/src/pages/cliente/ConfiguradorPacote.tsx");
    const admin = ler("apps/web/src/pages/admin/Eventos.tsx");
    expect(schema).toContain('destaque_titulo: varchar("destaque_titulo"');
    expect(schema).toContain('destaque_subtitulo: varchar("destaque_subtitulo"');
    expect(schema).toContain('destaque_texto: text("destaque_texto")');
    expect(migration).toContain("ALTER TABLE pacotes ADD COLUMN IF NOT EXISTS destaque_titulo");
    expect(journal).toContain('"tag": "0025_destaques_comerciais_pacotes"');
    expect(rotas).toContain("textoDestaque(req.body?.destaque_titulo");
    expect(rotas).toContain("destaque_texto: pacote.destaque_texto");
    expect(publico).toContain("destaque_subtitulo: pacotes.destaque_subtitulo");
    expect(home).toContain("fotoEventoAtiva");
    expect(home).toContain("periodosOferta");
    expect(home).toContain("destaque_titulo");
    expect(eventos).toContain("Períodos disponíveis");
    expect(eventos).not.toContain("flatMap((modalidade)");
    expect(configurador).toContain("pacote.destaque_titulo");
    expect(configurador).toContain("periodoSolicitado");
    expect(configurador).toContain("Este período está esgotado");
    expect(admin).toContain("Destaque comercial na vitrine");
    expect(publico).toContain("vagas_disponiveis: capacidade.vagas_disponiveis");
    expect(home).not.toContain("params.set('periodo'");
  });

  it("trata camping como modalidade somente transporte", () => {
    const rotas = ler("server/routes/pacotes.ts");
    const recursos = ler("server/services/contratacaoRecursos.ts");
    expect(rotas).toContain('modalidade === "camping"');
    expect(rotas).toContain('["onibus"]');
    expect(recursos).toContain('modalidade === "camping"');
    expect(recursos).toContain("transporte: true, hospedagem: false");
  });
});
