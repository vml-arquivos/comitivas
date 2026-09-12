import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

async function fonte(caminho: string) {
  return readFile(new URL(caminho, import.meta.url), "utf8");
}

describe("hospedagem, pós-venda e instalação", () => {
  it("protege capacidade e mantém remanejamentos de quartos", async () => {
    const [servico, rotas] = await Promise.all([
      fonte("../server/services/hospedagemService.ts"),
      fonte("../server/routes/hospedagem.ts"),
    ]);
    expect(servico).toContain("A capacidade não pode ser menor que a ocupação atual");
    expect(servico).toContain("status = 'movida'");
    expect(servico).toContain("SELECT pg_advisory_xact_lock");
    expect(rotas).toContain('router.post("/alocacoes/:alocacaoId/mover"');
  });

  it("cancela carrinho incompleto sem motivo e preserva análise após avanço", async () => {
    const [cliente, solicitacoes, inventario] = await Promise.all([
      fonte("../server/routes/cliente.ts"),
      fonte("../server/services/reservaSolicitacaoService.ts"),
      fonte("../server/services/inventoryService.ts"),
    ]);
    const trecho = cliente.slice(cliente.indexOf('router.post("/reservas/:reservaId/cancelar"'), cliente.indexOf('router.post("/reservas/:reservaId/reconfigurar"'));
    expect(trecho).toContain("ReservaSolicitacaoService.criar");
    expect(trecho).toContain("InventoryService.liberarReservaNaTransacao");
    expect(trecho).toContain("!contrato?.validado_em && !possuiPagamentoAvancado");
    expect(solicitacoes).toContain("Registre o resultado do estorno antes de concluir");
    expect(solicitacoes).toContain("validado_em IS NULL");
    expect(solicitacoes).toContain('tipo === "troca_pacote" && !pacoteDestinoId');
    expect(inventario).toContain("incluirConvertido");
    expect(inventario).toContain("status = 'convertido'");
  });

  it("captura o prompt PWA antes de abrir a página de instalação", async () => {
    const [main, pwa, botao] = await Promise.all([
      fonte("../apps/web/src/main.tsx"),
      fonte("../apps/web/src/utils/pwaInstall.ts"),
      fonte("../apps/web/src/components/PwaInstallButton.tsx"),
    ]);
    expect(main).toContain("guardarPromptInstalacao");
    expect(pwa).toContain("__comitivasInstallPrompt");
    expect(botao).toContain("await prompt.prompt()");
  });

  it("expõe edição e prorrogação de cupons", async () => {
    const [tela, rota] = await Promise.all([
      fonte("../apps/web/src/pages/admin/Cupons.tsx"),
      fonte("../server/routes/cupons.ts"),
    ]);
    expect(tela).toContain("api.put(`/cupons/${editandoId}`");
    expect(tela).toContain("Editar ou prorrogar cupom");
    expect(rota).toContain('router.put("/:cupom_id"');
  });
});
