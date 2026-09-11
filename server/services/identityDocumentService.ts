import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { clienteDocumentos, usuarios } from "../db/schema.js";

export type TipoIdentidade = "rg" | "cnh" | "passaporte" | "outro";
export type StatusValidacaoDocumento = "nao_iniciada" | "processando" | "aprovado" | "rejeitado" | "analise_manual" | "erro";

export type LeituraDocumentoIdentidade = {
  tipo_documento: string | null;
  nome_completo: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  numero_documento: string | null;
  possui_foto: boolean;
  legivel: boolean;
  confianca: number;
  motivos: string[];
};

export type ResultadoCorrespondencia = {
  status: Exclude<StatusValidacaoDocumento, "nao_iniciada" | "processando" | "erro">;
  nome_corresponde: boolean;
  cpf_corresponde: boolean | null;
  nascimento_corresponde: boolean | null;
  possui_foto: boolean;
  legivel: boolean;
  confianca: number;
  motivos: string[];
};

const TIPOS_IDENTIDADE = new Set<TipoIdentidade>(["rg", "cnh", "passaporte", "outro"]);

function somenteDigitos(valor: unknown): string {
  return String(valor ?? "").replace(/\D/g, "");
}

export function normalizarNome(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nomesCorrespondem(a: unknown, b: unknown): boolean {
  const primeiro = normalizarNome(a);
  const segundo = normalizarNome(b);
  if (!primeiro || !segundo) return false;
  if (primeiro === segundo) return true;
  const tokensA = primeiro.split(" ").sort().join(" ");
  const tokensB = segundo.split(" ").sort().join(" ");
  return tokensA === tokensB;
}

function dataIso(valor: unknown): string | null {
  if (!valor) return null;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString().slice(0, 10);
  const texto = String(valor).trim();
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = texto.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? null : data.toISOString().slice(0, 10);
}

function numeroEntreZeroEUm(valor: unknown): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.max(0, Math.min(1, numero)) : 0;
}

function motivosSeguros(valor: unknown): string[] {
  return Array.isArray(valor)
    ? valor.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8).map((item) => item.slice(0, 180))
    : [];
}

export function avaliarCorrespondenciaDocumento(
  leitura: LeituraDocumentoIdentidade,
  cadastro: { nome: unknown; cpf: unknown; data_nascimento: unknown },
  tipoInformado: TipoIdentidade,
  confiancaMinima = 0.85,
): ResultadoCorrespondencia {
  const nomeCorresponde = nomesCorrespondem(leitura.nome_completo, cadastro.nome);
  const cpfCadastro = somenteDigitos(cadastro.cpf);
  const cpfDocumento = somenteDigitos(leitura.cpf);
  const cpfCorresponde = cpfDocumento ? cpfDocumento === cpfCadastro : null;
  const nascimentoCadastro = dataIso(cadastro.data_nascimento);
  const nascimentoDocumento = dataIso(leitura.data_nascimento);
  const nascimentoCorresponde = nascimentoDocumento && nascimentoCadastro ? nascimentoDocumento === nascimentoCadastro : null;
  const confianca = numeroEntreZeroEUm(leitura.confianca);
  const motivos = [...motivosSeguros(leitura.motivos)];

  if (!leitura.legivel) motivos.push("Documento sem legibilidade suficiente.");
  if (!leitura.possui_foto) motivos.push("Não foi localizada uma foto de identificação.");
  if (!nomeCorresponde) motivos.push("O nome do documento não corresponde ao cadastro.");
  if (cpfCorresponde === false) motivos.push("O CPF do documento não corresponde ao cadastro.");
  if (nascimentoCorresponde === false) motivos.push("A data de nascimento não corresponde ao cadastro.");

  if (!leitura.legivel || !leitura.possui_foto || !nomeCorresponde || cpfCorresponde === false || nascimentoCorresponde === false) {
    return { status: "rejeitado", nome_corresponde: nomeCorresponde, cpf_corresponde: cpfCorresponde, nascimento_corresponde: nascimentoCorresponde, possui_foto: leitura.possui_foto, legivel: leitura.legivel, confianca, motivos };
  }

  const tipoLido = String(leitura.tipo_documento || "").toLocaleLowerCase("pt-BR");
  const tipoCompativel = tipoInformado === "outro" || tipoLido.includes(tipoInformado) || (tipoInformado === "rg" && tipoLido.includes("identidade"));
  if (!tipoCompativel) motivos.push("O tipo de documento precisa de conferência.");
  if (confianca < confiancaMinima) motivos.push("A leitura precisa de conferência.");
  if (!cpfDocumento && tipoInformado !== "passaporte") motivos.push("O CPF não foi localizado no documento.");
  if (!cpfDocumento && tipoInformado === "passaporte" && !nascimentoDocumento) motivos.push("A data de nascimento não foi localizada no passaporte.");

  const precisaAnalise = !tipoCompativel
    || confianca < confiancaMinima
    || (!cpfDocumento && tipoInformado !== "passaporte")
    || (!cpfDocumento && tipoInformado === "passaporte" && !nascimentoDocumento);
  return {
    status: precisaAnalise ? "analise_manual" : "aprovado",
    nome_corresponde: nomeCorresponde,
    cpf_corresponde: cpfCorresponde,
    nascimento_corresponde: nascimentoCorresponde,
    possui_foto: leitura.possui_foto,
    legivel: leitura.legivel,
    confianca,
    motivos,
  };
}

