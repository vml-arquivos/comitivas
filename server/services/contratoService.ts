import { generateBrandedPdfBuffer } from "../../packages/contract-engine/brandedPdfLayout.js";
import { CONTRATADA_DADOS } from "../../packages/contract-engine/letterhead.js";
import { db } from "../db/index.js";
import { reservas, usuarios, lotes, eventos, pacotes } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import Decimal from "decimal.js";
import fs from "fs/promises";
import path from "path";

export type FormaPagamentoContrato = "pix" | "boleto" | "credito";

export interface DadosContrato {
  reserva_id: string;
  usuario_id: string;
  lote_id: string;
  aceite_ip: string;
  aceite_timestamp?: Date;
}

export interface CondicaoPagamentoCalculada {
  forma_pagamento: FormaPagamentoContrato;
  quantidade_parcelas: number;
  valor_total: string;
  valor_parcela: string;
  desconto_pagamento: string;
}

type ItemContrato = {
  nome: string;
  quantidade: number;
  valor: Decimal;
};

const MODALIDADES_HOSPEDAGEM: Record<string, string> = {
  camping: "Camping",
  quarto_ventilador: "Quarto com ventilador",
  quarto_ar_condicionado: "Quarto com ar-condicionado",
};

const FORMAS_PAGAMENTO: Record<FormaPagamentoContrato, string> = {
  pix: "PIX à vista",
  boleto: "Boleto bancário parcelado",
  credito: "Cartão de crédito",
};

function escaparHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatarMoeda(valor: Decimal.Value | null | undefined): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(new Decimal(valor ?? 0).toNumber());
  } catch {
    return "R$ 0,00";
  }
}

function formatarData(valor: Date | string | null | undefined): string {
  if (!valor) return "Não informado";

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "Não informado";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}

function formatarDataHora(valor: Date | string | null | undefined): string {
  if (!valor) return "a confirmar pela organização";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "a confirmar pela organização";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}

