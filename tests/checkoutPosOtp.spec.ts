import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

async function fonte(caminho: string) {
  return readFile(new URL(caminho, import.meta.url), "utf8");
}

describe("avanço automático após validação OTP", () => {
  it("confirma o contrato, inicia a etapa financeira e sai do checkout", async () => {
    const checkout = await fonte("../apps/web/src/pages/cliente/Checkout.tsx");
    expect(checkout).toContain("await api.post(`/contratos/otp/confirmar/${reservaId}`");
    expect(checkout).toContain("const avancou = await criarCobrancaEAvancar()");
    expect(checkout).toContain("navigate(`/confirmacao/${reservaId}`");
    expect(checkout).toContain("replace: true");
  });

  it("redireciona sessões já concluídas e não oferece OTP novamente", async () => {
    const checkout = await fonte("../apps/web/src/pages/cliente/Checkout.tsx");
    expect(checkout).toContain("if (!reservaId || isLoading || !contratoValidado || !pagamentoEmAndamento) return");
    expect(checkout).toContain("pagamentoData || pagamento");
    expect(checkout).toContain("Contrato validado, mas não foi possível iniciar a etapa financeira agora");
  });

  it("mantém a confirmação alinhada ao fluxo automático", async () => {
    const confirmacao = await fonte("../apps/web/src/pages/cliente/Confirmacao.tsx");
    expect(confirmacao).toContain("Sua contratação foi validada automaticamente");
    expect(confirmacao).toContain("Boleto bancário em preparação");
    expect(confirmacao).not.toContain("A administração valida o cadastro e o contrato assinado");
  });
});