function configuracaoNumerica(nome: string, padrao: number): number {
  const valor = Number(process.env[nome]);
  return Number.isFinite(valor) && valor > 0 ? valor : padrao;
}

export function configuracaoValidacaoDocumental() {
  const provedor = String(process.env.DOCUMENT_AI_PROVIDER || "gemini").trim().toLocaleLowerCase("pt-BR");
  const modelo = String(process.env.GEMINI_DOCUMENT_MODEL || "gemini-2.5-flash").trim();
  return {
    obrigatoriaContrato: process.env.DOCUMENT_IDENTITY_REQUIRED_FOR_CONTRACT === "true",
    leituraAutomaticaDisponivel: provedor === "gemini" && Boolean(process.env.GEMINI_API_KEY?.trim()) && Boolean(modelo),
    provedor,
    modelo,
  };
}

function extrairJson(texto: string): unknown {
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(limpo);
}

async function lerComGemini(buffer: Buffer, mimeType: string): Promise<LeituraDocumentoIdentidade> {
  const chave = String(process.env.GEMINI_API_KEY || "").trim();
  const modelo = String(process.env.GEMINI_DOCUMENT_MODEL || "gemini-2.5-flash").trim();
  if (!chave || !modelo) throw new Error("PROVEDOR_NAO_CONFIGURADO");

  const timeoutMs = Math.round(configuracaoNumerica("DOCUMENT_AI_TIMEOUT_MS", 30_000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: "Leia este documento de identificação. Extraia somente dados visíveis, sem completar, inferir ou corrigir. Informe se há foto do titular e se o documento está legível. CPF deve conter apenas dígitos e data de nascimento deve usar AAAA-MM-DD. Se um dado não estiver visível, use null." },
            { inlineData: { mimeType, data: buffer.toString("base64") } },
          ],
        }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: "object",
            required: ["tipo_documento", "nome_completo", "cpf", "data_nascimento", "numero_documento", "possui_foto", "legivel", "confianca", "motivos"],
            properties: {
              tipo_documento: { type: ["string", "null"] },
              nome_completo: { type: ["string", "null"] },
              cpf: { type: ["string", "null"] },
              data_nascimento: { type: ["string", "null"] },
              numero_documento: { type: ["string", "null"] },
              possui_foto: { type: "boolean" },
              legivel: { type: "boolean" },
              confianca: { type: "number", minimum: 0, maximum: 1 },
              motivos: { type: "array", items: { type: "string" }, maxItems: 8 },
            },
          },
        },
      }),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error("CREDENCIAL_INVALIDA");
      if (response.status === 429) throw new Error("LIMITE_PROVEDOR");
      throw new Error("FALHA_PROVEDOR");
    }
    const payload = await response.json() as any;
    const texto = payload?.candidates?.[0]?.content?.parts?.map((parte: any) => parte?.text || "").join("");
    if (!texto) throw new Error("RESPOSTA_INVALIDA");
    const parsed = extrairJson(texto) as Record<string, unknown>;
    return {
      tipo_documento: parsed.tipo_documento == null ? null : String(parsed.tipo_documento).slice(0, 60),
      nome_completo: parsed.nome_completo == null ? null : String(parsed.nome_completo).slice(0, 255),
      cpf: parsed.cpf == null ? null : somenteDigitos(parsed.cpf).slice(0, 11),
      data_nascimento: dataIso(parsed.data_nascimento),
      numero_documento: parsed.numero_documento == null ? null : String(parsed.numero_documento).slice(0, 80),
      possui_foto: parsed.possui_foto === true,
      legivel: parsed.legivel === true,
      confianca: numeroEntreZeroEUm(parsed.confianca),
      motivos: motivosSeguros(parsed.motivos),
    };
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error("TEMPO_ESGOTADO");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function mensagemErroSegura(codigo: string): string {
  const mensagens: Record<string, string> = {
    PROVEDOR_NAO_CONFIGURADO: "A leitura automática ainda não está configurada. O documento foi preservado para análise.",
    CREDENCIAL_INVALIDA: "A leitura automática está temporariamente indisponível por configuração.",
    LIMITE_PROVEDOR: "O serviço de leitura está temporariamente ocupado. Tente novamente em alguns minutos.",
    TEMPO_ESGOTADO: "A leitura demorou mais que o esperado. Tente novamente.",
    ARQUIVO_NAO_ENCONTRADO: "O arquivo do documento não foi localizado.",
  };
  return mensagens[codigo] || "Não foi possível concluir a leitura automática. O documento foi preservado para nova tentativa.";
}

