import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { db } from "../db/index.js";
import { contratoValidacoes, contratosDocumentos, otpDesafios, reservas, usuarios } from "../db/schema.js";
import { ContratoService } from "./contratoService.js";
import { maskDestination, providerFor, NotificationChannel } from "./notificationProvider.js";

const OTP_EXPIRATION_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function pepper(): string {
  const value = process.env.OTP_PEPPER?.trim() || process.env.JWT_SECRET?.trim();
  if (!value && process.env.NODE_ENV === "production") throw new Error("OTP_PEPPER é obrigatório em produção");
  return value || "desenvolvimento-otp-pepper-alterar";
}

function digest(code: string): string { return createHmac("sha256", pepper()).update(code).digest("hex"); }
function hashEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}
function protocolo(): string { return `EC-${new Date().getUTCFullYear()}-${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`; }
function userAgentData(userAgent: string | undefined) {
  const valor = userAgent || "";
  return {
    navegador: /Chrome/i.test(valor) ? "Chrome" : /Firefox/i.test(valor) ? "Firefox" : /Safari/i.test(valor) ? "Safari" : /Edg/i.test(valor) ? "Edge" : "Outro",
    sistema_operacional: /Windows/i.test(valor) ? "Windows" : /Android/i.test(valor) ? "Android" : /iPhone|iPad/i.test(valor) ? "iOS" : /Mac OS/i.test(valor) ? "macOS" : /Linux/i.test(valor) ? "Linux" : "Outro",
  };
}

export interface SolicitarOtpInput {
  usuario_id: string;
  reserva_id: string;
  contrato_id?: string;
  canal: NotificationChannel;
}

export interface ConfirmarOtpInput {
  usuario_id: string;
  reserva_id: string;
  codigo: string;
  aceite_contrato: boolean;
  aceite_regras: boolean;
  ip?: string;
  userAgent?: string;
  idioma?: string;
  timezone?: string;
  geolocalizacao?: { consentida: boolean; latitude?: number; longitude?: number; precisao_metros?: number };
}

export class OtpService {
  static async solicitar(input: SolicitarOtpInput) {
    if (!["email", "whatsapp"].includes(input.canal)) throw new Error("Canal de validação inválido");
    const base = await ContratoService.obterDadosBase(input.reserva_id);
    if (base.reserva.usuario_id !== input.usuario_id) throw new Error("Acesso negado");
    const documento = input.contrato_id
      ? (await db.select().from(contratosDocumentos).where(and(eq(contratosDocumentos.id, input.contrato_id), eq(contratosDocumentos.reserva_id, input.reserva_id))).limit(1))[0]
      : (await db.select().from(contratosDocumentos).where(eq(contratosDocumentos.reserva_id, input.reserva_id)).orderBy(desc(contratosDocumentos.versao)).limit(1))[0];
    if (!documento) throw new Error("Prepare o contrato antes de solicitar a validação");
    if (documento.status === "validado") throw new Error("Este contrato já foi validado");

    const anterior = (await db.select().from(otpDesafios).where(and(eq(otpDesafios.usuario_id, input.usuario_id), eq(otpDesafios.reserva_id, input.reserva_id), isNull(otpDesafios.usado_em))).orderBy(desc(otpDesafios.criado_em)).limit(1))[0];
    if (anterior && new Date(anterior.cooldown_ate).getTime() > Date.now()) throw new Error("Aguarde o cooldown antes de solicitar outro código");
    await db.update(otpDesafios).set({ expira_em: new Date() }).where(and(eq(otpDesafios.usuario_id, input.usuario_id), eq(otpDesafios.reserva_id, input.reserva_id), isNull(otpDesafios.usado_em)));

    const usuario = (await db.select().from(usuarios).where(eq(usuarios.id, input.usuario_id)).limit(1))[0];
    if (!usuario) throw new Error("Usuário não encontrado");
    const destino = input.canal === "email" ? usuario.email : usuario.telefone;
    if (!destino) throw new Error(input.canal === "email" ? "A conta não possui e-mail" : "A conta não possui telefone para WhatsApp");
    const masked = maskDestination(input.canal, destino);
    const agora = new Date();
    const desafio = (await db.insert(otpDesafios).values({
      usuario_id: input.usuario_id,
      reserva_id: input.reserva_id,
      contrato_id: documento.id,
      canal: input.canal,
      destinatario_mascarado: masked,
      segredo_hash: digest(String(randomInt(0, 1_000_000)).padStart(6, "0")),
      expira_em: new Date(agora.getTime() + OTP_EXPIRATION_MS),
      max_tentativas: OTP_MAX_ATTEMPTS,
      cooldown_ate: new Date(agora.getTime() + OTP_COOLDOWN_MS),
    }).returning())[0];
    if (!desafio) throw new Error("Não foi possível criar o desafio de validação");

    // O código é gerado uma única vez e nunca é persistido. Recalcular o digest
    // para envio exige manter o código somente em memória durante esta chamada.
    const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await db.update(otpDesafios).set({ segredo_hash: digest(codigo) }).where(eq(otpDesafios.id, desafio.id));
    const resultado = await providerFor(input.canal).sendOtp(destino, codigo, { nome: usuario.nome, protocolo: desafio.id });
    if (!resultado.sent) return { enviado: false, motivo: resultado.reason, desafio_id: desafio.id, canal: input.canal, destinatario: masked, expira_em: desafio.expira_em };
    return { enviado: true, desafio_id: desafio.id, canal: input.canal, destinatario: masked, expira_em: desafio.expira_em, message_id: resultado.messageId, enviado_em: resultado.sentAt };
  }

