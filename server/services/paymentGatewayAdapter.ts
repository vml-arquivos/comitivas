import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { pagamentos, pagamentoParcelas, pagamentoIdempotencias, reservas, usuarios } from "../db/schema.js";
import { CoraMetodo, CoraPaymentProvider } from "./coraPaymentProvider.js";

export interface CriarPagamentoRequest {
  reserva_id: string;
  valor: number;
  metodo: "pix" | "boleto";
  parcelas?: number;
  vencimento?: Date;
  descricao?: string;
  idempotencyKey?: string;
}

export interface PagamentoGatewayResponse {
  id: string;
  status: string;
  valor: number;
  metodo: string;
  qr_code?: string;
  pix_copia_e_cola?: string;
  url_pagamento?: string;
  document_url?: string;
  parcelas?: Array<{ id: string; valor: number; status: string; vencimento?: string; url_pagamento?: string; pix_copia_e_cola?: string }>;
  [key: string]: any;
}

function statusCoraParaLocal(status: unknown): "pendente" | "processando" | "aprovado" | "cancelado" | "recusado" {
  switch (String(status || "").toUpperCase()) {
    case "PAID": return "aprovado";
    case "CANCELED":
    case "CANCELLED": return "cancelado";
    case "DRAFT": return "processando";
    default: return "pendente";
  }
}

function metodoCora(metodo: CriarPagamentoRequest["metodo"], parcelas: number): CoraMetodo {
  if (metodo === "pix") return "pix";
  return parcelas > 1 ? "carne" : "boleto_pix";
}

function asNumber(valor: unknown): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

function buildResponse(pagamento: typeof pagamentos.$inferSelect, cora: any): PagamentoGatewayResponse {
  const response = (pagamento.gateway_resposta || {}) as any;
  return {
    id: String(pagamento.gateway_id || pagamento.id),
    status: String(response.status || pagamento.status || "pendente"),
    valor: asNumber(pagamento.valor),
    metodo: pagamento.metodo,
    qr_code: response.qr_code,
    pix_copia_e_cola: response.pix_copia_e_cola,
    url_pagamento: response.url_pagamento,
    document_url: response.document_url,
    parcelas: response.parcelas,
    cora: cora || response.cora,
  };
}

export class PaymentGatewayAdapter {
  /** Gateway de produção único: Banco Cora. */
  static get GATEWAY(): "cora" | "mock" {
    return process.env.PAYMENT_GATEWAY === "mock" && process.env.NODE_ENV !== "production" ? "mock" : "cora";
  }

  static validarConfiguracaoSegura(): void {
    const configurado = (process.env.PAYMENT_GATEWAY || "cora").trim().toLowerCase();
    if (!(["cora", "mock"] as string[]).includes(configurado)) {
      throw new Error("PAYMENT_GATEWAY inválido: somente cora é permitido em produção");
    }
    if (process.env.NODE_ENV === "production" && configurado !== "cora") {
      throw new Error("PAYMENT_GATEWAY=mock não é permitido em produção; Banco Cora é o único gateway");
    }
    if (configurado === "cora") {
      try {
        CoraPaymentProvider.validarConfiguracao();
      } catch (error) {
        if (process.env.NODE_ENV === "production") throw error;
        console.warn("[PaymentGateway] Cora não configurada neste ambiente; cobranças ficarão bloqueadas até configurar mTLS.");
      }
    }
    if (process.env.NODE_ENV === "production") {
      const url = process.env.CORA_WEBHOOK_PUBLIC_URL?.trim();
      if (!url || !url.startsWith("https://")) throw new Error("CORA_WEBHOOK_PUBLIC_URL com HTTPS é obrigatória em produção");
    }
  }

