import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { contratoEventos, contratoValidacoes, contratosDocumentos, notificacoesOutbox, otpDesafios, reservas, usuarios } from "../db/schema.js";
import { ContratoService } from "./contratoService.js";
import { maskDestination, providerFor, NotificationChannel } from "./notificationProvider.js";

const OTP_EXPIRATION_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const ACEITE_CONTRATO_TEXTO = "Li e concordo com o Contrato oficial da Excursão das Comitivas apresentado nesta tela.";
const ACEITE_REGRAS_TEXTO = "Li e concordo com as Regras de Convivência versão 2026.1 apresentadas nesta tela.";

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
    navegador: /Edg/i.test(valor) ? "Edge" : /Chrome/i.test(valor) ? "Chrome" : /Firefox/i.test(valor) ? "Firefox" : /Safari/i.test(valor) ? "Safari" : "Outro",
    sistema_operacional: /Windows/i.test(valor) ? "Windows" : /Android/i.test(valor) ? "Android" : /iPhone|iPad/i.test(valor) ? "iOS" : /Mac OS/i.test(valor) ? "macOS" : /Linux/i.test(valor) ? "Linux" : "Outro",
  };
}
function eventoHash(metadados: unknown, anterior?: string | null): string {
  return createHash("sha256").update(`${anterior || ""}:${JSON.stringify(metadados)}`, "utf8").digest("hex");
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
    if (!(["email", "whatsapp"] as string[]).includes(input.canal)) throw new Error("Canal de validação inválido");
    const base = await ContratoService.obterDadosBase(input.reserva_id);
    if (base.reserva.usuario_id !== input.usuario_id) throw new Error("Acesso negado");
    const documento = input.contrato_id
      ? (await db.select().from(contratosDocumentos).where(and(eq(contratosDocumentos.id, input.contrato_id), eq(contratosDocumentos.reserva_id, input.reserva_id))).limit(1))[0]
      : (await db.select().from(contratosDocumentos).where(and(eq(contratosDocumentos.reserva_id, input.reserva_id), sql`status IN ('aguardando_validacao', 'preparado')`)).orderBy(desc(contratosDocumentos.versao)).limit(1))[0];
    if (!documento) throw new Error("Prepare o contrato antes de solicitar a validação");
    if (documento.status === "validado") throw new Error("Este contrato já foi validado");

    const anterior = (await db.select().from(otpDesafios).where(and(eq(otpDesafios.usuario_id, input.usuario_id), eq(otpDesafios.reserva_id, input.reserva_id), isNull(otpDesafios.usado_em))).orderBy(desc(otpDesafios.criado_em)).limit(1))[0];
    if (anterior && new Date(anterior.cooldown_ate).getTime() > Date.now()) throw new Error("Aguarde o cooldown antes de solicitar outro código");
    await db.update(otpDesafios).set({ expira_em: new Date(), status_envio: "invalidado" }).where(and(eq(otpDesafios.usuario_id, input.usuario_id), eq(otpDesafios.reserva_id, input.reserva_id), isNull(otpDesafios.usado_em)));

    const usuario = (await db.select().from(usuarios).where(eq(usuarios.id, input.usuario_id)).limit(1))[0];
    if (!usuario) throw new Error("Usuário não encontrado");
    const destino = input.canal === "email" ? usuario.email : usuario.telefone;
    if (!destino) throw new Error(input.canal === "email" ? "A conta não possui e-mail" : "A conta não possui telefone para WhatsApp");
    const masked = maskDestination(input.canal, destino);
    const agora = new Date();
    const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const desafio = (await db.insert(otpDesafios).values({
      usuario_id: input.usuario_id,
      reserva_id: input.reserva_id,
      contrato_id: documento.id,
      canal: input.canal,
      destinatario_mascarado: masked,
      segredo_hash: digest(codigo),
      expira_em: new Date(agora.getTime() + OTP_EXPIRATION_MS),
      max_tentativas: OTP_MAX_ATTEMPTS,
      cooldown_ate: new Date(agora.getTime() + OTP_COOLDOWN_MS),
      status_envio: "pendente",
      provedor: input.canal,
      solicitado_em: agora,
    }).returning())[0];
    if (!desafio) throw new Error("Não foi possível criar o desafio de validação");
    await db.insert(contratoEventos).values({ id: `evt-${randomUUID()}`, contrato_id: documento.id, reserva_id: input.reserva_id, tipo: "otp_solicitado", criado_em: agora, ator_id: input.usuario_id, metadados: { desafio_id: desafio.id, canal: input.canal, destinatario_mascarado: masked }, hash_evento: eventoHash({ desafio_id: desafio.id, canal: input.canal, destinatario_mascarado: masked }) });

    let resultado: Awaited<ReturnType<ReturnType<typeof providerFor>["sendOtp"]>>;
    try {
      resultado = await providerFor(input.canal).sendOtp(destino, codigo, { nome: usuario.nome, protocolo: desafio.id });
    } catch (error: any) {
      resultado = { sent: false, reason: error?.message || "Falha no provedor de notificação" };
    }
    if (!resultado.sent) {
      const falhouEm = new Date();
      await db.update(otpDesafios).set({ status_envio: "falhou", falhou_em: falhouEm, erro_envio: resultado.reason || "Falha no envio" }).where(eq(otpDesafios.id, desafio.id));
      const metadados = { desafio_id: desafio.id, canal: input.canal, destinatario_mascarado: masked, motivo: resultado.reason || "Falha no envio" };
      await db.insert(contratoEventos).values({ id: `evt-${randomUUID()}`, contrato_id: documento.id, reserva_id: input.reserva_id, tipo: "otp_envio_falhou", criado_em: falhouEm, ator_id: input.usuario_id, metadados, hash_evento: eventoHash(metadados) });
      return { enviado: false, motivo: resultado.reason, desafio_id: desafio.id, canal: input.canal, destinatario: masked, expira_em: desafio.expira_em };
    }
    const enviadoEm = resultado.sentAt || new Date();
    await db.update(otpDesafios).set({ status_envio: "enviado", message_id: resultado.messageId || null, enviado_em: enviadoEm }).where(eq(otpDesafios.id, desafio.id));
    await db.update(reservas).set({ checkout_estado: "otp_enviado", atualizado_em: enviadoEm }).where(eq(reservas.id, input.reserva_id));
    const metadados = { desafio_id: desafio.id, canal: input.canal, destinatario_mascarado: masked, message_id: resultado.messageId || null };
    await db.insert(contratoEventos).values({ id: `evt-${randomUUID()}`, contrato_id: documento.id, reserva_id: input.reserva_id, tipo: "otp_enviado", criado_em: enviadoEm, ator_id: input.usuario_id, metadados, hash_evento: eventoHash(metadados) });
    return { enviado: true, desafio_id: desafio.id, canal: input.canal, destinatario: masked, expira_em: desafio.expira_em, message_id: resultado.messageId, enviado_em: enviadoEm };
  }

  static async confirmar(input: ConfirmarOtpInput) {
    if (!input.aceite_contrato || !input.aceite_regras) throw new Error("É necessário aceitar o contrato e as Regras de Convivência");
    if (!/^\d{6}$/.test(input.codigo)) throw new Error("O código deve conter 6 dígitos");
    let arquivoCriado: string | undefined;
    try {
      const resultado = await db.transaction(async (tx) => {
        const desafios = await tx.execute(sql`
          SELECT * FROM otp_desafios
          WHERE usuario_id = ${input.usuario_id} AND reserva_id = ${input.reserva_id}
            AND usado_em IS NULL
          ORDER BY criado_em DESC
          LIMIT 1
          FOR UPDATE
        `);
        const desafio = desafios.rows[0] as any;
        if (!desafio) throw new Error("Código não encontrado ou já utilizado");
        if (desafio.status_envio !== "enviado") throw new Error("O código não foi entregue; solicite um novo código");
        if (new Date(desafio.expira_em).getTime() <= Date.now()) throw new Error("Código expirado");
        if (Number(desafio.tentativas) >= Number(desafio.max_tentativas)) throw new Error("Limite de tentativas atingido; solicite novo código");

        const tentativas = Number(desafio.tentativas) + 1;
        await tx.update(otpDesafios).set({ tentativas }).where(eq(otpDesafios.id, String(desafio.id)));
        if (!hashEquals(String(desafio.segredo_hash), digest(input.codigo))) throw new Error("Código inválido");

        const base = await ContratoService.obterDadosBase(input.reserva_id);
        if (base.reserva.usuario_id !== input.usuario_id) throw new Error("Acesso negado");
        const documento = (await tx.select().from(contratosDocumentos).where(eq(contratosDocumentos.id, String(desafio.contrato_id))).limit(1))[0];
        if (!documento || documento.reserva_id !== input.reserva_id || !["aguardando_validacao", "preparado"].includes(documento.status)) throw new Error("Contrato inválido ou já validado");

        const agora = new Date();
        const protocoloValidacao = protocolo();
        const snapshot = documento.snapshot as any;
        const pdf = await ContratoService.gerarContratoPDF({
          reserva_id: input.reserva_id,
          contrato_id: documento.id,
          snapshot,
          protocolo: protocoloValidacao,
          canal: String(desafio.canal),
          destinatario_mascarado: String(desafio.destinatario_mascarado),
          aceite_ip: input.ip || "desconhecido",
          aceite_timestamp: agora,
          aceite_contrato_texto: ACEITE_CONTRATO_TEXTO,
          aceite_regras_texto: ACEITE_REGRAS_TEXTO,
        });
        const pdfHash = createHash("sha256").update(pdf).digest("hex");
        const uploadDir = process.env.STORAGE_PATH || "./uploads";
        await fs.mkdir(uploadDir, { recursive: true });
        arquivoCriado = path.join(uploadDir, `contrato-${input.reserva_id}-${documento.versao}-${protocoloValidacao}.pdf`);
        await fs.writeFile(arquivoCriado, pdf, { mode: 0o600 });
        const userAgent = userAgentData(input.userAgent);

        const documentoAtualizado = await tx.update(contratosDocumentos).set({ status: "validado", arquivo: arquivoCriado, pdf_sha256: pdfHash, validado_em: agora }).where(and(eq(contratosDocumentos.id, documento.id), sql`status IN ('aguardando_validacao', 'preparado')`)).returning({ id: contratosDocumentos.id });
        if (!documentoAtualizado[0]) throw new Error("Contrato já validado por outra requisição");
        await tx.update(otpDesafios).set({ usado_em: agora }).where(and(eq(otpDesafios.id, String(desafio.id)), isNull(otpDesafios.usado_em)));
        await tx.update(reservas).set({ status: "contrato_gerado", checkout_estado: "contrato_validado", contrato_pdf_url: arquivoCriado, aceite_timestamp: agora, aceite_ip: input.ip || "desconhecido", atualizado_em: agora }).where(eq(reservas.id, input.reserva_id));
        const validacao = (await tx.insert(contratoValidacoes).values({
          protocolo: protocoloValidacao,
          contrato_id: documento.id,
          usuario_id: input.usuario_id,
          reserva_id: input.reserva_id,
          versao: documento.versao,
          snapshot_sha256: documento.snapshot_sha256,
          pdf_sha256: pdfHash,
          aceite_contrato: input.aceite_contrato,
          aceite_regras: input.aceite_regras,
          aceite_contrato_texto: ACEITE_CONTRATO_TEXTO,
          aceite_regras_texto: ACEITE_REGRAS_TEXTO,
          aceites_sha256: createHash("sha256").update(`${ACEITE_CONTRATO_TEXTO}\n${ACEITE_REGRAS_TEXTO}`, "utf8").digest("hex"),
          regras_versao: "2026.1",
          aviso_privacidade_versao: process.env.AVISO_PRIVACIDADE_VERSION || "2026.1",
          canal: String(desafio.canal),
          destinatario_mascarado: String(desafio.destinatario_mascarado),
          message_id: desafio.message_id || null,
          enviado_em: desafio.enviado_em || null,
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
        }).returning({ protocolo: contratoValidacoes.protocolo }))[0];
        if (!validacao) throw new Error("Não foi possível registrar a validação");
        await tx.insert(notificacoesOutbox).values({
          reserva_id: input.reserva_id,
          tipo: "assinatura_concluida",
          chave_idempotente: `contrato-validado:${validacao.protocolo}`,
          template: "contrato-validado-2026.1",
          versao: "2026.1",
          destinatario_mascarado: maskDestination("email", base.usuario.email),
          payload: { usuario_id: base.usuario.id, assunto: `Contrato validado — reserva ${input.reserva_id}`, corpo_html: `<p>Olá, ${String(base.usuario.nome).replace(/[<>]/g, "")}. Sua contratação foi validada com o protocolo ${validacao.protocolo}.</p><p>O contrato e o certificado de evidências seguem anexos.</p>` },
          anexos: [{ nome: `contrato-${input.reserva_id}-${validacao.protocolo}.pdf`, caminho: arquivoCriado }],
          status: "pendente",
          proxima_tentativa: agora,
        }).onConflictDoNothing({ target: notificacoesOutbox.chave_idempotente });
        const metadados = { protocolo: protocoloValidacao, snapshot_sha256: documento.snapshot_sha256, pdf_sha256: pdfHash, canal: String(desafio.canal) };
        await tx.insert(contratoEventos).values({ id: `evt-${randomUUID()}`, contrato_id: documento.id, reserva_id: input.reserva_id, tipo: "assinatura_concluida", criado_em: agora, ator_id: input.usuario_id, ip: input.ip || null, user_agent: input.userAgent || null, metadados, hash_evento: eventoHash(metadados) });
        return { protocolo: validacao.protocolo, contrato_id: documento.id, versao: documento.versao, arquivo: arquivoCriado, pdf_sha256: pdfHash, confirmado_em: agora };
      });
      return resultado;
    } catch (error) {
      if (arquivoCriado) await fs.rm(arquivoCriado, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}
