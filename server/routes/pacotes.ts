import { Router, Request, Response } from "express";
import { authMiddleware, requireRole, isAdminOrDev } from "../middleware/authMiddleware.js";
import { PacoteService, ConfiguracaoPacote } from "../services/pacoteService.js";
import { ContratoService } from "../services/contratoService.js";
import { ConfiguracaoService } from "../services/configuracaoService.js";
import { GatewayConfigService } from "../services/gatewayConfigService.js";
import { AuthService } from "../services/authService.js";
import { db } from "../db/index.js";
import { eventos, lotes, pacotes, itens_addon, reservas, usuarios, leads_origem, pagamentos, pagamentoParcelas, cupons } from "../db/schema.js";
import { eq, and, desc, inArray, isNull, or, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { CatalogoExclusaoService } from "../services/catalogoExclusaoService.js";
import { OperacaoOnibusService } from "../services/operacaoOnibusService.js";

const router = Router();

const FORMAS_CONTRATACAO = new Set(["onibus", "hospedagem", "onibus_hospedagem", "livre"]);
const FORMAS_PAGAMENTO_PACOTE = new Set(["pix", "boleto", "credito"]);

function dataIsoSegura(valor: unknown): string | null {
  if (!valor) return null;
  const data = valor instanceof Date ? valor : new Date(String(valor));
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

function validarConfiguracaoComercial(body: any) {
  const formaContratacao = String(body.forma_contratacao || "hospedagem").trim().toLowerCase();
  if (!FORMAS_CONTRATACAO.has(formaContratacao)) throw new Error("Forma de contratação inválida");

  const onibusConfig = Array.isArray(body.onibus_config) ? body.onibus_config : [];
  if (formaContratacao.includes("onibus") && onibusConfig.length === 0) {
    throw new Error("Configure ao menos um ônibus para esta forma de contratação");
  }
  const onibusNormalizados = onibusConfig.map((item: any, indice: number) => {
    const capacidade = Number(item?.capacidade ?? item?.vagas ?? 0);
    if (!Number.isInteger(capacidade) || capacidade < 1 || capacidade > 100) throw new Error(`Capacidade inválida no ônibus ${indice + 1}`);
    const ocupadas = Array.isArray(item?.ocupadas) ? item.ocupadas.filter((assento: unknown) => Number.isInteger(Number(assento))).map(Number) : [];
    return {
      id: String(item?.id || `onibus-${indice + 1}`),
      nome: String(item?.nome || `Ônibus ${indice + 1}`).trim().slice(0, 120),
      capacidade,
      ocupadas: Array.from(new Set<number>(ocupadas.filter((assento: number) => assento >= 1 && assento <= capacidade))).sort((a, b) => a - b),
    };
  });

  const pagamento = body.configuracao_pagamento && typeof body.configuracao_pagamento === "object" ? body.configuracao_pagamento : {};
  const formasPermitidas = Array.isArray(pagamento.formas_permitidas)
    ? Array.from(new Set(pagamento.formas_permitidas.map((forma: unknown) => String(forma).toLowerCase()).filter((forma: string) => FORMAS_PAGAMENTO_PACOTE.has(forma))))
    : ["pix", "boleto"];
  if (formasPermitidas.length === 0) throw new Error("Selecione ao menos uma forma de pagamento");
  const boletoParcelasMaximo = Number(pagamento.boleto_parcelas_maximo ?? 1);
  if (!Number.isInteger(boletoParcelasMaximo) || boletoParcelasMaximo < 1 || boletoParcelasMaximo > 36) throw new Error("O limite de parcelas do boleto deve estar entre 1 e 36");
  const creditoParcelasMaximo = Number(pagamento.credito_parcelas_maximo ?? 10);
  if (!Number.isInteger(creditoParcelasMaximo) || creditoParcelasMaximo < 1 || creditoParcelasMaximo > 24) throw new Error("O limite de parcelas do cartão deve estar entre 1 e 24");
  const creditoTaxaPercentual = Number(pagamento.credito_taxa_percentual ?? 0);
  if (!Number.isFinite(creditoTaxaPercentual) || creditoTaxaPercentual < 0 || creditoTaxaPercentual > 100) throw new Error("A taxa do cartão deve estar entre 0% e 100%");
  const creditoJurosMensalPercentual = Number(pagamento.credito_juros_mensal_percentual ?? 0);
  if (!Number.isFinite(creditoJurosMensalPercentual) || creditoJurosMensalPercentual < 0 || creditoJurosMensalPercentual > 20) throw new Error("Os juros mensais do cartão devem estar entre 0% e 20%");
  const prazoSegurancaDias = Number(pagamento.prazo_seguranca_dias ?? 0);
  if (!Number.isInteger(prazoSegurancaDias) || prazoSegurancaDias < 0 || prazoSegurancaDias > 365) throw new Error("O prazo de segurança deve estar entre 0 e 365 dias");
  const multaAtrasoPercentual = Number(pagamento.multa_atraso_percentual ?? 2);
  const jurosMoraMensalPercentual = Number(pagamento.juros_mora_mensal_percentual ?? 1);
  if (!Number.isFinite(multaAtrasoPercentual) || multaAtrasoPercentual < 0 || multaAtrasoPercentual > 100) throw new Error("A multa por atraso deve estar entre 0% e 100%");
  if (!Number.isFinite(jurosMoraMensalPercentual) || jurosMoraMensalPercentual < 0 || jurosMoraMensalPercentual > 20) throw new Error("Os juros de mora devem estar entre 0% e 20% ao mês");
  const dataLimite = body.data_limite_pagamento ? new Date(body.data_limite_pagamento) : null;
  if (dataLimite && Number.isNaN(dataLimite.getTime())) throw new Error("Data limite de pagamento inválida");

  return {
    forma_contratacao: formaContratacao,
    onibus_config: onibusNormalizados,
    configuracao_pagamento: {
      formas_permitidas: formasPermitidas,
      boleto_parcelas_maximo: boletoParcelasMaximo,
      credito_parcelas_maximo: creditoParcelasMaximo,
      credito_taxa_percentual: creditoTaxaPercentual,
      credito_juros_mensal_percentual: creditoJurosMensalPercentual,
      prazo_seguranca_dias: prazoSegurancaDias,
      multa_atraso_percentual: multaAtrasoPercentual,
      juros_mora_mensal_percentual: jurosMoraMensalPercentual,
    },
    data_limite_pagamento: dataLimite,
  };
}

function regrasDoPacote(pacote: any) {
  const configuracao = pacote?.configuracao_pagamento && typeof pacote.configuracao_pagamento === "object" ? pacote.configuracao_pagamento : {};
  const limite = Number(configuracao.boleto_parcelas_maximo);
  const limiteCredito = Number(configuracao.credito_parcelas_maximo);
  return {
    formasPermitidas: Array.isArray(configuracao.formas_permitidas) ? configuracao.formas_permitidas.map(String).filter((forma: string) => FORMAS_PAGAMENTO_PACOTE.has(forma)) : ["pix", "boleto"],
    boletoParcelasMaximo: Number.isInteger(limite) && limite > 0 ? limite : undefined,
    creditoParcelasMaximo: Number.isInteger(limiteCredito) && limiteCredito > 0 ? limiteCredito : undefined,
    creditoTaxaPercentual: Number(configuracao.credito_taxa_percentual) || 0,
    creditoJurosMensalPercentual: Number(configuracao.credito_juros_mensal_percentual) || 0,
    prazoSegurancaDias: Number.isInteger(Number(configuracao.prazo_seguranca_dias)) ? Math.max(0, Number(configuracao.prazo_seguranca_dias)) : 0,
    dataLimitePagamento: pacote?.data_limite_pagamento || null,
  };
}

// Listar itens disponíveis de um lote
router.get("/lotes/:lote_id/itens", async (req: Request, res: Response) => {
  try {
    const { lote_id } = req.params;

    const itens = await PacoteService.buscarItensDisponiveis(lote_id);

    res.json({
      lote_id,
      itens,
      total: itens.length,
    });
  } catch (error) {
    console.error("[PACOTES] Erro ao listar itens:", error);
    res.status(500).json({ erro: "Erro ao listar itens" });
  }
});

// Calcular valor do pacote (sem salvar)
router.post("/calcular", async (req: Request, res: Response) => {
  try {
    const config: ConfiguracaoPacote = req.body;

    if (!config.lote_id) {
      return res.status(400).json({ erro: "lote_id é obrigatório" });
    }

    const resultado = await PacoteService.calcularValorPacote(config);

    res.json(resultado);
  } catch (error: any) {
    console.error("[PACOTES] Erro ao calcular:", error);
    res.status(400).json({ erro: error?.message || "Não foi possível calcular o valor do pacote" });
  }
});

// Criar reserva (requer autenticação)
router.post("/reservar", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({ erro: "Não autenticado" });
    }

    const config: ConfiguracaoPacote = req.body;

    if (!config.lote_id) {
      return res.status(400).json({ erro: "lote_id é obrigatório" });
    }

    const ip = req.ip || req.socket.remoteAddress || "desconhecido";

    let origem: { lead_id?: string; vendedor_id?: string; codigo_origem?: string } = { codigo_origem: "site" };
    let leadAtualizado: Array<{ id: string }> = [];
    if (req.body.lead_id) {
      const leadId = String(req.body.lead_id);
      const tokenValido = AuthService.verifyLeadIntentToken(String(req.body.lead_intent_token || ""), leadId);
      const lead = (await db.select({ id: leads_origem.id, vendedor_id: leads_origem.vendedor_id, codigo_origem: leads_origem.codigo_origem, usuario_id: leads_origem.usuario_id })
        .from(leads_origem)
        .where(and(eq(leads_origem.id, leadId), tokenValido ? or(isNull(leads_origem.usuario_id), eq(leads_origem.usuario_id, req.usuario.id)) : eq(leads_origem.usuario_id, req.usuario.id)))
        .limit(1))[0];
      if (!lead) return res.status(401).json({ erro: "Origem comercial inválida ou sem permissão" });
      origem = { lead_id: lead.id, vendedor_id: lead.vendedor_id || undefined, codigo_origem: lead.codigo_origem || undefined };
      leadAtualizado = await db.update(leads_origem).set({
        usuario_id: req.usuario.id,
        lote_id: config.lote_id,
        pacote_id: config.pacote_id || null,
        status: "checkout_iniciado",
        atualizado_em: new Date(),
      }).where(and(eq(leads_origem.id, lead.id), or(isNull(leads_origem.usuario_id), eq(leads_origem.usuario_id, req.usuario.id)))).returning({ id: leads_origem.id });
    }

    if (leadAtualizado.length === 0) {
      const leadDaConta = await db.select({ id: leads_origem.id, vendedor_id: leads_origem.vendedor_id, codigo_origem: leads_origem.codigo_origem })
        .from(leads_origem)
        .where(eq(leads_origem.usuario_id, req.usuario.id))
        .orderBy(desc(sql`${leads_origem.vendedor_id} IS NOT NULL`), desc(leads_origem.atualizado_em))
        .limit(1);
      if (leadDaConta[0]) origem = { lead_id: leadDaConta[0].id, vendedor_id: leadDaConta[0].vendedor_id || undefined, codigo_origem: leadDaConta[0].codigo_origem || undefined };
    }

    const resultado = await PacoteService.reservarPacote(
      req.usuario.id,
      config.lote_id,
      config,
      ip,
      origem,
    );
    const alocacaoOperacional = await OperacaoOnibusService.alocarPrimeiroDisponivel(config.lote_id, resultado.reserva.id, req.usuario.id);

    // Cadastro direto não possui lead_id no navegador. Atualiza o card ligado
    // à conta para que pacote e etapa também apareçam no CRM.
    if (leadAtualizado.length === 0) {
      const leadDaConta = await db.select({ id: leads_origem.id })
        .from(leads_origem)
        .where(eq(leads_origem.usuario_id, req.usuario.id))
        .orderBy(desc(sql`${leads_origem.vendedor_id} IS NOT NULL`), desc(leads_origem.atualizado_em))
        .limit(1);
      if (leadDaConta[0]) {
        await db.update(leads_origem).set({
          lote_id: config.lote_id,
          pacote_id: config.pacote_id || null,
          status: "checkout_iniciado",
          atualizado_em: new Date(),
        }).where(eq(leads_origem.id, leadDaConta[0].id));
      }
    }

    res.status(201).json({
      reserva_id: resultado.reserva.id,
      status: resultado.reserva.status,
      calculo: resultado.calculo,
      operacao: alocacaoOperacional ? { poltrona_atribuida: true, alocacao_id: alocacaoOperacional.id } : { poltrona_atribuida: false, motivo: "Atribuição pendente no mapa operacional" },
    });
  } catch (error: any) {
    console.error("[PACOTES] Erro ao reservar:", error);
    const mensagem = error?.message || "Erro ao criar reserva";
    if (mensagem === "DUPLICIDADE_RESERVA_ATIVA") {
      return res.status(409).json({ erro: "Já existe uma contratação para este viajante neste período. Continue pela reserva existente.", reserva_id: error?.reservaId || null });
    }
    const erroDeRegra = /cupom|pacote|lote|vaga|adicional|quantidade|origem|incompatível|inválid/i.test(mensagem);
    res.status(erroDeRegra ? 400 : 500).json({ erro: mensagem });
  }
});

