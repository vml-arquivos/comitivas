import { Router, Request, Response } from "express";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { PaymentGatewayAdapter } from "../services/paymentGatewayAdapter.js";
import { InventoryService } from "../services/inventoryService.js";
import { db } from "../db/index.js";
import { inventarioHolds, leads_origem, pagamentoParcelas, pagamentos, reservas, webhookEventos } from "../db/schema.js";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function header(req: Request, name: string): string | undefined {
  const value = req.header(name);
  return value?.trim() || undefined;
}

function stableUuid(value: string): string {
  if (UUID_RE.test(value)) return value;
  const hex = createHash("sha256").update(value, "utf8").digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = (parseInt(hex[16], 16) & 0x3 | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function centavos(valor: unknown): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
}

function webhookAssinado(req: Request): boolean {
  const segredo = process.env.CORA_WEBHOOK_HMAC_SECRET?.trim();
  if (!segredo) return process.env.NODE_ENV !== "production";
  const informado = (header(req, "x-cora-signature") || header(req, "x-webhook-signature") || header(req, "x-signature") || "").replace(/^sha256=/i, "").trim();
  if (!informado) return false;
  const esperado = createHmac("sha256", segredo).update((req as any).rawBody || Buffer.from(JSON.stringify(req.body || {})), "utf8").digest("hex");
  const recebido = Buffer.from(informado, "hex");
  const calculado = Buffer.from(esperado, "hex");
  return recebido.length === calculado.length && timingSafeEqual(recebido, calculado);
}

async function reservarOuConverterHold(tx: any, reservaId: string, reserva: any, agora: Date): Promise<void> {
  const hold = reserva.inventario_hold_id
    ? (await tx.execute(sql`SELECT id, status, expira_em FROM inventario_holds WHERE id = ${reserva.inventario_hold_id} FOR UPDATE`)).rows[0] as any
    : undefined;
  if (hold) {
    if (hold.status === "ativo") {
      if (new Date(hold.expira_em).getTime() <= agora.getTime()) throw new Error("O hold de inventário expirou antes da confirmação");
      await tx.update(inventarioHolds).set({ status: "convertido", convertido_em: agora }).where(and(eq(inventarioHolds.id, hold.id), eq(inventarioHolds.status, "ativo")));
    } else if (hold.status !== "convertido") {
      throw new Error("A vaga desta reserva não está mais disponível");
    }
    return;
  }

  const vaga = await tx.execute(sql`UPDATE lotes SET "vagas_disponíveis" = "vagas_disponíveis" - 1, atualizado_em = ${agora} WHERE id = ${reserva.lote_id} AND "vagas_disponíveis" > 0 RETURNING id`);
  if (!vaga.rows.length) throw new Error("LOTE_SEM_VAGAS");
}

async function reconciliarPagamento(pagamentoId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const pagamento = (await tx.select().from(pagamentos).where(eq(pagamentos.id, pagamentoId)).limit(1))[0];
    if (!pagamento) throw new Error("Pagamento não encontrado");
    const reserva = (await tx.select().from(reservas).where(eq(reservas.id, pagamento.reserva_id)).limit(1))[0];
    if (!reserva) throw new Error("Reserva não encontrada para o pagamento");
    const parcelas = await tx.select().from(pagamentoParcelas).where(eq(pagamentoParcelas.pagamento_id, pagamento.id));
    const totalCentavos = Number(pagamento.valor_centavos || centavos(pagamento.valor));
    const pagoCentavos = parcelas.length
      ? parcelas.filter((parcela) => parcela.status === "aprovado").reduce((total, parcela) => total + Number(parcela.valor_pago_centavos || parcela.valor_centavos || centavos(parcela.valor)), 0)
      : pagamento.status === "aprovado" ? totalCentavos : Number(pagamento.valor_pago_centavos || 0);
    const quitado = pagoCentavos >= totalCentavos && totalCentavos > 0;
    const parcial = pagoCentavos > 0;
    const estado = quitado ? "quitado" : parcial ? "pagamento_parcial" : "aguardando_pagamento";
    const statusReconciliado = quitado ? "quitado" : parcial ? "parcial" : "pendente";
    await tx.update(pagamentos).set({ valor_centavos: totalCentavos, valor_pago_centavos: pagoCentavos, status: parcial ? "aprovado" : pagamento.status, status_reconciliado: statusReconciliado, atualizado_em: new Date() }).where(eq(pagamentos.id, pagamento.id));
    if (!parcial) return;

    const agora = new Date();
    await reservarOuConverterHold(tx, reserva.id, reserva, agora);
    await tx.update(reservas).set({ status: "cliente_confirmado", checkout_estado: quitado ? "quitado" : "primeira_parcela_confirmada", atualizado_em: agora }).where(eq(reservas.id, reserva.id));
    await tx.update(leads_origem).set({ status: "cliente_confirmado", atualizado_em: agora }).where(eq(leads_origem.usuario_id, reserva.usuario_id));
  });
}

