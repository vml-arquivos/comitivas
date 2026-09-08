import axios from "axios";
import nodemailer from "nodemailer";
import fs from "fs/promises";

export interface EmailDeliveryAttachment {
  nome: string;
  caminho: string;
}

export interface EmailDeliveryPayload {
  destinatario: string;
  assunto: string;
  corpo_html: string;
  corpo_texto?: string;
  remetente: string;
  replyTo?: string;
  anexos?: EmailDeliveryAttachment[];
}

export interface EmailDeliveryResult {
  sent: boolean;
  provider?: "brevo_api" | "smtp";
  messageId?: string;
  reason?: string;
}

interface Mailbox {
  email: string;
  name?: string;
}

function normalizar(valor?: string | null): string | undefined {
  const limpo = valor?.trim();
  return limpo || undefined;
}

function parseMailbox(valor: string | undefined, fallbackName?: string): Mailbox | undefined {
  const limpo = normalizar(valor);
  if (!limpo) return undefined;

  const match = limpo.match(/^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/);
  if (match?.[2]) {
    const nome = match[1]?.trim().replace(/^"|"$/g, "") || fallbackName;
    return { email: match[2], ...(nome ? { name: nome } : {}) };
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpo)) {
    return { email: limpo, ...(fallbackName ? { name: fallbackName } : {}) };
  }

  return undefined;
}

async function anexosBrevo(anexos: EmailDeliveryAttachment[] = []) {
  const resultado: Array<{ name: string; content: string }> = [];
  for (const anexo of anexos) {
    const conteudo = await fs.readFile(anexo.caminho);
    resultado.push({ name: anexo.nome, content: conteudo.toString("base64") });
  }
  return resultado;
}

async function enviarViaBrevoApi(payload: EmailDeliveryPayload, apiKey: string): Promise<EmailDeliveryResult> {
  const sender = parseMailbox(payload.remetente, "Excursão das Comitivas");
  if (!sender) return { sent: false, provider: "brevo_api", reason: "Remetente inválido" };

  const replyTo = parseMailbox(payload.replyTo);
  const apiUrl = process.env.BREVO_API_URL?.trim() || "https://api.brevo.com/v3/smtp/email";
  const timeout = Number(process.env.BREVO_API_TIMEOUT_MS || 15_000);

  try {
    const attachments = await anexosBrevo(payload.anexos || []);
    const response = await axios.post(apiUrl, {
      sender,
      to: [{ email: payload.destinatario }],
      subject: payload.assunto,
      htmlContent: payload.corpo_html,
      ...(payload.corpo_texto ? { textContent: payload.corpo_texto } : {}),
      ...(replyTo ? { replyTo } : {}),
      ...(attachments.length ? { attachment: attachments } : {}),
    }, {
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      timeout,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    return {
      sent: true,
      provider: "brevo_api",
      messageId: response.data?.messageId || response.data?.messageIds?.[0],
    };
  } catch (error: any) {
    const status = error?.response?.status;
    const detalhes = error?.response?.data?.message || error?.response?.data?.code || error?.message || "Falha na API Brevo";
    return {
      sent: false,
      provider: "brevo_api",
      reason: `${status ? `HTTP ${status}: ` : ""}${String(detalhes)}`,
    };
  }
}

async function enviarViaSmtp(payload: EmailDeliveryPayload): Promise<EmailDeliveryResult> {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return { sent: false, provider: "smtp", reason: "SMTP não configurado" };

  try {
    const attachments: Array<{ filename: string; content: Buffer }> = [];
    for (const anexo of payload.anexos || []) {
      const conteudo = await fs.readFile(anexo.caminho);
      attachments.push({ filename: anexo.nome, content: conteudo });
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 2525),
      secure: process.env.SMTP_SECURE === "true" || process.env.SMTP_PORT === "465",
      auth: { user, pass },
      connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10_000),
      greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10_000),
      socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 15_000),
    });

    const info = await transporter.sendMail({
      from: payload.remetente,
      replyTo: payload.replyTo,
      to: payload.destinatario,
      subject: payload.assunto,
      text: payload.corpo_texto,
      html: payload.corpo_html,
      attachments,
    });
    return { sent: true, provider: "smtp", messageId: info.messageId };
  } catch (error: any) {
    return { sent: false, provider: "smtp", reason: error?.message || "Falha SMTP" };
  }
}

export async function enviarEmailTransacional(payload: EmailDeliveryPayload): Promise<EmailDeliveryResult> {
  const brevoApiKey = process.env.BREVO_API_KEY?.trim() || process.env.SENDINBLUE_API_KEY?.trim();

  if (brevoApiKey) {
    const viaApi = await enviarViaBrevoApi(payload, brevoApiKey);
    if (viaApi.sent) return viaApi;

    console.error(`[EMAIL] Brevo API falhou: ${viaApi.reason || "erro desconhecido"}`);
    if (process.env.EMAIL_SMTP_FALLBACK !== "true") return viaApi;
  }

  const viaSmtp = await enviarViaSmtp(payload);
  if (!viaSmtp.sent) console.error(`[EMAIL] SMTP falhou: ${viaSmtp.reason || "erro desconhecido"}`);
  return viaSmtp;
}
