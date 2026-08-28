import { createHash } from "node:crypto";
import fs from "fs/promises";
import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import path from "path";
import Decimal from "decimal.js";
import { and, desc, eq, sql } from "drizzle-orm";
import { CONTRATADA_DADOS } from "../../packages/contract-engine/letterhead.js";
import { generateBrandedPdfBuffer } from "../../packages/contract-engine/brandedPdfLayout.js";
import { renderizarContratoModeloPadrao } from "../../packages/contract-engine/contratoModeloPadrao.js";
import { db } from "../db/index.js";
import regrasRuntime from "../../packages/legal-content/regras-2026.1.json";
import {
  contratosDocumentos,
  contratoEventos,
  otpDesafios,
  descontosAdministrativos,
  eventos,
  lotes,
  pacotes,
  reservas,
  usuarios,
} from "../db/schema.js";

export type FormaPagamentoContrato = "pix" | "boleto" | "credito";
export const CONTRATO_TEMPLATE_VERSION = "2026.1-oficial";
export const REGRAS_CONVIVENCIA_VERSION = regrasRuntime.versao;
export const REGRAS_CONVIVENCIA_OFICIAIS = regrasRuntime.conteudo;

const MODALIDADES_HOSPEDAGEM: Record<string, string> = {
  camping: "Camping",
  quarto_ventilador: "Quarto com ventilador compartilhado",
  quarto_ar_condicionado: "Quarto com climatizador compartilhado",
};

const FORMAS_PAGAMENTO: Record<string, string> = {
  pix: "Pagamento à vista via PIX",
  boleto: "Parcelamento por boleto bancário",
  credito: "Parcelamento por cartão de crédito",
};

export interface ContratoFormulario {
  contratante?: {
    nome?: string;
    cpf?: string;
    rg?: string;
    nacionalidade?: string;
    estado_civil?: string;
    profissao?: string;
    nascimento?: string | null;
    endereco?: string;
    telefone?: string;
    email?: string;
  };
  hospedagem?: {
    check_in?: string | null;
    check_out?: string | null;
    modalidade?: string | null;
    local?: string;
  };
  transporte?: {
    rodoviario_incluido?: boolean;
    local_embarque?: string | null;
    ponto_referencia?: string | null;
    data_saida?: string | null;
    horario_saida?: string | null;
    data_retorno?: string | null;
    horario_retorno?: string | null;
    veiculo?: string | null;
  };
  bagagem?: { limite_kg?: number | null };
  seguro?: { seguradora?: string | null; apolice?: string | null; cobertura?: string | null; telefone?: string | null };
  uso_imagem?: { autorizado?: boolean; prazo_anos?: number };
  servicos_inclusos?: string[];
  observacoes_especificas?: string | null;
}

export interface DadosContrato {
  reserva_id: string;
  usuario_id?: string;
  lote_id?: string;
  contrato_id?: string;
  snapshot?: SnapshotVenda;
  formulario?: ContratoFormulario;
  aceite_ip?: string;
  aceite_timestamp?: Date;
  protocolo?: string;
  canal?: string;
  destinatario_mascarado?: string;
  aceite_contrato_texto?: string;
  aceite_regras_texto?: string;
}

export interface CondicaoPagamentoCalculada {
  forma_pagamento: FormaPagamentoContrato;
  quantidade_parcelas: number;
  valor_total: string;
  valor_parcela: string;
  desconto_pagamento: string;
}

type ItemContrato = { id?: string; codigo?: string; nome: string; tipo?: string; transporte_rodoviario?: boolean; quantidade: number; valor: Decimal };

