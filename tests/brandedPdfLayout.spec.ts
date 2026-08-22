import { describe, expect, it } from "vitest";
import {
  brandPresentation,
  footerTemplate,
  headerTemplate,
  normalizeBrand,
} from "../packages/contract-engine/brandedPdfLayout.js";

describe("branding seguro do PDF", () => {
  it("normaliza qualquer marca histórica ou desconhecida para comitiva", () => {
    expect(normalizeBrand("destrava")).toBe("comitiva");
    expect(normalizeBrand("permupay")).toBe("comitiva");
    expect(normalizeBrand("mercadopago")).toBe("comitiva");
    expect(normalizeBrand(undefined)).toBe("comitiva");
  });

  it("mantém apresentação, cabeçalho e rodapé exclusivamente Comitivas", () => {
    const presentation = brandPresentation("destrava");
    const header = headerTemplate("permupay");
    const footer = footerTemplate("marca-desconhecida");

    expect(presentation.name).toBe("Excursão das Comitivas");
    expect(presentation.borderColor).toBe("#B91C1C");
    expect(presentation.logoDataUri).toMatch(/^data:image\/png;base64,/);
    expect(header).toContain("Excursão das Comitivas");
    expect(footer).toContain("EXCURSÃO DAS COMITIVAS");
    expect(`${header}\n${footer}`).not.toMatch(/destrava|permupay|mercadopago/i);
  });
});

export {};

/*
 * O teste é deliberadamente puro: não gera PDF nem inicia Chromium. A geração
 * completa continua coberta pelos fluxos de contrato e é validada no build.
 */