router.post("/criar", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const { reserva_id, metodo } = req.body || {};
    const metodosValidos = ["pix", "boleto"];
    if (!reserva_id || !metodo) return res.status(400).json({ erro: "reserva_id e metodo são obrigatórios" });
    if (!metodosValidos.includes(metodo)) return res.status(400).json({ erro: "O checkout Cora oferece somente PIX e boleto" });

    const reserva = (await db.select().from(reservas).where(eq(reservas.id, reserva_id)).limit(1))[0];
    if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    if (reserva.usuario_id !== req.usuario.id) return res.status(403).json({ erro: "Acesso negado" });
    if (!["contrato_gerado", "cliente_confirmado"].includes(String(reserva.status)) && !["contrato_validado", "cobranca_pendente", "aguardando_pagamento", "pagamento_parcial", "primeira_parcela_confirmada"].includes(String(reserva.checkout_estado))) return res.status(400).json({ erro: "Valide o contrato antes de criar a cobrança" });
    if (reserva.forma_pagamento && reserva.forma_pagamento !== metodo) return res.status(400).json({ erro: "O método diverge da condição aceita no contrato" });

    const parcelas = metodo === "boleto" ? Math.max(1, Number(reserva.quantidade_parcelas || 1)) : 1;
    const recebido = String(req.body?.idempotency_key || header(req, "Idempotency-Key") || `checkout:${reserva_id}:${metodo}:${parcelas}`).trim();
    if (recebido.length < 8 || recebido.length > 255) return res.status(400).json({ erro: "Idempotency-Key inválida" });
    const idempotencyKey = stableUuid(recebido);
    await InventoryService.exigirHoldAtivo(reserva_id);
    const cronograma = Array.isArray(reserva.cronograma_pagamento) ? reserva.cronograma_pagamento as Array<{ vencimento?: string }> : [];

    const pagamentoGateway = await PaymentGatewayAdapter.criarPagamento({
      reserva_id,
      valor: Number(reserva.valor_total),
      metodo,
      parcelas,
      vencimento: cronograma[0]?.vencimento ? new Date(`${cronograma[0].vencimento}T12:00:00Z`) : undefined,
      datasVencimento: cronograma.map((item) => item.vencimento).filter((item): item is string => Boolean(item)),
      idempotencyKey,
      descricao: `Excursão das Comitivas — reserva ${reserva_id}`,
    });

    await db.update(reservas).set({ checkout_estado: "aguardando_pagamento", status: "aguardando_pagamento", atualizado_em: new Date() }).where(eq(reservas.id, reserva_id));
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
      idempotency_key: idempotencyKey,
    });
  } catch (error: any) {
    console.error("[PAGAMENTOS] Erro ao criar:", error?.message || "falha não detalhada");
    return res.status(502).json({ erro: error.message || "Não foi possível criar a cobrança Cora; o contrato permanece validado e você pode tentar novamente." });
  }
});

