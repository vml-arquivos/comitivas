import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

async function fonte(caminho: string) {
  return readFile(new URL(caminho, import.meta.url), "utf8");
}

describe("contratação com validação documental assistida", () => {
  it("preserva dados e e-mail como gates, mas torna aprovação administrativa configurável no contrato", async () => {
    const contratos = await fonte("../server/routes/contratos.ts");
    expect(contratos).toContain("Confirme seu e-mail antes de aceitar o contrato");
    expect(contratos).toContain("Complete os dados essenciais antes do contrato");
    expect(contratos).toContain("CONTRACT_REQUIRES_CADASTRO_APPROVAL");
  });

  it("mantém cobrança protegida por aprovação do cadastro e do contrato", async () => {
    const pagamentos = await fonte("../server/routes/pagamentos.ts");
    expect(pagamentos).toContain("cadastroAprovadoComEvidencia(cliente)");
    expect(pagamentos).toContain("contrato.aprovado_admin_em");
    expect(pagamentos).toContain('contrato.status !== "aprovado_admin"');
  });

  it("responde ao upload antes de esperar OCR e oferece câmera/arquivo no checkout", async () => {
    const [cliente, checkout] = await Promise.all([
      fonte("../server/routes/cliente.ts"),
      fonte("../apps/web/src/pages/cliente/Checkout.tsx"),
    ]);
    expect(cliente).toContain("analise_assincrona: true");
    expect(cliente).toContain("void IdentityDocumentService.validar(documento.id)");
    expect(checkout).toContain('capture="environment"');
    expect(checkout).toContain("Tirar foto");
    expect(checkout).toContain("Escolher arquivo");
  });
});
