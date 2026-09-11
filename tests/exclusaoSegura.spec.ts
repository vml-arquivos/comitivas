import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function fonte(caminho: string) {
  return readFile(new URL(caminho, import.meta.url), "utf8");
}

describe("exclusão segura do catálogo e da operação", () => {
  it("arquiva excursão, período e pacote quando existe histórico", async () => {
    const servico = await fonte("../server/services/catalogoExclusaoService.ts");

    expect(servico).toContain("SELECT 1 FROM reservas WHERE pacote_id");
    expect(servico).toContain("SELECT 1 FROM reservas WHERE lote_id");
    expect(servico).toContain("UPDATE pacotes SET ativo = false");
    expect(servico).toContain("UPDATE lotes SET ativo = false");
    expect(servico).toContain("UPDATE eventos SET ativo = false");
    expect(servico).toContain("auditoria_admin");
  });

  it("não devolve consultas SQL nas respostas dos endpoints de exclusão", async () => {
    const [eventos, lotes, pacotes] = await Promise.all([
      fonte("../server/routes/eventos.ts"),
      fonte("../server/routes/lotes.ts"),
      fonte("../server/routes/pacotes.ts"),
    ]);

    expect(eventos).toContain("CatalogoExclusaoService.evento");
    expect(lotes).toContain("CatalogoExclusaoService.lote");
    expect(pacotes).toContain("CatalogoExclusaoService.pacote");
    expect(eventos).toContain('erro: "Não foi possível excluir ou arquivar a excursão"');
    expect(lotes).toContain('erro: "Não foi possível excluir ou arquivar o período"');
    expect(pacotes).toContain('erro: "Não foi possível excluir ou arquivar o pacote"');
  });

  it("retira ônibus e saídas sem apagar passageiros ou histórico", async () => {
    const [rotas, servico] = await Promise.all([
      fonte("../server/routes/operacao.ts"),
      fonte("../server/services/operacaoOnibusService.ts"),
    ]);

    expect(rotas).toContain('router.delete("/saidas/:saidaId"');
    expect(rotas).toContain('router.delete("/onibus/:onibusId"');
    expect(servico).toContain("excluirOuArquivarSaida");
    expect(servico).toContain("excluirOuArquivarOnibus");
    expect(servico).toContain("UPDATE assento_alocacoes SET status = 'cancelada'");
    expect(servico).toContain('registrar(tx, id, "saida", id, "saida_arquivada"');
  });
});