type SnapshotVenda = {
  cliente: Record<string, unknown>;
  evento: Record<string, unknown>;
  lote: Record<string, unknown>;
  periodo: { check_in: string; check_out: string };
  pacote: Record<string, unknown>;
  hospedagem: { modalidade: string | null; modalidade_nome: string; local: string };
  servicos_inclusos: string[];
  adicionais: Array<Record<string, unknown>>;
  quantidade: number;
  precos_unitarios: Array<Record<string, unknown>>;
  financeiro: {
    subtotal: string;
    cupom: string;
    desconto_pagamento: string;
    desconto_administrativo: string;
    total: string;
    forma_pagamento: string | null;
    parcelas: number;
    valor_parcela: string;
    vencimentos: string[];
    cronograma: Array<{ numero: number; vencimento: string; valor: string; valor_centavos: number }>;

  };
  transporte: { rodoviario_incluido: boolean; local_embarque: string | null; ponto_referencia: string | null; data_saida: string | null; data_retorno: string | null; horario_saida: string | null; horario_retorno: string | null; veiculo: string | null };
  bagagem?: { limite_kg: number | null };
  seguro?: { seguradora: string | null; apolice: string | null; cobertura: string | null; telefone: string | null };
  uso_imagem?: { autorizado: boolean; prazo_anos: number };
  observacoes_especificas?: string | null;
  politicas: Record<string, unknown>;
  regras: { versao: string; conteudo: string; sha256: string };
  data_contrato: string;
  versao_contratual: string;
};

function escaparHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function decimal(valor: unknown): Decimal {
  try { return new Decimal(String(valor ?? 0)); } catch { return new Decimal(0); }
}

function dataValida(valor: Date | string | null | undefined): Date | null {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

function formatarData(valor: Date | string | null | undefined): string {
  const data = dataValida(valor);
  if (!data) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }).format(data);
}

function formatarDataISO(valor: Date | string | null | undefined): string | null {
  const data = dataValida(valor);
  if (!data) return null;
  const partes = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Sao_Paulo" }).formatToParts(data);
  const ano = partes.find((parte) => parte.type === "year")?.value;
  const mes = partes.find((parte) => parte.type === "month")?.value;
  const dia = partes.find((parte) => parte.type === "day")?.value;
  return ano && mes && dia ? `${ano}-${mes}-${dia}` : data.toISOString().slice(0, 10);
}

function formatarDataHora(valor: Date | string | null | undefined): string {
  const data = dataValida(valor);
  if (!data) return "a confirmar pela organização";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(data);
}

function formatarMoeda(valor: Decimal.Value | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(decimal(valor).toNumber());
}

function formatarCpf(valor: string | null | undefined): string {
  const cpf = String(valor || "").replace(/\D/g, "");
  return cpf.length === 11 ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : valor || "Não informado";
}

function normalizarItens(valor: unknown): ItemContrato[] {
  let dados = valor;
  if (typeof dados === "string") {
    try { dados = JSON.parse(dados); } catch { return []; }
  }
  if (!Array.isArray(dados)) return [];
  return dados.map((item: any) => ({
    id: item?.id ? String(item.id) : undefined,
    codigo: item?.codigo ? String(item.codigo) : undefined,
    nome: String(item?.nome || "Item adicional"),
    tipo: item?.tipo ? String(item.tipo) : undefined,
    transporte_rodoviario: item?.transporte_rodoviario === true,
    quantidade: Number.isInteger(Number(item?.quantidade)) && Number(item.quantidade) > 0 ? Number(item.quantidade) : 1,
    valor: decimal(item?.valor),
  })).filter((item) => item.valor.greaterThanOrEqualTo(0));
}

function sha256(valor: string): string { return createHash("sha256").update(valor, "utf8").digest("hex"); }
function canonizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonizar);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([chave, item]) => [chave, canonizar(item)]));
  }
  return valor;
}
function serializarSnapshot(snapshot: SnapshotVenda): string { return JSON.stringify(canonizar(snapshot)); }
function hashEvento(evento: unknown, hashAnterior?: string | null): string {
  return sha256(`${hashAnterior || ""}:${JSON.stringify(canonizar(evento))}`);
}
function checkbox(selecionado: boolean): string { return selecionado ? "☒" : "☐"; }

