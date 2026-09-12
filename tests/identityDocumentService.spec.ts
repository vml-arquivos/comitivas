import { describe, expect, it } from "vitest";
import { avaliarCorrespondenciaDocumento, configuracaoValidacaoDocumental, normalizarNome } from "../server/services/identityDocumentService.js";

const cadastro = {
  nome: "Ana Araújo Silva",
  cpf: "123.456.789-09",
  data_nascimento: new Date("1991-04-12T12:00:00Z"),
};

function leitura(overrides: Record<string, unknown> = {}) {
  return {
    tipo_documento: "CNH",
    nome_completo: "ANA ARAUJO SILVA",
    cpf: "12345678909",
    data_nascimento: "1991-04-12",
    numero_documento: "123456789",
    possui_foto: true,
    legivel: true,
    confianca: 0.97,
    motivos: [],
    ...overrides,
  };
}

describe("validação documental", () => {
  it("normaliza acentos e permite a mesma composição de nome", () => {
    expect(normalizarNome("  Ana  Araújo-Silva ")).toBe("ana araujo silva");
    expect(avaliarCorrespondenciaDocumento(leitura({ nome_completo: "Silva, Ana Araújo" }), cadastro, "cnh").status).toBe("aprovado");
  });

  it("aprova somente quando foto, leitura e dados correspondem", () => {
    const resultado = avaliarCorrespondenciaDocumento(leitura(), cadastro, "cnh");
    expect(resultado).toMatchObject({ status: "aprovado", nome_corresponde: true, cpf_corresponde: true, nascimento_corresponde: true, possui_foto: true, legivel: true });
  });

  it("rejeita CPF divergente sem confiar no navegador", () => {
    const resultado = avaliarCorrespondenciaDocumento(leitura({ cpf: "98765432100" }), cadastro, "cnh");
    expect(resultado.status).toBe("rejeitado");
    expect(resultado.cpf_corresponde).toBe(false);
  });

  it("manda leitura de baixa confiança para análise", () => {
    expect(avaliarCorrespondenciaDocumento(leitura({ confianca: 0.54 }), cadastro, "cnh").status).toBe("analise_manual");
  });

  it("aceita passaporte sem CPF somente quando nome, nascimento e foto correspondem", () => {
    const resultado = avaliarCorrespondenciaDocumento(leitura({ tipo_documento: "passaporte", cpf: null }), cadastro, "passaporte");
    expect(resultado.status).toBe("aprovado");
    expect(resultado.cpf_corresponde).toBeNull();
  });

  it("usa somente o pipeline local mesmo quando existe configuração histórica do Gemini", () => {
    const anterior = process.env.DOCUMENT_AI_PROVIDER;
    process.env.DOCUMENT_AI_PROVIDER = "gemini";
    expect(configuracaoValidacaoDocumental()).toMatchObject({ provedor: "local", modelo: "tesseract+opencv", leituraAutomaticaDisponivel: true });
    if (anterior === undefined) delete process.env.DOCUMENT_AI_PROVIDER;
    else process.env.DOCUMENT_AI_PROVIDER = anterior;
  });

  it("não aprova documento sem fotografia ou sem leitura legível", () => {
    expect(avaliarCorrespondenciaDocumento(leitura({ possui_foto: false }), cadastro, "cnh").status).toBe("rejeitado");
    expect(avaliarCorrespondenciaDocumento(leitura({ legivel: false }), cadastro, "cnh").status).toBe("rejeitado");
  });
});
