import { Router, Request, Response } from "express";
import { createHash } from "node:crypto";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { PaymentGatewayAdapter } from "../services/paymentGatewayAdapter.js";
import { db } from "../db/index.js";
import { leads_origem, pagamentos, reservas, webhookEventos } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

const router = Router();

function header(req: Request, name: string): string | undefined {
  const value = req.header(name);
  return value?.trim() || undefined;
}

async function confirmarPagamentoEReservarVaga(pagamento: typeof pagamentos.$inferSelect) {
  await db.transaction(async (tx) => {
    const resultado = await tx.execute(sql`
      SELECT id, lote_id, usuario_id, status
      FROM reservas
      WHERE id = ${pagamento.reserva_id}
      FOR UPDATE
    `);
    const reserva = resultado.rows[0] as { id: string; lote_id: string; usuario_id: string; status: string | null } | undefined;
    if (!reserva) throw new Error("Reserva não encontrada para o pagamento");

    const pagamentoAtual = (await tx.select({ status: pagamentos.status }).from(pagamentos).where(eq(pagamentos.id, pagamento.id)).limit(1))[0];
    if (pagamentoAtual?.status === "aprovado" && reserva.status === "cliente_confirmado") return;

    if (reserva.status !== "cliente_confirmado") {
      const vaga = await tx.execute(sql`
        UPDATE lotes
        SET "vagas_disponíveis" = "vagas_disponíveis" - 1, atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ${reserva.lote_id} AND "vagas_disponíveis" > 0
        RETURNING id
      `);
      if (vaga.rows.length === 0) throw new Error("LOTE_SEM_VAGAS");
    }

    await tx.update(pagamentos).set({ status: "aprovado", atualizado_em: new Date() }).where(eq(pagamentos.id, pagamento.id));
    await tx.update(reservas).set({ status: "cliente_confirmado", atualizado_em: new Date() }).where(eq(reservas.id, pagamento.reserva_id));
    await tx.update(leads_origem).set({ status: "cliente_confirmado", atualizado_em: new Date() }).where(eq(leads_origem.usuario_id, reserva.usuario_id));
  });
}

router.post("/criar", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const { reserva_id, metodo, idempotency_key } = req.body || {};
    const metodosValidos = ["pix", "boleto"];
    if (!reserva_id || !metodo) return res.status(400).json({ erro: "reserva_id e metodo são obrigatórios" });
    if (!metodosValidos.includes(metodo)) return res.status(400).json({ erro: "O checkout Cora oferece somente PIX e boleto" });

    const reserva = (await db.select().from(reservas).where(eq(reservas.id, reserva_id)).limit(1))[0];
    if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    if (reserva.usuario_id !== req.usuario.id) return res.status(403).json({ erro: "Acesso negado" });
    if (reserva.status !== "contrato_gerado") return res.status(400).json({ erro: "Reserva não está pronta para pagamento" });
    if (reserva.forma_pagamento && reserva.forma_pagamento !== metodo) return res.status(400).json({ erro: "O método diverge da condição aceita no contrato" });

    const parcelas = metodo === "boleto" ? Math.max(1, Number(reserva.quantidade_parcelas || 1)) : 1;
    const idempotencyKey = String(idempotency_key || `comitiva-${reserva_id}-${metodo}-${parcelas}`).trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 255) return res.status(400).json({ erro: "Idempotency-Key inválida" });

    const pagamentoGateway = await PaymentGatewayAdapter.criarPagamento({
      reserva_id,
      valor: Number(reserva.valor_total),
      metodo,
      parcelas,
      idempotencyKey,
      descricao: `Excursão das Comitivas — reserva ${reserva_id}`,
    });

    await db.update(reservas).set({ status: "aguardando_pagamento", atualizado_em: new Date() }).where(eq(reservas.id, reserva_id));
    return res.json({
      gateway_id: pagamentoGateway.id,
      status: pagamentoGateway.status,
      valor: pagamentoGateway.valor,
      metodo: pagamentoGateway.metodo,
      quantidade_parcelas: parcelas,
      valor_parcela: reserva.valor_parcela || reserva.valor_total,
      qr_code: pagamentoGateway.qr_code,
      pix_copia_e_cola: pagamentoGateway.pix_copia_e_cola,
      url_pagamento: pagamentoGateway.url_pagamento,
      document_url: pagamentoGateway.document_url,
      parcelas: pagamentoGateway.parcelas,
    });
  } catch (error: any) {
    console.error("[PAGAMENTOS] Erro ao criar:", error);
    return res.status(502).json({ erro: error.message || "Não foi possível criar a cobrança Cora" });
  }
});

