import { Router, Request, Response } from "express";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { authMiddleware, isAdminOrDev } from "../middleware/authMiddleware.js";
import { PaymentGatewayAdapter } from "../services/paymentGatewayAdapter.js";
import { ConfiguracaoService } from "../services/configuracaoService.js";
import { InventoryService } from "../services/inventoryService.js";
import { ContratoService } from "../services/contratoService.js";
import { db } from "../db/index.js";
import { comissoes, contratosDocumentos, inventarioHolds, leads_origem, lotes, pacotes, pagamentoIdempotencias, pagamentoParcelas, pagamentos, reservas, usuarios, webhookEventos } from "../db/schema.js";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { cadastroAprovadoComEvidencia, camposFaltantesCadastroMinimo } from "../security/governance.js";
import { NotificationOutboxService } from "../services/notificationOutboxService.js";
import { ContratacaoIntegridadeService } from "../services/contratacaoIntegridadeService.js";

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

function escaparEmail(valor: unknown): string {
  return String(valor ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

async function anexoContratoSeDisponivel(caminho: unknown, reservaId: string) {
  const arquivo = String(caminho || "").trim();
  if (!arquivo || /^https?:\/\//i.test(arquivo)) return [];
  try {
    await fs.access(arquivo);
    return [{ nome: `contrato-${reservaId}.pdf`, caminho: arquivo }];
  } catch {
    return [];
  }
}

async function enfileirarCobrancaGerada(params: { reserva: any; cliente: any; pagamento: any; idempotencyKey: string }) {
  if (!params.cliente?.email) return;
  const urlPagamento = params.pagamento.url_pagamento || params.pagamento.document_url || "";
  const parcelas = Array.isArray(params.pagamento.parcelas) ? params.pagamento.parcelas : [];
  const linhasParcelas = parcelas.map((parcela: any) => `<li>Parcela ${escaparEmail(parcela.sequencia || parcela.numero || "")} — R$ ${escaparEmail(parcela.valor || "")} — vencimento ${escaparEmail(parcela.vencimento || "a confirmar")}</li>`).join("");
  const corpo = `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#182D3B;background:#F8F5EF;padding:24px"><div style="max-width:680px;margin:auto;background:#fff;border:1px solid #eadfd8;border-radius:16px;padding:28px"><p style="color:#851F32;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Excursão das Comitivas</p><h1 style="font-size:24px">Sua cobrança foi gerada</h1><p>Olá, <strong>${escaparEmail(params.cliente.nome)}</strong>.</p><p>A cobrança da reserva <strong>${escaparEmail(params.reserva.id)}</strong> foi criada com sucesso. Confira os dados abaixo e mantenha este e-mail guardado.</p>${linhasParcelas ? `<h2 style="font-size:17px">Cronograma</h2><ul>${linhasParcelas}</ul>` : ""}${urlPagamento ? `<p><a href="${escaparEmail(urlPagamento)}" style="display:inline-block;background:#851F32;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Abrir cobrança</a></p>` : ""}<p>O contrato validado segue anexado quando o arquivo está disponível. Ele também permanece acessível na área autenticada do cliente.</p><p style="font-size:12px;color:#64748b">Se você não reconhece esta cobrança, contate a equipe antes de efetuar o pagamento.</p></div></body></html>`;
  await NotificationOutboxService.enfileirarEmail({
    reserva_id: params.reserva.id,
    usuario_id: params.cliente.id,
    tipo: "cobranca_gerada",
    chave_idempotente: `cobranca-gerada:${params.idempotencyKey}`,
    template: "cobranca_gerada",
    versao: "2026.1",
    destinatario: params.cliente.email,
    assunto: `Cobrança gerada — reserva ${params.reserva.id}`,
    corpo_html: corpo,
    anexos: await anexoContratoSeDisponivel(params.reserva.contrato_pdf_url, params.reserva.id),
    remetente: "finance",
  });
}

async function enfileirarPagamentoQuitado(reservaId: string) {
  const registro = (await db.select({ reserva: reservas, cliente: usuarios }).from(reservas).innerJoin(usuarios, eq(usuarios.id, reservas.usuario_id)).where(eq(reservas.id, reservaId)).limit(1))[0];
  if (!registro?.cliente.email) return;
  const corpo = `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#182D3B;background:#F8F5EF;padding:24px"><div style="max-width:680px;margin:auto;background:#fff;border:1px solid #eadfd8;border-radius:16px;padding:28px"><p style="color:#851F32;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Excursão das Comitivas</p><h1 style="font-size:24px">Pagamento confirmado</h1><p>Olá, <strong>${escaparEmail(registro.cliente.nome)}</strong>.</p><p>O pagamento da reserva <strong>${escaparEmail(reservaId)}</strong> foi reconciliado como quitado. O contrato validado continua disponível na sua área autenticada.</p><p>Guarde este e-mail como comprovante operacional da confirmação.</p></div></body></html>`;
  await NotificationOutboxService.enfileirarEmail({
    reserva_id: reservaId,
    usuario_id: registro.cliente.id,
    tipo: "pagamento_confirmado",
    chave_idempotente: `pagamento-quitado:${reservaId}`,
    template: "pagamento_confirmado",
    versao: "2026.1",
    destinatario: registro.cliente.email,
    assunto: `Pagamento confirmado — reserva ${reservaId}`,
    corpo_html: corpo,
    anexos: await anexoContratoSeDisponivel(registro.reserva.contrato_pdf_url, reservaId),
    remetente: "finance",
  });
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

  const lote = (await tx.execute(sql`SELECT operacional_interno FROM lotes WHERE id = ${reserva.lote_id} FOR UPDATE`)).rows[0] as { operacional_interno?: boolean } | undefined;
  if (!lote) throw new Error("LOTE_NAO_ENCONTRADO");
  if (!lote.operacional_interno) {
    const vaga = await tx.execute(sql`UPDATE lotes SET "vagas_disponíveis" = "vagas_disponíveis" - 1, atualizado_em = ${agora} WHERE id = ${reserva.lote_id} AND "vagas_disponíveis" > 0 RETURNING id`);
    if (!vaga.rows.length) throw new Error("LOTE_SEM_VAGAS");
  }
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
    const cliente = (await db.select({ nome: usuarios.nome, email: usuarios.email, cpf: usuarios.cpf, telefone: usuarios.telefone, sexo: usuarios.sexo, data_nascimento: usuarios.data_nascimento, endereco: usuarios.endereco, cep: usuarios.cep, logradouro: usuarios.logradouro, numero: usuarios.numero, bairro: usuarios.bairro, cidade: usuarios.cidade, estado: usuarios.estado, cadastro_status: usuarios.cadastro_status, aprovado_em: usuarios.aprovado_em, aprovado_por: usuarios.aprovado_por, ativo: usuarios.ativo, email_confirmado: usuarios.email_confirmado }).from(usuarios).where(eq(usuarios.id, reserva.usuario_id)).limit(1))[0];
    if (!cliente?.email_confirmado) return res.status(409).json({ erro: "Cobrança bloqueada: confirme o e-mail do cliente" });
    const camposFaltantes = camposFaltantesCadastroMinimo(cliente, { exigirSexoEnderecoEstruturado: true });
    if (camposFaltantes.length) return res.status(409).json({ codigo: "CADASTRO_INCOMPLETO", erro: "Complete seu cadastro antes de continuar para o pagamento.", campos_faltantes: camposFaltantes });
    if (!cadastroAprovadoComEvidencia(cliente)) return res.status(409).json({ erro: "Cobrança bloqueada: o cadastro automático ainda não foi concluído" });
    const contrato = (await db.select({ status: contratosDocumentos.status, validado_em: contratosDocumentos.validado_em }).from(contratosDocumentos).where(eq(contratosDocumentos.reserva_id, reserva.id)).orderBy(desc(contratosDocumentos.versao)).limit(1))[0];
    if (!contrato?.validado_em) return res.status(409).json({ erro: "Cobrança bloqueada: contrato ainda não foi validado pelo cliente" });
    if (!["contrato_gerado", "cliente_confirmado"].includes(String(reserva.status)) && !["contrato_validado", "contrato_aprovado_admin", "cobranca_pendente", "aguardando_pagamento", "pagamento_parcial", "primeira_parcela_confirmada"].includes(String(reserva.checkout_estado))) return res.status(400).json({ erro: "A reserva ainda não está liberada para cobrança" });
    if (reserva.forma_pagamento && reserva.forma_pagamento !== metodo) return res.status(400).json({ erro: "O método diverge da condição aceita no contrato" });

    // O financeiro nunca avança se os recursos físicos do contrato estiverem
    // divergentes. Para contratos legados já assinados, a rotina reconcilia a
    // vaga real e converte o hold antes de criar qualquer cobrança/controle.
    await ContratacaoIntegridadeService.garantirReserva(reserva.id, { renovarHold: true, converterHold: true, origem: "criar_pagamento" });

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
    // cobrança é criada no gateway. Após a assinatura eletrônica e a aprovação automática do cadastro,
    // o controle segue para preparação operacional dos boletos, sem aprovação manual.
    if (metodo === "boleto" && configuracoes.boleto_modo === "manual") {
      const agora = new Date();
      const controle = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`boleto-manual:${reserva.id}`}))`);
        let pagamento = (await tx.select().from(pagamentos).where(and(eq(pagamentos.reserva_id, reserva.id), eq(pagamentos.metodo, "boleto"))).orderBy(desc(pagamentos.criado_em)).limit(1))[0];
        if (!pagamento) {
          pagamento = (await tx.insert(pagamentos).values({
            id: createId(),
            reserva_id: reserva.id,
            status: "pendente",
            valor: reserva.valor_total,
            metodo: "boleto",
            gateway_id: null,
            gateway_resposta: { modo: "manual", origem: "assinatura_automatica" },
            idempotency_key: `boleto-manual:${reserva.id}`,
            valor_centavos: Number(reserva.valor_total_centavos || Math.round(Number(reserva.valor_total) * 100)),
            valor_pago_centavos: 0,
            status_reconciliado: "pendente",
            criado_em: agora,
            atualizado_em: agora,
          }).returning())[0];
        }
        if (!pagamento) throw new Error("Não foi possível preparar o controle financeiro do boleto");

        let parcelasAtuais = await tx.select().from(pagamentoParcelas).where(eq(pagamentoParcelas.pagamento_id, pagamento.id)).orderBy(pagamentoParcelas.sequencia);
        if (!parcelasAtuais.length) {
          const cronograma = Array.isArray(reserva.cronograma_pagamento) ? reserva.cronograma_pagamento as Array<any> : [];
          const qtd = Math.max(1, Number(reserva.quantidade_parcelas || cronograma.length || 1));
          const totalCentavos = Number(reserva.valor_total_centavos || Math.round(Number(reserva.valor_total) * 100));
          const baseParcela = Math.floor(totalCentavos / qtd);
          const resto = totalCentavos - baseParcela * qtd;
          const inicio = new Date();
          parcelasAtuais = await tx.insert(pagamentoParcelas).values(Array.from({ length: qtd }, (_, index) => {
            const item = cronograma[index] || {};
            const vencimento = item.vencimento || new Date(inicio.getFullYear(), inicio.getMonth() + index + 1, Math.min(28, inicio.getDate())).toISOString().slice(0, 10);
            const valorCentavos = Number(item.valor_centavos || (baseParcela + (index === qtd - 1 ? resto : 0)));
            return { id: createId(), pagamento_id: pagamento!.id, reserva_id: reserva.id, sequencia: index + 1, valor: (valorCentavos / 100).toFixed(2), vencimento, valor_centavos: valorCentavos, valor_pago_centavos: 0, status: "pendente", criado_em: agora, atualizado_em: agora };
          })).returning();
        }

        await tx.update(reservas).set({
          checkout_estado: "boletos_em_preparacao",
          status: "contrato_gerado",
          boleto_liberado_em: sql`COALESCE(${reservas.boleto_liberado_em}, ${agora})`,
          atualizado_em: agora,
        }).where(eq(reservas.id, reserva_id));
        return { pagamento, parcelas: parcelasAtuais };
      });

      return res.json({
        modo: "manual",
        boleto_modo: "manual",
        status: "boletos_em_preparacao",
        metodo: "boleto",
        quantidade_parcelas: parcelas,
        valor: reserva.valor_total,
        valor_parcela: reserva.valor_parcela || reserva.valor_total,
        checkout_estado: "boletos_em_preparacao",
        pagamento_id: controle.pagamento.id,
        parcelas: controle.parcelas,
        mensagem: "Contratação aprovada automaticamente. Os boletos estão em preparação e serão enviados ao e-mail cadastrado assim que forem anexados pela operação.",
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
    await enfileirarCobrancaGerada({ reserva, cliente, pagamento: pagamentoGateway, idempotencyKey }).catch((error) => {
      console.error("[PAGAMENTOS] Não foi possível enfileirar e-mail de cobrança:", error?.message || "falha não detalhada");
    });
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
        const quitado = (await db.select({ status_reconciliado: pagamentos.status_reconciliado }).from(pagamentos).where(eq(pagamentos.id, pagamento.id)).limit(1))[0]?.status_reconciliado === "quitado";
        if (quitado) await enfileirarPagamentoQuitado(req.params.reserva_id).catch((error) => console.error("[PAGAMENTOS] Falha ao enfileirar confirmação:", error?.message || "erro"));
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
      boleto_url: pagamentoParcelas.boleto_url,
      pix_copia_e_cola: pagamentoParcelas.pix_copia_e_cola,
      codigo_barras: pagamentoParcelas.codigo_barras,
      linha_digitavel: pagamentoParcelas.linha_digitavel,
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
    // A Cora documenta os headers webhook-event-id, webhook-event-type e
    // webhook-resource-id, mas não documenta assinatura HMAC. O evento é
    // deduplicado pelo ID e o estado financeiro é confirmado pela API Cora
    // autenticada antes de qualquer alteração local.
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
          const quitado = (await db.select({ status_reconciliado: pagamentos.status_reconciliado }).from(pagamentos).where(eq(pagamentos.id, pagamento.id)).limit(1))[0]?.status_reconciliado === "quitado";
          if (quitado) await enfileirarPagamentoQuitado(pagamento.reserva_id).catch((error) => console.error("[WEBHOOK CORA] Falha ao enfileirar confirmação:", error?.message || "erro"));
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
