export type EmailSenderKind = "system" | "support" | "contracts" | "finance";

const ENV_BY_KIND: Record<EmailSenderKind, string> = {
  system: "EMAIL_FROM_SYSTEM",
  support: "EMAIL_FROM_SUPPORT",
  contracts: "EMAIL_FROM_CONTRACTS",
  finance: "EMAIL_FROM_FINANCE",
};

function normalizar(valor?: string | null): string | undefined {
  const limpo = valor?.trim();
  return limpo ? limpo : undefined;
}

function extrairEndereco(valor?: string | null): string | undefined {
  const limpo = normalizar(valor);
  if (!limpo) return undefined;
  const entreSinais = limpo.match(/<([^<>\s]+@[^<>\s]+)>/);
  if (entreSinais?.[1]) return entreSinais[1];
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpo) ? limpo : undefined;
}

export function obterRemetente(kind: EmailSenderKind = "system", smtpUser?: string): string {
  const especifico = normalizar(process.env[ENV_BY_KIND[kind]]);
  if (especifico) return especifico;

  const legado = normalizar(process.env.SMTP_FROM);
  if (legado) return legado;

  const usuario = normalizar(smtpUser || process.env.SMTP_USER);
  return usuario ? `Excursão das Comitivas <${usuario}>` : "Excursão das Comitivas <sistema@excursaodascomitivas.com.br>";
}

export function obterReplyTo(): string | undefined {
  return normalizar(process.env.EMAIL_REPLY_TO)
    || extrairEndereco(process.env.EMAIL_FROM_SUPPORT)
    || extrairEndereco(process.env.SMTP_FROM);
}

export function remetenteParaTipoHistorico(tipo?: string | null): EmailSenderKind {
  const valor = String(tipo || "").toLowerCase();
  if (valor.includes("boleto") || valor.includes("pagamento") || valor.includes("finance")) return "finance";
  if (valor.includes("contrato") || valor.includes("reenvio") || valor.includes("assinatura") || valor.includes("otp")) return "contracts";
  if (valor.includes("atendimento") || valor.includes("suporte")) return "support";
  return "system";
}
