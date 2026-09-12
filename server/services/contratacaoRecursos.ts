export type FormaContratacao = "onibus" | "hospedagem" | "onibus_hospedagem" | "livre";
export type ModalidadePacote = "camping" | "quarto_ventilador" | "quarto_ar_condicionado";
export type GrupoHospedagem = "masculino" | "feminino";
export type EstruturaQuarto = "ventilador" | "ar_condicionado";

export type RecursosContratados = {
  transporte: boolean;
  hospedagem: boolean;
  estrutura_quarto: EstruturaQuarto | null;
};

/**
 * Regra comercial única para checkout, inventário e contrato.
 * Camping é transporte; quartos podem ser vendidos com ou sem transporte.
 * "livre" é mantido para pacotes legados e segue a modalidade cadastrada.
 */
export function resolverRecursosContratacao(
  formaBruta: unknown,
  modalidadeBruta: unknown,
): RecursosContratados {
  const forma = String(formaBruta || "hospedagem") as FormaContratacao;
  const modalidade = String(modalidadeBruta || "quarto_ventilador") as ModalidadePacote;

  if (modalidade === "camping") {
    return { transporte: true, hospedagem: false, estrutura_quarto: null };
  }

  const estrutura_quarto: EstruturaQuarto | null = modalidade === "quarto_ar_condicionado"
    ? "ar_condicionado"
    : modalidade === "quarto_ventilador" ? "ventilador" : null;
  const hospedagem = forma === "hospedagem" || forma === "onibus_hospedagem" || forma === "livre";
  const transporte = forma === "onibus" || forma === "onibus_hospedagem";
  return { transporte, hospedagem, estrutura_quarto: hospedagem ? estrutura_quarto : null };
}

export function normalizarGrupoHospedagem(valor: unknown): GrupoHospedagem | null {
  const grupo = String(valor || "").trim().toLowerCase();
  return grupo === "masculino" || grupo === "feminino" ? grupo : null;
}
