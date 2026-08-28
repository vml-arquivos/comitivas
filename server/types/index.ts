export interface UsuarioPayload {
  id: string;
  email: string;
  tipo: "cliente" | "vendedor" | "admin";
  session_version?: number;
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
  desconto_pagamento?: number;
  pacote_id?: string;
  modalidade_hospedagem?: "camping" | "quarto_ventilador" | "quarto_ar_condicionado";
  forma_pagamento?: "pix" | "boleto" | "credito";
  quantidade_parcelas?: number;
  valor_parcela?: number;
}

export interface PagamentoData {
  reserva_id: string;
  valor: number;
  metodo: "pix" | "boleto" | "credito" | "debito";
  gateway_id?: string;
}

export interface ContratoData {
  reserva_id: string;
  usuario_nome: string;
  usuario_cpf: string;
  usuario_email: string;
  usuario_telefone: string;
  usuario_rg?: string;
  usuario_data_nascimento?: Date;
  usuario_estado_civil?: string;
  usuario_profissao?: string;
  usuario_endereco?: string;
  usuario_nacionalidade?: string;
  evento_nome: string;
  lote_nome: string;
  itens_selecionados: Record<string, any>;
  valor_total: number;
  modalidade_hospedagem?: "camping" | "quarto_ventilador" | "quarto_ar_condicionado";
  forma_pagamento?: "pix" | "boleto" | "credito";
  quantidade_parcelas?: number;
  valor_parcela?: number;
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
