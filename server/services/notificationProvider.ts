import nodemailer from "nodemailer";
import axios from "axios";

export type NotificationChannel = "email" | "whatsapp";

export interface NotificationResult {
  sent: boolean;
  messageId?: string;
  sentAt?: Date;
  reason?: string;
}

export interface NotificationProvider {
  sendOtp(destination: string, code: string, context: { nome: string; protocolo: string }): Promise<NotificationResult>;
}

export class EmailProvider implements NotificationProvider {
  async sendPasswordReset(destination: string, nome: string, resetUrl: string): Promise<NotificationResult> {
    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) return { sent: false, reason: "SMTP não configurado" };
    const transporter = nodemailer.createTransport({ host, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true", auth: { user, pass } });
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM?.trim() || `Excursão das Comitivas <${user}>`,
      to: destination,
      subject: "Redefinição de senha — Excursão das Comitivas",
      text: `Olá, ${nome}. Acesse o link para redefinir sua senha: ${resetUrl}. O link expira em 30 minutos e só pode ser usado uma vez.`,
      html: `<div style="font-family:Arial,sans-serif;color:#2b1718;padding:24px"><h1 style="color:#540c16">Redefinição de senha</h1><p>Olá, ${nome.replace(/[<>]/g, "")}. Recebemos uma solicitação para redefinir sua senha.</p><p><a href="${resetUrl.replace(/\"/g, "&quot;")}" style="display:inline-block;background:#7f1d1d;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none">Criar nova senha</a></p><p>O link expira em 30 minutos e só pode ser usado uma vez.</p></div>`,
    });
    return { sent: true, messageId: info.messageId, sentAt: new Date() };
  }

  async sendOtp(destination: string, code: string, context: { nome: string; protocolo: string }): Promise<NotificationResult> {
    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) return { sent: false, reason: "SMTP não configurado" };
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user, pass },
    });
    const from = process.env.SMTP_FROM?.trim() || `Excursão das Comitivas <${user}>`;
    const info = await transporter.sendMail({
      from,
      to: destination,
      subject: "Seu código de validação — Excursão das Comitivas",
      text: `Olá, ${context.nome}. Seu código para validar o contrato ${context.protocolo} é válido por aproximadamente 10 minutos. Não compartilhe este código.`,
      html: `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;background:#fffaf5;color:#2b1718;padding:24px"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #ead8c5;border-radius:12px;padding:28px"><p style="color:#7f1d1d;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Excursão das Comitivas</p><h1 style="color:#540c16">Validação eletrônica</h1><p>Olá, ${context.nome.replace(/[<>]/g, "")}. Use o código abaixo para validar o contrato da sua reserva.</p><div style="font-size:32px;letter-spacing:.24em;font-weight:800;color:#7f1d1d;text-align:center;padding:18px;background:#fff7ed;border-radius:8px">${code}</div><p>O código expira em aproximadamente 10 minutos e só pode ser usado uma vez. Protocolo: ${context.protocolo}.</p><p style="font-size:12px;color:#64748b">Se você não solicitou esta validação, ignore esta mensagem.</p></div></body></html>`,
    });
    return { sent: true, messageId: info.messageId, sentAt: new Date() };
  }
}

export class WhatsAppProvider implements NotificationProvider {
  async sendOtp(destination: string, code: string, context: { nome: string; protocolo: string }): Promise<NotificationResult> {
    const token = process.env.WHATSAPP_API_TOKEN?.trim();
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    if (!token || !phoneNumberId) return { sent: false, reason: "WhatsApp Business não configurado" };
    const phone = destination.replace(/\D/g, "");
    if (phone.length < 10) return { sent: false, reason: "Destinatário WhatsApp inválido" };
    const apiVersion = process.env.WHATSAPP_API_VERSION?.trim() || "v23.0";
    const response = await axios.post(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: process.env.WHATSAPP_OTP_TEMPLATE_NAME?.trim() || "validacao_contrato",
        language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "pt_BR" },
        components: [{ type: "body", parameters: [{ type: "text", text: context.nome }, { type: "text", text: code }, { type: "text", text: context.protocolo }] }],
      },
    }, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeout: 15_000 });
    const messageId = response.data?.messages?.[0]?.id;
    return { sent: Boolean(messageId), messageId, sentAt: messageId ? new Date() : undefined, reason: messageId ? undefined : "WhatsApp não confirmou o envio" };
  }
}

export function providerFor(channel: NotificationChannel): NotificationProvider {
  return channel === "email" ? new EmailProvider() : new WhatsAppProvider();
}

export function maskDestination(channel: NotificationChannel, destination: string): string {
  if (channel === "email") {
    const [local, domain] = destination.split("@");
    if (!local || !domain) return "***";
    return `${local.slice(0, 2)}***@${domain}`;
  }
  const digits = destination.replace(/\D/g, "");
  return digits.length >= 4 ? `+${digits.slice(0, 2)} ${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-2)}` : "***";
}
