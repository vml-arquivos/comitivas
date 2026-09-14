import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

async function fonte(caminho: string) { return readFile(new URL(caminho, import.meta.url), "utf8"); }

describe("contratação automática com validação documental assistida", () => {
  it("exige dados, e-mail e documento enviado sem esperar OCR", async () => {
    const contratos = await fonte("../server/routes/contratos.ts");
    expect(contratos).toContain("Confirme seu e-mail antes de aceitar o contrato");
    expect(contratos).toContain("Complete os dados essenciais antes do contrato");
    expect(contratos).toContain("documentoIdentidadeEnviado");
    expect(contratos).not.toContain("eq(clienteDocumentos.validacao_status, \"aprovado\")");
  });

  it("não exige aprovação administrativa para cobrança após OTP", async () => {
    const pagamentos = await fonte("../server/routes/pagamentos.ts");
    expect(pagamentos).toContain("cadastroAprovadoComEvidencia(cliente)");
    expect(pagamentos).not.toContain("contrato ainda não foi aprovado administrativamente");
    expect(pagamentos).toContain("boletos_em_preparacao");
  });

  it("responde ao upload antes do OCR e oferece câmera/arquivo", async () => {
    const [cliente, checkout] = await Promise.all([fonte("../server/routes/cliente.ts"), fonte("../apps/web/src/pages/cliente/Checkout.tsx")]);
    expect(cliente).toContain("analise_assincrona: true");
    expect(cliente).toContain("void IdentityDocumentService.validar(documento.id)");
    expect(checkout).toContain('capture="environment"');
    expect(checkout).toContain("Tirar foto");
    expect(checkout).toContain("Escolher arquivo");
    expect(checkout).toContain("Contratação aprovada");
  });

  it("normaliza pacotes de quarto automáticos para transporte + hospedagem", async () => {
    const migration = await fonte("../drizzle/0021_fluxo_automatico_contratacao.sql");
    const pacotes = await fonte("../server/routes/pacotes.ts");
    expect(migration).toContain("forma_contratacao = 'onibus_hospedagem'");
    expect(migration).toContain("contrato_modelo, 'auto'");
    expect(pacotes).toContain('formaPadrao = "onibus_hospedagem"');
  });
});