// Listar reservas do usuário
router.get("/minhas-reservas", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({ erro: "Não autenticado" });
    }

    const minhasReservas = await db
      .select({
        id: reservas.id,
        lote_id: reservas.lote_id,
        pacote_id: reservas.pacote_id,
        status: reservas.status,
        checkout_estado: reservas.checkout_estado,
        valor_total: reservas.valor_total,
        valor_total_centavos: reservas.valor_total_centavos,
        forma_pagamento: reservas.forma_pagamento,
        quantidade_parcelas: reservas.quantidade_parcelas,
        valor_parcela: reservas.valor_parcela,
        cronograma_pagamento: reservas.cronograma_pagamento,
        contrato_pdf_url: reservas.contrato_pdf_url,
        criado_em: reservas.criado_em,
        atualizado_em: reservas.atualizado_em,
        pacote_nome: pacotes.nome,
        modalidade_hospedagem: pacotes.modalidade_hospedagem,
        lote_nome: lotes.nome,
        evento_nome: eventos.nome,
        evento_local: eventos.local,
        evento_data_inicio: eventos.data_inicio,
        evento_data_fim: eventos.data_fim,
      })
      .from(reservas)
      .innerJoin(lotes, eq(reservas.lote_id, lotes.id))
      .innerJoin(eventos, eq(lotes.evento_id, eventos.id))
      .leftJoin(pacotes, eq(reservas.pacote_id, pacotes.id))
      .where(eq(reservas.usuario_id, req.usuario.id))
      .orderBy(desc(reservas.criado_em));

    const pagamentosRecentes = minhasReservas.length
      ? await db.select({ id: pagamentos.id, reserva_id: pagamentos.reserva_id, status: pagamentos.status, status_reconciliado: pagamentos.status_reconciliado, valor_pago_centavos: pagamentos.valor_pago_centavos, valor_centavos: pagamentos.valor_centavos, metodo: pagamentos.metodo, atualizado_em: pagamentos.atualizado_em })
        .from(pagamentos)
        .where(inArray(pagamentos.reserva_id, minhasReservas.map((reserva) => reserva.id)))
        .orderBy(desc(pagamentos.atualizado_em))
      : [];
    const pagamentoPorReserva = new Map<string, typeof pagamentosRecentes[number]>();
    for (const pagamento of pagamentosRecentes) if (!pagamentoPorReserva.has(pagamento.reserva_id)) pagamentoPorReserva.set(pagamento.reserva_id, pagamento);
    const parcelasRecentes = minhasReservas.length
      ? await db.select({
        id: pagamentoParcelas.id, reserva_id: pagamentoParcelas.reserva_id, sequencia: pagamentoParcelas.sequencia,
        valor: pagamentoParcelas.valor, vencimento: pagamentoParcelas.vencimento, status: pagamentoParcelas.status,
        valor_pago_centavos: pagamentoParcelas.valor_pago_centavos,
        boleto_disponivel: sql<boolean>`${pagamentoParcelas.boleto_documento_id} IS NOT NULL`,
        enviado_email_em: pagamentoParcelas.enviado_email_em, enviado_whatsapp_em: pagamentoParcelas.enviado_whatsapp_em, pago_confirmado_em: pagamentoParcelas.pago_confirmado_em,
      }).from(pagamentoParcelas).where(inArray(pagamentoParcelas.reserva_id, minhasReservas.map((reserva) => reserva.id))).orderBy(pagamentoParcelas.reserva_id, pagamentoParcelas.sequencia)
      : [];

    res.json({
      total: minhasReservas.length,
      reservas: minhasReservas.map(({ contrato_pdf_url, ...reserva }) => ({
        ...reserva,
        pagamento: pagamentoPorReserva.get(reserva.id) || null,
        parcelas: parcelasRecentes.filter((parcela) => parcela.reserva_id === reserva.id),
        contrato_disponivel: Boolean(contrato_pdf_url),
        voucher_disponivel: reserva.status === "cliente_confirmado" && pagamentoPorReserva.get(reserva.id)?.status_reconciliado === "quitado",
      })),
    });
  } catch (error) {
    console.error("[PACOTES] Erro ao listar reservas:", error);
    res.status(500).json({ erro: "Erro ao listar reservas" });
  }
});

