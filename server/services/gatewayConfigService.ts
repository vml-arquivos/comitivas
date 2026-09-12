import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../db/index.js";
import { gatewayCredenciais } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { SecretVaultService } from "./secretVaultService.js";

export type GatewayAdminInput = {
  ambiente?: "stage" | "production";
  ativo?: boolean;
  client_id?: string;
  certificate_pem?: string;
  private_key_pem?: string;
  webhook_secret?: string;
  token_url?: string;
  api_base?: string;
  installments_api_base?: string;
  webhook_public_url?: string;
  http_timeout_ms?: number;
  carne_timeout_ms?: number;
};

export class GatewayConfigService {
  private static runtimeOnly() {
    return process.env.NODE_ENV === "production" || process.env.CORA_ENV === "production";
  }

  private static async runtimeStatus() {
    const clientId = process.env.CORA_CLIENT_ID?.trim() || "";
    const certPath = process.env.CORA_CERT_PATH?.trim() || "";
    const keyPath = process.env.CORA_PRIVATE_KEY_PATH?.trim() || "";
    const webhook = process.env.CORA_WEBHOOK_HMAC_SECRET?.trim() || "";
    let certificados = false;
    if (certPath && keyPath) {
      try {
        await Promise.all([fs.access(certPath), fs.access(keyPath)]);
        certificados = true;
      } catch { certificados = false; }
    }
    return { client: Boolean(clientId), certificados, webhook: Boolean(webhook), configurado: Boolean(clientId && certificados) };
  }

  static async obterMascara() {
    const linha = (await db.select().from(gatewayCredenciais).where(eq(gatewayCredenciais.id, "cora")).limit(1))[0];
    if (!linha) {
      const runtime = await this.runtimeStatus();
      return { id: "cora", provedor: "cora", ambiente: process.env.CORA_ENV === "production" ? "production" : "stage", ativo: runtime.configurado, configurado: runtime.configurado, client_id_mascarado: runtime.client ? "configurado no Coolify" : null, certificado_configurado: runtime.certificados, chave_privada_configurada: runtime.certificados, webhook_configurado: runtime.webhook };
    }
    let clientId: string | null = null;
    try { clientId = SecretVaultService.decrypt(linha.client_id_enc); } catch { clientId = null; }
    const runtime = await this.runtimeStatus();
    const dbConfigurado = Boolean(linha.client_id_enc && linha.certificate_enc && linha.private_key_enc);
    const configurado = this.runtimeOnly() ? runtime.configurado : dbConfigurado || runtime.configurado;
    return {
      id: linha.id,
      provedor: linha.provedor,
      ambiente: linha.ambiente,
      ativo: Boolean(linha.ativo),
      configurado,
      client_id_mascarado: clientId ? SecretVaultService.masked(clientId) : runtime.client ? "configurado no Coolify" : null,
      certificado_configurado: this.runtimeOnly() ? runtime.certificados : Boolean(linha.certificate_enc) || runtime.certificados,
      chave_privada_configurada: this.runtimeOnly() ? runtime.certificados : Boolean(linha.private_key_enc) || runtime.certificados,
      webhook_configurado: this.runtimeOnly() ? runtime.webhook : Boolean(linha.webhook_secret_enc) || runtime.webhook,
      token_url: linha.token_url,
      api_base: linha.api_base,
      installments_api_base: linha.installments_api_base,
      webhook_public_url: linha.webhook_public_url,
      http_timeout_ms: linha.http_timeout_ms,
      carne_timeout_ms: linha.carne_timeout_ms,
      ultimo_teste_em: linha.ultimo_teste_em,
      ultimo_teste_status: linha.ultimo_teste_status,
      ultimo_teste_mensagem: linha.ultimo_teste_mensagem,
      atualizado_em: linha.atualizado_em,
      atualizado_por: linha.atualizado_por,
    };
  }

