import axios, { AxiosRequestConfig, Method } from "axios";
import https from "node:https";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

export type CoraMetodo = "pix" | "boleto" | "boleto_pix" | "carne";

type CoraService = { name: string; description: string; amount: number };

type CoraCustomer = {
  name: string;
  email?: string;
  document: { identity: string; type: "CPF" | "CNPJ" };
};

export interface CriarCobrancaCoraInput {
  code: string;
  metodo: CoraMetodo;
  valor: number;
  descricao: string;
  cliente: CoraCustomer;
  vencimento: Date;
  parcelas?: number;
  servicos?: CoraService[];
  idempotencyKey?: string;
}

export interface CoraCobranca {
  id: string;
  status: string;
  metodo: CoraMetodo;
  totalAmount?: number;
  qrCode?: string;
  pixCopiaECola?: string;
  boletoUrl?: string;
  barcode?: string;
  digitable?: string;
  documentUrl?: string;
  parcelas?: Array<{
    id: string;
    valor: number;
    status: string;
    vencimento?: string;
    boletoUrl?: string;
    pixCopiaECola?: string;
    barcode?: string;
    digitable?: string;
  }>;
  raw: unknown;
}

function dataISO(data: Date): string {
  const dataNormalizada = new Date(data);
  if (Number.isNaN(dataNormalizada.getTime())) throw new Error("Data de vencimento inválida");
  return dataNormalizada.toISOString().slice(0, 10);
}