router.get("/status/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const reserva = (await db.select().from(reservas).where(eq(reservas.id, req.params.reserva_id)).limit(1))[0];
    if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    if (reserva.usuario_id !== req.usuario.id && req.usuario.tipo !== "admin") return res.status(403).json({ erro: "Acesso negado" });
    const pagamento = (await db.select().from(pagamentos).where(eq(pagamentos.reserva_id, req.params.reserva_id)).orderBy(sql`${pagamentos.criado_em} DESC`).limit(1))[0];
    if (!pagamento) return res.status(404).json({ erro: "Pagamento não encontrado" });

    // O status local é atualizado por webhook; a consulta sob demanda confirma o provedor quando necessário.
    if (pagamento.gateway_id && pagamento.status !== "aprovado" && PaymentGatewayAdapter.GATEWAY === "cora") {
      const remoto = await PaymentGatewayAdapter.consultarPagamento(pagamento.gateway_id);
      if (String(remoto?.status || "").toUpperCase() === "PAID") await confirmarPagamentoEReservarVaga(pagamento);
    }
    const atualizado = (await db.select().from(pagamentos).where(eq(pagamentos.id, pagamento.id)).limit(1))[0] || pagamento;
    const resposta = (atualizado.gateway_resposta || {}) as any;
    return res.json({
      reserva_id: req.params.reserva_id,
      status: atualizado.status,
      valor: atualizado.valor,
      metodo: atualizado.metodo,
      gateway_id: atualizado.gateway_id,
      qr_code: resposta.qr_code,
      pix_copia_e_cola: resposta.pix_copia_e_cola,
      url_pagamento: resposta.url_pagamento,
      document_url: resposta.document_url,
      parcelas: resposta.parcelas,
      criado_em: atualizado.criado_em,
      atualizado_em: atualizado.atualizado_em,
    });
  } catch (error: any) {
    console.error("[PAGAMENTOS] Erro ao verificar status:", error);
    return res.status(502).json({ erro: "Não foi possível consultar o status na Cora" });
  }
});

router.post("/webhook/cora", async (req: Request, res: Response) => {
  const payload = req.body || {};
  const raw = JSON.stringify(payload);
  const eventoId = header(req, "webhook-event-id") || String(payload.event_id || payload.eventId || createHash("sha256").update(raw).digest("hex"));
  const eventoTipo = header(req, "webhook-event-type") || String(payload.event_type || payload.eventType || payload.type || payload.event || "invoice.unknown");
  const recursoId = header(req, "webhook-resource-id") || String(payload.resource_id || payload.resourceId || payload.invoice_id || payload.id || payload.resource?.id || "");

  try {
    const existente = await db.select({ id: webhookEventos.id, processado_em: webhookEventos.processado_em }).from(webhookEventos).where(eq(webhookEventos.evento_id, eventoId)).limit(1);
    if (existente[0]?.processado_em) return res.json({ ok: true, duplicado: true });
    if (!existente[0]) {
      await db.insert(webhookEventos).values({ id: createId(), evento_id: eventoId, tipo: eventoTipo, recurso_id: recursoId || null, payload });
    }

    const tipo = eventoTipo.toLowerCase();
    if (recursoId && (tipo.includes("paid") || tipo.includes("canceled") || tipo.includes("cancelled") || tipo.includes("overdue") || tipo.includes("late"))) {
      const pagamento = (await db.select().from(pagamentos).where(eq(pagamentos.gateway_id, recursoId)).limit(1))[0];
      if (pagamento) {
        // O corpo do webhook é apenas um gatilho. A decisão é tomada pela consulta mTLS à Cora.
        if (tipo.includes("paid")) {
          const confirmado = await PaymentGatewayAdapter.confirmarPagamento(recursoId);
          if (confirmado) await confirmarPagamentoEReservarVaga(pagamento);
        } else if (tipo.includes("canceled") || tipo.includes("cancelled")) {
          await db.update(pagamentos).set({ status: "cancelado", atualizado_em: new Date() }).where(eq(pagamentos.id, pagamento.id));
        } else {
          await db.update(pagamentos).set({ status: "pendente", atualizado_em: new Date() }).where(eq(pagamentos.id, pagamento.id));
        }
      }
    }
    await db.update(webhookEventos).set({ processado_em: new Date() }).where(eq(webhookEventos.evento_id, eventoId));
    return res.json({ ok: true });
  } catch (error: any) {
    console.error("[WEBHOOK CORA] Erro ao processar evento:", error.message || error);
    return res.status(500).json({ erro: "Evento recebido, mas ainda não processado" });
  }
});

export default router;
