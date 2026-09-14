import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

async function fonte(caminho: string) {
  return readFile(new URL(caminho, import.meta.url), "utf8");
}

describe("seleção explícita do tipo de contratação", () => {
  it("mostra as três opções antes do pacote e persiste a escolha", async () => {
    const [configurador, intent] = await Promise.all([
      fonte("../apps/web/src/pages/cliente/ConfiguradorPacote.tsx"),
      fonte("../apps/web/src/utils/checkoutIntent.ts"),
    ]);
    expect(configurador).toContain("O que você quer contratar?");
    expect(configurador).toContain("Transporte + hospedagem");
    expect(configurador).toContain("Somente hospedagem");
    expect(configurador).toContain("Somente transporte");
    expect(configurador).toContain("forma_contratacao: formaContratacao");
    expect(intent).toContain("formaContratacao?: 'onibus' | 'hospedagem' | 'onibus_hospedagem'");
  });

  it("não inventa preço: cada tipo só usa pacote publicado para aquele escopo", async () => {
    const configurador = await fonte("../apps/web/src/pages/cliente/ConfiguradorPacote.tsx");
    const servico = await fonte("../server/services/pacoteService.ts");
    expect(configurador).toContain("formaPublica(pacote.forma_contratacao) === formaContratacao");
    expect(configurador).toContain("O preço exibido é o preço real desse pacote");
    expect(servico).toContain("validarFormaContratacaoSelecionada(config, pacoteSelecionado)");
    expect(servico).toContain("O tipo de contratação escolhido não corresponde ao pacote selecionado");
  });

  it("confirma novamente o escopo no checkout antes do contrato/pagamento", async () => {
    const checkout = await fonte("../apps/web/src/pages/cliente/Checkout.tsx");
    expect(checkout).toContain("Tipo de contratação");
    expect(checkout).toContain("tipoContratacaoLabel");
    expect(checkout).toContain("Este é o escopo que será usado no contrato e na operação da sua reserva");
  });

  it("permite ao admin publicar preço separado para cada tipo de contrato", async () => {
    const admin = await fonte("../apps/web/src/pages/admin/Eventos.tsx");
    expect(admin).toContain("Tipo de contratação deste pacote");
    expect(admin).toContain("publique um pacote com preço próprio para cada tipo desejado");
    expect(admin).toContain('value="hospedagem_transporte"');
  });
});
