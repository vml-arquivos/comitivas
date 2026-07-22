import nodemailer from "nodemailer";
import { db } from "../db/index.js";
import { emails_enviados, reservas, usuarios } from "../db/schema.js";
import { eq } from "drizzle-orm";
import fs from "fs/promises";

export interface EmailPayload {
  destinatario: string;
  assunto: string;
  corpo_html: string;
  anexos?: Array<{
    nome: string;
    caminho: string;
  }>;
}

export class EmailService {
  private static transporter: nodemailer.Transporter | null = null;

  static getTransporter(): nodemailer.Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    return this.transporter;
  }

  static async enviarEmail(payload: EmailPayload): Promise<boolean> {
    try {
      const transporter = this.getTransporter();

      // Preparar anexos
      const attachments = [];
      if (payload.anexos && payload.anexos.length > 0) {
        for (const anexo of payload.anexos) {
          try {
            const conteudo = await fs.readFile(anexo.caminho);
            attachments.push({
              filename: anexo.nome,
              content: conteudo,
            });
          } catch (error) {
            console.error(`[EmailService] Erro ao ler anexo ${anexo.nome}:`, error);
          }
        }
      }

      // Enviar e-mail
      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || "noreply@comitiva.com.br",
        to: payload.destinatario,
        subject: payload.assunto,
        html: payload.corpo_html,
        attachments,
      });

      console.log(`[EmailService] E-mail enviado: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error("[EmailService] Erro ao enviar e-mail:", error);
      return false;
    }
  }

  static async enviarConfirmacaoPagamento(reserva_id: string): Promise<boolean> {
    try {
      // Buscar dados da reserva
      const reservaResult = await db
        .select()
        .from(reservas)
        .where(eq(reservas.id, reserva_id))
        .limit(1);

      if (reservaResult.length === 0) {
        throw new Error("Reserva não encontrada");
      }

      const reserva = reservaResult[0];

      // Buscar dados do usuário
      const usuarioResult = await db
        .select()
        .from(usuarios)
        .where(eq(usuarios.id, reserva.usuario_id))
        .limit(1);

      if (usuarioResult.length === 0) {
        throw new Error("Usuário não encontrado");
      }

      const usuario = usuarioResult[0];

      // Preparar anexos
      const anexos = [];
      if (reserva.contrato_pdf_url) {
        anexos.push({
          nome: `contrato-${reserva_id}.pdf`,
          caminho: reserva.contrato_pdf_url,
        });
      }

      // Gerar HTML do e-mail
      const corpo_html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #E63946; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .footer { background-color: #1D3557; color: white; padding: 15px; text-align: center; font-size: 12px; }
    .button { display: inline-block; background-color: #E63946; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Pagamento Confirmado!</h1>
    </div>
    <div class="content">
      <p>Olá <strong>${usuario.nome}</strong>,</p>
      <p>Seu pagamento foi recebido e confirmado com sucesso!</p>
      <p><strong>Detalhes da Reserva:</strong></p>
      <ul>
        <li>ID da Reserva: ${reserva_id}</li>
        <li>Valor Total: R$ ${reserva.valor_total}</li>
        <li>Status: Confirmado</li>
      </ul>
      <p>Em anexo você encontra o contrato em duas vias e o comprovante de pagamento.</p>
      <p>Para dúvidas ou suporte, entre em contato conosco através do e-mail de resposta.</p>
      <p>Obrigado por escolher a Comitiva!</p>
    </div>
    <div class="footer">
      <p>&copy; 2024 Comitiva - Excursões e Eventos. Todos os direitos reservados.</p>
    </div>
  </div>
</body>
</html>
      `;

      // Enviar e-mail
      const enviado = await this.enviarEmail({
        destinatario: usuario.email,
        assunto: `Pagamento Confirmado - Reserva ${reserva_id}`,
        corpo_html,
        anexos,
      });

      // Registrar no banco
      if (enviado) {
        await db.insert(emails_enviados).values({
          reserva_id,
          tipo: "confirmacao",
          destinatario: usuario.email,
          assunto: `Pagamento Confirmado - Reserva ${reserva_id}`,
          corpo: corpo_html,
          anexos: JSON.stringify(anexos),
          enviado_em: new Date(),
        });
      }

      return enviado;
    } catch (error: any) {
      console.error("[EmailService] Erro ao enviar confirmação:", error);

      // Registrar erro no banco
      await db.insert(emails_enviados).values({
        reserva_id,
        tipo: "confirmacao",
        destinatario: "desconhecido",
        assunto: "Erro ao enviar confirmação",
        corpo: null,
        erro: error.message,
      });

      return false;
    }
  }

  static async reenviarContrato(reserva_id: string): Promise<boolean> {
    try {
      // Buscar dados da reserva
      const reservaResult = await db
        .select()
        .from(reservas)
        .where(eq(reservas.id, reserva_id))
        .limit(1);

      if (reservaResult.length === 0) {
        throw new Error("Reserva não encontrada");
      }

      const reserva = reservaResult[0];

      // Buscar dados do usuário
      const usuarioResult = await db
        .select()
        .from(usuarios)
        .where(eq(usuarios.id, reserva.usuario_id))
        .limit(1);

      if (usuarioResult.length === 0) {
        throw new Error("Usuário não encontrado");
      }

      const usuario = usuarioResult[0];

      if (!reserva.contrato_pdf_url) {
        throw new Error("Contrato não disponível");
      }

      // Gerar HTML do e-mail
      const corpo_html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #E63946; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .footer { background-color: #1D3557; color: white; padding: 15px; text-align: center; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Reenvio de Contrato</h1>
    </div>
    <div class="content">
      <p>Olá <strong>${usuario.nome}</strong>,</p>
      <p>Segue em anexo o contrato da sua reserva conforme solicitado.</p>
      <p>ID da Reserva: ${reserva_id}</p>
      <p>Qualquer dúvida, estamos à disposição!</p>
    </div>
    <div class="footer">
      <p>&copy; 2024 Comitiva - Excursões e Eventos. Todos os direitos reservados.</p>
    </div>
  </div>
</body>
</html>
      `;

      // Enviar e-mail
      const enviado = await this.enviarEmail({
        destinatario: usuario.email,
        assunto: `Reenvio de Contrato - Reserva ${reserva_id}`,
        corpo_html,
        anexos: [
          {
            nome: `contrato-${reserva_id}.pdf`,
            caminho: reserva.contrato_pdf_url,
          },
        ],
      });

      // Registrar no banco
      if (enviado) {
        await db.insert(emails_enviados).values({
          reserva_id,
          tipo: "reenvio",
          destinatario: usuario.email,
          assunto: `Reenvio de Contrato - Reserva ${reserva_id}`,
          corpo: corpo_html,
          anexos: JSON.stringify([
            {
              nome: `contrato-${reserva_id}.pdf`,
              caminho: reserva.contrato_pdf_url,
            },
          ]),
          enviado_em: new Date(),
        });
      }

      return enviado;
    } catch (error: any) {
      console.error("[EmailService] Erro ao reenviar contrato:", error);
      return false;
    }
  }
}