// Buscar detalhes de uma reserva
router.get("/reservas/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({ erro: "Não autenticado" });
    }

    const { reserva_id } = req.params;

    const reserva = await db
      .select()
      .from(reservas)
      .where(eq(reservas.id, reserva_id))
      .limit(1);

    if (reserva.length === 0) {
      return res.status(404).json({ erro: "Reserva não encontrada" });
    }

    // Verificar se é do usuário ou admin
    if (reserva[0].usuario_id !== req.usuario.id && !isAdminOrDev(req.usuario.tipo)) {
      return res.status(403).json({ erro: "Acesso negado" });
    }
    if (req.usuario.tipo !== "dev") {
      const perfilAlvo = (await db.select({ tipo: usuarios.tipo }).from(usuarios).where(eq(usuarios.id, reserva[0].usuario_id)).limit(1))[0];
      if (!perfilAlvo || perfilAlvo.tipo === "dev") return res.status(404).json({ erro: "Reserva não encontrada" });
    }

    const contratante = await db
      .select({
        nome: usuarios.nome,
        cpf: usuarios.cpf,
        data_nascimento: usuarios.data_nascimento,
        endereco: usuarios.endereco,
        telefone: usuarios.telefone,
        email: usuarios.email,
      })
      .from(usuarios)
      .where(eq(usuarios.id, reserva[0].usuario_id))
      .limit(1);

    const pacoteSelecionado = reserva[0].pacote_id
      ? await db
        .select({
          id: pacotes.id,
          nome: pacotes.nome,
          descricao: pacotes.descricao,
          modalidade_hospedagem: pacotes.modalidade_hospedagem,
          forma_contratacao: pacotes.forma_contratacao,
          onibus_config: pacotes.onibus_config,
          configuracao_pagamento: pacotes.configuracao_pagamento,
          data_limite_pagamento: pacotes.data_limite_pagamento,
        })
        .from(pacotes)
        .where(eq(pacotes.id, reserva[0].pacote_id))
        .limit(1)
      : [];

    const loteResult = await db
      .select({
        lote_nome: lotes.nome,
        data_embarque: lotes.data_embarque,
        data_inicio: lotes.data_inicio,
        data_fim: lotes.data_fim,
        evento_nome: eventos.nome,
        evento_local: eventos.local,
      })
      .from(lotes)
      .innerJoin(eventos, eq(lotes.evento_id, eventos.id))
      .where(eq(lotes.id, reserva[0].lote_id))
      .limit(1);
    const cupomSelecionado = reserva[0].cupom_id
      ? (await db.select({ codigo: cupons.codigo }).from(cupons).where(eq(cupons.id, reserva[0].cupom_id)).limit(1))[0]
      : undefined;
    const regrasPacote = regrasDoPacote(pacoteSelecionado[0] as any);
    const dataViagem = loteResult[0]?.data_embarque || loteResult[0]?.data_inicio;
    const dataLimitePagamento = ContratoService.calcularDataLimiteEfetiva(regrasPacote.dataLimitePagamento, dataViagem, regrasPacote.prazoSegurancaDias);
    const configPagamento = await ConfiguracaoService.obterConfiguracoesPagamento();
    // Se o contrato já foi gerado, a condição fica travada (ver Checkout.tsx),
    // então o teto correto para exibir é o que valia no momento do aceite —
    // aproximado pela data de criação da reserva. Sem contrato ainda, usamos
    // a data atual, que é o que efetivamente será validado no aceite.
    const parcelasPorData = ContratoService.calcularParcelasMaximasBoleto(
      dataLimitePagamento,
      reserva[0].forma_pagamento ? reserva[0].criado_em : new Date(),
      configPagamento.boleto_meses_maximo_antecedencia,
    );
    const parcelasBoletoMaximasCalculadas = Math.min(parcelasPorData, regrasPacote.boletoParcelasMaximo || parcelasPorData);
    const parcelasBoletoMaximas = reserva[0].forma_pagamento === "boleto"
      ? Math.max(parcelasBoletoMaximasCalculadas, Number(reserva[0].quantidade_parcelas || 1))
      : parcelasBoletoMaximasCalculadas;
    const parcelasCreditoMaximasCalculadas = Math.min(parcelasPorData, regrasPacote.creditoParcelasMaximo || configPagamento.credito_parcelas_maximo, configPagamento.credito_parcelas_maximo);
    const parcelasCreditoMaximas = reserva[0].forma_pagamento === "credito"
      ? Math.max(parcelasCreditoMaximasCalculadas, Number(reserva[0].quantidade_parcelas || 1))
      : parcelasCreditoMaximasCalculadas;

    const gatewayPainel = await GatewayConfigService.obterMascara().catch(() => null);
    const gatewayAmbienteConfigurado = Boolean(
      process.env.CORA_CLIENT_ID?.trim()
      && process.env.CORA_CERT_PATH?.trim()
      && process.env.CORA_PRIVATE_KEY_PATH?.trim(),
    );
    const gatewayAutomaticoDisponivel = Boolean(gatewayPainel?.ativo && gatewayPainel.configurado) || gatewayAmbienteConfigurado;

    res.json({
      ...reserva[0],
      pacote_nome: pacoteSelecionado[0]?.nome || null,
      pacote_descricao: pacoteSelecionado[0]?.descricao || null,
      modalidade_hospedagem: pacoteSelecionado[0]?.modalidade_hospedagem || null,
      forma_contratacao: pacoteSelecionado[0]?.forma_contratacao || "hospedagem",
      onibus_config: pacoteSelecionado[0]?.onibus_config || [],
      configuracao_pagamento: pacoteSelecionado[0]?.configuracao_pagamento || {},
      data_limite_pagamento: pacoteSelecionado[0]?.data_limite_pagamento || null,
      lote_nome: loteResult[0]?.lote_nome || null,
      evento_nome: loteResult[0]?.evento_nome || null,
      evento_local: loteResult[0]?.evento_local || null,
      data_inicio: loteResult[0]?.data_inicio || null,
      data_fim: loteResult[0]?.data_fim || null,
      cupom_codigo: cupomSelecionado?.codigo || null,
      desconto_cupom: reserva[0].desconto_aplicado || "0.00",
      contratante: contratante[0] || null,
      parcelas_boleto_maximas: parcelasBoletoMaximas,
      parcelas_credito_maximas: parcelasCreditoMaximas,
      formas_pagamento_permitidas: regrasPacote.formasPermitidas,
      formas_pagamento_checkout: regrasPacote.formasPermitidas.filter((forma: string) => forma !== "credito"),
      credito_taxa_percentual: regrasPacote.creditoTaxaPercentual,
      credito_juros_mensal_percentual: regrasPacote.creditoJurosMensalPercentual,
      cartao_disponivel: false,
      cartao_indisponivel_motivo: regrasPacote.formasPermitidas.includes("credito") ? "O provedor bancário atual não processa cartão no checkout." : null,
      data_limite_efetiva: dataIsoSegura(dataLimitePagamento),
      pix_desconto_percentual: configPagamento.pix_desconto_percentual,
      credito_parcelas_maximo: configPagamento.credito_parcelas_maximo,
      boleto_modo: configPagamento.boleto_modo,
      gateway_automatico_disponivel: gatewayAutomaticoDisponivel,
    });
  } catch (error) {
    console.error("[PACOTES] Erro ao buscar reserva:", error);
    res.status(500).json({ erro: "Erro ao buscar reserva" });
  }
});

