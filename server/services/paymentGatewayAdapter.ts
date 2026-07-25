import axios from "axios";
import { randomUUID } from "node:crypto";
import { db } from "../db/index.js";
import { pagamentos, reservas, usuarios } from "../db/schema.js";
import { eq } from "drizzle-orm";

export interface CriarPagamentoRequest {
  reserva_id: string;
  valor: number;
  metodo: "pix" | "boleto" | "credito" | "debito";
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
  private static get GATEWAY() {
    return process.env.PAYMENT_GATEWAY || "mercadopago";
  }

  private static get MERCADOPAGO_TOKEN() {
    return process.env.MERCADOPAGO_ACCESS_TOKEN;
  }

  private static get ASAAS_TOKEN() {
    return process.env.ASAAS_API_KEY;
  }

  static validarConfiguracaoSegura(): void {
    if (!["mock", "mercadopago", "asaas"].includes(this.GATEWAY)) {
      throw new Error(`PAYMENT_GATEWAY inválido: ${this.GATEWAY}`);
    }
    if (process.env.NODE_ENV !== "production") return;
    if (this.GATEWAY === "mock") {
      throw new Error("PAYMENT_GATEWAY" + "=mock não é permitido em produção");
    }
    if (this.GATEWAY === "mercadopago" && !this.MERCADOPAGO_TOKEN?.trim()) {
      throw new Error("MERCADOPAGO_ACCESS_TOKEN é obrigatório em produção");
    }
    if (this.GATEWAY === "asaas" && !this.ASAAS_TOKEN?.trim()) {
      throw new Error("ASAAS_API_KEY é obrigatório em produção");
    }
    const apiUrl = process.env.API_URL?.trim();
    if (!apiUrl || !apiUrl.startsWith("https://")) {
      throw new Error("API_URL com HTTPS é obrigatória em produção para receber webhooks");
    }
  }

  static async criarPagamento(request: CriarPagamentoRequest): Promise<PagamentoGatewayResponse> {
    if (this.GATEWAY === "mock") {
      return this.criarPagamentoTeste(request);
    }
    if (this.GATEWAY === "asaas") {
      return this.criarPagamentoAsaas(request);
    }
    return this.criarPagamentoMercadoPago(request);
  }

  /**
   * Modo de teste explícito: registra a intenção de pagamento no banco sem
   * acionar qualquer provedor externo e sem gerar QR Code ou link fictício.
   */
  private static async criarPagamentoTeste(
    request: CriarPagamentoRequest,
  ): Promise<PagamentoGatewayResponse> {
    const gatewayId = `teste-${randomUUID()}`;

    await db.insert(pagamentos).values({
      reserva_id: request.reserva_id,
      valor: request.valor.toFixed(2),
      metodo: request.metodo,
      status: "pendente",
      gateway_id: gatewayId,
      gateway_resposta: JSON.stringify({
        ambiente: "teste",
        mensagem: "Nenhuma cobrança foi enviada a um gateway de pagamento.",
      }),
    });

    return {
      id: gatewayId,
      status: "pendente",
      valor: request.valor,
      metodo: request.metodo,
    };
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
      const usuarioResult = await db
        .select({
          nome: usuarios.nome,
          email: usuarios.email,
          cpf: usuarios.cpf,
        })
        .from(usuarios)
        .where(eq(usuarios.id, reserva.usuario_id))
        .limit(1);
      const usuario = usuarioResult[0];
      if (!usuario) {
        throw new Error("Cliente da reserva não encontrado");
      }
      const partesNome = usuario.nome.trim().split(/\s+/);
      const primeiroNome = partesNome.shift() || usuario.nome;
      const sobrenome = partesNome.join(" ");
      const cpf = String(usuario.cpf || "").replace(/\D/g, "");

      // Preparar payload
      const payload = {
        transaction_amount: request.valor,
        description: request.descricao || `Reserva ${request.reserva_id}`,
        payment_method_id: this.mapMetodoParaMercadoPago(request.metodo),
        payer: {
          email: usuario.email,
          first_name: primeiroNome,
          last_name: sobrenome,
          ...(cpf.length === 11 ? {
            identification: {
              type: "CPF",
              number: cpf,
            },
          } : {}),
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
            "X-Idempotency-Key": `comitiva-${request.reserva_id}-${request.metodo}`,
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
      case "boleto":
        return "bolbradesco";
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
      case "boleto":
        return "BOLETO";
      case "credito":
        return "CREDIT_CARD";
      case "debito":
        return "DEBIT_CARD";
      default:
        return "PIX";
    }
  }
}