  static async criarPagamento(request: CriarPagamentoRequest): Promise<PagamentoGatewayResponse> {
    const chave = request.idempotencyKey?.trim() || `comitiva-${request.reserva_id}-${request.metodo}-${request.parcelas || 1}`;
    const existente = await db.select().from(pagamentos).where(eq(pagamentos.idempotency_key, chave)).limit(1);
    if (existente[0]) return buildResponse(existente[0], (existente[0].gateway_resposta as any)?.cora);

    if (this.GATEWAY === "mock") return this.criarPagamentoTeste(request, chave);

    const reserva = (await db.select().from(reservas).where(eq(reservas.id, request.reserva_id)).limit(1))[0];
    if (!reserva) throw new Error("Reserva não encontrada");
    const usuario = (await db.select({ nome: usuarios.nome, email: usuarios.email, cpf: usuarios.cpf }).from(usuarios).where(eq(usuarios.id, reserva.usuario_id)).limit(1))[0];
    if (!usuario) throw new Error("Cliente da reserva não encontrado");

    const valorReserva = new Decimal(reserva.valor_total.toString()).toDecimalPlaces(2);
    const valorSolicitado = new Decimal(request.valor).toDecimalPlaces(2);
    if (!valorReserva.equals(valorSolicitado)) throw new Error("O valor da cobrança não corresponde ao total autoritativo da reserva");
    if (request.metodo === "boleto" && (!request.parcelas || request.parcelas < 1)) throw new Error("Quantidade de parcelas inválida");
    const parcelas = request.parcelas || 1;
    const vencimento = request.vencimento || new Date(Date.now() + 24 * 60 * 60 * 1000);
    const cora = await CoraPaymentProvider.criarCobranca({
      code: request.reserva_id,
      metodo: metodoCora(request.metodo, parcelas),
      valor: valorSolicitado.toNumber(),
      descricao: request.descricao || `Reserva ${request.reserva_id}`,
      cliente: {
        name: usuario.nome,
        email: usuario.email,
        document: { identity: String(usuario.cpf || "").replace(/\D/g, ""), type: "CPF" },
      },
      vencimento,
      parcelas,
      idempotencyKey: chave,
    });

    const localStatus = statusCoraParaLocal(cora.status);
    const responseData: Record<string, unknown> = {
      cora,
      status: cora.status,
      qr_code: cora.qrCode,
      pix_copia_e_cola: cora.pixCopiaECola,
      url_pagamento: cora.boletoUrl,
      document_url: cora.documentUrl,
      parcelas: cora.parcelas?.map((parcela) => ({
        id: parcela.id,
        valor: parcela.valor,
        status: parcela.status,
        vencimento: parcela.vencimento,
        url_pagamento: parcela.boletoUrl,
        pix_copia_e_cola: parcela.pixCopiaECola,
      })),
    };
    const inserido = await db.insert(pagamentos).values({
      reserva_id: request.reserva_id,
      valor: valorSolicitado.toFixed(2),
      metodo: request.metodo,
      status: localStatus,
      gateway_id: cora.id,
      gateway_resposta: responseData,
      idempotency_key: chave,
    }).returning();
    const pagamento = inserido[0];
    if (!pagamento) throw new Error("Não foi possível registrar o pagamento");
    await db.insert(pagamentoIdempotencias).values({ chave, operacao: "criar-cobranca-cora", reserva_id: request.reserva_id, pagamento_id: pagamento.id, resposta: responseData }).onConflictDoNothing();

    if (cora.parcelas?.length) {
      await db.insert(pagamentoParcelas).values(cora.parcelas.map((parcela, index) => ({
        pagamento_id: pagamento.id,
        reserva_id: request.reserva_id,
        sequencia: index + 1,
        valor: parcela.valor.toFixed(2),
        vencimento: parcela.vencimento || new Date(vencimento.getTime() + index * 30 * 86_400_000).toISOString().slice(0, 10),
        cora_id: parcela.id,
        status: statusCoraParaLocal(parcela.status),
        boleto_url: parcela.boletoUrl,
        pix_copia_e_cola: parcela.pixCopiaECola,
        codigo_barras: parcela.barcode,
        linha_digitavel: parcela.digitable,
      })));
    }

    return buildResponse(pagamento, cora);
  }

  private static async criarPagamentoTeste(request: CriarPagamentoRequest, chave: string): Promise<PagamentoGatewayResponse> {
    const inserido = await db.insert(pagamentos).values({
      reserva_id: request.reserva_id,
      valor: request.valor.toFixed(2),
      metodo: request.metodo,
      status: "pendente",
      gateway_id: `teste-${randomUUID()}`,
      gateway_resposta: { ambiente: "teste", mensagem: "Nenhuma cobrança foi enviada a um gateway de pagamento." },
      idempotency_key: chave,
    }).returning();
    const pagamento = inserido[0];
    if (!pagamento) throw new Error("Não foi possível registrar o pagamento de teste");
    await db.insert(pagamentoIdempotencias).values({ chave, operacao: "criar-cobranca-teste", reserva_id: request.reserva_id, pagamento_id: pagamento.id, resposta: { ambiente: "teste" } }).onConflictDoNothing();
    return buildResponse(pagamento, undefined);
  }

  static async confirmarPagamento(gateway_id: string): Promise<boolean> {
    if (this.GATEWAY === "mock") return false;
    const data = await CoraPaymentProvider.consultarCobranca(gateway_id);
    return String(data?.status || "").toUpperCase() === "PAID";
  }

  static async consultarPagamento(gateway_id: string): Promise<any> {
    if (this.GATEWAY === "mock") return null;
    return CoraPaymentProvider.consultarCobranca(gateway_id);
  }

  static async cancelarPagamento(gateway_id: string): Promise<any> {
    if (this.GATEWAY === "mock") throw new Error("Cancelamento de mock não representa uma operação financeira");
    return CoraPaymentProvider.cancelarCobranca(gateway_id);
  }
}
