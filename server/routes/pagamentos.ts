import { Router, Request, Response } from "express";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { authMiddleware, isAdminOrDev } from "../middleware/authMiddleware.js";
import { PaymentGatewayAdapter } from "../services/paymentGatewayAdapter.js";
import { ConfiguracaoService } from "../services/configuracaoService.js";
import { GatewayConfigService } from "../services/gatewayConfigService.js";
import { InventoryService } from "../services/inventoryService.js";
import { ContratoService } from "../services/contratoService.js";
import { db } from "../db/index.js";
import { comissoes, contratosDocumentos, inventarioHolds, leads_origem, lotes, pacotes, pagamentoIdempotencias, pagamentoParcelas, pagamentos, reservas, usuarios, webhookEventos } from "../db/schema.js";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { cadastroAprovadoComEvidencia, camposFaltantesCadastroMinimo } from "../security/governance.js";

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
    await tx.update(reservas).set({ status: quitado ? "cliente_confirmado" : "aguardando_pagamento", checkout_estado: quitado ? "quitado" : "primeira_parcela_confirmada", atualizado_em: agora }).where(eq(reservas.id, reserva.id));
    await tx.update(leads_origem).set({ status: quitado ? "cliente_confirmado" : "pagamento_parcial", atualizado_em: agora }).where(eq(leads_origem.usuario_id, reserva.usuario_id));
    if (quitado) await tx.update(comissoes).set({ status: "elegivel", atualizado_em: agora }).where(eq(comissoes.reserva_id, reserva.id));
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
    const cliente = (await db.select({ nome: usuarios.nome, email: usuarios.email, cpf: usuarios.cpf, telefone: usuarios.telefone, data_nascimento: usuarios.data_nascimento, endereco: usuarios.endereco, cadastro_status: usuarios.cadastro_status, aprovado_em: usuarios.aprovado_em, aprovado_por: usuarios.aprovado_por, ativo: usuarios.ativo, email_confirmado: usuarios.email_confirmado }).from(usuarios).where(eq(usuarios.id, reserva.usuario_id)).limit(1))[0];
    if (!cliente?.email_confirmado) return res.status(409).json({ erro: "Cobrança bloqueada: confirme o e-mail do cliente" });
    const camposFaltantes = camposFaltantesCadastroMinimo(cliente);
    if (camposFaltantes.length) return res.status(409).json({ codigo: "CADASTRO_INCOMPLETO", erro: "Complete seu cadastro antes de continuar para o pagamento.", campos_faltantes: camposFaltantes });
    if (!cadastroAprovadoComEvidencia(cliente)) return res.status(409).json({ erro: "Cobrança bloqueada: cadastro do cliente ainda não possui aprovação administrativa completa" });
    const contrato = (await db.select({ status: contratosDocumentos.status, validado_em: contratosDocumentos.validado_em, aprovado_admin_em: contratosDocumentos.aprovado_admin_em }).from(contratosDocumentos).where(eq(contratosDocumentos.reserva_id, reserva.id)).orderBy(desc(contratosDocumentos.versao)).limit(1))[0];
    if (!contrato?.validado_em) return res.status(409).json({ erro: "Cobrança bloqueada: contrato ainda não foi validado pelo cliente" });
    if (!contrato.aprovado_admin_em || contrato.status !== "aprovado_admin") return res.status(409).json({ erro: "Cobrança bloqueada: contrato ainda não foi aprovado administrativamente" });
    if (!["contrato_gerado", "cliente_confirmado"].includes(String(reserva.status)) && !["contrato_validado", "contrato_aprovado_admin", "cobranca_pendente", "aguardando_pagamento", "pagamento_parcial", "primeira_parcela_confirmada"].includes(String(reserva.checkout_estado))) return res.status(400).json({ erro: "A reserva ainda não está liberada para cobrança" });
    if (reserva.forma_pagamento && reserva.forma_pagamento !== metodo) return res.status(400).json({ erro: "O método diverge da condição aceita no contrato" });

    const parcelas = metodo === "boleto" ? Math.max(1, Number(reserva.quantidade_parcelas || 1)) : 1;
    const configuracoes = await ConfiguracaoService.obterConfiguracoesPagamento();
    if (metodo === "boleto") {
      const pacote = reserva.pacote_id ? (await db.select({ data_limite_pagamento: pacotes.data_limite_pagamento, configuracao_pagamento: pacotes.configuracao_pagamento }).from(pacotes).where(eq(pacotes.id, reserva.pacote_id)).limit(1))[0] : undefined;
      const lote = (await db.select({ data_embarque: lotes.data_embarque, data_inicio: lotes.data_inicio }).from(lotes).where(eq(lotes.id, reserva.lote_id)).limit(1))[0];
      const regras = pacote?.configuracao_pagamento && typeof pacote.configuracao_pagamento === "object" ? pacote.configuracao_pagamento as Record<string, unknown> : {};
      const tetoPacote = Number(regras.boleto_parcelas_maximo);
      const prazoSeguranca = Number.isInteger(Number(regras.prazo_seguranca_dias)) ? Math.max(0, Number(regras.prazo_seguranca_dias)) : 0;
      const dataLimite = ContratoService.calcularDataLimiteEfetiva(pacote?.data_limite_pagamento, lote?.data_embarque || lote?.data_inicio, prazoSeguranca);
      const tetoAtual = Math.min(
        ContratoService.calcularParcelasMaximasBoleto(dataLimite, new Date(), configuracoes.boleto_meses_maximo_antecedencia),
        Number.isInteger(tetoPacote) && tetoPacote > 0 ? tetoPacote : Number.MAX_SAFE_INTEGER,
      );
      if (parcelas > tetoAtual) return res.status(409).json({ erro: "A condição do boleto ultrapassou o prazo atual. A equipe precisa preparar uma nova versão do contrato." });
    }

    // Boleto manual: o cliente já concluiu a assinatura eletrônica, mas nenhuma
    // cobrança é criada no gateway. O financeiro só é liberado por Admin/DEV
    // depois da aprovação cadastral e da conferência das evidências do contrato.
    if (metodo === "boleto" && configuracoes.boleto_modo === "manual") {
      await db.update(reservas).set({
        checkout_estado: "aguardando_aprovacao_boleto",
        status: "contrato_gerado",
        atualizado_em: new Date(),
      }).where(eq(reservas.id, reserva_id));
      return res.json({
        modo: "manual",
        boleto_modo: "manual",
        status: "aguardando_aprovacao",
        metodo: "boleto",
        quantidade_parcelas: parcelas,
        valor: reserva.valor_total,
        valor_parcela: reserva.valor_parcela || reserva.valor_total,
        checkout_estado: "aguardando_aprovacao_boleto",
        mensagem: "Contrato validado. O cadastro será conferido pela equipe; após a aprovação, os boletos serão preparados e enviados manualmente por e-mail e WhatsApp.",
      });
    }

    const recebido = String(req.body?.idempotency_key || header(req, "Idempotency-Key") || `checkout:${reserva_id}:${metodo}:${parcelas}`).trim();
    if (recebido.length < 8 || recebido.length > 255) return res.status(400).json({ erro: "Idempotency-Key inválida" });
    const idempotencyKey = stableUuid(recebido);
    await InventoryService.exigirHoldAtivo(reserva_id);
    const cronograma = Array.isArray(reserva.cronograma_pagamento) ? reserva.cronograma_pagamento as Array<{ vencimento?: string }> : [];

    if (metodo === "boleto") {
      const existente = (await db.select({ pagamento_id: pagamentoIdempotencias.pagamento_id, resposta: pagamentoIdempotencias.resposta }).from(pagamentoIdempotencias).where(eq(pagamentoIdempotencias.chave, idempotencyKey)).limit(1))[0];
      if (existente?.pagamento_id) return res.json({ ...(existente.resposta as Record<string, unknown> || {}), idempotency_key: idempotencyKey, duplicado: true });
      const totalCentavos = centavos(reserva.valor_total);
      const quantidade = Math.max(1, Number(reserva.quantidade_parcelas || 1));
      const baseCentavos = Math.floor(totalCentavos / quantidade);
      const pagamento = await db.transaction(async (tx) => {
        const hold = reserva.inventario_hold_id ? (await tx.select({ id: inventarioHolds.id, expira_em: inventarioHolds.expira_em, status: inventarioHolds.status }).from(inventarioHolds).where(eq(inventarioHolds.id, reserva.inventario_hold_id)).for("update").limit(1))[0] : undefined;
        if (!hold || hold.status !== "ativo" || new Date(hold.expira_em).getTime() <= Date.now()) throw new Error("A reserva de inventário expirou antes da emissão manual");
        await tx.update(inventarioHolds).set({ status: "convertido", convertido_em: new Date() }).where(and(eq(inventarioHolds.id, hold.id), eq(inventarioHolds.status, "ativo")));
        const criado = (await tx.insert(pagamentos).values({ id: createId(), reserva_id, status: "pendente", valor: (totalCentavos / 100).toFixed(2), metodo: "boleto", idempotency_key: idempotencyKey, valor_centavos: totalCentavos, valor_pago_centavos: 0, status_reconciliado: "pendente", criado_em: new Date(), atualizado_em: new Date() }).returning())[0];
        if (!criado) throw new Error("Não foi possível criar o controle do boleto");
        const parcelas = Array.from({ length: quantidade }, (_, indice) => {
          const parcelaCentavos = baseCentavos + (indice < totalCentavos % quantidade ? 1 : 0);
          const vencimento = cronograma[indice]?.vencimento || new Date(Date.now() + (indice + 1) * 30 * 86400000).toISOString().slice(0, 10);
          return { id: createId(), pagamento_id: criado.id, reserva_id, sequencia: indice + 1, valor: (parcelaCentavos / 100).toFixed(2), vencimento, valor_centavos: parcelaCentavos, valor_pago_centavos: 0, status: "pendente" };
        });
        await tx.insert(pagamentoParcelas).values(parcelas).onConflictDoNothing();
        const resposta = { pagamento_id: criado.id, status: "pendente", metodo: "boleto", valor: (totalCentavos / 100).toFixed(2), quantidade_parcelas: quantidade, valor_parcela: (baseCentavos / 100).toFixed(2), parcelas, central_boleto: "liberada" };
        await tx.insert(pagamentoIdempotencias).values({ id: createId(), chave: idempotencyKey, operacao: "criar_boleto_manual", reserva_id, pagamento_id: criado.id, resposta });
        await tx.update(reservas).set({ checkout_estado: "boletos_liberados", status: "aguardando_pagamento", atualizado_em: new Date() }).where(eq(reservas.id, reserva_id));
        return resposta;
      });
      return res.status(201).json({ ...pagamento, idempotency_key: idempotencyKey, mensagem: "Central de boletos liberada; os PDFs serão anexados pela equipe financeira." });
    }

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
    if (reserva.usuario_id !== req.usuario.id && !isAdminOrDev(req.usuario.tipo)) return res.status(403).json({ erro: "Acesso negado" });
    if (req.usuario.tipo !== "dev") {
      const alvo = (await db.select({ tipo: usuarios.tipo }).from(usuarios).where(eq(usuarios.id, reserva.usuario_id)).limit(1))[0];
      if (!alvo || alvo.tipo === "dev") return res.status(403).json({ erro: "Acesso negado" });
    }
    const pagamento = (await db.select().from(pagamentos).where(eq(pagamentos.reserva_id, req.params.reserva_id)).orderBy(desc(pagamentos.criado_em)).limit(1))[0];
    if (!pagamento) {
      const config = await ConfiguracaoService.obterConfiguracoesPagamento();
      return res.json({
        reserva_id: req.params.reserva_id,
        checkout_estado: reserva.checkout_estado,
        status: reserva.forma_pagamento === "boleto" && config.boleto_modo === "manual" ? "boleto_manual" : "sem_cobranca",
        boleto_modo: config.boleto_modo,
        pagamento: null,
        parcelas: [],
      });
    }

    if (pagamento.gateway_id && pagamento.status !== "aprovado" && PaymentGatewayAdapter.GATEWAY === "cora") {
      const remoto = await PaymentGatewayAdapter.consultarPagamento(pagamento.gateway_id);
      if (["PAID", "PAID_OUT"].includes(String(remoto?.status || "").toUpperCase())) {
        await db.update(pagamentos).set({ status: "aprovado", valor_pago_centavos: pagamento.valor_centavos || centavos(pagamento.valor), atualizado_em: new Date() }).where(eq(pagamentos.id, pagamento.id));
        await reconciliarPagamento(pagamento.id);
      }
    }
    const atualizado = (await db.select().from(pagamentos).where(eq(pagamentos.id, pagamento.id)).limit(1))[0] || pagamento;
    const resposta = (atualizado.gateway_resposta || {}) as any;
    const parcelasLocais = await db.select({
      id: pagamentoParcelas.id,
      sequencia: pagamentoParcelas.sequencia,
      valor: pagamentoParcelas.valor,
      vencimento: pagamentoParcelas.vencimento,
      status: pagamentoParcelas.status,
      valor_pago_centavos: pagamentoParcelas.valor_pago_centavos,
      boleto_disponivel: sql<boolean>`${pagamentoParcelas.boleto_documento_id} IS NOT NULL`,
      enviado_email_em: pagamentoParcelas.enviado_email_em,
      enviado_whatsapp_em: pagamentoParcelas.enviado_whatsapp_em,
      pago_confirmado_em: pagamentoParcelas.pago_confirmado_em,
    }).from(pagamentoParcelas).where(eq(pagamentoParcelas.pagamento_id, pagamento.id)).orderBy(pagamentoParcelas.sequencia);
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
      parcelas: parcelasLocais.length ? parcelasLocais : resposta.parcelas,
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
    // Se as credenciais foram cadastradas pelo painel DEV, materializa o
    // segredo de webhook em memória antes de validar a assinatura.
    await GatewayConfigService.aplicarRuntime().catch(() => false);
    if (!webhookAssinado(req)) return res.status(401).json({ erro: "Assinatura do webhook inválida" });
    await db.insert(webhookEventos).values({ id: createId(), evento_id: eventoId, tipo: eventoTipo, recurso_id: recursoId || null, payload, tentativas: 0 }).onConflictDoNothing();
    const claim = await db.update(webhookEventos).set({ tentativas: sql`tentativas + 1` }).where(and(eq(webhookEventos.evento_id, eventoId), isNull(webhookEventos.processado_em))).returning({ id: webhookEventos.id });
    if (!claim[0]) return res.json({ ok: true, duplicado: true });

    const tipo = eventoTipo.toLowerCase();
    if (recursoId) {
      let pagamento = (await db.select().from(pagamentos).where(eq(pagamentos.gateway_id, recursoId)).limit(1))[0];
      const parcela = !pagamento ? (await db.select().from(pagamentoParcelas).where(eq(pagamentoParcelas.cora_id, recursoId)).limit(1))[0] : undefined;
      if (parcela) pagamento = (await db.select().from(pagamentos).where(eq(pagamentos.id, parcela.pagamento_id)).limit(1))[0];
      if (pagamento && (tipo.includes("paid") || tipo.includes("canceled") || tipo.includes("cancelled") || tipo.includes("overdue") || tipo.includes("late"))) {
        const remoto = await PaymentGatewayAdapter.consultarPagamento(recursoId);
        const remotoStatus = String(remoto?.status || "").toUpperCase();
        if (tipo.includes("paid") && ["PAID", "PAID_OUT"].includes(remotoStatus)) {
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
