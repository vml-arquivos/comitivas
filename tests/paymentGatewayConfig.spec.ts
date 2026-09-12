import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PaymentGatewayAdapter } from "../server/services/paymentGatewayAdapter.js";

const nomes = ["NODE_ENV", "PAYMENT_GATEWAY", "CORA_CLIENT_ID", "CORA_CERT_PATH", "CORA_PRIVATE_KEY_PATH", "CORA_WEBHOOK_PUBLIC_URL", "OTP_PEPPER"];
const ambienteOriginal = Object.fromEntries(nomes.map((nome) => [nome, process.env[nome]]));

function arquivosTemporarios() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cora-test-"));
  const cert = path.join(dir, "cert.pem"); const key = path.join(dir, "key.pem");
  fs.writeFileSync(cert, "cert"); fs.writeFileSync(key, "key");
  return { cert, key, dir };
}

afterEach(() => {
  for (const [nome, valor] of Object.entries(ambienteOriginal)) { if (valor === undefined) delete process.env[nome]; else process.env[nome] = valor; }
});

describe("PaymentGatewayAdapter.validarConfiguracaoSegura", () => {
  it("rejeita mock em produção", () => {
    process.env.NODE_ENV = "production"; process.env.PAYMENT_GATEWAY = "mock";
    expect(() => PaymentGatewayAdapter.validarConfiguracaoSegura()).toThrow("mock não é permitido em produção");
  });

  it("rejeita Mercado Pago e Asaas sem qualquer compatibilidade produtiva", () => {
    process.env.NODE_ENV = "production";
    for (const legado of ["mercadopago", "asaas"]) { process.env.PAYMENT_GATEWAY = legado; expect(() => PaymentGatewayAdapter.validarConfiguracaoSegura()).toThrow("somente cora"); }
  });

  it("exige Client ID, arquivos mTLS e webhook HTTPS para Cora em produção", () => {
    process.env.NODE_ENV = "production"; process.env.PAYMENT_GATEWAY = "cora"; process.env.CORA_WEBHOOK_PUBLIC_URL = "https://exemplo.com/api/pagamentos/webhook/cora";
    delete process.env.CORA_CLIENT_ID; delete process.env.CORA_CERT_PATH; delete process.env.CORA_PRIVATE_KEY_PATH;
    expect(() => PaymentGatewayAdapter.validarConfiguracaoSegura()).toThrow("CORA_CLIENT_ID");
    const arquivos = arquivosTemporarios(); process.env.CORA_CLIENT_ID = "client-stage-real"; process.env.CORA_CERT_PATH = arquivos.cert; process.env.CORA_PRIVATE_KEY_PATH = arquivos.key;
    process.env.CORA_WEBHOOK_PUBLIC_URL = "http://exemplo.com/webhook";
    expect(() => PaymentGatewayAdapter.validarConfiguracaoSegura()).toThrow("HTTPS");
    process.env.CORA_WEBHOOK_PUBLIC_URL = "https://exemplo.com/webhook";
    expect(() => PaymentGatewayAdapter.validarConfiguracaoSegura()).not.toThrow();
    fs.rmSync(arquivos.dir, { recursive: true, force: true });
  });

  it("permite boot local sem Cora configurada, mas não cria pagamento sem credenciais", () => {
    process.env.NODE_ENV = "development"; process.env.PAYMENT_GATEWAY = "cora"; delete process.env.CORA_CLIENT_ID; delete process.env.CORA_CERT_PATH; delete process.env.CORA_PRIVATE_KEY_PATH;
    expect(() => PaymentGatewayAdapter.validarConfiguracaoSegura()).not.toThrow();
  });

  it("mantém a normalização de liquidação final PAID_OUT no adapter", async () => {
    const { readFile } = await import("node:fs/promises");
    const fonte = await readFile(new URL("../server/services/paymentGatewayAdapter.ts", import.meta.url), "utf8");
    expect(fonte).toContain('case "PAID_OUT": return "aprovado";');
  });

  it("mantém certificados e chaves fora do frontend e do cofre de produção", async () => {
    const { readFile } = await import("node:fs/promises");
    const [tela, config] = await Promise.all([
      readFile(new URL("../apps/web/src/pages/admin/GatewayPagamento.tsx", import.meta.url), "utf8"),
      readFile(new URL("../server/services/gatewayConfigService.ts", import.meta.url), "utf8"),
    ]);
    expect(tela).not.toContain("private_key_pem");
    expect(tela).not.toContain("certificate_pem");
    expect(config).toContain("Segredos Cora são somente runtime");
    expect(config).toContain("if (this.runtimeOnly()) return false;");
  });
});
