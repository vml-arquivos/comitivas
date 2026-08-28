import { and, eq, lte, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { notificacoesOutbox, reservas, usuarios } from "../db/schema.js";
import { EmailService } from "./emailService.js";

function destinatarioMascarado(email: string): string {
  const [local, dominio] = email.split("@");
  if (!local || !dominio) return "***";
  return `${local.slice(0, 2)}***@${dominio}`;
}

export class NotificationOutboxService {
  static async enfileirarEmail(input: { reserva_id?: string; usuario_id?: string; tipo: string; chave_idempotente: string; template: string; versao?: string; destinatario: string; assunto: string; corpo_html: string; anexos?: Array<{ nome: string; caminho: string }> }) {
    const resultado = await db.insert(notificacoesOutbox).values({
      reserva_id: input.reserva_id || null,
      tipo: input.tipo,
      chave_idempotente: input.chave_idempotente,
      template: input.template,
      versao: input.versao || "2026.1",
      destinatario_mascarado: destinatarioMascarado(input.destinatario),
      payload: { usuario_id: input.usuario_id || null, assunto: input.assunto, corpo_html: input.corpo_html },
      anexos: input.anexos || [],
      status: "pendente",
      proxima_tentativa: new Date(),
    }).onConflictDoNothing({ target: notificacoesOutbox.chave_idempotente }).returning({ id: notificacoesOutbox.id });
    return resultado[0]?.id || null;
  }

  static async processarLote(limite = 20): Promise<number> {
    const agora = new Date();
    const fila = await db.select().from(notificacoesOutbox).where(or(eq(notificacoesOutbox.status, "pendente"), and(eq(notificacoesOutbox.status, "falhou"), lte(notificacoesOutbox.proxima_tentativa, agora)))).orderBy(notificacoesOutbox.criado_em).limit(limite);
    let processados = 0;
    for (const item of fila) {
      const reclamado = (await db.update(notificacoesOutbox).set({ status: "processando", tentativas: sql`tentativas + 1` }).where(and(eq(notificacoesOutbox.id, item.id), or(eq(notificacoesOutbox.status, "pendente"), eq(notificacoesOutbox.status, "falhou")))).returning())[0];
      if (!reclamado) continue;
      try {
        const payload = item.payload as any;
        let destinatario = "";
        if (payload.usuario_id) destinatario = (await db.select({ email: usuarios.email }).from(usuarios).where(eq(usuarios.id, String(payload.usuario_id))).limit(1))[0]?.email || "";
        if (!destinatario && item.reserva_id) {
          const reserva = (await db.select({ email: usuarios.email }).from(reservas).innerJoin(usuarios, eq(reservas.usuario_id, usuarios.id)).where(eq(reservas.id, item.reserva_id)).limit(1))[0];
          destinatario = reserva?.email || "";
        }
        if (!destinatario) throw new Error("Destinatário não encontrado");
        const enviado = await EmailService.enviarEmail({ destinatario, assunto: String(payload.assunto || item.template), corpo_html: String(payload.corpo_html || ""), anexos: (item.anexos as any[]) || [] });
        if (!enviado) throw new Error("SMTP não confirmou o envio");
        await db.update(notificacoesOutbox).set({ status: "enviado", enviado_em: new Date(), ultimo_erro: null }).where(eq(notificacoesOutbox.id, item.id));
        processados += 1;
      } catch (error: any) {
        const tentativas = Number(reclamado.tentativas || 1);
        const atraso = Math.min(24 * 60 * 60 * 1000, 60_000 * 2 ** Math.min(tentativas, 10));
        await db.update(notificacoesOutbox).set({ status: "falhou", ultimo_erro: error?.message || "Falha de notificação", proxima_tentativa: new Date(Date.now() + atraso) }).where(eq(notificacoesOutbox.id, item.id));
      }
    }
    return processados;
  }
}
