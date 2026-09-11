import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

async function fonte(caminho: string) {
  return readFile(new URL(caminho, import.meta.url), "utf8");
}

describe("checkout, cupom e contrato", () => {
  it("preserva o cupom durante login e retomada da compra", async () => {
    const [configurador, intent] = await Promise.all([
      fonte("../apps/web/src/pages/cliente/ConfiguradorPacote.tsx"),
      fonte("../apps/web/src/utils/checkoutIntent.ts"),
    ]);

    expect(intent).toContain("cupomCodigo?: string");
    expect(configurador).toContain("setCupomCodigo(intencaoSalva.cupomCodigo || '')");
    expect(configurador).toContain("cupomCodigo: cupomCodigo.trim() || undefined");
    expect(configurador).toContain("cupom_codigo: cupomCodigo.trim() || undefined");
    expect(configurador).toContain("lead_intent_token: leadIntentToken || undefined");
  });

  it("mostra no checkout o cupom realmente persistido pelo backend", async () => {
    const [checkout, rota] = await Promise.all([
      fonte("../apps/web/src/pages/cliente/Checkout.tsx"),
      fonte("../server/routes/pacotes.ts"),
    ]);

    expect(checkout).toContain("reserva?.desconto_cupom ?? reserva?.desconto_aplicado");
    expect(checkout).toContain("reserva?.cupom_codigo");
    expect(rota).toContain("cupom_codigo: cupomSelecionado?.codigo || null");
    expect(rota).toContain("desconto_cupom: reserva[0].desconto_aplicado");
    expect(rota).toContain('res.status(400).json({ erro: error?.message');
  });

  it("serializa datas do checkout sem assumir que o driver devolveu Date", async () => {
    const rota = await fonte("../server/routes/pacotes.ts");
    expect(rota).toContain("function dataIsoSegura(valor: unknown)");
    expect(rota).not.toContain("dataLimite?.toISOString()");
    expect(rota).not.toContain("dataLimitePagamento?.toISOString()");
  });
});
