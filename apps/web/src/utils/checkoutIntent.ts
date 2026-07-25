export const CHECKOUT_INTENT_KEY = 'comitivas_checkout_intent';
export const LEAD_ID_KEY = 'comitivas_lead_id';

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

export function salvarLeadId(leadId: string) {
  localStorage.setItem(LEAD_ID_KEY, leadId);
}

export function lerLeadId() {
  return localStorage.getItem(LEAD_ID_KEY);
}

export function destinoSeguro(valor: string | null, fallback = '/') {
  if (!valor || !valor.startsWith('/') || valor.startsWith('//')) return fallback;
  return valor;
}
