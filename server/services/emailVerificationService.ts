import { createHash, randomBytes } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { verificacoesEmail } from "../db/schema.js";
import { EmailProvider } from "./notificationProvider.js";
function hashCodigo(codigo: string): string { return createHash("sha256").update(codigo).digest("hex"); }
function gerarCodigoEmail(): string { return String(100000 + (randomBytes(4).readUInt32BE(0) % 900000)); }

export async function emitirConfirmacaoEmail(usuario: { id: string; email: string; nome: string }): Promise<boolean> {
  const envioRecente = (await db.select({ id: verificacoesEmail.id })
    .from(verificacoesEmail)
    .where(and(
      eq(verificacoesEmail.usuario_id, usuario.id),
      isNull(verificacoesEmail.usado_em),
      sql`${verificacoesEmail.criado_em} > CURRENT_TIMESTAMP - INTERVAL '60 seconds'`,
    ))
    .limit(1))[0];
  if (envioRecente) return true;

  const codigo = gerarCodigoEmail();
  const agora = new Date();
  await db.update(verificacoesEmail).set({ usado_em: agora }).where(and(eq(verificacoesEmail.usuario_id, usuario.id), isNull(verificacoesEmail.usado_em)));
  await db.insert(verificacoesEmail).values({ id: createId(), usuario_id: usuario.id, codigo_hash: hashCodigo(codigo), expira_em: new Date(agora.getTime() + 30 * 60 * 1000), enviado_em: agora });
  const envio = await new EmailProvider().sendEmailVerification(usuario.email, usuario.nome, codigo).catch((error: any) => ({ sent: false, reason: error?.message || "falha no provedor" }));
  if (!envio.sent) {
    await db.update(verificacoesEmail).set({ usado_em: new Date() }).where(and(eq(verificacoesEmail.usuario_id, usuario.id), isNull(verificacoesEmail.usado_em)));
    console.error(`[AUTH] Confirmação de e-mail não enviada: ${envio.reason || "provedor não confirmou o envio"}`);
  }
  return envio.sent;
}

