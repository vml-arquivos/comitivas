import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { PaymentGatewayAdapter } from "../services/paymentGatewayAdapter.js";
import { db } from "../db/index.js";
import { leads_origem, pagamentos, reservas } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";

const router = Router();

async function confirmarPagamentoEReservarVaga(pagamento: typeof pagamentos.$inferSelect) {
  await db.transaction(async (tx) => {
    // O lock por reserva torna webhooks repetidos idempotentes: apenas a
    // primeira confirmação consome uma vaga.
    const resultado = await tx.execute(sql`
      SELECT id, lote_id, usuario_id, status
      FROM reservas
      WHERE id = ${pagamento.reserva_id}
      FOR UPDATE
    `);
    const reserva = resultado.rows[0] as {
      id: string;
      lote_id: string;
      usuario_id: string;
      status: string | null;
    } | undefined;
    if (!reserva) throw new Error("Reserva não encontrada para o pagamento");

    if (reserva.status !== "cliente_confirmado") {
      const vaga = await tx.execute(sql`
        UPDATE lotes
        SET
          "vagas_disponíveis" = "vagas_disponíveis" - 1,
          atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ${reserva.lote_id}
          AND "vagas_disponíveis" > 0
        RETURNING id
      `);
      if (vaga.rows.length === 0) {
        throw new Error("LOTE_SEM_VAGAS");
      }
    }

    await tx.update(pagamentos).set({
      status: "aprovado",
      atualizado_em: new Date(),
    }).where(eq(pagamentos.id, pagamento.id));

    await tx.update(reservas).set({
      status: "cliente_confirmado",
      atualizado_em: new Date(),
    }).where(eq(reservas.id, pagamento.reserva_id));

    await tx.update(leads_origem).set({
      status: "cliente_confirmado",
      atualizado_em: new Date(),
    }).where(eq(leads_origem.usuario_id, reserva.usuario_id));
  });
}

// Criar pagamento
router.post("/criar", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({ erro: "Não autenticado" });
    }

    const { reserva_id, metodo } = req.body;
    const metodosValidos = ["pix", "boleto", "credito", "debito"];

    if (!reserva_id || !metodo) {
      return res.status(400).json({ erro: "reserva_id e metodo são obrigatórios" });
    }
    if (!metodosValidos.includes(metodo)) {
      return res.status(400).json({ erro: "Método de pagamento inválido" });
    }

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

    // Verificar status
    if (reserva.status !== "contrato_gerado") {
      return res.status(400).json({ erro: "Reserva não está pronta para pagamento" });
    }

    // Para contratos novos, o método precisa ser o mesmo que foi aceito e
    // registrado no PDF. Reservas antigas sem esse campo continuam compatíveis.
    if (reserva.forma_pagamento && reserva.forma_pagamento !== metodo) {
      return res.status(400).json({ erro: "O método de pagamento diverge da condição aceita no contrato" });
    }

    // Criar pagamento no gateway
    const pagamentoGateway = await PaymentGatewayAdapter.criarPagamento({
      reserva_id,
      valor: parseFloat(reserva.valor_total.toString()),
      metodo,
      descricao: `Reserva de pacote de excursão`,
    });

    // Atualizar status da reserva
    await db
      .update(reservas)
      .set({
        status: "aguardando_pagamento",
        atualizado_em: new Date(),
      })
      .where(eq(reservas.id, reserva_id));

    res.json({
      gateway_id: pagamentoGateway.id,
      status: pagamentoGateway.status,
      valor: pagamentoGateway.valor,
      metodo: pagamentoGateway.metodo,
      quantidade_parcelas: reserva.quantidade_parcelas || 1,
      valor_parcela: reserva.valor_parcela || reserva.valor_total,
      qr_code: pagamentoGateway.qr_code,
      url_pagamento: pagamentoGateway.url_pagamento,
    });
  } catch (error: any) {
    console.error("[PAGAMENTOS] Erro ao criar:", error);
    res.status(500).json({ erro: error.message || "Erro ao criar pagamento" });
  }
});

// Verificar status do pagamento
router.get("/status/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
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

    // Verificar se é do usuário ou admin
    if (reserva.usuario_id !== req.usuario.id && req.usuario.tipo !== "admin") {
      return res.status(403).json({ erro: "Acesso negado" });
    }

    // Buscar pagamento
    const pagamentoResult = await db
      .select()
      .from(pagamentos)
      .where(eq(pagamentos.reserva_id, reserva_id))
      .limit(1);

    if (pagamentoResult.length === 0) {
      return res.status(404).json({ erro: "Pagamento não encontrado" });
    }

    const pagamento = pagamentoResult[0];

    res.json({
      reserva_id,
      status: pagamento.status,
      valor: pagamento.valor,
      metodo: pagamento.metodo,
      gateway_id: pagamento.gateway_id,
      criado_em: pagamento.criado_em,
      atualizado_em: pagamento.atualizado_em,
    });
  } catch (error: any) {
    console.error("[PAGAMENTOS] Erro ao verificar status:", error);
    res.status(500).json({ erro: "Erro ao verificar status" });
  }
});

// Webhook para Mercado Pago
router.post("/webhook/mercadopago", async (req: Request, res: Response) => {
  try {
    const { data, type } = req.body;

    if (type !== "payment") {
      return res.json({ ok: true });
    }

    const paymentId = data.id;

    // Buscar pagamento
    const pagamentoResult = await db
      .select()
      .from(pagamentos)
      .where(eq(pagamentos.gateway_id, paymentId.toString()))
      .limit(1);

    if (pagamentoResult.length === 0) {
      return res.json({ ok: true });
    }

    const pagamento = pagamentoResult[0];

    // Confirmar pagamento
    const aprovado = await PaymentGatewayAdapter.confirmarPagamento(paymentId.toString());

    if (aprovado) {
      await confirmarPagamentoEReservarVaga(pagamento);

      console.log(`[WEBHOOK] Pagamento aprovado: ${paymentId}`);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("[WEBHOOK] Erro ao processar:", error);
    res.status(500).json({ erro: "Erro ao processar webhook" });
  }
});

// Webhook para Asaas
router.post("/webhook/asaas", async (req: Request, res: Response) => {
  try {
    const { event, payment } = req.body;

    if (event !== "payment_confirmed") {
      return res.json({ ok: true });
    }

    const paymentId = payment.id;

    // Buscar pagamento
    const pagamentoResult = await db
      .select()
      .from(pagamentos)
      .where(eq(pagamentos.gateway_id, paymentId))
      .limit(1);

    if (pagamentoResult.length === 0) {
      return res.json({ ok: true });
    }

    const pagamento = pagamentoResult[0];

    // Confirma o status diretamente no provedor antes de alterar dados locais.
    // O corpo do webhook é apenas um gatilho; ele não é fonte de verdade.
    const aprovado = await PaymentGatewayAdapter.confirmarPagamento(paymentId);
    if (!aprovado) {
      console.warn(`[WEBHOOK] Confirmação Asaas recusada ou pendente: ${paymentId}`);
      return res.json({ ok: true });
    }

    await confirmarPagamentoEReservarVaga(pagamento);

    console.log(`[WEBHOOK] Pagamento confirmado Asaas: ${paymentId}`);

    res.json({ ok: true });
  } catch (error) {
    console.error("[WEBHOOK] Erro ao processar Asaas:", error);
    res.status(500).json({ erro: "Erro ao processar webhook" });
  }
});

export default router;