  static async confirmar(input: ConfirmarOtpInput) {
    if (!input.aceite_contrato || !input.aceite_regras) throw new Error("É necessário aceitar o contrato e as Regras de Convivência");
    if (!/^\d{6}$/.test(input.codigo)) throw new Error("O código deve conter 6 dígitos");
    const desafio = (await db.select().from(otpDesafios).where(and(eq(otpDesafios.usuario_id, input.usuario_id), eq(otpDesafios.reserva_id, input.reserva_id), isNull(otpDesafios.usado_em))).orderBy(desc(otpDesafios.criado_em)).limit(1))[0];
    if (!desafio) throw new Error("Código não encontrado ou já utilizado");
    if (new Date(desafio.expira_em).getTime() <= Date.now()) throw new Error("Código expirado");
    if (desafio.tentativas >= desafio.max_tentativas) throw new Error("Limite de tentativas atingido; solicite novo código");

    await db.update(otpDesafios).set({ tentativas: desafio.tentativas + 1 }).where(eq(otpDesafios.id, desafio.id));
    if (!hashEquals(desafio.segredo_hash, digest(input.codigo))) throw new Error("Código inválido");

    const agora = new Date();
    const base = await ContratoService.obterDadosBase(input.reserva_id);
    if (base.reserva.usuario_id !== input.usuario_id) throw new Error("Acesso negado");
    const documento = (await db.select().from(contratosDocumentos).where(eq(contratosDocumentos.id, desafio.contrato_id)).limit(1))[0];
    if (!documento || documento.reserva_id !== input.reserva_id || documento.status === "validado") throw new Error("Contrato inválido ou já validado");

    const pdf = await ContratoService.gerarContratoPDF({ reserva_id: input.reserva_id, aceite_ip: input.ip || "desconhecido", aceite_timestamp: agora });
    const uploadDir = process.env.STORAGE_PATH || "./uploads";
    await fs.mkdir(uploadDir, { recursive: true });
    const arquivo = path.join(uploadDir, `contrato-${input.reserva_id}-${documento.versao}-${Date.now()}.pdf`);
    await fs.writeFile(arquivo, pdf);
    const pdfHash = createHash("sha256").update(pdf).digest("hex");
    const userAgent = userAgentData(input.userAgent);
    const protocoloValidacao = protocolo();

    const validacao = await db.transaction(async (tx) => {
      await tx.update(otpDesafios).set({ usado_em: agora }).where(eq(otpDesafios.id, desafio.id));
      await tx.update(contratosDocumentos).set({ status: "validado", arquivo, pdf_sha256: pdfHash, validado_em: agora }).where(and(eq(contratosDocumentos.id, documento.id), eq(contratosDocumentos.status, "aguardando_validacao")));
      await tx.update(reservas).set({ status: "contrato_gerado", contrato_pdf_url: arquivo, aceite_timestamp: agora, aceite_ip: input.ip || "desconhecido", atualizado_em: agora }).where(eq(reservas.id, input.reserva_id));
      const inserido = await tx.insert(contratoValidacoes).values({
        protocolo: protocoloValidacao,
        contrato_id: documento.id,
        usuario_id: input.usuario_id,
        reserva_id: input.reserva_id,
        versao: documento.versao,
        snapshot_sha256: documento.snapshot_sha256,
        pdf_sha256: pdfHash,
        aceite_contrato: input.aceite_contrato,
        aceite_regras: input.aceite_regras,
        regras_versao: "2026.1",
        aviso_privacidade_versao: process.env.AVISO_PRIVACIDADE_VERSION || "2026.1",
        canal: desafio.canal,
        destinatario_mascarado: desafio.destinatario_mascarado,
        confirmado_em: agora,
        servidor_utc: agora,
        ip: input.ip || null,
        user_agent: input.userAgent || null,
        navegador: userAgent.navegador,
        sistema_operacional: userAgent.sistema_operacional,
        idioma: input.idioma || null,
        timezone: input.timezone || null,
        latitude: input.geolocalizacao?.consentida && input.geolocalizacao.latitude !== undefined ? String(input.geolocalizacao.latitude) : null,
        longitude: input.geolocalizacao?.consentida && input.geolocalizacao.longitude !== undefined ? String(input.geolocalizacao.longitude) : null,
        precisao_metros: input.geolocalizacao?.consentida && input.geolocalizacao.precisao_metros !== undefined ? String(input.geolocalizacao.precisao_metros) : null,
        geolocalizacao_consentida: input.geolocalizacao?.consentida === true,
      }).returning();
      return inserido[0];
    });
    return { protocolo: validacao?.protocolo || protocoloValidacao, contrato_id: documento.id, versao: documento.versao, arquivo, pdf_sha256: pdfHash, confirmado_em: agora };
  }
}
