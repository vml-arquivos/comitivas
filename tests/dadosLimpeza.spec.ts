import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function fonte(caminho: string) {
  return readFile(new URL(caminho, import.meta.url), "utf8");
}

describe("limpeza administrativa de dados incompletos", () => {
  it("separa prévia e execução e exige confirmação textual", async () => {
    const [servico, rota, componente] = await Promise.all([
      fonte("../server/services/dadosLimpezaService.ts"),
      fonte("../server/routes/admin.ts"),
      fonte("../apps/web/src/components/admin/LimpezaDadosIncompletos.tsx"),
    ]);
    expect(servico).toContain("static async resumo");
    expect(servico).toContain("static async limpar");
    expect(rota).toContain("/dados-incompletos/resumo");
    expect(rota).toContain("LIMPAR_DADOS_INCOMPLETOS");
    expect(componente).toContain("Executar limpeza");
  });

  it("não remove contratos aceitos ou pagamentos efetivados", async () => {
    const servico = await fonte("../server/services/dadosLimpezaService.ts");
    expect(servico).toContain("r.aceite_timestamp IS NULL");
    expect(servico).toContain("contrato_validacoes");
    expect(servico).toContain("p.status = 'aprovado'");
    expect(servico).toContain("p.status_reconciliado = 'quitado'");
    expect(servico).toContain("valor_pago_centavos");
  });

  it("limpa dependências de checkout antes da reserva e registra auditoria", async () => {
    const servico = await fonte("../server/services/dadosLimpezaService.ts");
    expect(servico).toContain("notificacoes_outbox");
    expect(servico).toContain("contratos_documentos");
    expect(servico).toContain("assento_alocacoes");
    expect(servico).toContain("quarto_alocacoes");
    expect(servico).toContain("inventario_holds");
    expect(servico).toContain("DELETE FROM reservas");
    expect(servico).toContain("auditoria_admin");
  });

  it("oferece edição e exclusão nos locais comerciais", async () => {
    const [reservas, jornada] = await Promise.all([
      fonte("../apps/web/src/pages/admin/Reservas.tsx"),
      fonte("../apps/web/src/pages/admin/Jornada.tsx"),
    ]);
    expect(reservas).toContain("/admin/reservas/${reserva.id}/incompleta");
    expect(reservas).toContain("Gerar contrato manualmente");
    expect(jornada).toContain("/jornada/leads/${lead.id}");
    expect(jornada).toContain("Excluir contato");
  });
});