// Simulação autoritativa: usa as mesmas regras que serão revalidadas ao
// preparar o contrato. Nenhum preço, parcela ou vencimento enviado pelo
// navegador é persistido por este endpoint.
router.post("/reservas/:reserva_id/simular-pagamento", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const reserva = (await db.select().from(reservas).where(eq(reservas.id, req.params.reserva_id)).limit(1))[0];
    if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    if (reserva.usuario_id !== req.usuario.id && !isAdminOrDev(req.usuario.tipo)) return res.status(403).json({ erro: "Acesso negado" });
    const metodo = String(req.body?.metodo_pagamento || "").toLowerCase();
    if (!['pix', 'boleto'].includes(metodo)) return res.status(400).json({ erro: "O provedor bancário atual oferece somente PIX e boleto" });

    const pacote = reserva.pacote_id ? (await db.select().from(pacotes).where(eq(pacotes.id, reserva.pacote_id)).limit(1))[0] : undefined;
    const lote = (await db.select({ data_embarque: lotes.data_embarque, data_inicio: lotes.data_inicio }).from(lotes).where(eq(lotes.id, reserva.lote_id)).limit(1))[0];
    const regras = regrasDoPacote(pacote);
    if (!regras.formasPermitidas.includes(metodo)) return res.status(400).json({ erro: "A forma de pagamento não está disponível para este pacote" });
    const configuracao = await ConfiguracaoService.obterConfiguracoesPagamento();
    const dataLimite = ContratoService.calcularDataLimiteEfetiva(regras.dataLimitePagamento, lote?.data_embarque || lote?.data_inicio, regras.prazoSegurancaDias);
    const parcelasPorData = ContratoService.calcularParcelasMaximasBoleto(dataLimite, new Date(), configuracao.boleto_meses_maximo_antecedencia);
    const parcelasMaximasBoleto = Math.min(parcelasPorData, regras.boletoParcelasMaximo || parcelasPorData);
    const quantidade = metodo === 'pix' ? 1 : Number(req.body?.quantidade_parcelas || 1);
    const valorBase = Number(reserva.valor_total) + Number(reserva.desconto_pagamento || 0);
    const condicao = ContratoService.calcularCondicaoPagamento(valorBase.toFixed(2), metodo, quantidade, parcelasMaximasBoleto, { percentualDescontoPix: configuracao.pix_desconto_percentual });
    const vencimentos = metodo === 'boleto' ? ContratoService.gerarVencimentos(dataLimite, condicao.quantidade_parcelas, new Date()) : [];
    if (metodo === 'boleto' && vencimentos.length !== condicao.quantidade_parcelas) return res.status(400).json({ erro: "As parcelas solicitadas ultrapassam a data limite de pagamento" });
    return res.json({ condicao_pagamento: condicao, vencimentos, data_limite_efetiva: dataIsoSegura(dataLimite), parcelas_maximas: metodo === 'boleto' ? parcelasMaximasBoleto : 1 });
  } catch (error: any) {
    return res.status(400).json({ erro: error.message || "Não foi possível simular a condição de pagamento" });
  }
});

