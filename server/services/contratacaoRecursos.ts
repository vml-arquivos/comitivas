export type FormaContratacao = "onibus" | "hospedagem" | "onibus_hospedagem" | "livre";
export type FormaContratacaoValida = "onibus" | "hospedagem" | "onibus_hospedagem";
export type ModalidadePacote = "camping" | "quarto_ventilador" | "quarto_ar_condicionado";
export type GrupoHospedagem = "masculino" | "feminino";
export type EstruturaQuarto = "ventilador" | "ar_condicionado";

export type RecursosContratados = {
  transporte: boolean;
  hospedagem: boolean;
  estrutura_quarto: EstruturaQuarto | null;
  transporte_proprio?: boolean;
};

export const FORMAS_CONTRATACAO_VALIDAS: readonly FormaContratacaoValida[] = ["onibus_hospedagem", "hospedagem", "onibus"];

/** Resolve a configuração nova sem quebrar pacotes criados antes da coluna JSONB. */
export function normalizarFormasContratacao(
  formasBrutas: unknown,
  formaLegada: unknown,
  modalidadeBruta: unknown,
): FormaContratacaoValida[] {
  const modalidade = String(modalidadeBruta || "").trim().toLowerCase();
  if (modalidade === "camping") return ["onibus"];
  const candidatas = Array.isArray(formasBrutas) ? formasBrutas : [formasBrutas ?? formaLegada];
  return Array.from(new Set(candidatas
    .map((forma) => String(forma || "").trim().toLowerCase())
    .filter((forma): forma is FormaContratacaoValida => FORMAS_CONTRATACAO_VALIDAS.includes(forma as FormaContratacaoValida))));
}

/**
 * Regra comercial única para checkout, inventário e contrato.
 * O tipo de contratação é autoritativo: transporte, hospedagem ou ambos.
 * A modalidade define apenas a estrutura da hospedagem, nunca o escopo do contrato.
 * "livre" é mantido como legado e equivale a hospedagem até receber configuração explícita.
 */
export function resolverRecursosContratacao(
  formaBruta: unknown,
  modalidadeBruta: unknown,
  transporteProprioBruto?: unknown,
): RecursosContratados {
  const forma = String(formaBruta || "hospedagem") as FormaContratacao;
  const modalidade = String(modalidadeBruta || "quarto_ventilador") as ModalidadePacote;
  const transporteProprio = transporteProprioBruto === true || String(transporteProprioBruto || "").trim().toLowerCase() === "proprio";

  if (modalidade === "camping") {
    return transporteProprio
      ? { transporte: false, hospedagem: false, estrutura_quarto: null, transporte_proprio: true }
      : { transporte: true, hospedagem: false, estrutura_quarto: null };
  }

  const estrutura_quarto: EstruturaQuarto | null = modalidade === "quarto_ar_condicionado"
    ? "ar_condicionado"
    : modalidade === "quarto_ventilador" ? "ventilador" : null;
  const hospedagem = forma === "hospedagem" || forma === "onibus_hospedagem" || forma === "livre";
  const transporte = (forma === "onibus" || forma === "onibus_hospedagem") && !transporteProprio;
  return transporteProprio
    ? { transporte, hospedagem, estrutura_quarto: hospedagem ? estrutura_quarto : null, transporte_proprio: true }
    : { transporte, hospedagem, estrutura_quarto: hospedagem ? estrutura_quarto : null };
}

export function normalizarGrupoHospedagem(valor: unknown): GrupoHospedagem | null {
  const grupo = String(valor || "").trim().toLowerCase();
  return grupo === "masculino" || grupo === "feminino" ? grupo : null;
}