function valorPorExtenso(valor: Decimal): string {
  const unidades = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const especiais = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  const grupo = (numero: number): string => {
    if (numero < 10) return unidades[numero];
    if (numero < 20) return especiais[numero - 10];
    if (numero < 100) return dezenas[Math.floor(numero / 10)] + (numero % 10 ? ` e ${unidades[numero % 10]}` : "");
    if (numero === 100) return "cem";
    return centenas[Math.floor(numero / 100)] + (numero % 100 ? ` e ${grupo(numero % 100)}` : "");
  };
  const inteiro = Math.floor(valor.toNumber());
  const centavos = valor.minus(inteiro).times(100).round().toNumber();
  const partes: string[] = [];
  if (inteiro >= 1_000_000) {
    const milhoes = Math.floor(inteiro / 1_000_000);
    partes.push(`${grupo(milhoes)} ${milhoes === 1 ? "milhão" : "milhões"}`);
  }
  const milhares = Math.floor((inteiro % 1_000_000) / 1000);
  if (milhares) partes.push(`${milhares === 1 ? "mil" : `${grupo(milhares)} mil`}`);
  const resto = inteiro % 1000;
  if (resto) partes.push(grupo(resto));
  const textoInteiro = partes.join(" e ") || "zero";
  const moeda = inteiro === 1 ? "real" : "reais";
  if (!centavos) return `${textoInteiro} ${moeda}`;
  return `${textoInteiro} ${moeda} e ${grupo(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`;
}

function vencimentos(dataLimite: Date | null, parcelas: number): string[] {
  if (!dataLimite || parcelas < 1) return [];
  const ultimo = new Date(dataLimite);
  ultimo.setUTCDate(ultimo.getUTCDate() - 1);
  return Array.from({ length: parcelas }, (_, index) => {
    const data = new Date(ultimo);
    data.setUTCMonth(data.getUTCMonth() - (parcelas - 1 - index));
    return data.toISOString().slice(0, 10);
  });
}

function cronogramaPagamento(total: Decimal, dataLimite: Date | null, parcelas: number) {
  const totalCentavos = total.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  const datas = vencimentos(dataLimite, parcelas);
  const base = Math.floor(totalCentavos / Math.max(1, parcelas));
  const resto = totalCentavos - base * Math.max(1, parcelas);
  return Array.from({ length: parcelas }, (_, index) => {
    const valorCentavos = base + (index === parcelas - 1 ? resto : 0);
    return { numero: index + 1, vencimento: datas[index] || "", valor_centavos: valorCentavos, valor: new Decimal(valorCentavos).div(100).toFixed(2) };
  });
}

function transporteFoiContratado(itens: ItemContrato[]): boolean {
  return itens.some((item) => item.transporte_rodoviario === true || item.codigo === "transporte_rodoviario" || item.tipo === "transporte_rodoviario");
}

function textoOpcional(valor: unknown, fallback: string | null = null): string | null {
  const texto = String(valor ?? "").trim();
  return texto ? texto.slice(0, 500) : fallback;
}

function dataISOouNulo(valor: unknown): string | null {
  if (!valor) return null;
  const texto = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  return formatarDataISO(texto);
}

function numeroOpcional(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? Math.round(numero * 100) / 100 : null;
}

export class ContratoService {
  static calcularParcelasMaximasBoleto(dataLimitePagamento: Date | string | null | undefined, dataReferencia: Date = new Date(), mesesMaximoAntecedencia = 20): number {
    const limite = dataValida(dataLimitePagamento);
    if (!limite) return 1;
    const meses = (limite.getUTCFullYear() - dataReferencia.getUTCFullYear()) * 12 + (limite.getUTCMonth() - dataReferencia.getUTCMonth());
    return meses <= 0 ? 1 : Math.min(mesesMaximoAntecedencia, meses);
  }