// Listar pacotes ativos de um lote (público)
router.get("/lotes/:lote_id/pacotes", async (req: Request, res: Response) => {
  try {
    const lista = await db
      .select()
      .from(pacotes)
      .where(and(eq(pacotes.lote_id, req.params.lote_id), eq(pacotes.ativo, true)));

    res.json({ lote_id: req.params.lote_id, pacotes: lista });
  } catch (error) {
    console.error("[PACOTES] Erro ao listar pacotes:", error);
    res.status(500).json({ erro: "Erro ao listar pacotes" });
  }
});

// Criar pacote/modalidade (admin)
router.post("/", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { lote_id, nome, descricao, valor_total, itens_selecionados, modalidade_hospedagem, disponibilidade, contrato_modelo, ativo } = req.body;
    const modalidadesValidas = ["camping", "quarto_ventilador", "quarto_ar_condicionado"];
    const disponibilidadesValidas = ["disponivel", "ultimas_vagas", "esgotado"];
    const modelosContratoValidos = ["auto", "hospedagem", "transporte"];

    if (!lote_id || !nome || valor_total === undefined || !modalidade_hospedagem) {
      return res.status(400).json({ erro: "lote_id, nome, valor_total e modalidade_hospedagem são obrigatórios" });
    }
    if (!modalidadesValidas.includes(modalidade_hospedagem)) {
      return res.status(400).json({ erro: "Modalidade de hospedagem inválida" });
    }
    if (disponibilidade && !disponibilidadesValidas.includes(disponibilidade)) {
      return res.status(400).json({ erro: "Disponibilidade inválida" });
    }
    if (contrato_modelo && !modelosContratoValidos.includes(contrato_modelo)) {
      return res.status(400).json({ erro: "Modelo de contrato inválido" });
    }
    const comercial = validarConfiguracaoComercial(req.body);

    const lote = await db.select({ id: lotes.id }).from(lotes).where(eq(lotes.id, lote_id)).limit(1);
    if (lote.length === 0) {
      return res.status(404).json({ erro: "Lote não encontrado" });
    }

    const criado = await db.insert(pacotes).values({
      id: createId(),
      lote_id,
      nome,
      descricao: descricao || "",
      valor_total: String(valor_total),
      itens_selecionados: itens_selecionados || [],
      modalidade_hospedagem,
      disponibilidade: disponibilidade || "disponivel",
      contrato_modelo: contrato_modelo || "auto",
      forma_contratacao: comercial.forma_contratacao,
      onibus_config: comercial.onibus_config,
      configuracao_pagamento: comercial.configuracao_pagamento,
      data_limite_pagamento: comercial.data_limite_pagamento,
      ativo: ativo !== false,
      criado_em: new Date(),
      atualizado_em: new Date(),
    }).returning();

    res.status(201).json({ mensagem: "Pacote publicado com sucesso", pacote: criado[0] });
  } catch (error: any) {
    console.error("[PACOTES] Erro ao criar pacote:", error);
    res.status(500).json({ erro: error.message || "Erro ao criar pacote" });
  }
});

