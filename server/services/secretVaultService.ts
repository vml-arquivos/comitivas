import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

function masterKey(): Buffer {
  const raw = process.env.SYSTEM_SECRETS_MASTER_KEY?.trim();
  if (!raw) throw new Error("SYSTEM_SECRETS_MASTER_KEY não configurada");
  if (process.env.NODE_ENV === "production" && raw.length < 32) throw new Error("SYSTEM_SECRETS_MASTER_KEY deve ter pelo menos 32 caracteres em produção");
  return createHash("sha256").update(raw, "utf8").digest();
}

export class SecretVaultService {
  static encrypt(value: string | null | undefined): string | null {
    const plain = String(value ?? "").trim();
    if (!plain) return null;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
  }

  static decrypt(value: string | null | undefined): string | null {
    if (!value) return null;
    const [version, ivRaw, tagRaw, encryptedRaw] = String(value).split(".");
    if (version !== VERSION || !ivRaw || !tagRaw || !encryptedRaw) throw new Error("Segredo criptografado inválido");
    const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(ivRaw, "base64url"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
  }

  static masked(value: string | null | undefined): string | null {
    if (!value) return null;
    const text = String(value);
    if (text.length <= 8) return "••••••••";
    return `${text.slice(0, 3)}••••${text.slice(-4)}`;
  }
}