router.get("/status/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const reserva = (await db.select().from(reservas).where(eq(reservas.id, req.params.reserva_id)).limit(1))[0];
    if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    if (reserva.usuario_id !== req.usuario.id && req.usuario.tipo !== "admin") return res.status(403).json({ erro: "Acesso negado" });
    const pagamento = (await db.select().from(pagamentos).where(eq(pagamentos.reserva_id, req.params.reserva_id)).orderBy(desc(pagamentos.criado_em)).limit(1))[0];
    if (!pagamento) return res.json({ reserva_id: req.params.reserva_id, checkout_estado: reserva.checkout_estado, status: "sem_cobranca", pagamento: null });

    if (pagamento.gateway_id && pagamento.status !== "aprovado" && PaymentGatewayAdapter.GATEWAY === "cora") {
      const remoto = await PaymentGatewayAdapter.consultarPagamento(pagamento.gateway_id);
      if (["PAID", "PAID_OUT"].includes(String(remoto?.status || "").toUpperCase())) {
        await db.update(pagamentos).set({ status: "aprovado", valor_pago_centavos: pagamento.valor_centavos || centavos(pagamento.valor), atualizado_em: new Date() }).where(eq(pagamentos.id, pagamento.id));
        await reconciliarPagamento(pagamento.id);
      }
    }
    const atualizado = (await db.select().from(pagamentos).where(eq(pagamentos.id, pagamento.id)).limit(1))[0] || pagamento;
    const resposta = (atualizado.gateway_resposta || {}) as any;
    return res.json({
      reserva_id: req.params.reserva_id,
      checkout_estado: (await db.select({ checkout_estado: reservas.checkout_estado }).from(reservas).where(eq(reservas.id, req.params.reserva_id)).limit(1))[0]?.checkout_estado,
      status: atualizado.status,
      status_reconciliado: atualizado.status_reconciliado,
      valor: atualizado.valor,
      valor_pago_centavos: atualizado.valor_pago_centavos,
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
    console.error("[PAGAMENTOS] Erro ao verificar status:", error?.message || "falha não detalhada");
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
    if (!webhookAssinado(req)) return res.status(401).json({ erro: "Assinatura do webhook inválida" });
    const existente = await db.select({ id: webhookEventos.id, processado_em: webhookEventos.processado_em }).from(webhookEventos).where(eq(webhookEventos.evento_id, eventoId)).limit(1);
    if (existente[0]?.processado_em) return res.json({ ok: true, duplicado: true });
    if (!existente[0]) await db.insert(webhookEventos).values({ id: createId(), evento_id: eventoId, tipo: eventoTipo, recurso_id: recursoId || null, payload, tentativas: 1 }).onConflictDoNothing();
    else await db.update(webhookEventos).set({ tentativas: sql`tentativas + 1` }).where(eq(webhookEventos.evento_id, eventoId));

    const tipo = eventoTipo.toLowerCase();
    if (recursoId) {
      let pagamento = (await db.select().from(pagamentos).where(eq(pagamentos.gateway_id, recursoId)).limit(1))[0];
      const parcela = !pagamento ? (await db.select().from(pagamentoParcelas).where(eq(pagamentoParcelas.cora_id, recursoId)).limit(1))[0] : undefined;
      if (parcela) pagamento = (await db.select().from(pagamentos).where(eq(pagamentos.id, parcela.pagamento_id)).limit(1))[0];
      if (pagamento && (tipo.includes("paid") || tipo.includes("canceled") || tipo.includes("cancelled") || tipo.includes("overdue") || tipo.includes("late"))) {
        const remoto = await PaymentGatewayAdapter.consultarPagamento(recursoId);
        const remotoStatus = String(remoto?.status || "").toUpperCase();
        if (tipo.includes("paid") && remotoStatus === "PAID") {
          if (parcela) await db.update(pagamentoParcelas).set({ status: "aprovado", valor_pago_centavos: parcela.valor_centavos || centavos(parcela.valor), atualizado_em: new Date() }).where(eq(pagamentoParcelas.id, parcela.id));
          else await db.update(pagamentos).set({ status: "aprovado", atualizado_em: new Date() }).where(eq(pagamentos.id, pagamento.id));
          await reconciliarPagamento(pagamento.id);
        } else if (tipo.includes("canceled") || tipo.includes("cancelled")) {
          if (parcela) await db.update(pagamentoParcelas).set({ status: "cancelado", atualizado_em: new Date() }).where(eq(pagamentoParcelas.id, parcela.id));
          else await db.update(pagamentos).set({ status: "cancelado", status_reconciliado: "cancelado", atualizado_em: new Date() }).where(eq(pagamentos.id, pagamento.id));
        } else if (parcela) {
          await db.update(pagamentoParcelas).set({ status: "atrasado", atualizado_em: new Date() }).where(eq(pagamentoParcelas.id, parcela.id));
        }
      }
    }
    await db.update(webhookEventos).set({ processado_em: new Date(), ultimo_erro: null, proxima_tentativa: null }).where(eq(webhookEventos.evento_id, eventoId));
    return res.json({ ok: true });
  } catch (error: any) {
    console.error("[WEBHOOK CORA] Erro ao processar evento:", error?.message || "falha não detalhada");
    await db.update(webhookEventos).set({ ultimo_erro: error?.message || "falha não detalhada", proxima_tentativa: new Date(Date.now() + 5 * 60 * 1000) }).where(eq(webhookEventos.evento_id, eventoId)).catch(() => undefined);
    return res.status(500).json({ erro: "Evento recebido, mas ainda não processado" });
  }
});

export default router;