  static calcularCondicaoPagamento(
    valorAtual: Decimal.Value,
    formaBruta: unknown,
    parcelasBrutas: unknown,
    parcelasMaximasBoleto = 2,
    opcoes: { percentualDescontoPix?: number; parcelasMaximasCredito?: number } = {},
  ): CondicaoPagamentoCalculada {
    const forma = String(formaBruta ?? "").trim().toLowerCase() as FormaPagamentoContrato;
    if (!(forma in FORMAS_PAGAMENTO)) throw new Error("Forma de pagamento inválida");
    const parcelas = Number(parcelasBrutas ?? 1);
    if (!Number.isInteger(parcelas) || parcelas < 1) throw new Error("A quantidade de parcelas deve ser um número inteiro positivo");
    if (forma === "pix" && parcelas !== 1) throw new Error("O pagamento via PIX deve ser feito à vista");
    if (forma === "boleto" && parcelas > parcelasMaximasBoleto) throw new Error(parcelasMaximasBoleto <= 1 ? "Nesta data, o boleto só pode ser emitido à vista (1x), pela proximidade da viagem" : `O boleto pode ser parcelado em até ${parcelasMaximasBoleto} vezes nesta data`);
    if (forma === "credito" && parcelas > (opcoes.parcelasMaximasCredito ?? 10)) throw new Error(`O cartão de crédito pode ser parcelado em até ${opcoes.parcelasMaximasCredito ?? 10} vezes`);
    const original = decimal(valorAtual);
    if (original.lessThanOrEqualTo(0)) throw new Error("O valor da reserva deve ser maior que zero");
    const desconto = forma === "pix" ? original.times(opcoes.percentualDescontoPix ?? 5).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP) : new Decimal(0);
    const total = original.minus(desconto).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return { forma_pagamento: forma, quantidade_parcelas: parcelas, valor_total: total.toFixed(2), valor_parcela: total.div(parcelas).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2), desconto_pagamento: desconto.toFixed(2) };
  }

  static async obterDadosBase(reservaId: string) {
    const reserva = (await db.select().from(reservas).where(eq(reservas.id, reservaId)).limit(1))[0];
    if (!reserva) throw new Error("Reserva não encontrada");
    const usuario = (await db.select().from(usuarios).where(eq(usuarios.id, reserva.usuario_id)).limit(1))[0];
    if (!usuario) throw new Error("Usuário da reserva não encontrado");
    const lote = (await db.select().from(lotes).where(eq(lotes.id, reserva.lote_id)).limit(1))[0];
    if (!lote) throw new Error("Lote da reserva não encontrado");
    const evento = (await db.select().from(eventos).where(eq(eventos.id, lote.evento_id)).limit(1))[0];
    if (!evento) throw new Error("Evento não encontrado");
    const pacote = reserva.pacote_id
      ? (await db.select().from(pacotes).where(and(eq(pacotes.id, reserva.pacote_id), eq(pacotes.lote_id, lote.id))).limit(1))[0]
      : undefined;
    return { reserva, usuario, lote, evento, pacote };
  }

  static async gerarSnapshot(dadosContrato: DadosContrato): Promise<SnapshotVenda> {
    const { reserva, usuario, lote, evento, pacote } = await this.obterDadosBase(dadosContrato.reserva_id);
    const adicionais = normalizarItens(reserva.itens_selecionados);
    const descontoQuery: any = db.select({ valor_desconto: descontosAdministrativos.valor_desconto }).from(descontosAdministrativos).where(eq(descontosAdministrativos.reserva_id, reserva.id));
    const descontoAdministrativo = (await (typeof descontoQuery.orderBy === "function" ? descontoQuery.orderBy(desc(descontosAdministrativos.criado_em)) : descontoQuery).limit(1))[0];
    const base = decimal(pacote?.valor_total ?? lote.valor_base);
    const itens: ItemContrato[] = [{ id: pacote?.id, nome: pacote?.nome || `Pacote base — ${lote.nome}`, quantidade: 1, valor: base }, ...adicionais];
    const subtotal = itens.reduce((total, item) => total.plus(item.valor.times(item.quantidade)), new Decimal(0)).toDecimalPlaces(2);
    const descontoCupom = decimal(reserva.desconto_aplicado);
    const descontoPagamento = decimal(reserva.desconto_pagamento);
    const total = decimal(reserva.valor_total);
    const parcelas = reserva.quantidade_parcelas || 1;
    const aceite = dadosContrato.aceite_timestamp || reserva.aceite_timestamp || new Date();
    const formulario = dadosContrato.formulario || {};
    const clienteForm = formulario.contratante || {};
    const hospedagemForm = formulario.hospedagem || {};
    const transporteForm = formulario.transporte || {};
    const seguroForm = formulario.seguro || {};
    const rodoviario = transporteForm.rodoviario_incluido === undefined ? transporteFoiContratado(adicionais) : transporteForm.rodoviario_incluido === true;
    const localHospedagem = textoOpcional(hospedagemForm.local, lote.local_hospedagem || "Chácara Recanto Novo Encantado ou Santa Thereza") || "Chácara Recanto Novo Encantado ou Santa Thereza";
    const modalidadeHospedagem = textoOpcional(hospedagemForm.modalidade, pacote?.modalidade_hospedagem || null);
    const regrasHash = sha256(REGRAS_CONVIVENCIA_OFICIAIS);
    const dataLimite = lote.data_embarque || lote.data_inicio;
    const servicos = ["Hospedagem", "Café da manhã", "Almoço", "Open Bar das 09h às 19h", "Translado entre a chácara e o Parque do Peão"];
    if (rodoviario) servicos.unshift("Transporte rodoviário de ida e volta, conforme programação previamente divulgada pela CONTRATADA");
    const cronograma = cronogramaPagamento(total, dataValida(dataLimite), parcelas);
    return {
      cliente: { id: usuario.id, nome: textoOpcional(clienteForm.nome, usuario.nome), cpf: textoOpcional(clienteForm.cpf, usuario.cpf), rg: textoOpcional(clienteForm.rg, usuario.rg), nacionalidade: textoOpcional(clienteForm.nacionalidade, usuario.nacionalidade || "Brasileira"), estado_civil: textoOpcional(clienteForm.estado_civil, usuario.estado_civil), profissao: textoOpcional(clienteForm.profissao, usuario.profissao), nascimento: dataISOouNulo(clienteForm.nascimento) || formatarDataISO(usuario.data_nascimento), endereco: textoOpcional(clienteForm.endereco, usuario.endereco), telefone: textoOpcional(clienteForm.telefone, usuario.telefone), email: textoOpcional(clienteForm.email, usuario.email) },
      evento: { id: evento.id, nome: evento.nome, local: evento.local, data_inicio: formatarDataISO(evento.data_inicio), data_fim: formatarDataISO(evento.data_fim) },
      lote: { id: lote.id, nome: lote.nome, descricao: lote.descricao },
      periodo: { check_in: dataISOouNulo(hospedagemForm.check_in) || formatarDataISO(lote.data_inicio) || "", check_out: dataISOouNulo(hospedagemForm.check_out) || formatarDataISO(lote.data_fim) || "" },
      pacote: { id: pacote?.id || null, nome: pacote?.nome || null, descricao: pacote?.descricao || null },
      hospedagem: { modalidade: modalidadeHospedagem, modalidade_nome: MODALIDADES_HOSPEDAGEM[modalidadeHospedagem || ""] || "Conforme contratação registrada", local: localHospedagem },
      servicos_inclusos: Array.isArray(formulario.servicos_inclusos) && formulario.servicos_inclusos.length > 0 ? formulario.servicos_inclusos.map((item) => String(item).trim()).filter(Boolean).slice(0, 30) : servicos,
      adicionais: adicionais.map((item) => ({ id: item.id, codigo: item.codigo, nome: item.nome, tipo: item.tipo, transporte_rodoviario: item.transporte_rodoviario, quantidade: item.quantidade, valor_unitario: item.valor.toFixed(2) })),
      quantidade: 1,
      precos_unitarios: itens.map((item) => ({ nome: item.nome, quantidade: item.quantidade, valor_unitario: item.valor.toFixed(2), total: item.valor.times(item.quantidade).toFixed(2) })),
      financeiro: { subtotal: subtotal.toFixed(2), cupom: descontoCupom.toFixed(2), desconto_pagamento: descontoPagamento.toFixed(2), desconto_administrativo: decimal(descontoAdministrativo?.valor_desconto).toFixed(2), total: total.toFixed(2), forma_pagamento: reserva.forma_pagamento, parcelas, valor_parcela: cronograma[0]?.valor || (reserva.valor_parcela ? decimal(reserva.valor_parcela).toFixed(2) : total.div(parcelas).toFixed(2)), vencimentos: cronograma.map((item) => item.vencimento), cronograma },
      transporte: { rodoviario_incluido: rodoviario, local_embarque: rodoviario ? textoOpcional(transporteForm.local_embarque, lote.local_embarque) : null, ponto_referencia: rodoviario ? textoOpcional(transporteForm.ponto_referencia, null) : null, data_saida: rodoviario ? dataISOouNulo(transporteForm.data_saida) || formatarDataISO(lote.data_embarque) : null, data_retorno: rodoviario ? dataISOouNulo(transporteForm.data_retorno) || formatarDataISO(lote.data_retorno) : null, horario_saida: rodoviario ? textoOpcional(transporteForm.horario_saida, lote.data_embarque ? formatarDataHora(lote.data_embarque) : null) : null, horario_retorno: rodoviario ? textoOpcional(transporteForm.horario_retorno, lote.data_retorno ? formatarDataHora(lote.data_retorno) : null) : null, veiculo: rodoviario ? textoOpcional(transporteForm.veiculo, null) : null },
      bagagem: { limite_kg: numeroOpcional(formulario.bagagem?.limite_kg) },
      seguro: { seguradora: textoOpcional(seguroForm.seguradora), apolice: textoOpcional(seguroForm.apolice), cobertura: textoOpcional(seguroForm.cobertura), telefone: textoOpcional(seguroForm.telefone) },
      uso_imagem: { autorizado: formulario.uso_imagem?.autorizado === true, prazo_anos: Number(formulario.uso_imagem?.prazo_anos) > 0 ? Math.min(10, Math.round(Number(formulario.uso_imagem?.prazo_anos))) : 3 },
      observacoes_especificas: textoOpcional(formulario.observacoes_especificas),
      politicas: { cancelamento: ["Superior a 90 dias: retenção de 10%", "Entre 80 e 60 dias: retenção de 20%", "Entre 50 e 30 dias: retenção de 30%", "Entre 20 e 15 dias: retenção de 50%", "Menos de 15 dias: retenção de 80%", "No-show ou abandono: retenção de 100%"], reembolso: "Até 30 dias da formalização do pedido" },
      regras: { versao: REGRAS_CONVIVENCIA_VERSION, conteudo: REGRAS_CONVIVENCIA_OFICIAIS, sha256: regrasHash },
      data_contrato: formatarData(aceite),
      versao_contratual: CONTRATO_TEMPLATE_VERSION,
    };
  }

  private static async obterSnapshotPersistido(contratoId: string): Promise<{ id: string; versao: number; status: string; snapshot: SnapshotVenda; snapshot_sha256: string; pdf_sha256: string | null }> {
    const documento = (await db.select({ id: contratosDocumentos.id, versao: contratosDocumentos.versao, status: contratosDocumentos.status, snapshot: contratosDocumentos.snapshot, snapshot_sha256: contratosDocumentos.snapshot_sha256, pdf_sha256: contratosDocumentos.pdf_sha256 }).from(contratosDocumentos).where(eq(contratosDocumentos.id, contratoId)).limit(1))[0];
    if (!documento) throw new Error("Documento contratual não encontrado");
    return { ...documento, snapshot: documento.snapshot as SnapshotVenda };
  }

  static async marcarVisualizacao(contratoId: string, reservaId: string, atorId?: string, ip?: string, userAgent?: string): Promise<void> {
    const documento = await this.obterSnapshotPersistido(contratoId);
    const agora = new Date();
    await db.transaction(async (tx) => {
      await tx.update(contratosDocumentos).set({ visualizado_em: documento.status === "validado" ? undefined : agora }).where(and(eq(contratosDocumentos.id, contratoId), eq(contratosDocumentos.reserva_id, reservaId)));
      const anterior = (await tx.select({ hash_evento: contratoEventos.hash_evento }).from(contratoEventos).where(eq(contratoEventos.contrato_id, contratoId)).orderBy(desc(contratoEventos.criado_em)).limit(1))[0];
      const metadados = { contrato_id: contratoId, versao: documento.versao };
      await tx.insert(contratoEventos).values({ id: `evt-${randomUUID()}`, contrato_id: contratoId, reserva_id: reservaId, tipo: "visualizado", criado_em: agora, ator_id: atorId || null, ip: ip || null, user_agent: userAgent || null, metadados, hash_anterior: anterior?.hash_evento || null, hash_evento: hashEvento(metadados, anterior?.hash_evento) });
    });
  }

  static async gerarContratoHTML(dadosContrato: DadosContrato): Promise<string> {
    const snapshot = dadosContrato.snapshot || (dadosContrato.contrato_id
      ? (await this.obterSnapshotPersistido(dadosContrato.contrato_id)).snapshot
      : await this.gerarSnapshot(dadosContrato));
    return renderizarContratoModeloPadrao({ reservaId: dadosContrato.reserva_id, snapshot });
  }

  static async gerarContratoPDF(dadosContrato: DadosContrato): Promise<Buffer> {
    const base = await generateBrandedPdfBuffer(await this.gerarContratoHTML(dadosContrato), { brand: "comitiva", contractModel: true });
    if (!dadosContrato.protocolo) return base;
    const documento = await PDFDocument.load(base);
    const fonte = await documento.embedFont(StandardFonts.Helvetica);
    const fonteNegrito = await documento.embedFont(StandardFonts.HelveticaBold);
    const pagina = documento.addPage([595.28, 841.89]);
    const linhas = [
      "CERTIFICADO DE EVIDÊNCIAS DA ASSINATURA ELETRÔNICA",
      "Excursão das Comitivas — contratação 2026",
      "",
      `Protocolo: ${dadosContrato.protocolo}`,
      `Reserva: ${dadosContrato.reserva_id}`,
      `Contrato: ${dadosContrato.contrato_id || "não informado"}`,
      `Canal: ${dadosContrato.canal || "não informado"}`,
      `Destino: ${dadosContrato.destinatario_mascarado || "não informado"}`,
      `Data/hora UTC: ${(dadosContrato.aceite_timestamp || new Date()).toISOString()}`,
      `IP confiável registrado: ${dadosContrato.aceite_ip || "não informado"}`,
      "",
      "Hash SHA-256 do conteúdo contratual aceito:",
      dadosContrato.snapshot ? sha256(serializarSnapshot(dadosContrato.snapshot)) : "ver registro de validação",
      "",
      `Aceite do contrato: ${dadosContrato.aceite_contrato_texto || "texto registrado no banco"}`,
      `Aceite das regras: ${dadosContrato.aceite_regras_texto || "texto registrado no banco"}`,
      "",
      "Este certificado acompanha o PDF final e não altera o conteúdo contratual congelado.",
      "O hash SHA-256 do arquivo final está registrado na validação e pode ser conferido pela área autenticada.",
    ];
    let y = 780;
    pagina.drawText(linhas[0], { x: 48, y, size: 14, font: fonteNegrito, color: rgb(0.5, 0.05, 0.05) });
    y -= 30;
    linhas.slice(1).forEach((linha) => { pagina.drawText(linha.slice(0, 105), { x: 48, y, size: linha.startsWith("Hash") ? 9 : 10, font: linha.startsWith("CERTIFICADO") ? fonteNegrito : fonte, color: rgb(0.12, 0.16, 0.22) }); y -= 18; });
    return Buffer.from(await documento.save());
  }

  static async salvarContratoPDF(dadosContrato: DadosContrato): Promise<string> {
    const buffer = await this.gerarContratoPDF(dadosContrato);
    const uploadDir = process.env.STORAGE_PATH || "./uploads";
    await fs.mkdir(uploadDir, { recursive: true });
    const caminho = path.join(uploadDir, `contrato-${dadosContrato.reserva_id}-${Date.now()}.pdf`);
    await fs.writeFile(caminho, buffer);
    return caminho;
  }

  static async prepararContrato(reservaId: string, formulario?: ContratoFormulario): Promise<{ id: string; versao: number; snapshot: SnapshotVenda; snapshot_sha256: string; status: string }> {
    const snapshot = await this.gerarSnapshot({ reserva_id: reservaId, formulario });
    const hash = sha256(serializarSnapshot(snapshot));
    const agora = new Date();
    const resultado = await db.transaction(async (tx) => {
      await tx.update(contratosDocumentos).set({ status: "invalidado", invalidado_em: agora, motivo_invalidacao: "Nova versão preparada; aceite anterior pendente invalidado" }).where(and(eq(contratosDocumentos.reserva_id, reservaId), sql`status IN ('rascunho', 'aguardando_validacao', 'preparado')`));
      const ultima = (await tx.select({ versao: contratosDocumentos.versao }).from(contratosDocumentos).where(eq(contratosDocumentos.reserva_id, reservaId)).orderBy(desc(contratosDocumentos.versao)).limit(1))[0];
      const versao = Number(ultima?.versao || 0) + 1;
      const inserido = await tx.insert(contratosDocumentos).values({ reserva_id: reservaId, versao, versao_template: CONTRATO_TEMPLATE_VERSION, snapshot, snapshot_sha256: hash, conteudo_canonico: serializarSnapshot(snapshot), regras_versao: REGRAS_CONVIVENCIA_VERSION, regras_sha256: snapshot.regras.sha256, aviso_privacidade_versao: process.env.AVISO_PRIVACIDADE_VERSION || "2026.1", status: "aguardando_validacao", criado_em: agora }).returning({ id: contratosDocumentos.id, versao: contratosDocumentos.versao, status: contratosDocumentos.status });
      if (!inserido[0]) throw new Error("Não foi possível criar a versão contratual");
      const metadados = { snapshot_sha256: hash, versao: inserido[0].versao, template: CONTRATO_TEMPLATE_VERSION };
      await tx.insert(contratoEventos).values({ id: `evt-${randomUUID()}`, contrato_id: inserido[0].id, reserva_id: reservaId, tipo: "conteudo_preparado", criado_em: agora, metadados, hash_evento: hashEvento(metadados) });
      await tx.update(reservas).set({ checkout_estado: "contrato_preparado", cronograma_pagamento: snapshot.financeiro.cronograma, atualizado_em: agora }).where(eq(reservas.id, reservaId));
      return { id: inserido[0].id, versao: inserido[0].versao, snapshot, snapshot_sha256: hash, status: inserido[0].status };
    });
    return resultado;
  }

  static async registrarAceiteContrato(reservaId: string, _aceiteIp: string, formulario?: ContratoFormulario): Promise<void> {
    await this.prepararContrato(reservaId, formulario);
  }
}

export type { SnapshotVenda };