function formatarCpf(valor: string | null | undefined): string {
  const cpf = String(valor || "").replace(/\D/g, "");
  if (cpf.length !== 11) return valor || "Não informado";
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function formatarHorario(valor: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(valor);
}

function converterDecimal(valor: unknown): Decimal {
  try {
    return new Decimal(String(valor ?? 0));
  } catch {
    return new Decimal(0);
  }
}

function normalizarItens(valor: unknown): ItemContrato[] {
  let itensBrutos: unknown = valor;

  if (typeof itensBrutos === "string") {
    try {
      itensBrutos = JSON.parse(itensBrutos);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(itensBrutos)) return [];

  return itensBrutos
    .map((item: any) => {
      const quantidadeOriginal = Number(item?.quantidade ?? 1);
      const quantidade = Number.isInteger(quantidadeOriginal) && quantidadeOriginal > 0
        ? quantidadeOriginal
        : 1;

      return {
        nome: String(item?.nome ?? "Item adicional"),
        quantidade,
        valor: converterDecimal(item?.valor),
      };
    })
    .filter((item) => item.valor.greaterThanOrEqualTo(0));
}

function modalidadeMarcada(modalidadeSelecionada: string | null | undefined, modalidade: string): string {
  return modalidadeSelecionada === modalidade ? "☒" : "☐";
}

function descreverParcelamento(
  valorTotal: Decimal,
  quantidadeParcelas: number,
  valorParcela: Decimal,
): string {
  if (quantidadeParcelas <= 1) {
    return `1 parcela de ${formatarMoeda(valorTotal)}`;
  }

  const valorUltimaParcela = valorTotal
    .minus(valorParcela.times(quantidadeParcelas - 1))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  if (valorUltimaParcela.equals(valorParcela)) {
    return `${quantidadeParcelas} parcelas de ${formatarMoeda(valorParcela)}`;
  }

  return `${quantidadeParcelas - 1} parcelas de ${formatarMoeda(valorParcela)} e 1 parcela final de ${formatarMoeda(valorUltimaParcela)}`;
}

function descreverPagamento(
  forma: string | null | undefined,
  parcelas: number | null | undefined,
  valorParcela: Decimal,
  descontoPagamento: Decimal,
  valorTotal: Decimal,
): string {
  if (forma === "pix") {
    return `PIX à vista, com desconto de 5% no valor de ${formatarMoeda(descontoPagamento)}.`;
  }

  if (forma === "boleto") {
    const quantidade = parcelas || 1;
    return `Boleto bancário em ${descreverParcelamento(valorTotal, quantidade, valorParcela)}, sem juros, condicionado à quitação integral antes da viagem.`;
  }

  if (forma === "credito") {
    const quantidade = parcelas || 1;
    return `Cartão de crédito em ${descreverParcelamento(valorTotal, quantidade, valorParcela)}. Eventuais taxas da operadora serão informadas pelo meio de pagamento antes da conclusão.`;
  }

  return "Condição de pagamento ainda não registrada para esta reserva histórica.";
}

export class ContratoService {
  /**
   * Normaliza e calcula a condição que será gravada na reserva antes do aceite.
   * O contrato só pode ser emitido com uma condição explícita; isso evita que o
   * PDF registre uma modalidade de pagamento diferente da escolhida no checkout.
   */
  static calcularCondicaoPagamento(
    valorAtual: Decimal.Value,
    formaBruta: unknown,
    parcelasBrutas: unknown,
  ): CondicaoPagamentoCalculada {
    const forma = String(formaBruta ?? "").trim().toLowerCase() as FormaPagamentoContrato;
    if (!(forma in FORMAS_PAGAMENTO)) {
      throw new Error("Forma de pagamento inválida");
    }

    const quantidadeParcelas = Number(parcelasBrutas ?? 1);
    if (!Number.isInteger(quantidadeParcelas) || quantidadeParcelas < 1) {
      throw new Error("A quantidade de parcelas deve ser um número inteiro positivo");
    }

    if (forma === "pix" && quantidadeParcelas !== 1) {
      throw new Error("O pagamento via PIX deve ser feito à vista");
    }

    if (forma === "boleto" && quantidadeParcelas > 2) {
      throw new Error("O boleto pode ser parcelado em até 2 vezes");
    }

    if (forma === "credito" && quantidadeParcelas > 12) {
      throw new Error("O cartão de crédito pode ser parcelado em até 12 vezes");
    }

    const valorAntesDoPagamento = new Decimal(valorAtual);
    if (valorAntesDoPagamento.lessThanOrEqualTo(0)) {
      throw new Error("O valor da reserva deve ser maior que zero");
    }

    const descontoPagamento = forma === "pix"
      ? valorAntesDoPagamento.times(0.05).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      : new Decimal(0);
    const valorTotal = valorAntesDoPagamento.minus(descontoPagamento).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const valorParcela = valorTotal.div(quantidadeParcelas).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    return {
      forma_pagamento: forma,
      quantidade_parcelas: quantidadeParcelas,
      valor_total: valorTotal.toFixed(2),
      valor_parcela: valorParcela.toFixed(2),
      desconto_pagamento: descontoPagamento.toFixed(2),
    };
  }

  static async gerarContratoHTML(dadosContrato: DadosContrato): Promise<string> {
    try {
      const reservaResult = await db
        .select()
        .from(reservas)
        .where(eq(reservas.id, dadosContrato.reserva_id))
        .limit(1);

      if (reservaResult.length === 0) {
        throw new Error("Reserva não encontrada");
      }

      const reserva = reservaResult[0];

      // A reserva é a fonte de verdade para o titular e o lote. Os campos
      // recebidos são mantidos apenas por compatibilidade com as rotas antigas.
      const usuarioResult = await db
        .select()
        .from(usuarios)
        .where(eq(usuarios.id, reserva.usuario_id))
        .limit(1);

      if (usuarioResult.length === 0) {
        throw new Error("Usuário da reserva não encontrado");
      }

      const usuario = usuarioResult[0];

      const loteResult = await db
        .select()
        .from(lotes)
        .where(eq(lotes.id, reserva.lote_id))
        .limit(1);

      if (loteResult.length === 0) {
        throw new Error("Lote da reserva não encontrado");
      }

      const lote = loteResult[0];

      const eventoResult = await db
        .select()
        .from(eventos)
        .where(eq(eventos.id, lote.evento_id))
        .limit(1);

      if (eventoResult.length === 0) {
        throw new Error("Evento não encontrado");
      }

      const evento = eventoResult[0];

      // Busca exclusivamente o pacote registrado na reserva. Não há fallback
      // para o primeiro pacote do lote, pois isso poderia marcar hospedagem errada.
      const pacoteResult = reserva.pacote_id
        ? await db
          .select()
          .from(pacotes)
          .where(and(eq(pacotes.id, reserva.pacote_id), eq(pacotes.lote_id, lote.id)))
          .limit(1)
        : [];
      const pacote = pacoteResult[0];
      const modalidade = pacote?.modalidade_hospedagem || null;

      const itensAdicionais = normalizarItens(reserva.itens_selecionados);
      const valorPacoteBase = converterDecimal(pacote?.valor_total ?? lote.valor_base);
      const itensContrato: ItemContrato[] = [
        {
          nome: pacote
            ? `${pacote.nome} — ${MODALIDADES_HOSPEDAGEM[modalidade || ""] || "Hospedagem não informada"}`
            : `Pacote base — ${lote.nome}`,
          quantidade: 1,
          valor: valorPacoteBase,
        },
        ...itensAdicionais,
      ];

      const totalItens = itensContrato.reduce(
        (total, item) => total.plus(item.valor.times(item.quantidade)),
        new Decimal(0),
      );
      const descontoCupom = converterDecimal(reserva.desconto_aplicado);
      const descontoPagamento = converterDecimal(reserva.desconto_pagamento);
      const valorTotalReserva = converterDecimal(reserva.valor_total);
      const quantidadeParcelas = reserva.quantidade_parcelas || 1;
      const valorParcela = reserva.valor_parcela
        ? converterDecimal(reserva.valor_parcela)
        : valorTotalReserva.div(quantidadeParcelas).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      const dataAceite = dadosContrato.aceite_timestamp || reserva.aceite_timestamp || new Date();
      const dataAceiteFormatada = formatarData(dataAceite);
      const dataIdaFormatada = formatarData(lote.data_inicio);
      const dataVoltaFormatada = formatarData(lote.data_fim);
      const dataEmbarqueFormatada = formatarDataHora(lote.data_embarque || lote.data_inicio);
      const dataRetornoFormatada = formatarDataHora(lote.data_retorno || lote.data_fim);
      const localEmbarque = lote.local_embarque || "Brasília/DF, com embarque adicional em Goiânia/GO";
      const localHospedagem = lote.local_hospedagem || "chácara ou camping previamente contratado em Barretos/SP";
      const descricaoHospedagem = modalidade === "camping"
        ? "A modalidade Camping oferece área gramada, banheiros externos, pontos de energia e segurança. O CONTRATANTE deverá levar seu próprio material de camping."
        : modalidade === "quarto_ventilador"
          ? "A modalidade Quarto com Ventilador utiliza quartos-suítes compartilhados para 5 a 6 pessoas, organizados em quartos femininos ou masculinos, sem quartos mistos."
          : modalidade === "quarto_ar_condicionado"
            ? "A modalidade Quarto com Ar-condicionado utiliza quartos-suítes compartilhados para 5 a 6 pessoas, organizados em quartos femininos ou masculinos, sem quartos mistos."
            : "A estrutura da hospedagem seguirá a modalidade registrada na reserva.";

      const linhasItens = itensContrato.map((item) => {
        const totalItem = item.valor.times(item.quantidade);
        return `<tr>
          <td>${escaparHtml(item.nome)}</td>
          <td class="numero">${item.quantidade}</td>
          <td class="numero">${formatarMoeda(item.valor)}</td>
          <td class="numero">${formatarMoeda(totalItem)}</td>
        </tr>`;
      }).join("");

      const linhasDescontos = [
        descontoCupom.greaterThan(0)
          ? `<tr><td colspan="3" class="rotulo-resumo">Desconto de cupom</td><td class="numero">-${formatarMoeda(descontoCupom)}</td></tr>`
          : "",
        descontoPagamento.greaterThan(0)
          ? `<tr><td colspan="3" class="rotulo-resumo">Desconto para pagamento via PIX</td><td class="numero">-${formatarMoeda(descontoPagamento)}</td></tr>`
          : "",
      ].join("");

      const localAssinatura = "Brasília/DF";
      const descricaoCondicaoPagamento = descreverPagamento(
        reserva.forma_pagamento,
        reserva.quantidade_parcelas,
        valorParcela,
        descontoPagamento,
        valorTotalReserva,
      );

      const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contrato de Pacote de Viagem — ${escaparHtml(evento.nome)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; line-height: 1.55; color: #1f2937; margin: 0; font-size: 10.2pt; }
    .container { max-width: 800px; margin: 0 auto; padding: 0; }
    h1 { text-align: center; font-size: 14pt; color: #7f1d1d; letter-spacing: .2px; margin: 0 0 18px; }
    h2 { font-size: 10.5pt; color: #991b1b; margin: 18px 0 6px; font-weight: 700; text-transform: uppercase; }
    p { margin: 0 0 9px; text-align: justify; }
    .dados-partes { width: 100%; border-collapse: collapse; margin: 12px 0 16px; }
    .dados-partes th, .dados-partes td { border: 1px solid #d1d5db; padding: 6px 8px; font-size: 9.3pt; vertical-align: top; }
    .dados-partes th { width: 31%; background: #fff7ed; color: #7c2d12; text-align: left; }
    .tabela-itens { width: 100%; border-collapse: collapse; margin: 10px 0 16px; }
    .tabela-itens th, .tabela-itens td { border: 1px solid #cbd5e1; padding: 6px; font-size: 9pt; vertical-align: top; }
    .tabela-itens th { background: #7f1d1d; color: #fff; text-align: left; }
    .numero { text-align: right; white-space: nowrap; }
    .rotulo-resumo { text-align: right; font-weight: 600; background: #fffaf5; }
    .total-geral td { font-size: 10pt; font-weight: 700; background: #fef2f2; color: #7f1d1d; }
    .modalidades { margin: 8px 0 12px; padding: 10px 12px; border: 1px solid #fecaca; border-radius: 6px; background: #fffafa; display: flex; flex-wrap: wrap; gap: 8px 18px; }
    .modalidade { display: inline-flex; gap: 5px; align-items: center; font-weight: 600; }
    .marcador { font-size: 12pt; line-height: 1; color: #991b1b; }
    .condicao-pagamento { padding: 10px 12px; border-left: 4px solid #b91c1c; background: #fff7ed; margin: 10px 0 14px; }
    .assinaturas { margin-top: 48px; display: flex; gap: 36px; justify-content: space-between; page-break-inside: avoid; }
    .assinatura { width: 46%; border-top: 1px solid #475569; padding-top: 8px; text-align: center; font-size: 9pt; }
    .rodape-documento { text-align: center; font-size: 7.7pt; color: #64748b; margin-top: 28px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
    .nao-quebrar { page-break-inside: avoid; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  </style>
</head>
<body>
  <div class="container">
    <h1>CONTRATO DE PACOTE DE VIAGEM — EXCURSÃO DAS COMITIVAS</h1>

    <p>Por este instrumento particular, as partes abaixo qualificadas celebram o presente contrato de prestação de serviços de pacote turístico terrestre nacional, nos termos e condições seguintes.</p>

    <h2>Qualificação das partes</h2>
    <table class="dados-partes">
      <tbody>
        <tr><th>CONTRATADA</th><td><strong>${escaparHtml(CONTRATADA_DADOS.razao_social)}</strong>, inscrito no CNPJ sob nº ${escaparHtml(CONTRATADA_DADOS.cnpj)}, com sede em ${escaparHtml(CONTRATADA_DADOS.endereco_sede)}, e-mail ${escaparHtml(CONTRATADA_DADOS.email)}.</td></tr>
        <tr><th>CONTRATANTE</th><td><strong>${escaparHtml(usuario.nome)}</strong></td></tr>
        <tr><th>CPF / RG</th><td>CPF: ${escaparHtml(formatarCpf(usuario.cpf))} &nbsp; | &nbsp; RG: ${escaparHtml(usuario.rg || "Não informado")}</td></tr>
        <tr><th>Nascimento / Nacionalidade</th><td>${escaparHtml(formatarData(usuario.data_nascimento))} &nbsp; | &nbsp; ${escaparHtml(usuario.nacionalidade || "Brasileira")}</td></tr>
        <tr><th>Estado civil / Profissão</th><td>${escaparHtml(usuario.estado_civil || "Não informado")} &nbsp; | &nbsp; ${escaparHtml(usuario.profissao || "Não informado")}</td></tr>
        <tr><th>Endereço</th><td>${escaparHtml(usuario.endereco || "Não informado")}</td></tr>
        <tr><th>Contato</th><td>Telefone: ${escaparHtml(usuario.telefone || "Não informado")} &nbsp; | &nbsp; E-mail: ${escaparHtml(usuario.email)}</td></tr>
      </tbody>
    </table>

    <h2>Cláusula primeira — Do objeto do contrato</h2>
    <p>1.1. A CONTRATADA prestará ao CONTRATANTE os serviços referentes à excursão <strong>${escaparHtml(evento.nome)}</strong>, com destino a ${escaparHtml(evento.local)}, no período de ${dataIdaFormatada} a ${dataVoltaFormatada}, conforme a composição e os valores registrados neste instrumento.</p>
    <p>1.2. É de responsabilidade do CONTRATANTE a leitura integral deste contrato antes de seu aceite eletrônico.</p>

    <h2>Cláusula segunda — Dados da viagem</h2>
    <p>2.1. Período contratado: <strong>${escaparHtml(lote.nome)}</strong>, de ${dataIdaFormatada} a ${dataVoltaFormatada}.</p>
    <p>2.2. Embarque de ida previsto para ${dataEmbarqueFormatada}, com saída de ${escaparHtml(localEmbarque)} e destino a Barretos/SP.</p>
    <p>2.3. Saída de retorno de Barretos/SP prevista para ${dataRetornoFormatada}, com desembarque no trajeto inverso.</p>
    <p>2.4. Poderão ocorrer ajustes de horário por necessidade operacional. A distribuição dos assentos será realizada pela equipe responsável no momento do embarque.</p>

    <h2>Cláusula terceira — Da hospedagem</h2>
    <p>3.1. A hospedagem será prestada em ${escaparHtml(localHospedagem)}, na modalidade registrada nesta reserva.</p>
    <p>3.2. Caso haja necessidade operacional, a CONTRATADA poderá substituir o local por outro de padrão equivalente ou superior.</p>
    <div class="modalidades">
      <span class="modalidade"><span class="marcador">${modalidadeMarcada(modalidade, "camping")}</span> CAMPING</span>
      <span class="modalidade"><span class="marcador">${modalidadeMarcada(modalidade, "quarto_ventilador")}</span> QUARTO COM VENTILADOR</span>
      <span class="modalidade"><span class="marcador">${modalidadeMarcada(modalidade, "quarto_ar_condicionado")}</span> QUARTO COM AR-CONDICIONADO</span>
    </div>
    <p>3.3. ${escaparHtml(descricaoHospedagem)}</p>

    <h2>Cláusula quarta — Serviços inclusos no pacote</h2>
    <p>4.1. Estão inclusos: transporte rodoviário de ida e volta Brasília/DF ⇄ Barretos/SP, com embarque adicional em Goiânia/GO; hospedagem na modalidade contratada; café da manhã; almoço; 10 horas de open bar na chácara com água, refrigerante, energético, vodka, gin, cerveja e Paratudo; barman preparando drinks; DJ durante o dia; som automotivo; piscina liberada; e translado chácara ⇄ Parque do Peão nos horários definidos pela organização.</p>
    <p>4.2. A composição financeira abaixo identifica o pacote contratado e eventuais itens adicionais escolhidos pelo CONTRATANTE.</p>
    <table class="tabela-itens">
      <thead><tr><th>Item</th><th class="numero">Qtd.</th><th class="numero">Valor unitário</th><th class="numero">Total</th></tr></thead>
      <tbody>
        ${linhasItens}
        <tr><td colspan="3" class="rotulo-resumo">Subtotal dos serviços</td><td class="numero">${formatarMoeda(totalItens)}</td></tr>
        ${linhasDescontos}
        <tr class="total-geral"><td colspan="3" class="rotulo-resumo">VALOR TOTAL CONTRATADO</td><td class="numero">${formatarMoeda(valorTotalReserva)}</td></tr>
      </tbody>
    </table>

    <h2>Cláusula quinta — Forma de pagamento</h2>
    <div class="condicao-pagamento"><strong>Condição escolhida:</strong> ${escaparHtml(FORMAS_PAGAMENTO[reserva.forma_pagamento as FormaPagamentoContrato] || "Não registrada")}<br/>${escaparHtml(descricaoCondicaoPagamento)}</div>
    <p>5.1. O pagamento via PIX é realizado à vista, com desconto de 5% já discriminado no resumo financeiro quando aplicável.</p>
    <p>5.2. O pagamento por boleto poderá ser parcelado em até 2 (duas) vezes, sem juros. Para a excursão Barretos 2026, a primeira parcela está prevista para julho, conforme disponibilidade e cronograma apresentado no checkout, sempre com quitação integral até a viagem.</p>
    <p>5.3. O pagamento por cartão de crédito poderá ser parcelado em até 12 (doze) vezes, de acordo com a condição selecionada e as taxas vigentes da operadora, informadas antes da conclusão.</p>

    <h2>Cláusula sexta — Do atraso no pagamento</h2>
    <p>6.1. Em caso de atraso, incidirá multa de 2% sobre o valor da parcela, juros de 1% ao mês e correção monetária pelo IPCA, sem prejuízo das demais medidas cabíveis.</p>

    <h2>Cláusula sétima — Do valor e vencimento das parcelas</h2>
    <p>7.1. O valor total contratado é de <strong>${formatarMoeda(valorTotalReserva)}</strong>. ${escaparHtml(descricaoCondicaoPagamento)}</p>

    <h2>Cláusula oitava — Do embarque e desembarque</h2>
    <p>8.1. O embarque e o desembarque seguirão a rota informada na Cláusula Segunda, incluindo o ponto adicional de Goiânia/GO quando confirmado para o passageiro.</p>
    <p>8.2. O passageiro deverá constar na relação de autorização da ANTT e apresentar documento de identificação original ou cópia autenticada.</p>
    <p>8.3. O embarque está condicionado à quitação do contrato, salvo condição formalmente aprovada pela CONTRATADA.</p>

    <h2>Cláusula nona — Da desistência e responsabilidade</h2>
    <p>9.1. O CONTRATANTE poderá desistir deste contrato em até 7 (sete) dias corridos da assinatura, com devolução integral, nos termos do art. 49 do Código de Defesa do Consumidor, quando a contratação ocorrer fora do estabelecimento comercial.</p>
    <p>9.2. Após esse prazo, o cancelamento por iniciativa do CONTRATANTE poderá gerar multa de 30% sobre o valor total do pacote, a título de despesas administrativas e operacionais.</p>

    <h2>Cláusula décima — Dos danos</h2>
    <p>10.1. Danos causados pelo CONTRATANTE nas instalações do veículo, da hospedagem ou de fornecedores serão cobrados conforme a avaliação e as regras do fornecedor responsável.</p>

    <h2>Cláusula décima primeira — Das exclusões</h2>
    <p>11.1. Não estão incluídos passeios opcionais e despesas pessoais, lavanderia, telefonemas, refeições não especificadas, ingressos para eventos ou shows e quaisquer serviços não discriminados neste contrato.</p>

    <h2>Cláusula décima segunda — Da inscrição</h2>
    <p>12.1. A inscrição é confirmada mediante o pagamento do sinal ou da condição contratada. Não são aceitos cheques.</p>

    <h2>Cláusula décima terceira — Da interrupção da viagem</h2>
    <p>13.1. Em caso de desistência durante a viagem por iniciativa do CONTRATANTE, não haverá devolução dos valores já pagos.</p>

    <h2>Cláusula décima quarta — Das despesas não previstas</h2>
    <p>14.1. Despesas pessoais e serviços não incluídos expressamente no pacote são de responsabilidade exclusiva do CONTRATANTE.</p>

    <h2>Cláusula décima quinta — Do número mínimo de passageiros</h2>
    <p>15.1. A saída do ônibus está condicionada ao mínimo de 35 passageiros, podendo ocorrer em vans, com mínimo de 12 passageiros, ou micro-ônibus, com mínimo de 22 passageiros, quando a quantidade de participantes for inferior.</p>

    <h2>Cláusula décima sexta — Do desligamento</h2>
    <p>16.1. A CONTRATADA poderá desligar da excursão qualquer passageiro que causar transtornos ou desrespeitar as regras de convivência e segurança.</p>

    <h2>Cláusula décima sétima — Disposições importantes</h2>
    <p>17.1. O guia da excursão é a autoridade operacional durante a viagem. O itinerário poderá sofrer alterações por condições climáticas, trânsito ou questões técnicas. É proibido fumar ou utilizar entorpecentes no interior do veículo, sob pena de retirada do passageiro.</p>

    <h2>Autorização de uso de imagem</h2>
    <p>O CONTRATANTE autoriza, de forma gratuita, definitiva e irrevogável, o uso de sua imagem, voz e nome captados durante a excursão para fins de divulgação, promoção e registro do evento, em qualquer meio de comunicação. Caso não concorde, deverá manifestar-se expressamente por escrito até a data de início da viagem.</p>

    <h2>Do foro</h2>
    <p>As partes elegem o foro da ${escaparHtml(CONTRATADA_DADOS.foro)}, com renúncia a qualquer outro, por mais privilegiado que seja, para dirimir controvérsias decorrentes deste contrato.</p>

    <p>${localAssinatura}, ${dataAceiteFormatada}.</p>

    <div class="assinaturas">
      <div class="assinatura"><strong>CONTRATANTE</strong><br/>${escaparHtml(usuario.nome)}<br/>CPF: ${escaparHtml(formatarCpf(usuario.cpf))}</div>
      <div class="assinatura"><strong>CONTRATADA</strong><br/>${escaparHtml(CONTRATADA_DADOS.razao_social)}<br/>CNPJ: ${escaparHtml(CONTRATADA_DADOS.cnpj)}</div>
    </div>

    <div class="rodape-documento">Contrato gerado em ${dataAceiteFormatada} às ${formatarHorario(dataAceite)}. Aceite eletrônico registrado com IP ${escaparHtml(dadosContrato.aceite_ip || reserva.aceite_ip || "não informado")} — Reserva ID: ${escaparHtml(reserva.id)}.</div>
  </div>
</body>
</html>`;

      return html;
    } catch (error) {
      console.error("[ContratoService] Erro ao gerar HTML:", error);
      throw error;
    }
  }

  static async gerarContratoPDF(dadosContrato: DadosContrato): Promise<Buffer> {
    try {
      const html = await this.gerarContratoHTML(dadosContrato);
      return await generateBrandedPdfBuffer(html, { brand: "comitiva" });
    } catch (error) {
      console.error("[ContratoService] Erro ao gerar PDF:", error);
      throw error;
    }
  }

  static async salvarContratoPDF(dadosContrato: DadosContrato): Promise<string> {
    try {
      const pdfBuffer = await this.gerarContratoPDF(dadosContrato);
      const uploadDir = process.env.STORAGE_PATH || "./uploads";
      await fs.mkdir(uploadDir, { recursive: true });

      const nomeArquivo = `contrato-${dadosContrato.reserva_id}-${Date.now()}.pdf`;
      const caminhoCompleto = path.join(uploadDir, nomeArquivo);
      await fs.writeFile(caminhoCompleto, pdfBuffer);

      return caminhoCompleto;
    } catch (error) {
      console.error("[ContratoService] Erro ao salvar PDF:", error);
      throw error;
    }
  }

  static async registrarAceiteContrato(reserva_id: string, aceite_ip: string): Promise<void> {
    try {
      const reservaResult = await db
        .select()
        .from(reservas)
        .where(eq(reservas.id, reserva_id))
        .limit(1);

      if (reservaResult.length === 0) {
        throw new Error("Reserva não encontrada");
      }

      const reserva = reservaResult[0];
      const aceiteTimestamp = new Date();
      const dadosContrato: DadosContrato = {
        reserva_id,
        usuario_id: reserva.usuario_id,
        lote_id: reserva.lote_id,
        aceite_ip,
        aceite_timestamp: aceiteTimestamp,
      };

      const caminhoContrato = await this.salvarContratoPDF(dadosContrato);

      await db
        .update(reservas)
        .set({
          status: "contrato_gerado",
          contrato_pdf_url: caminhoContrato,
          aceite_timestamp: aceiteTimestamp,
          aceite_ip,
          atualizado_em: aceiteTimestamp,
        })
        .where(eq(reservas.id, reserva_id));

      console.log(`[ContratoService] Contrato gerado e salvo: ${caminhoContrato}`);
    } catch (error) {
      console.error("[ContratoService] Erro ao registrar aceite:", error);
      throw error;
    }
  }
}