function cents(valor: number): number {
  const resultado = Math.round(Number(valor) * 100);
  if (!Number.isFinite(resultado) || resultado < 500) {
    throw new Error("A cobrança Cora deve ser de no mínimo R$ 5,00");
  }
  return resultado;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export class CoraPaymentProvider {
  private static token?: { value: string; expiresAt: number };
  private static tokenPromise?: Promise<string>;

  static get ambiente(): "stage" | "production" {
    return process.env.CORA_ENV === "production" ? "production" : "stage";
  }

  private static get baseUrl(): string {
    return process.env.CORA_API_BASE_URL?.trim() || (
      this.ambiente === "production"
        ? "https://matls-clients.api.cora.com.br"
        : "https://matls-clients.api.stage.cora.com.br"
    );
  }

  private static get tokenUrl(): string {
    return process.env.CORA_TOKEN_URL?.trim() || `${this.baseUrl}/token`;
  }

  static validarConfiguracao(): void {
    const obrigatorios: Array<[string, string | undefined]> = [
      ["CORA_CLIENT_ID", process.env.CORA_CLIENT_ID],
      ["CORA_CERT_PATH", process.env.CORA_CERT_PATH],
      ["CORA_PRIVATE_KEY_PATH", process.env.CORA_PRIVATE_KEY_PATH],
    ];
    const ausentes = obrigatorios.filter(([, valor]) => !valor?.trim()).map(([nome]) => nome);
    if (ausentes.length > 0) throw new Error(`Configuração Cora incompleta: ${ausentes.join(", ")}`);
    for (const [nome, caminho] of obrigatorios.slice(1)) {
      try {
        fs.accessSync(caminho as string, fs.constants.R_OK);
      } catch {
        throw new Error(`${nome} não está legível no caminho configurado`);
      }
    }
  }

  private static httpsAgent(): https.Agent {
    this.validarConfiguracao();
    return new https.Agent({
      cert: fs.readFileSync(process.env.CORA_CERT_PATH as string),
      key: fs.readFileSync(process.env.CORA_PRIVATE_KEY_PATH as string),
      rejectUnauthorized: true,
    });
  }

  private static async accessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    if (this.tokenPromise && !forceRefresh) return this.tokenPromise;

    this.tokenPromise = (async () => {
      this.validarConfiguracao();
      const response = await axios.post(
        this.tokenUrl,
        new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.CORA_CLIENT_ID as string }).toString(),
        {
          httpsAgent: this.httpsAgent(),
          timeout: Number(process.env.CORA_HTTP_TIMEOUT_MS || 15_000),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        },
      );
      const accessToken = stringValue(response.data?.access_token);
      const expiresIn = Number(response.data?.expires_in || 86_400);
      if (!accessToken) throw new Error("A Cora não retornou access_token");
      this.token = { value: accessToken, expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000 };
      return accessToken;
    })();

    try {
      return await this.tokenPromise;
    } finally {
      this.tokenPromise = undefined;
    }
  }

  private static async request<T>(method: Method, endpoint: string, data?: unknown, idempotencyKey?: string, retry = true): Promise<T> {
    const token = await this.accessToken();
    const config: AxiosRequestConfig = {
      method,
      url: `${this.baseUrl}${endpoint}`,
      data,
      httpsAgent: this.httpsAgent(),
      timeout: Number(process.env.CORA_HTTP_TIMEOUT_MS || 15_000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
    };
    try {
      const response = await axios.request<T>(config);
      return response.data;
    } catch (error: any) {
      if (retry && error?.response?.status === 401) {
        await this.accessToken(true);
        return this.request<T>(method, endpoint, data, idempotencyKey, false);
      }
      const providerMessage = stringValue(error?.response?.data?.message) || stringValue(error?.response?.data?.error);
      throw new Error(providerMessage ? `Cora: ${providerMessage}` : "Não foi possível comunicar com a Cora");
    }
  }

  private static customerPayload(cliente: CoraCustomer) {
    return {
      name: cliente.name.slice(0, 60),
      ...(cliente.email ? { email: cliente.email.slice(0, 60) } : {}),
      document: cliente.document,
    };
  }

  private static servicos(input: CriarCobrancaCoraInput): CoraService[] {
    const servicos = input.servicos?.length
      ? input.servicos
      : [{ name: "Excursão das Comitivas", description: input.descricao.slice(0, 100), amount: cents(input.valor) }];
    return servicos.map((service) => ({
      name: service.name.slice(0, 60),
      description: service.description.slice(0, 100),
      amount: cents(service.amount / 100),
    }));
  }

  private static pixResponse(data: any, input: CriarCobrancaCoraInput): CoraCobranca {
    const pix = data?.pix || {};
    const paymentOptions = data?.payment_options || {};
    const bankSlip = paymentOptions?.bank_slip || {};
    return {
      id: String(data?.id || ""),
      status: String(data?.status || "OPEN"),
      metodo: input.metodo,
      totalAmount: Number(data?.total_amount || cents(input.valor)),
      qrCode: stringValue(bankSlip.url) || stringValue(pix.qr_code),
      pixCopiaECola: stringValue(pix.emv) || stringValue(pix.copia_e_cola),
      boletoUrl: stringValue(bankSlip.url),
      barcode: stringValue(bankSlip.barcode),
      digitable: stringValue(bankSlip.digitable),
      raw: data,
    };
  }

  static async criarCobranca(input: CriarCobrancaCoraInput): Promise<CoraCobranca> {
    const idempotencyKey = input.idempotencyKey || randomUUID();
    const valorEmCentavos = cents(input.valor);
    const dueDate = dataISO(input.vencimento);
    const servicos = this.servicos(input);
    const customer = this.customerPayload(input.cliente);

    if (input.metodo === "carne") {
      const quantidade = input.parcelas || 1;
      if (!Number.isInteger(quantidade) || quantidade < 2 || quantidade > 24) {
        throw new Error("O carnê Cora deve ter entre 2 e 24 parcelas");
      }
      const dates = Array.from({ length: quantidade }, (_, index) => {
        const data = new Date(input.vencimento);
        data.setMonth(data.getMonth() + index);
        return dataISO(data);
      });
      const data = await this.request<any>("POST", "/v2/invoices/installments", {
        code: input.code,
        customer,
        service: {
          name: "Excursão das Comitivas",
          description: input.descricao.slice(0, 100),
          amount: valorEmCentavos,
        },
        installment: { number_of: quantidade, due_date: { dates } },
        payment_forms: ["BANK_SLIP"],
      }, idempotencyKey);
      return {
        id: String(data?.id || data?.result?.[0]?.id || input.code),
        status: String(data?.status || "OPEN"),
        metodo: input.metodo,
        documentUrl: stringValue(data?.document_url),
        parcelas: Array.isArray(data?.result) ? data.result.map((item: any) => ({
          id: String(item?.id || ""),
          valor: Number(item?.amount_total || 0) / 100,
          status: String(item?.status || "OPEN"),
          vencimento: stringValue(item?.payment_terms?.due_date),
          boletoUrl: stringValue(item?.bank_slip?.url),
          pixCopiaECola: stringValue(item?.pix?.emv),
          barcode: stringValue(item?.bank_slip?.barcode),
          digitable: stringValue(item?.bank_slip?.digitable),
        })) : [],
        raw: data,
      };
    }

    const forms = input.metodo === "pix" ? ["PIX"] : input.metodo === "boleto_pix" ? ["BANK_SLIP", "PIX"] : ["BANK_SLIP"];
    const data = await this.request<any>("POST", "/invoices", {
      code: input.code,
      customer,
      services: servicos,
      payment_terms: { due_date: dueDate },
      ...(input.metodo === "pix" ? { payment_forms: "PIX" } : { payment_forms: forms }),
    }, idempotencyKey);
    return this.pixResponse(data, input);
  }

  static async consultarCobranca(id: string): Promise<any> {
    if (!id?.trim()) throw new Error("ID da cobrança Cora é obrigatório");
    return this.request<any>("GET", `/invoices/${encodeURIComponent(id)}`);
  }

  static async cancelarCobranca(id: string): Promise<any> {
    if (!id?.trim()) throw new Error("ID da cobrança Cora é obrigatório");
    return this.request<any>("DELETE", `/invoices/${encodeURIComponent(id)}`, undefined, randomUUID());
  }
}