function cpfMascarado(cpf: string | null): string | null {
  const digitos = somenteDigitos(cpf);
  return digitos.length === 11 ? `***.***.***-${digitos.slice(-2)}` : null;
}

function numeroMascarado(numero: string | null): string | null {
  const texto = String(numero || "").trim();
  return texto ? `***${texto.slice(-4)}` : null;
}

export class IdentityDocumentService {
  static async validar(documentoId: string, opcoes: { forcar?: boolean } = {}) {
    const registro = (await db.select({
      id: clienteDocumentos.id,
      categoria: clienteDocumentos.categoria,
      tipo_identidade: clienteDocumentos.tipo_identidade,
      mime_type: clienteDocumentos.mime_type,
      arquivo: clienteDocumentos.arquivo,
      validacao_status: clienteDocumentos.validacao_status,
      usuario_id: clienteDocumentos.usuario_id,
      nome: usuarios.nome,
      cpf: usuarios.cpf,
      data_nascimento: usuarios.data_nascimento,
    }).from(clienteDocumentos).innerJoin(usuarios, eq(clienteDocumentos.usuario_id, usuarios.id)).where(eq(clienteDocumentos.id, documentoId)).limit(1))[0];
    if (!registro || registro.categoria !== "identidade") throw new Error("DOCUMENTO_NAO_ENCONTRADO");
    if (registro.validacao_status === "aprovado" && !opcoes.forcar) return { status: "aprovado", reutilizado: true };

    const tipo = TIPOS_IDENTIDADE.has(registro.tipo_identidade as TipoIdentidade) ? registro.tipo_identidade as TipoIdentidade : "outro";
    const agora = new Date();
    await db.update(clienteDocumentos).set({
      validacao_status: "processando",
      leitura_iniciada_em: agora,
      erro_validacao: null,
      leitura_tentativas: sql`${clienteDocumentos.leitura_tentativas} + 1`,
      atualizado_em: agora,
    }).where(eq(clienteDocumentos.id, documentoId));

    try {
      const base = path.resolve(process.env.STORAGE_PATH || "./uploads");
      const arquivo = path.resolve(registro.arquivo);
      if (!arquivo.startsWith(`${base}${path.sep}`)) throw new Error("ARQUIVO_NAO_ENCONTRADO");
      const buffer = await fs.readFile(arquivo).catch(() => { throw new Error("ARQUIVO_NAO_ENCONTRADO"); });
      const configuracao = configuracaoValidacaoDocumental();
      if (configuracao.provedor !== "gemini") throw new Error("PROVEDOR_NAO_CONFIGURADO");
      const leitura = await lerComGemini(buffer, registro.mime_type);
      const resultado = avaliarCorrespondenciaDocumento(leitura, registro, tipo, configuracaoNumerica("DOCUMENT_AI_MIN_CONFIDENCE", 0.85));
      const finalizadoEm = new Date();
      const dadosMinimos = {
        tipo_documento: leitura.tipo_documento,
        nome_normalizado: normalizarNome(leitura.nome_completo),
        cpf_mascarado: cpfMascarado(leitura.cpf),
        cpf_sha256: leitura.cpf ? createHash("sha256").update(somenteDigitos(leitura.cpf)).digest("hex") : null,
        data_nascimento: leitura.data_nascimento,
        numero_documento_mascarado: numeroMascarado(leitura.numero_documento),
      };
      await db.update(clienteDocumentos).set({
        validacao_status: resultado.status,
        dados_extraidos: dadosMinimos,
        validacao_resultado: resultado,
        validacao_provedor: configuracao.provedor,
        validacao_modelo: configuracao.modelo,
        validado_em: resultado.status === "aprovado" ? finalizadoEm : null,
        erro_validacao: null,
        atualizado_em: finalizadoEm,
      }).where(eq(clienteDocumentos.id, documentoId));
      return { status: resultado.status, resultado };
    } catch (error: any) {
      const codigo = String(error?.message || "FALHA_PROVEDOR");
      const mensagem = mensagemErroSegura(codigo);
      const semConfiguracao = ["PROVEDOR_NAO_CONFIGURADO", "CREDENCIAL_INVALIDA"].includes(codigo);
      await db.update(clienteDocumentos).set({
        validacao_status: semConfiguracao ? "analise_manual" : "erro",
        validacao_provedor: String(process.env.DOCUMENT_AI_PROVIDER || "gemini").slice(0, 40),
        validacao_modelo: String(process.env.GEMINI_DOCUMENT_MODEL || "gemini-2.5-flash").slice(0, 120),
        validado_em: null,
        erro_validacao: mensagem,
        atualizado_em: new Date(),
      }).where(eq(clienteDocumentos.id, documentoId));
      return { status: semConfiguracao ? "analise_manual" : "erro", erro: mensagem };
    }
  }
}
