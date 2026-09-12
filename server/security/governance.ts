export type PerfilUsuario = "cliente" | "vendedor" | "admin" | "dev" | string | null | undefined;

export interface EvidenciaAprovacaoCadastro {
  ativo?: boolean | null;
  cadastro_status?: string | null;
  aprovado_em?: Date | string | null;
  aprovado_por?: string | null;
}

export function podeExporUsuario(perfilSolicitante: PerfilUsuario, perfilAlvo: PerfilUsuario): boolean {
  return perfilAlvo !== "dev" || perfilSolicitante === "dev";
}

export function cadastroAprovadoComEvidencia(registro: EvidenciaAprovacaoCadastro | null | undefined): boolean {
  return Boolean(
    registro?.ativo
      && registro.cadastro_status === "aprovado"
      && registro.aprovado_em
      && String(registro.aprovado_por || "").trim(),
  );
}

export interface CadastroMinimoCliente {
  nome?: string | null;
  email?: string | null;
  cpf?: string | null;
  telefone?: string | null;
  sexo?: string | null;
  data_nascimento?: Date | string | null;
  endereco?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
}

export function camposFaltantesCadastroMinimo(
  registro: CadastroMinimoCliente | null | undefined,
  opcoes: { exigirSexoEnderecoEstruturado?: boolean } = {},
): string[] {
  const exigirSexoEnderecoEstruturado = opcoes.exigirSexoEnderecoEstruturado === true;
  if (!registro) return exigirSexoEnderecoEstruturado
    ? ["nome", "e-mail", "CPF", "sexo", "telefone", "data de nascimento", "CEP", "logradouro", "número", "bairro", "cidade", "UF"]
    : ["nome", "e-mail", "CPF", "telefone", "data de nascimento", "endereço"];
  const faltantes: string[] = [];
  if (!String(registro.nome || "").trim()) faltantes.push("nome");
  if (!String(registro.email || "").trim()) faltantes.push("e-mail");
  if (String(registro.cpf || "").replace(/\D/g, "").length !== 11) faltantes.push("CPF");
  if (exigirSexoEnderecoEstruturado && !["masculino", "feminino"].includes(String(registro.sexo || "").trim().toLowerCase())) faltantes.push("sexo");
  const telefone = String(registro.telefone || "").replace(/\D/g, "");
  if (telefone.length < 10 || telefone.length > 13) faltantes.push("telefone");
  const nascimento = registro.data_nascimento ? new Date(registro.data_nascimento) : null;
  if (!nascimento || Number.isNaN(nascimento.getTime()) || nascimento.getTime() >= Date.now()) faltantes.push("data de nascimento");
  if (exigirSexoEnderecoEstruturado) {
    if (String(registro.cep || "").replace(/\D/g, "").length !== 8) faltantes.push("CEP");
    if (String(registro.logradouro || "").trim().length < 2) faltantes.push("logradouro");
    if (!String(registro.numero || "").trim()) faltantes.push("número");
    if (String(registro.bairro || "").trim().length < 2) faltantes.push("bairro");
    if (String(registro.cidade || "").trim().length < 2) faltantes.push("cidade");
    if (!/^[A-Za-zÀ-ÿ]{2}$/.test(String(registro.estado || "").trim())) faltantes.push("UF");
  }
  if (String(registro.endereco || "").trim().length < 8) faltantes.push("endereço");
  return faltantes;
}

export interface GateBoleto {
  clienteAtivo: boolean;
  cadastroStatus: string | null | undefined;
  cadastroAprovadoComEvidencia: boolean;
  contratoExiste: boolean;
  contratoValidado: boolean;
  contratoAprovadoAdmin: boolean;
  formaPagamento: string | null | undefined;
}

export function motivoBloqueioBoleto(gate: GateBoleto): string | null {
  if (!gate.clienteAtivo) return "Boleto bloqueado: cliente inativo.";
  if (gate.cadastroStatus !== "aprovado") return "Boleto bloqueado: cadastro ainda não foi aprovado.";
  if (!gate.cadastroAprovadoComEvidencia) return "Boleto bloqueado: aprovação do cadastro sem registro completo.";
  if (!gate.contratoExiste) return "Boleto bloqueado: contrato ainda não foi gerado.";
  if (!gate.contratoValidado) return "Boleto bloqueado: contrato ainda não foi validado pelo cliente.";
  if (!gate.contratoAprovadoAdmin) return "Boleto bloqueado: contrato ainda não foi aprovado pela administração.";
  if (gate.formaPagamento !== "boleto") return "Boleto bloqueado: forma de pagamento não é boleto.";
  return null;
}
