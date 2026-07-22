import { Router, Request, Response } from "express";
import { authMiddleware, requireRole } from "../middleware/authMiddleware.js";
import { EmailService } from "../services/emailService.js";
import { db } from "../db/index.js";
import { emails_enviados, reservas } from "../db/schema.js";
import { eq } from "drizzle-orm";

const router = Router();

// Reenviar contrato (cliente)
router.post("/reenviar-contrato/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({ erro: "Não autenticado" });
    }

    const { reserva_id } = req.params;

    // Buscar reserva
    const reservaResult = await db
      .select()
      .from(reservas)
      .where(eq(reservas.id, reserva_id))
      .limit(1);

    if (reservaResult.length === 0) {
      return res.status(404).json({ erro: "Reserva não encontrada" });
    }

    const reserva = reservaResult[0];

    // Verificar se é do usuário
    if (reserva.usuario_id !== req.usuario.id) {
      return res.status(403).json({ erro: "Acesso negado" });
    }

    // Enviar e-mail
    const enviado = await EmailService.reenviarContrato(reserva_id);

    if (enviado) {
      res.json({ mensagem: "Contrato reenviado com sucesso" });
    } else {
      res.status(500).json({ erro: "Erro ao enviar e-mail" });
    }
  } catch (error: any) {
    console.error("[EMAILS] Erro ao reenviar:", error);
    res.status(500).json({ erro: error.message || "Erro ao reenviar contrato" });
  }
});

// Listar e-mails enviados (admin)
router.get("/historico/:reserva_id", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { reserva_id } = req.params;

    const emailsResult = await db
      .select()
      .from(emails_enviados)
      .where(eq(emails_enviados.reserva_id, reserva_id));

    res.json({
      reserva_id,
      total: emailsResult.length,
      emails: emailsResult,
    });
  } catch (error: any) {
    console.error("[EMAILS] Erro ao listar:", error);
    res.status(500).json({ erro: "Erro ao listar e-mails" });
  }
});

// Reenviar e-mail manualmente (admin)
router.post("/reenviar-manual/:email_id", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { email_id } = req.params;

    // Buscar e-mail
    const emailResult = await db
      .select()
      .from(emails_enviados)
      .where(eq(emails_enviados.id, email_id))
      .limit(1);

    if (emailResult.length === 0) {
      return res.status(404).json({ erro: "E-mail não encontrado" });
    }

    const email = emailResult[0];

    // Reenviar
    const enviado = await EmailService.enviarEmail({
      destinatario: email.destinatario,
      assunto: email.assunto,
      corpo_html: email.corpo || "",
    });

    if (enviado) {
      // Atualizar registro
      await db
        .update(emails_enviados)
        .set({
          enviado_em: new Date(),
          erro: null,
        })
        .where(eq(emails_enviados.id, email_id));

      res.json({ mensagem: "E-mail reenviado com sucesso" });
    } else {
      res.status(500).json({ erro: "Erro ao enviar e-mail" });
    }
  } catch (error: any) {
    console.error("[EMAILS] Erro ao reenviar manual:", error);
    res.status(500).json({ erro: "Erro ao reenviar e-mail" });
  }
});

export default router;
