import axios from "axios";
import { db } from "../db/index.js";
import { pagamentos, reservas } from "../db/schema.js";
import { eq } from "drizzle-orm";

export interface CriarPagamentoRequest {
  reserva_id: string;
  valor: number;
  metodo: "pix" | "credito" | "debito";
  descricao?: string;
}

export interface PagamentoGatewayResponse {
  id: string;
  status: string;
  valor: number;
  metodo: string;
  qr_code?: string;
  url_pagamento?: string;
  [key: string]: any;
}

export class PaymentGatewayAdapter {
  private static readonly GATEWAY = process.env.PAYMENT_GATEWAY || "mercadopago";
  private static readonly MERCADOPAGO_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
  private static readonly ASAAS_TOKEN = process.env.ASAAS_API_KEY;

  static async criarPagamento(request: CriarPagamentoRequest): Promise<PagamentoGatewayResponse> {
    if (this.GATEWAY === "asaas") {
      return this.criarPagamentoAsaas(request);
    }
    return this.criarPagamentoMercadoPago(request);
  }

  private static async criarPagamentoMercadoPago(
    request: CriarPagamentoRequest
  ): Promise<PagamentoGatewayResponse> {
    try {
      if (!this.MERCADOPAGO_TOKEN) {
        throw new Error("Token do Mercado Pago não configurado");
      }

      // Buscar dados da reserva
      const reservaResult = await db
        .select()
        .from(reservas)
        .where(eq(reservas.id, request.reserva_id))
        .limit(1);

      if (reservaResult.length === 0) {
        throw new Error("Reserva não encontrada");
      }

      const reserva = reservaResult[0];

      // Preparar payload
      const payload = {
        transaction_amount: request.valor,
        description: request.descricao || `Reserva ${request.reserva_id}`,
        payment_method_id: this.mapMetodoParaMercadoPago(request.metodo),
        payer: {
          email: "cliente@comitiva.com.br",
        },
        external_reference: request.reserva_id,
        notification_url: `${process.env.API_URL}/api/pagamentos/webhook/mercadopago`,
      };

      // Fazer requisição
      const response = await axios.post(
        "https://api.mercadopago.com/v1/payments",
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.MERCADOPAGO_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      // Salvar pagamento no banco
      await db.insert(pagamentos).values({
        reserva_id: request.reserva_id,
        valor: request.valor.toString(),
        metodo: request.metodo,
        status: "processando",
        gateway_id: response.data.id.toString(),
        gateway_resposta: JSON.stringify(response.data),
      });

      return {
        id: response.data.id.toString(),
        status: response.data.status,
        valor: request.valor,
        metodo: request.metodo,
        qr_code: response.data.point_of_interaction?.transaction_data?.qr_code,
        url_pagamento: response.data.init_point,
      };
    } catch (error: any) {
      console.error("[PaymentGateway] Erro Mercado Pago:", error.response?.data || error.message);
      throw error;
    }
  }

  private static async criarPagamentoAsaas(
    request: CriarPagamentoRequest
  ): Promise<PagamentoGatewayResponse> {
    try {
      if (!this.ASAAS_TOKEN) {
        throw new Error("Token do Asaas não configurado");
      }

      // Preparar payload
      const payload = {
        billingType: this.mapMetodoParaAsaas(request.metodo),
        value: request.valor,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        description: request.descricao || `Reserva ${request.reserva_id}`,
        externalReference: request.reserva_id,
        notificationUrl: `${process.env.API_URL}/api/pagamentos/webhook/asaas`,
      };

      // Fazer requisição
      const response = await axios.post("https://api.asaas.com/v3/payments", payload, {
        headers: {
          "access_token": this.ASAAS_TOKEN,
          "Content-Type": "application/json",
        },
      });

      // Salvar pagamento no banco
      await db.insert(pagamentos).values({
        reserva_id: request.reserva_id,
        valor: request.valor.toString(),
        metodo: request.metodo,
        status: "pendente",
        gateway_id: response.data.id,
        gateway_resposta: JSON.stringify(response.data),
      });

      return {
        id: response.data.id,
        status: response.data.status,
        valor: request.valor,
        metodo: request.metodo,
        qr_code: response.data.pixQrCode,
        url_pagamento: response.data.invoiceUrl,
      };
    } catch (error: any) {
      console.error("[PaymentGateway] Erro Asaas:", error.response?.data || error.message);
      throw error;
    }
  }

  static async confirmarPagamento(gateway_id: string): Promise<boolean> {
    try {
      if (this.GATEWAY === "asaas") {
        return this.confirmarPagamentoAsaas(gateway_id);
      }
      return this.confirmarPagamentoMercadoPago(gateway_id);
    } catch (error) {
      console.error("[PaymentGateway] Erro ao confirmar:", error);
      return false;
    }
  }

  private static async confirmarPagamentoMercadoPago(gateway_id: string): Promise<boolean> {
    try {
      if (!this.MERCADOPAGO_TOKEN) {
        return false;
      }

      const response = await axios.get(`https://api.mercadopago.com/v1/payments/${gateway_id}`, {
        headers: {
          Authorization: `Bearer ${this.MERCADOPAGO_TOKEN}`,
        },
      });

      return response.data.status === "approved";
    } catch (error) {
      console.error("[PaymentGateway] Erro ao confirmar Mercado Pago:", error);
      return false;
    }
  }

  private static async confirmarPagamentoAsaas(gateway_id: string): Promise<boolean> {
    try {
      if (!this.ASAAS_TOKEN) {
        return false;
      }

      const response = await axios.get(`https://api.asaas.com/v3/payments/${gateway_id}`, {
        headers: {
          "access_token": this.ASAAS_TOKEN,
        },
      });

      return response.data.status === "CONFIRMED";
    } catch (error) {
      console.error("[PaymentGateway] Erro ao confirmar Asaas:", error);
      return false;
    }
  }

  private static mapMetodoParaMercadoPago(metodo: string): string {
    switch (metodo) {
      case "pix":
        return "pix";
      case "credito":
        return "credit_card";
      case "debito":
        return "debit_card";
      default:
        return "pix";
    }
  }

  private static mapMetodoParaAsaas(metodo: string): string {
    switch (metodo) {
      case "pix":
        return "PIX";
      case "credito":
        return "CREDIT_CARD";
      case "debito":
        return "DEBIT_CARD";
      default:
        return "PIX";
    }
  }
}