  static async salvar(dados: GatewayAdminInput, atualizadoPor: string) {
    if (this.runtimeOnly() && [dados.client_id, dados.certificate_pem, dados.private_key_pem, dados.webhook_secret].some((valor) => String(valor || "").trim())) {
      throw new Error("Segredos Cora são somente runtime; configure-os no Coolify e não os envie pelo painel");
    }
    const atual = (await db.select().from(gatewayCredenciais).where(eq(gatewayCredenciais.id, "cora")).limit(1))[0];
    const runtime = await this.runtimeStatus();
    const ambiente = dados.ambiente === "production" ? "production" : dados.ambiente === "stage" ? "stage" : (atual?.ambiente || "stage");
    const ativoFinal = dados.ativo !== undefined ? Boolean(dados.ativo) : Boolean(atual?.ativo);
    const clientConfigurado = this.runtimeOnly() ? runtime.client : Boolean(dados.client_id?.trim() || atual?.client_id_enc);
    const certificadoConfigurado = this.runtimeOnly() ? runtime.certificados : Boolean(dados.certificate_pem?.trim() || atual?.certificate_enc);
    const chaveConfigurada = this.runtimeOnly() ? runtime.certificados : Boolean(dados.private_key_pem?.trim() || atual?.private_key_enc);
    const webhookConfigurado = this.runtimeOnly() ? runtime.webhook : Boolean(dados.webhook_secret?.trim() || atual?.webhook_secret_enc || process.env.CORA_WEBHOOK_HMAC_SECRET?.trim());
    const webhookPublico = String(dados.webhook_public_url ?? atual?.webhook_public_url ?? process.env.CORA_WEBHOOK_PUBLIC_URL ?? "").trim();
    if (ativoFinal && (!clientConfigurado || !certificadoConfigurado || !chaveConfigurada)) {
      throw new Error("Para ativar a Cora, informe Client ID, certificado mTLS e private key");
    }
    if (ativoFinal && ambiente === "production" && (!webhookConfigurado || !webhookPublico.startsWith("https://"))) {
      throw new Error("Em produção, configure o segredo do webhook e uma URL pública HTTPS antes de ativar a Cora");
    }
    await db.insert(gatewayCredenciais).values({ id: "cora", provedor: "cora", ambiente, ativo: false }).onConflictDoNothing();
    await db.update(gatewayCredenciais).set({
      ambiente,
      ...(dados.ativo !== undefined ? { ativo: Boolean(dados.ativo) } : {}),
      ...(dados.client_id?.trim() ? { client_id_enc: SecretVaultService.encrypt(dados.client_id) } : {}),
      ...(dados.certificate_pem?.trim() ? { certificate_enc: SecretVaultService.encrypt(dados.certificate_pem) } : {}),
      ...(dados.private_key_pem?.trim() ? { private_key_enc: SecretVaultService.encrypt(dados.private_key_pem) } : {}),
      ...(dados.webhook_secret?.trim() ? { webhook_secret_enc: SecretVaultService.encrypt(dados.webhook_secret) } : {}),
      ...(dados.token_url !== undefined ? { token_url: dados.token_url.trim() || null } : {}),
      ...(dados.api_base !== undefined ? { api_base: dados.api_base.trim() || null } : {}),
      ...(dados.installments_api_base !== undefined ? { installments_api_base: dados.installments_api_base.trim() || null } : {}),
      ...(dados.webhook_public_url !== undefined ? { webhook_public_url: dados.webhook_public_url.trim() || null } : {}),
      ...(dados.http_timeout_ms !== undefined ? { http_timeout_ms: Number.isFinite(Number(dados.http_timeout_ms)) ? Math.max(1000, Math.min(120000, Math.trunc(Number(dados.http_timeout_ms)))) : null } : {}),
      ...(dados.carne_timeout_ms !== undefined ? { carne_timeout_ms: Number.isFinite(Number(dados.carne_timeout_ms)) ? Math.max(1000, Math.min(180000, Math.trunc(Number(dados.carne_timeout_ms)))) : null } : {}),
      atualizado_por: atualizadoPor,
      atualizado_em: new Date(),
    }).where(eq(gatewayCredenciais.id, "cora"));
    return this.obterMascara();
  }

  static async aplicarRuntime(): Promise<boolean> {
    if (this.runtimeOnly()) return false;
    const linha = (await db.select().from(gatewayCredenciais).where(eq(gatewayCredenciais.id, "cora")).limit(1))[0];
    if (!linha?.ativo || !linha.client_id_enc || !linha.certificate_enc || !linha.private_key_enc) return false;
    const clientId = SecretVaultService.decrypt(linha.client_id_enc);
    const cert = SecretVaultService.decrypt(linha.certificate_enc);
    const key = SecretVaultService.decrypt(linha.private_key_enc);
    const webhook = SecretVaultService.decrypt(linha.webhook_secret_enc);
    if (!clientId || !cert || !key) return false;
    const base = path.resolve(process.env.STORAGE_PATH || "./uploads", ".gateway");
    await fs.mkdir(base, { recursive: true, mode: 0o700 });
    const certPath = path.join(base, "cora-cert.pem");
    const keyPath = path.join(base, "cora-key.pem");
    await fs.writeFile(certPath, cert, { mode: 0o600 });
    await fs.writeFile(keyPath, key, { mode: 0o600 });
    process.env.CORA_CLIENT_ID = clientId;
    process.env.CORA_CERT_PATH = certPath;
    process.env.CORA_PRIVATE_KEY_PATH = keyPath;
    process.env.CORA_ENV = linha.ambiente === "production" ? "production" : "stage";
    const production = linha.ambiente === "production";
    process.env.CORA_API_BASE_URL = linha.api_base || (production ? "https://matls-clients.api.cora.com.br" : "https://matls-clients.api.stage.cora.com.br");
    process.env.CORA_TOKEN_URL = linha.token_url || `${process.env.CORA_API_BASE_URL}/token`;
    process.env.CORA_INSTALLMENTS_API_BASE_URL = linha.installments_api_base || (production ? "https://api.cora.com.br" : "https://api.stage.cora.com.br");
    if (linha.webhook_public_url) process.env.CORA_WEBHOOK_PUBLIC_URL = linha.webhook_public_url;
    if (linha.http_timeout_ms) process.env.CORA_HTTP_TIMEOUT_MS = String(linha.http_timeout_ms);
    if (linha.carne_timeout_ms) process.env.CORA_CARNE_TIMEOUT_MS = String(linha.carne_timeout_ms);
    if (webhook) process.env.CORA_WEBHOOK_HMAC_SECRET = webhook;
    return true;
  }

  static async registrarTeste(status: "ok" | "erro", mensagem: string, atualizadoPor: string) {
    await db.update(gatewayCredenciais).set({
      ultimo_teste_em: new Date(),
      ultimo_teste_status: status,
      ultimo_teste_mensagem: mensagem.slice(0, 1000),
      atualizado_por: atualizadoPor,
      atualizado_em: new Date(),
    }).where(eq(gatewayCredenciais.id, "cora"));
  }
}