// Atualizar pacote/modalidade (admin)
router.put("/:pacote_id", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { nome, descricao, valor_total, itens_selecionados, modalidade_hospedagem, disponibilidade, contrato_modelo, ativo } = req.body;
    const modalidadesValidas = ["camping", "quarto_ventilador", "quarto_ar_condicionado"];
    const disponibilidadesValidas = ["disponivel", "ultimas_vagas", "esgotado"];
    const modelosContratoValidos = ["auto", "hospedagem", "transporte"];

    if (modalidade_hospedagem && !modalidadesValidas.includes(modalidade_hospedagem)) {
      return res.status(400).json({ erro: "Modalidade de hospedagem inválida" });
    }
    if (disponibilidade && !disponibilidadesValidas.includes(disponibilidade)) {
      return res.status(400).json({ erro: "Disponibilidade inválida" });
    }
    if (contrato_modelo && !modelosContratoValidos.includes(contrato_modelo)) {
      return res.status(400).json({ erro: "Modelo de contrato inválido" });
    }
    const comercial = validarConfiguracaoComercial(req.body);

    const atualizado = await db.update(pacotes).set({
      nome: nome || undefined,
      descricao: descricao !== undefined ? descricao : undefined,
      valor_total: valor_total !== undefined ? String(valor_total) : undefined,
      itens_selecionados: itens_selecionados !== undefined ? itens_selecionados : undefined,
      modalidade_hospedagem: modalidade_hospedagem || undefined,
      disponibilidade: disponibilidade || undefined,
      contrato_modelo: contrato_modelo || undefined,
      forma_contratacao: req.body.forma_contratacao !== undefined ? comercial.forma_contratacao : undefined,
      onibus_config: req.body.onibus_config !== undefined ? comercial.onibus_config : undefined,
      configuracao_pagamento: req.body.configuracao_pagamento !== undefined ? comercial.configuracao_pagamento : undefined,
      data_limite_pagamento: req.body.data_limite_pagamento !== undefined ? comercial.data_limite_pagamento : undefined,
      ativo: ativo !== undefined ? Boolean(ativo) : undefined,
      atualizado_em: new Date(),
    }).where(eq(pacotes.id, req.params.pacote_id)).returning();

    if (atualizado.length === 0) {
      return res.status(404).json({ erro: "Pacote não encontrado" });
    }
    res.json({ mensagem: "Pacote atualizado com sucesso", pacote: atualizado[0] });
  } catch (error: any) {
    console.error("[PACOTES] Erro ao atualizar pacote:", error);
    res.status(500).json({ erro: error.message || "Erro ao atualizar pacote" });
  }
});

// Excluir definitivamente quando não há histórico; caso contrário, arquivar.
router.delete("/:pacote_id", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const resultado = await CatalogoExclusaoService.pacote(req.params.pacote_id, {
      id: req.usuario!.id,
      tipo: req.usuario!.tipo,
    });
    return res.json(resultado);
  } catch (error: any) {
    console.error("[PACOTES] Falha ao excluir ou arquivar pacote:", error);
    if (error?.message === "Pacote não encontrado") return res.status(404).json({ erro: error.message });
    return res.status(500).json({ erro: "Não foi possível excluir ou arquivar o pacote" });
  }
});

export default router;
