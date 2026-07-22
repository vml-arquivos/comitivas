export interface UsuarioPayload {
  id: string;
  email: string;
  tipo: "cliente" | "vendedor" | "admin";
}

export interface JWTPayload extends UsuarioPayload {
  iat: number;
  exp: number;
}

export interface ReservaData {
  usuario_id: string;
  lote_id: string;
  itens_selecionados: Record<string, any>;
  valor_total: number;
  cupom_id?: string;
  desconto_aplicado?: number;
}

export interface PagamentoData {
  reserva_id: string;
  valor: number;
  metodo: "pix" | "credito" | "debito";
  gateway_id?: string;
}

export interface ContratoData {
  reserva_id: string;
  usuario_nome: string;
  usuario_cpf: string;
  usuario_email: string;
  usuario_telefone: string;
  evento_nome: string;
  lote_nome: string;
  itens_selecionados: Record<string, any>;
  valor_total: number;
  data_aceite: Date;
  ip_aceite: string;
}

export interface EmailData {
  destinatario: string;
  assunto: string;
  corpo: string;
  anexos?: Array<{
    nome: string;
    caminho: string;
    mime_type: string;
  }>;
}

export interface PagamentoGatewayResponse {
  id: string;
  status: string;
  valor: number;
  metodo: string;
  [key: string]: any;
}
