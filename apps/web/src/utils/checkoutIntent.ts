export const CHECKOUT_INTENT_KEY = 'comitivas_checkout_intent';
export const LEAD_ID_KEY = 'comitivas_lead_id';
export const LEAD_INTENT_TOKEN_KEY = 'comitivas_lead_intent_token';
export const SELLER_REFERRAL_KEY = 'comitivas_seller_referral';

export interface CheckoutIntent {
  loteId: string;
  pacoteId: string;
  itensSelecionados: Record<string, number>;
  criadoEm: string;
}

export function salvarIntencaoCheckout(intent: CheckoutIntent) {
  localStorage.setItem(CHECKOUT_INTENT_KEY, JSON.stringify(intent));
}

export function lerIntencaoCheckout(): CheckoutIntent | null {
  try {
    const valor = localStorage.getItem(CHECKOUT_INTENT_KEY);
    if (!valor) return null;
    const intent = JSON.parse(valor) as CheckoutIntent;
    if (!intent.loteId || !intent.pacoteId) return null;
    return intent;
  } catch {
    return null;
  }
}

export function limparIntencaoCheckout() {
  localStorage.removeItem(CHECKOUT_INTENT_KEY);
}

export function salvarLeadId(leadId: string, token?: string) {
  localStorage.setItem(LEAD_ID_KEY, leadId);
  if (token) localStorage.setItem(LEAD_INTENT_TOKEN_KEY, token);
}

export function lerLeadId() {
  return localStorage.getItem(LEAD_ID_KEY);
}

export function lerLeadIntentToken() {
  return localStorage.getItem(LEAD_INTENT_TOKEN_KEY);
}

export function salvarReferenciaVendedor(referencia: string) {
  if (referencia) localStorage.setItem(SELLER_REFERRAL_KEY, referencia);
}

export function lerReferenciaVendedor() {
  return localStorage.getItem(SELLER_REFERRAL_KEY);
}

export function destinoSeguro(valor: string | null, fallback = '/') {
  if (!valor || !valor.startsWith('/') || valor.startsWith('//')) return fallback;
  return valor;
}
