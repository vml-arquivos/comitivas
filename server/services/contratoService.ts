import { createHash } from "node:crypto";
import fs from "fs/promises";
import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import path from "path";
import Decimal from "decimal.js";
import { and, desc, eq, sql } from "drizzle-orm";
import { CONTRATADA_DADOS } from "../../packages/contract-engine/letterhead.js";
import { generateBrandedPdfBuffer } from "../../packages/contract-engine/brandedPdfLayout.js";
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

export interface DadosContrato {
  reserva_id: string;
  usuario_id?: string;
  lote_id?: string;
  contrato_id?: string;
  snapshot?: SnapshotVenda;
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
  transporte: { rodoviario_incluido: boolean; local_embarque: string | null; data_saida: string | null; data_retorno: string | null; horario_saida: string | null; horario_retorno: string | null; veiculo: string | null };
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
  return data ? data.toISOString().slice(0, 10) : null;
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
    const rodoviario = transporteFoiContratado(adicionais);
    const localHospedagem = lote.local_hospedagem || "Chácara Recanto Novo Encantado ou Santa Thereza";
    const regrasHash = sha256(REGRAS_CONVIVENCIA_OFICIAIS);
    const dataLimite = lote.data_embarque || lote.data_inicio;
    const servicos = ["Hospedagem", "Café da manhã", "Almoço", "Open Bar das 09h às 19h", "Translado entre a chácara e o Parque do Peão"];
    if (rodoviario) servicos.unshift("Transporte rodoviário de ida e volta, conforme programação previamente divulgada pela CONTRATADA");
    const cronograma = cronogramaPagamento(total, dataValida(dataLimite), parcelas);
    return {
      cliente: { id: usuario.id, nome: usuario.nome, cpf: usuario.cpf, rg: usuario.rg, nacionalidade: usuario.nacionalidade || "Brasileira", estado_civil: usuario.estado_civil, profissao: usuario.profissao, nascimento: formatarDataISO(usuario.data_nascimento), endereco: usuario.endereco, telefone: usuario.telefone, email: usuario.email },
      evento: { id: evento.id, nome: evento.nome, local: evento.local, data_inicio: formatarDataISO(evento.data_inicio), data_fim: formatarDataISO(evento.data_fim) },
      lote: { id: lote.id, nome: lote.nome, descricao: lote.descricao },
      periodo: { check_in: formatarDataISO(lote.data_inicio) || "", check_out: formatarDataISO(lote.data_fim) || "" },
      pacote: { id: pacote?.id || null, nome: pacote?.nome || null, descricao: pacote?.descricao || null },
      hospedagem: { modalidade: pacote?.modalidade_hospedagem || null, modalidade_nome: MODALIDADES_HOSPEDAGEM[pacote?.modalidade_hospedagem || ""] || "Conforme contratação registrada", local: localHospedagem },
      servicos_inclusos: servicos,
      adicionais: adicionais.map((item) => ({ id: item.id, codigo: item.codigo, nome: item.nome, tipo: item.tipo, transporte_rodoviario: item.transporte_rodoviario, quantidade: item.quantidade, valor_unitario: item.valor.toFixed(2) })),
      quantidade: 1,
      precos_unitarios: itens.map((item) => ({ nome: item.nome, quantidade: item.quantidade, valor_unitario: item.valor.toFixed(2), total: item.valor.times(item.quantidade).toFixed(2) })),
      financeiro: { subtotal: subtotal.toFixed(2), cupom: descontoCupom.toFixed(2), desconto_pagamento: descontoPagamento.toFixed(2), desconto_administrativo: decimal(descontoAdministrativo?.valor_desconto).toFixed(2), total: total.toFixed(2), forma_pagamento: reserva.forma_pagamento, parcelas, valor_parcela: cronograma[0]?.valor || (reserva.valor_parcela ? decimal(reserva.valor_parcela).toFixed(2) : total.div(parcelas).toFixed(2)), vencimentos: cronograma.map((item) => item.vencimento), cronograma },
      transporte: { rodoviario_incluido: rodoviario, local_embarque: rodoviario ? lote.local_embarque : null, data_saida: rodoviario ? formatarDataISO(lote.data_embarque) : null, data_retorno: rodoviario ? formatarDataISO(lote.data_retorno) : null, horario_saida: rodoviario ? formatarDataHora(lote.data_embarque) : null, horario_retorno: rodoviario ? formatarDataHora(lote.data_retorno) : null, veiculo: null },
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
    const snapshot = dadosContrato.snapshot || (dadosContrato.contrato_id ? (await this.obterSnapshotPersistido(dadosContrato.contrato_id)).snapshot : await this.gerarSnapshot(dadosContrato));
    const c = snapshot.cliente as any;
    const e = snapshot.evento as any;
    const l = snapshot.lote as any;
    const h = snapshot.hospedagem;
    const f = snapshot.financeiro;
    const t = snapshot.transporte;
    const p = snapshot.politicas as any;
    const dataContrato = snapshot.data_contrato || formatarData(dadosContrato.aceite_timestamp || new Date());
    const linhasItens = snapshot.precos_unitarios.map((item: any) => `<tr><td>${escaparHtml(item.nome)}</td><td class="numero">${item.quantidade}</td><td class="numero">${formatarMoeda(item.valor_unitario)}</td><td class="numero">${formatarMoeda(item.total)}</td></tr>`).join("");
    const linhasRegras = snapshot.regras.conteudo.split("\n").map((linha) => linha.trim()).filter(Boolean).map((linha) => `<p>${escaparHtml(linha)}</p>`).join("");
    const modalidade = (nome: string, chave: string) => `<span class="modalidade"><span class="marcador">${checkbox(h.modalidade === chave)}</span> ${nome}</span>`;
    const inclusaoTransporte = t.rodoviario_incluido
      ? `<p>10.1. A contratação inclui transporte rodoviário interestadual de passageiros, com saída de Brasília/DF e destino à cidade de Barretos/SP, bem como o respectivo retorno, conforme programação previamente divulgada pela CONTRATADA.</p><p>10.2. O transporte será realizado por empresa regularmente habilitada junto aos órgãos competentes, especialmente à ANTT, observadas as normas de segurança e a legislação vigente.</p><p>10.3. Local de embarque: ${escaparHtml(t.local_embarque || "a confirmar pela organização")}. Data de saída: ${escaparHtml(formatarData(t.data_saida))}. Data de retorno: ${escaparHtml(formatarData(t.data_retorno))}.</p>`
      : `<p>10.1. Esta contratação não inclui transporte rodoviário interestadual. O translado contratado limita-se exclusivamente ao percurso entre a chácara e o Parque do Peão, em horários previamente divulgados pela organização.</p>`;
    const forma = f.forma_pagamento ? FORMAS_PAGAMENTO[f.forma_pagamento] || f.forma_pagamento : "Não registrada";
    const pagamento = f.forma_pagamento === "pix"
      ? `Pagamento à vista via PIX, com desconto de ${formatarMoeda(f.desconto_pagamento)}.`
      : f.forma_pagamento === "boleto"
        ? `Parcelamento por boleto bancário em ${f.parcelas} parcela(s), sem juros, com quitação integral antes da data de início da hospedagem.`
        : f.forma_pagamento === "credito"
          ? `Parcelamento por cartão de crédito em ${f.parcelas} parcela(s), com eventuais encargos da administradora suportados pelo CONTRATANTE.`
          : "Condição de pagamento ainda não registrada.";
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Contrato de Pacote de Viagem — ${escaparHtml(e.nome)}</title><style>
      *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#1f2937;margin:0;font-size:10pt}.container{max-width:800px;margin:0 auto}h1{text-align:center;color:#7f1d1d;font-size:15pt;margin:0 0 16px}h2{font-size:10.5pt;color:#991b1b;margin:18px 0 6px;text-transform:uppercase}p{margin:0 0 8px;text-align:justify}.dados,.itens{width:100%;border-collapse:collapse;margin:10px 0 15px}.dados th,.dados td,.itens th,.itens td{border:1px solid #d1d5db;padding:6px 8px;vertical-align:top}.dados th{width:30%;background:#fff7ed;color:#7c2d12;text-align:left}.itens th{background:#7f1d1d;color:#fff;text-align:left}.numero{text-align:right;white-space:nowrap}.modalidades{display:flex;gap:12px;flex-wrap:wrap;border:1px solid #fecaca;padding:10px;border-radius:6px;background:#fffafa}.modalidade{font-weight:600}.marcador{color:#991b1b;font-size:13pt}.resumo{background:#fff7ed;border-left:4px solid #b91c1c;padding:10px 12px}.total td{font-weight:bold;background:#fef2f2;color:#7f1d1d}.assinaturas{margin-top:40px;display:flex;justify-content:space-between;gap:30px;page-break-inside:avoid}.assinatura{width:46%;border-top:1px solid #475569;text-align:center;padding-top:8px}.regras{background:#fffaf5;border:1px solid #ead8c5;border-radius:8px;padding:14px}.rodape{margin-top:24px;padding-top:8px;border-top:1px solid #e2e8f0;text-align:center;font-size:7.5pt;color:#64748b}tr{page-break-inside:avoid}</style></head><body><div class="container">
      <h1>CONTRATO DE PACOTE DE VIAGEM — EXCURSÃO DAS COMITIVAS 2026</h1>
      <h2>Qualificação das partes</h2><p>As partes qualificadas neste instrumento celebram contrato para a prestação de serviços de HOSPEDAGEM/TRANSPORTE.</p>
      <table class="dados"><tbody><tr><th>CONTRATADA</th><td><strong>${escaparHtml(CONTRATADA_DADOS.razao_social)}</strong>, empresa inscrita no CNPJ ${escaparHtml(CONTRATADA_DADOS.cnpj)}, com sede na ${escaparHtml(CONTRATADA_DADOS.endereco_sede)}, e-mail ${escaparHtml(CONTRATADA_DADOS.email)}.</td></tr><tr><th>CONTRATANTE</th><td>${escaparHtml(c.nome)}</td></tr><tr><th>Documentos</th><td>CPF: ${escaparHtml(formatarCpf(c.cpf))} | RG: ${escaparHtml(c.rg || "Não informado")}</td></tr><tr><th>Dados pessoais</th><td>Nacionalidade: ${escaparHtml(c.nacionalidade)} | Estado civil: ${escaparHtml(c.estado_civil || "Não informado")} | Profissão: ${escaparHtml(c.profissao || "Não informado")} | Nascimento: ${escaparHtml(formatarData(c.nascimento))}</td></tr><tr><th>Endereço e contato</th><td>${escaparHtml(c.endereco || "Não informado")} | Telefone: ${escaparHtml(c.telefone || "Não informado")} | E-mail: ${escaparHtml(c.email)}</td></tr></tbody></table>
      <h2>Cláusula primeira — Do objeto do contrato</h2><p>1.1. O presente contrato tem por objeto a prestação de serviços de hospedagem/transporte durante a Festa do Peão de Barretos/SP, compreendendo hospedagem, café da manhã, almoço, open bar, translado interno entre a chácara e o Parque do Peão e demais serviços expressamente descritos neste instrumento.</p><p>1.2. O evento possui caráter regional e ocorre apenas uma vez ao ano, motivo pelo qual não será possível a remarcação do pacote para data fora da temporada oficial.</p><p>1.3. É de responsabilidade do CONTRATANTE a leitura integral deste contrato antes de seu aceite eletrônico.</p>
      <h2>Cláusula segunda — Dos dados da hospedagem</h2><p>Check-in: <strong>${escaparHtml(formatarData(snapshot.periodo.check_in))}</strong>. Check-out: <strong>${escaparHtml(formatarData(snapshot.periodo.check_out))}</strong>. Os horários poderão sofrer pequenos ajustes por necessidade operacional.</p>
      <h2>Cláusula terceira — Da hospedagem</h2><p>3.1. A hospedagem será realizada na ${escaparHtml(h.local)}.</p><div class="modalidades">${modalidade("CAMPING", "camping")}${modalidade("QUARTO COM VENTILADOR COMPARTILHADO", "quarto_ventilador")}${modalidade("QUARTO COM CLIMATIZADOR COMPARTILHADO", "quarto_ar_condicionado")}</div><p>3.2. Havendo necessidade, a CONTRATADA poderá substituir a hospedagem por estabelecimento de padrão equivalente ou superior, preservando localização, segurança e estrutura semelhantes.</p><p>3.3. Os quartos são compartilhados, separados por masculino e feminino, com ocupação variável entre 5 e 10 pessoas.</p><p>3.4. Todos os quartos possuem banheiro privativo. A área de camping possui banheiros coletivos.</p><p>3.5. A hospedagem dispõe de piscina, ventilador ou climatizador.</p><p>3.6. A roupa de cama é de responsabilidade exclusiva do hóspede, bem como itens de higiene pessoal.</p>
      <h2>Cláusula quarta — Dos serviços inclusos</h2><p>4.1. Estão inclusos nesta contratação: ${escaparHtml(snapshot.servicos_inclusos.join("; "))}.</p><table class="itens"><thead><tr><th>Item</th><th>Qtd.</th><th>Valor unitário</th><th>Total</th></tr></thead><tbody>${linhasItens}<tr><td colspan="3" class="numero">Subtotal dos serviços</td><td class="numero">${formatarMoeda(f.subtotal)}</td></tr>${Number(f.cupom) > 0 ? `<tr><td colspan="3" class="numero">Desconto de cupom</td><td class="numero">-${formatarMoeda(f.cupom)}</td></tr>` : ""}${Number(f.desconto_pagamento) > 0 ? `<tr><td colspan="3" class="numero">Desconto da forma de pagamento</td><td class="numero">-${formatarMoeda(f.desconto_pagamento)}</td></tr>` : ""}${Number(f.desconto_administrativo) > 0 ? `<tr><td colspan="3" class="numero">Desconto administrativo autorizado</td><td class="numero">-${formatarMoeda(f.desconto_administrativo)}</td></tr>` : ""}<tr class="total"><td colspan="3" class="numero">VALOR TOTAL CONTRATADO</td><td class="numero">${formatarMoeda(f.total)}</td></tr></tbody></table>
      <h2>Cláusula quinta — Das formas de pagamento</h2><div class="resumo"><strong>Condição escolhida:</strong> ${escaparHtml(forma)}<br>${escaparHtml(pagamento)}<br><strong>Valor por extenso:</strong> ${escaparHtml(valorPorExtenso(decimal(f.total)))}</div><p>5.1. O valor total do pacote turístico é de ${formatarMoeda(f.total)} (${escaparHtml(valorPorExtenso(decimal(f.total)))}).</p><p>5.2. A confirmação da reserva somente ocorrerá após a comprovação do pagamento da primeira parcela ou do valor integral contratado, conforme a modalidade escolhida.</p><p>5.3. O inadimplemento das parcelas não garante ao CONTRATANTE o direito de usufruir dos serviços contratados, ficando a participação condicionada à quitação integral antes da data do evento.</p>
      <h2>Cláusula sexta — Do atraso no pagamento</h2><p>6.1. O atraso de qualquer parcela implicará multa moratória de 2% sobre o valor da parcela vencida, juros de mora de 1% ao mês, calculados proporcionalmente aos dias de atraso, e atualização monetária pelo IPCA ou outro índice oficial que o substitua.</p><p>6.2. Permanecendo o débito em aberto, a CONTRATADA poderá promover a cobrança pelos meios legalmente admitidos.</p><p>6.3. O atraso ou inadimplemento de 2 ou mais parcelas poderá acarretar a suspensão da reserva e impedir a participação na excursão caso o pagamento integral não seja efetuado até a data de início do evento.</p>
      <h2>Cláusula sétima — Do cancelamento e da política de reembolso</h2><p>7.1. O CONTRATANTE poderá solicitar cancelamento a qualquer tempo, mediante comunicação formal à CONTRATADA.</p><p>7.2. O cancelamento sujeitará o CONTRATANTE às retenções destinadas exclusivamente à compensação das despesas administrativas, operacionais e financeiras assumidas pela CONTRATADA.</p><p>7.3. Serão observados os seguintes percentuais sobre o valor total: ${escaparHtml(p.cancelamento.join("; "))}.</p><p>7.4. Os valores eventualmente devidos serão restituídos no prazo de até 30 dias contados da formalização do pedido.</p><p>7.5. As retenções possuem natureza exclusivamente compensatória, não constituindo penalidade ou enriquecimento sem causa.</p><p>7.6. Esta cláusula observa a boa-fé objetiva, razoabilidade, proporcionalidade e a legislação aplicável, especialmente o Código de Defesa do Consumidor, o Código Civil e a Lei Geral do Turismo.</p><p>7.7. No cancelamento do evento por autoridade pública, caso fortuito ou força maior, as partes buscarão de comum acordo a melhor solução, observada a legislação vigente.</p>
      <h2>Cláusula oitava — Das exclusões</h2><p>8.1. Não estão incluídos ingressos para a Festa do Peão, shows, rodeios, camarotes, festas particulares, despesas pessoais, passeios opcionais, atendimento médico, perdas de objetos pessoais e quaisquer serviços não expressamente descritos como inclusos.</p><p>8.2. ${t.rodoviario_incluido ? "O transporte rodoviário interestadual está incluído conforme a composição acima." : "O presente contrato não abrange transporte rodoviário interestadual, compreendendo exclusivamente os serviços expressamente descritos e o translado interno entre a chácara e o Parque do Peão."}</p><p>8.3. Serviços contratados diretamente pelo CONTRATANTE junto a terceiros são de sua exclusiva responsabilidade.</p>
      <h2>Cláusula nona — Dos danos</h2><p>9.1. O CONTRATANTE compromete-se a zelar pelas instalações da hospedagem, áreas comuns, equipamentos, mobiliários, veículos utilizados no translado interno e demais bens disponibilizados.</p><p>9.2. Danos materiais causados pelo CONTRATANTE serão de sua exclusiva responsabilidade, com ressarcimento dos prejuízos efetivamente apurados.</p><p>9.3. A apuração será realizada mediante vistoria, registro fotográfico, orçamento ou documento equivalente, assegurada a ciência do CONTRATANTE.</p><p>9.4. O ressarcimento deverá ser efetuado em até 10 dias úteis da apresentação da comprovação do prejuízo.</p>
      <h2>Cláusula décima — Do transporte rodoviário</h2>${inclusaoTransporte}
      <h2>Cláusula décima primeira — Do embarque</h2><p>11.1. Quando houver transporte rodoviário contratado, o CONTRATANTE deverá comparecer ao local de embarque com antecedência mínima de 30 minutos, portando documento oficial com foto.</p><p>11.2. O atraso que impossibilite o embarque será de responsabilidade exclusiva do CONTRATANTE, sem direito a reembolso, remarcação ou indenização.</p><p>11.3. A CONTRATADA poderá alterar horário ou local por necessidade operacional, comunicando pelos meios cadastrados com pelo menos 24 horas de antecedência.</p>
      <h2>Cláusula décima segunda — Da bagagem</h2><p>12.1. Quando houver transporte rodoviário, cada passageiro poderá transportar 01 bagagem principal de até ______ kg e 01 bagagem de mão.</p><p>12.2. Objetos de valor, dinheiro, documentos, eletrônicos, joias, medicamentos e bens pessoais permanecem sob guarda exclusiva do CONTRATANTE.</p><p>12.3. Não será permitido o transporte de armas de fogo sem autorização legal, explosivos, inflamáveis, substâncias ilícitas ou animais, salvo hipóteses legais.</p>
      <h2>Cláusula décima terceira — Da poltrona</h2><p>13.1. Quando houver transporte rodoviário, a poltrona será indicada pela organização no momento do embarque. Havendo necessidade operacional, poderá ser alterada, preservando-se, sempre que possível, categoria equivalente.</p>
      <h2>Cláusula décima quarta — Do seguro de viagem</h2><p>14.1. Caso o transporte seja acompanhado de seguro de viagem, seus dados serão informados no momento da contratação. Na inexistência de seguro adicional, aplicam-se apenas as coberturas obrigatórias previstas na legislação.</p>
      <h2>Cláusula décima quinta — Dos atrasos, imprevistos e substituição do veículo</h2><p>15.1. A CONTRATADA envidará esforços para cumprir os horários, não se responsabilizando por congestionamentos, acidentes, condições climáticas, interdições, fiscalizações, manutenção, caso fortuito ou força maior. Sempre que necessário, poderá substituir o veículo por outro de categoria equivalente ou superior.</p>
      <h2>Cláusula décima sexta — Das regras de convivência e desligamento</h2><p>Constituem motivos para desligamento: agressão física ou verbal, ameaças, dano ao patrimônio, uso de drogas ilícitas, violência, desrespeito reiterado às normas de convivência ou aos colaboradores da organização.</p>
      <h2>Cláusula décima sétima — Do responsável operacional</h2><p>O guia da excursão é o responsável operacional pela organização dos serviços durante o evento.</p>
      <h2>Cláusula décima oitava — Do translado</h2><p>O translado compreende exclusivamente o percurso entre a chácara e o Parque do Peão, em horários previamente divulgados.</p>
      <h2>Cláusula décima nona — Das comunicações</h2><p>As comunicações poderão ocorrer por WhatsApp, e-mail ou telefone informado pelo CONTRATANTE. Consideram-se válidas as comunicações enviadas aos contatos cadastrados.</p>
      <h2>Regras de convivência aceitas</h2><div class="regras">${linhasRegras}</div>
      <p>Brasília, ${escaparHtml(dataContrato)}.</p><div class="assinaturas"><div class="assinatura"><strong>CONTRATANTE</strong><br>${escaparHtml(c.nome)}<br>CPF: ${escaparHtml(formatarCpf(c.cpf))}</div><div class="assinatura"><strong>CONTRATADA</strong><br>${escaparHtml(CONTRATADA_DADOS.razao_social)}<br>CNPJ: ${escaparHtml(CONTRATADA_DADOS.cnpj)}</div></div>
      <div class="rodape">Documento contratual ${escaparHtml(snapshot.versao_contratual)} · Regras ${escaparHtml(snapshot.regras.versao)} · Hash do snapshot: ${escaparHtml(sha256(serializarSnapshot(snapshot)))} · Reserva: ${escaparHtml(dadosContrato.reserva_id)}</div>
    </div></body></html>`;
  }

  static async gerarContratoPDF(dadosContrato: DadosContrato): Promise<Buffer> {
    const base = await generateBrandedPdfBuffer(await this.gerarContratoHTML(dadosContrato), { brand: "comitiva" });
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

  static async prepararContrato(reservaId: string): Promise<{ id: string; versao: number; snapshot: SnapshotVenda; snapshot_sha256: string; status: string }> {
    const snapshot = await this.gerarSnapshot({ reserva_id: reservaId });
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

  static async registrarAceiteContrato(reservaId: string, _aceiteIp: string): Promise<void> {
    await this.prepararContrato(reservaId);
  }
}

export type { SnapshotVenda };
