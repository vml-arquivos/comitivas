import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

async function fonte(caminho: string) {
  return readFile(new URL(caminho, import.meta.url), "utf8");
}

describe("amarração de cliente, vendedor e inventário em grupo", () => {
  it("remove somente a unicidade por reserva e preserva a exclusividade física", async () => {
    const [migration, onibus, quartos] = await Promise.all([
      fonte("../drizzle/0020_alocacoes_por_participante.sql"),
      fonte("../drizzle/0013_operacao_onibus_equipe.sql"),
      fonte("../drizzle/0014_fila_onibus_quartos_solicitacoes.sql"),
    ]);
    expect(migration).toContain("DROP INDEX IF EXISTS assento_alocacoes_reserva_ativa_unico");
    expect(migration).toContain("DROP INDEX IF EXISTS quarto_alocacoes_reserva_ativa_unica");
    expect(onibus).toContain("assento_alocacoes_assento_ativo_unico");
    expect(quartos).toContain("quarto_alocacoes_vaga_ativa_unica");
  });

  it("aloca transporte e hospedagem por participante e exige o grupo correto", async () => {
    const [servico, configurador, hospedagem, onibus] = await Promise.all([
      fonte("../server/services/pacoteService.ts"),
      fonte("../apps/web/src/pages/cliente/ConfiguradorPacote.tsx"),
      fonte("../server/services/hospedagemService.ts"),
      fonte("../server/services/operacaoOnibusService.ts"),
    ]);
    expect(servico).toContain("type PessoaAlocacao");
    expect(servico).toContain("pessoa.participanteId");
    expect(servico).toContain("participantes.some((participante) => !participante.sexo_operacional)");
    expect(servico).toContain("reserva_participantes rp");
    expect(configurador).toContain("Informe o sexo de cada pessoa para reservar o quarto correto");
    expect(hospedagem).toContain("Garante uma vaga compatível para cada participante");
    expect(hospedagem).toContain("grupo_participante");
    expect(hospedagem).toContain("Não há hóspede sem quarto compatível com o destino selecionado");
    expect(hospedagem).toContain("SET quarto_id = ${quartoId}, vaga_quarto_id");
    expect(onibus).toContain("rp.assento_id = aa.assento_id");
    expect(onibus).toContain("Todos os viajantes desta reserva já possuem poltrona");
    expect(onibus).toContain("SET assento_id = ${novoAssentoId}");
    expect(onibus).toContain("COALESCE(rp.nome_completo, u.nome) AS nome");
  });

  it("mantém o painel do vendedor limitado às reservas atribuídas", async () => {
    const admin = await fonte("../server/routes/admin.ts");
    expect(admin).toContain("await db.select().from(reservas).where(eq(reservas.vendedor_id, req.usuario.id))");
    expect(admin).toContain("...reservasConsultadas.map((reserva) => reserva.usuario_id)");
  });

  it("expõe rotas estáveis e dados de viajantes e cupons na conta", async () => {
    const [app, conta, cliente, layout] = await Promise.all([
      fonte("../apps/web/src/App.tsx"),
      fonte("../apps/web/src/pages/cliente/MinhaConta.tsx"),
      fonte("../server/routes/cliente.ts"),
      fonte("../apps/web/src/layouts/MainLayout.tsx"),
    ]);
    expect(app).toContain('path="/minha-conta/:secao?"');
    expect(app).toContain('to="/minha-conta/viagens"');
    expect(conta).toContain("['viajantes', 'Viajantes']");
    expect(conta).toContain("['cupons', 'Cupons']");
    expect(cliente).toContain("participantes: participantesLista");
    expect(cliente).toContain("cupons: cuponsLista");
    expect(layout).toContain("!location.pathname.startsWith('/minha-conta')");
  });

  it("usa OCR e conferência local, sem aprovação por MIME", async () => {
    const servico = await fonte("../server/services/identityDocumentService.ts");
    expect(servico).toContain("const leitura = await lerLocal(arquivo, mimeReal)");
    expect(servico).toContain("avaliarCorrespondenciaDocumento(leitura");
    expect(servico).not.toContain("aprovarDocumentoPermissivo");
    expect(servico).not.toContain('modelo: "mime-signature"');
  });
});
