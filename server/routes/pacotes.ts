import { Router, Request, Response, NextFunction, raw } from "express";
import { authMiddleware, requireRole, isAdminOrDev } from "../middleware/authMiddleware.js";
import { PacoteService, ConfiguracaoPacote } from "../services/pacoteService.js";
import { ContratoService } from "../services/contratoService.js";
import { ConfiguracaoService } from "../services/configuracaoService.js";
import { GatewayConfigService } from "../services/gatewayConfigService.js";
import { AuthService } from "../services/authService.js";
import { db } from "../db/index.js";
import { eventos, lotes, pacotes, pacotePeriodos, fotosPacote, itens_addon, reservas, usuarios, leads_origem, pagamentos, pagamentoParcelas, cupons, cuponsUtilizacoes, precosLedger, reservaParticipantes } from "../db/schema.js";
import { eq, and, desc, inArray, isNull, or, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { CatalogoExclusaoService } from "../services/catalogoExclusaoService.js";
import { ContratacaoIntegridadeService } from "../services/contratacaoIntegridadeService.js";
import fs from "node:fs/promises";
import path from "node:path";

const router = Router();

const FORMAS_CONTRATACAO = new Set(["onibus", "hospedagem", "onibus_hospedagem", "livre"]);
const FORMAS_PAGAMENTO_PACOTE = new Set(["pix", "boleto", "credito", "debito"]);
const parserFotoPacote = raw({ type: "application/octet-stream", limit: "10mb" });

function uploadFotoPacote(req: Request, res: Response, next: NextFunction) {
  parserFotoPacote(req, res, (error?: any) => {
    if (error?.type === "entity.too.large") return res.status(413).json({ erro: "A foto excede o limite de 10 MB" });
    if (error) return next(error);
    return next();
  });
}

function detectarFotoPacote(buffer: Buffer, extensao: string): string | null {
  const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if ([".jpg", ".jpeg"].includes(extensao) && jpeg) return "image/jpeg";
  if (extensao === ".png" && png) return "image/png";
  if (extensao === ".webp" && webp) return "image/webp";
  return null;
}

function caminhoFotoPacote(pacoteId: string, fotoId: string, mime: string): string {
  const extensao = mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg";
  const base = path.resolve(process.env.STORAGE_PATH || "./uploads");
  return path.resolve(base, "pacotes", pacoteId, `${fotoId}${extensao}`);
}

function mensagemErroPublica(error: unknown, fallback: string): string {
  const bruto = error instanceof Error ? error.message : String(error || "");
  if (!bruto || /failed query:|params:|syntax error|does not exist|violates .* constraint|duplicate key|connection terminated|econn|timeout/i.test(bruto)) {
    return fallback;
  }
  return bruto;
}

function dataIsoSegura(valor: unknown): string | null {
  if (!valor) return null;
  const data = valor instanceof Date ? valor : new Date(String(valor));
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

function dataPeriodo(valor: unknown, campo: string, obrigatoria = true): Date | null {
  if (valor === undefined || valor === null || valor === "") {
    if (obrigatoria) throw new Error(`${campo} é obrigatória`);
    return null;
  }
  const data = new Date(String(valor));
  if (Number.isNaN(data.getTime())) throw new Error(`${campo} inválida`);
  return data;
}

function validarIntervaloPeriodo(inicio: Date, fim: Date, embarque: Date | null, retorno: Date | null) {
  if (inicio.getTime() > fim.getTime()) throw new Error("A data inicial do período deve ser anterior à data final");
  if (embarque && retorno && embarque.getTime() > retorno.getTime()) throw new Error("A saída deve ocorrer antes do retorno");
}

function validarConfiguracaoComercial(body: any) {
  const modalidade = String(body.modalidade_hospedagem || "quarto_ventilador").trim().toLowerCase();
  const formaPadrao = "onibus_hospedagem";
  const formaContratacao = String(body.forma_contratacao || formaPadrao).trim().toLowerCase();
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


function modeloContratoPorForma(forma: string) {
  if (forma === "onibus") return "transporte";
  if (forma === "hospedagem") return "hospedagem";
  if (forma === "onibus_hospedagem") return "hospedagem_transporte";
  return "auto";
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
    res.status(400).json({ erro: mensagemErroPublica(error, "Não foi possível calcular o valor do pacote") });
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

    const carrinhoExistente = await PacoteService.retomarCarrinho(req.usuario.id, config.lote_id, { pacote_id: config.pacote_id, periodo_id: config.periodo_id, forma_contratacao: config.forma_contratacao });
    const resultado = carrinhoExistente || await PacoteService.reservarPacote(
        req.usuario.id,
        config.lote_id,
        config,
        ip,
        origem,
      );
    const integridade = await ContratacaoIntegridadeService.garantirReserva(resultado.reserva.id, { renovarHold: true, origem: "reservar_pacote" });

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
      operacao: {
        transporte: integridade.recursos.transporte,
        hospedagem: integridade.recursos.hospedagem,
        poltrona_atribuida: !integridade.recursos.transporte || integridade.assentos_ativos >= integridade.quantidade_pessoas,
        assentos_ativos: integridade.assentos_ativos,
        quartos_ativos: integridade.quartos_ativos,
        assento_alocacao_id: resultado.operacao.assento_alocacao_id,
        quarto_alocacao_id: resultado.operacao.quarto_alocacao_id,
      },
      quantidade_pessoas: resultado.quantidade_pessoas || 1,
      carrinho_retomado: Boolean(carrinhoExistente),
    });
  } catch (error: any) {
    console.error("[PACOTES] Erro ao reservar:", error);
    const mensagem = mensagemErroPublica(error, "Não foi possível criar a reserva");
    if (mensagem === "DUPLICIDADE_RESERVA_ATIVA") {
      return res.status(409).json({ erro: "Já existe uma contratação para este viajante neste período. Continue pela reserva existente.", reserva_id: error?.reservaId || null });
    }
    const erroDeRegra = /cupom|pacote|lote|vaga|adicional|quantidade|origem|incompatível|inválid|cadastro|sexo|endereço/i.test(mensagem);
    res.status(erroDeRegra ? 400 : 500).json({ erro: erroDeRegra ? mensagem : "Não foi possível criar a reserva" });
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
        periodo_id: reservas.periodo_id,
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
        periodo_nome: pacotePeriodos.nome,
        periodo_data_inicio: pacotePeriodos.data_inicio,
        periodo_data_fim: pacotePeriodos.data_fim,
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
      .leftJoin(pacotePeriodos, eq(reservas.periodo_id, pacotePeriodos.id))
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
        sexo: usuarios.sexo,
        endereco: usuarios.endereco,
        cep: usuarios.cep,
        logradouro: usuarios.logradouro,
        numero: usuarios.numero,
        complemento: usuarios.complemento,
        bairro: usuarios.bairro,
        cidade: usuarios.cidade,
        estado: usuarios.estado,
        telefone: usuarios.telefone,
        email: usuarios.email,
      })
      .from(usuarios)
      .where(eq(usuarios.id, reserva[0].usuario_id))
      .limit(1);

    const participantesReserva = await db.select({ id: reservaParticipantes.id, nome_completo: reservaParticipantes.nome_completo, cpf: reservaParticipantes.cpf, data_nascimento: reservaParticipantes.data_nascimento, telefone: reservaParticipantes.telefone, email: reservaParticipantes.email, sexo_operacional: reservaParticipantes.sexo_operacional, assento_id: reservaParticipantes.assento_id, quarto_id: reservaParticipantes.quarto_id, vaga_quarto_id: reservaParticipantes.vaga_quarto_id })
      .from(reservaParticipantes)
      .where(reserva[0].grupo_id ? eq(reservaParticipantes.grupo_id, reserva[0].grupo_id) : eq(reservaParticipantes.reserva_id, reserva[0].id));

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
    const periodoSelecionado = reserva[0].periodo_id
      ? await db.select({
        id: pacotePeriodos.id, nome: pacotePeriodos.nome, descricao: pacotePeriodos.descricao,
        data_inicio: pacotePeriodos.data_inicio, data_fim: pacotePeriodos.data_fim,
        data_embarque: pacotePeriodos.data_embarque, data_retorno: pacotePeriodos.data_retorno,
      }).from(pacotePeriodos).where(eq(pacotePeriodos.id, reserva[0].periodo_id)).limit(1)
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
    const dataViagem = periodoSelecionado[0]?.data_embarque || periodoSelecionado[0]?.data_inicio || loteResult[0]?.data_embarque || loteResult[0]?.data_inicio;
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
      periodo_id: reserva[0].periodo_id || null,
      periodo_nome: periodoSelecionado[0]?.nome || null,
      periodo_descricao: periodoSelecionado[0]?.descricao || null,
      periodo_data_inicio: periodoSelecionado[0]?.data_inicio || null,
      periodo_data_fim: periodoSelecionado[0]?.data_fim || null,
      periodo_data_embarque: periodoSelecionado[0]?.data_embarque || null,
      periodo_data_retorno: periodoSelecionado[0]?.data_retorno || null,
      lote_nome: loteResult[0]?.lote_nome || null,
      evento_nome: loteResult[0]?.evento_nome || null,
      evento_local: loteResult[0]?.evento_local || null,
      data_inicio: loteResult[0]?.data_inicio || null,
      data_fim: loteResult[0]?.data_fim || null,
      cupom_codigo: cupomSelecionado?.codigo || null,
      desconto_cupom: reserva[0].desconto_aplicado || "0.00",
      contratante: contratante[0] || null,
      participantes: participantesReserva,
      parcelas_boleto_maximas: parcelasBoletoMaximas,
      parcelas_credito_maximas: parcelasCreditoMaximas,
      formas_pagamento_permitidas: regrasPacote.formasPermitidas,
      formas_pagamento_checkout: regrasPacote.formasPermitidas.filter((forma: string) => !["credito", "debito"].includes(forma)),
      credito_taxa_percentual: regrasPacote.creditoTaxaPercentual,
      credito_juros_mensal_percentual: regrasPacote.creditoJurosMensalPercentual,
      cartao_disponivel: false,
      cartao_indisponivel_motivo: regrasPacote.formasPermitidas.includes("credito") ? "O provedor bancário atual não processa cartão no checkout." : null,
      cartao_debito_disponivel: false,
      cartao_debito_indisponivel_motivo: regrasPacote.formasPermitidas.includes("debito") ? "A Cora não documenta cobrança por cartão de débito. Escolha PIX ou boleto." : null,
      data_limite_efetiva: dataIsoSegura(dataLimitePagamento),
      pix_desconto_percentual: configPagamento.pix_desconto_percentual,
      credito_parcelas_maximo: configPagamento.credito_parcelas_maximo,
      boleto_modo: configPagamento.boleto_modo,
      gateway_automatico_disponivel: gatewayAutomaticoDisponivel,
      carrinho_retomavel: ["pacote_montado", "checkout_iniciado", "abandonado"].includes(String(reserva[0].status))
        && !["cancelado_cliente", "troca_pacote_cliente", "reiniciado_cliente", "cancelamento_aprovado"].includes(String(reserva[0].checkout_estado || "")),
    });
  } catch (error) {
    console.error("[PACOTES] Erro ao buscar reserva:", error);
    res.status(500).json({ erro: "Erro ao buscar reserva" });
  }
});

// Renovar somente o inventário do carrinho existente. Nunca cria uma segunda
// reserva e não altera contrato ou pagamento já avançados.
router.post("/reservas/:reserva_id/retomar", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const reserva = (await db.select({ id: reservas.id, usuario_id: reservas.usuario_id, lote_id: reservas.lote_id, checkout_estado: reservas.checkout_estado }).from(reservas).where(eq(reservas.id, req.params.reserva_id)).limit(1))[0];
    if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    if (reserva.usuario_id !== req.usuario.id && !isAdminOrDev(req.usuario.tipo)) return res.status(403).json({ erro: "Acesso negado" });
    const resultado = await PacoteService.retomarCarrinho(reserva.usuario_id, reserva.lote_id);
    if (!resultado || resultado.reserva.id !== reserva.id) return res.status(409).json({ erro: "Este carrinho não está disponível para retomada" });
    const integridade = await ContratacaoIntegridadeService.garantirReserva(resultado.reserva.id, { renovarHold: true, origem: "retomar_carrinho" });
    return res.json({ reserva_id: resultado.reserva.id, retomado: Boolean(resultado.retomada), checkout_estado: resultado.reserva.checkout_estado, operacao: integridade, mensagem: resultado.retomada ? "Carrinho renovado e vagas operacionais confirmadas. Continue de onde parou." : "Carrinho e vagas operacionais prontos para continuar." });
  } catch (error: any) {
    console.error("[PACOTES] Erro ao retomar carrinho:", error);
    const mensagem = mensagemErroPublica(error, "Não foi possível retomar o carrinho");
    return res.status(409).json({ erro: mensagem });
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

    const pacotesComDisponibilidade = await Promise.all(lista.map(async (pacote) => {
      const capacidade = await PacoteService.obterDisponibilidadeFisica(pacote);
      const regras = regrasDoPacote(pacote);
      const fotos = await db.select({ id: fotosPacote.id, url_foto: fotosPacote.url_foto, legenda: fotosPacote.legenda, alt_text: fotosPacote.alt_text, ordem: fotosPacote.ordem, capa: fotosPacote.capa })
        .from(fotosPacote).where(eq(fotosPacote.pacote_id, pacote.id)).orderBy(fotosPacote.ordem);
      const periodos = await db.select({
        id: pacotePeriodos.id, nome: pacotePeriodos.nome, descricao: pacotePeriodos.descricao,
        data_inicio: pacotePeriodos.data_inicio, data_fim: pacotePeriodos.data_fim,
        data_embarque: pacotePeriodos.data_embarque, data_retorno: pacotePeriodos.data_retorno,
        ordem: pacotePeriodos.ordem,
      }).from(pacotePeriodos)
        .where(and(eq(pacotePeriodos.pacote_id, pacote.id), eq(pacotePeriodos.ativo, true)))
        .orderBy(pacotePeriodos.ordem, pacotePeriodos.data_inicio);
      return {
        id: pacote.id,
        nome: pacote.nome,
        descricao: pacote.descricao,
        valor_total: pacote.valor_total,
        modalidade_hospedagem: pacote.modalidade_hospedagem,
        forma_contratacao: pacote.forma_contratacao,
        configuracao_necessaria: !["onibus", "hospedagem", "onibus_hospedagem"].includes(String(pacote.forma_contratacao)),
        formas_pagamento: regras.formasPermitidas,
        boleto_parcelas_maximo: regras.boletoParcelasMaximo || null,
        disponibilidade_configurada: pacote.disponibilidade,
        disponibilidade: capacidade.disponibilidade,
        fotos,
        periodos,
      };
    }));
    res.json({ lote_id: req.params.lote_id, pacotes: pacotesComDisponibilidade });
  } catch (error) {
    console.error("[PACOTES] Erro ao listar pacotes:", error);
    res.status(500).json({ erro: "Erro ao listar pacotes" });
  }
});

// Cupom é aplicado somente no checkout, depois da escolha do pacote.
router.post("/reservas/:reserva_id/aplicar-cupom", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const codigo = String(req.body?.codigo || "").trim().toUpperCase();
    if (!codigo) return res.status(400).json({ erro: "Informe o código do cupom" });
    const reserva = (await db.select().from(reservas).where(eq(reservas.id, req.params.reserva_id)).limit(1))[0];
    if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    if (reserva.usuario_id !== req.usuario.id && !isAdminOrDev(req.usuario.tipo)) return res.status(403).json({ erro: "Acesso negado" });
    if (reserva.forma_pagamento || ["contrato_validado", "contrato_aprovado_admin", "aguardando_pagamento", "quitado"].includes(String(reserva.checkout_estado))) {
      return res.status(409).json({ erro: "O cupom só pode ser aplicado antes da validação do contrato e do pagamento" });
    }
    const lote = (await db.select({ evento_id: lotes.evento_id }).from(lotes).where(eq(lotes.id, reserva.lote_id)).limit(1))[0];
    const cupom = lote ? (await db.select().from(cupons).where(and(
      eq(cupons.codigo, codigo), eq(cupons.evento_id, lote.evento_id), eq(cupons.ativo, true),
      or(isNull(cupons.pacote_id), reserva.pacote_id ? eq(cupons.pacote_id, reserva.pacote_id) : isNull(cupons.pacote_id)),
      or(isNull(cupons.vendedor_id), reserva.vendedor_id ? eq(cupons.vendedor_id, reserva.vendedor_id) : isNull(cupons.vendedor_id)),
    )).limit(1))[0] : undefined;
    if (!cupom) return res.status(400).json({ erro: "Cupom inválido para este evento ou pacote" });
    if (cupom.validade && new Date(cupom.validade).getTime() < Date.now()) return res.status(400).json({ erro: "Cupom expirado" });
    if (cupom.uso_maximo !== null && Number(cupom.uso_atual || 0) >= Number(cupom.uso_maximo)) return res.status(400).json({ erro: "Cupom com limite de uso atingido" });
    if (reserva.cupom_id && reserva.cupom_id !== cupom.id) return res.status(409).json({ erro: "Já existe outro cupom aplicado nesta reserva" });
    const base = Number(reserva.valor_total || 0) + Number(reserva.desconto_aplicado || 0);
    if (cupom.valor_minimo !== null && base < Number(cupom.valor_minimo)) return res.status(400).json({ erro: `Este cupom exige valor mínimo de R$ ${cupom.valor_minimo}` });
    if (cupom.limite_por_cliente) {
      const usos = await db.select({ id: cuponsUtilizacoes.id }).from(cuponsUtilizacoes).where(and(eq(cuponsUtilizacoes.cupom_id, cupom.id), eq(cuponsUtilizacoes.usuario_id, reserva.usuario_id))).limit(1);
      if (usos.length >= Number(cupom.limite_por_cliente) && reserva.cupom_id !== cupom.id) return res.status(400).json({ erro: "Este cupom já atingiu o limite por cliente" });
    }
    let desconto = cupom.desconto_percentual !== null
      ? base * Number(cupom.desconto_percentual) / 100
      : Number(cupom.desconto_fixo || 0);
    desconto = Math.min(Math.max(0, desconto), base);
    await db.transaction(async (tx) => {
      const reservaBloqueada = (await tx.select({ cupom_id: reservas.cupom_id }).from(reservas).where(eq(reservas.id, reserva.id)).for("update").limit(1))[0];
      if (!reservaBloqueada) throw new Error("Reserva não encontrada");
      if (reservaBloqueada.cupom_id && reservaBloqueada.cupom_id !== cupom.id) throw new Error("Já existe outro cupom aplicado nesta reserva");
      const novaAplicacao = !reservaBloqueada.cupom_id;
      const bloqueado = (await tx.select({ id: cupons.id, ativo: cupons.ativo, uso_atual: cupons.uso_atual, uso_maximo: cupons.uso_maximo }).from(cupons).where(eq(cupons.id, cupom.id)).for("update").limit(1))[0];
      if (!bloqueado || !bloqueado.ativo || (bloqueado.uso_maximo !== null && Number(bloqueado.uso_atual || 0) >= Number(bloqueado.uso_maximo) && novaAplicacao)) throw new Error("Cupom com limite de uso atingido");
      if (novaAplicacao) {
        await tx.update(cupons).set({ uso_atual: sql`COALESCE(${cupons.uso_atual}, 0) + 1` }).where(eq(cupons.id, cupom.id));
        await tx.insert(cuponsUtilizacoes).values({ id: createId(), cupom_id: cupom.id, usuario_id: reserva.usuario_id, reserva_id: reserva.id });
      }
      await tx.update(reservas).set({ cupom_id: cupom.id, desconto_aplicado: desconto.toFixed(2), valor_total: (base - desconto).toFixed(2), valor_total_centavos: Math.round((base - desconto) * 100), atualizado_em: new Date() }).where(eq(reservas.id, reserva.id));
      await tx.insert(precosLedger).values({ id: createId(), reserva_id: reserva.id, tipo: "cupom", codigo: cupom.id, descricao: `Cupom ${cupom.codigo}`, quantidade: 1, valor_unitario_centavos: -Math.round(desconto * 100), valor_total_centavos: -Math.round(desconto * 100), criado_em: new Date(), metadados: { origem: "checkout" } });
    });
    return res.json({ codigo: cupom.codigo, desconto_cupom: desconto.toFixed(2), valor_total: (base - desconto).toFixed(2) });
  } catch (error: any) {
    console.error("[PACOTES] Erro ao aplicar cupom:", error?.message || "falha não detalhada");
    return res.status(400).json({ erro: error?.message || "Não foi possível aplicar o cupom" });
  }
});

// Períodos comerciais pertencentes ao pacote. O inventário continua no lote;
// o período é um recorte comercial persistido na reserva e no contrato.
router.get("/:pacote_id/periodos", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const periodos = await db.select().from(pacotePeriodos)
      .where(eq(pacotePeriodos.pacote_id, req.params.pacote_id))
      .orderBy(pacotePeriodos.ordem, pacotePeriodos.data_inicio);
    return res.json({ periodos });
  } catch (error) {
    console.error("[PACOTES] Erro ao listar períodos:", error);
    return res.status(500).json({ erro: "Erro ao listar períodos do pacote" });
  }
});

router.post("/:pacote_id/periodos", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const pacote = (await db.select({ id: pacotes.id, lote_id: pacotes.lote_id }).from(pacotes).where(eq(pacotes.id, req.params.pacote_id)).limit(1))[0];
    if (!pacote) return res.status(404).json({ erro: "Pacote não encontrado" });
    const nome = String(req.body?.nome || "").trim().slice(0, 255);
    if (nome.length < 2) return res.status(400).json({ erro: "Informe um nome para o período" });
    const inicio = dataPeriodo(req.body?.data_inicio, "A data inicial");
    const fim = dataPeriodo(req.body?.data_fim, "A data final");
    const embarque = dataPeriodo(req.body?.data_embarque, "A data de embarque", false);
    const retorno = dataPeriodo(req.body?.data_retorno, "A data de retorno", false);
    validarIntervaloPeriodo(inicio!, fim!, embarque, retorno);
    const existentes = await db.select({ id: pacotePeriodos.id }).from(pacotePeriodos).where(eq(pacotePeriodos.pacote_id, pacote.id));
    const criado = (await db.insert(pacotePeriodos).values({
      id: createId(), pacote_id: pacote.id, nome, descricao: String(req.body?.descricao || "").trim().slice(0, 2000) || null,
      data_inicio: inicio!, data_fim: fim!, data_embarque: embarque, data_retorno: retorno,
      ordem: Number.isInteger(Number(req.body?.ordem)) ? Number(req.body.ordem) : existentes.length,
      ativo: req.body?.ativo !== false, criado_em: new Date(), atualizado_em: new Date(),
    }).returning())[0];
    return res.status(201).json({ mensagem: "Período adicionado ao pacote", periodo: criado });
  } catch (error: any) {
    console.error("[PACOTES] Erro ao criar período:", error);
    return res.status(400).json({ erro: error?.message || "Não foi possível adicionar o período" });
  }
});

router.put("/:pacote_id/periodos/:periodo_id", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const atual = (await db.select().from(pacotePeriodos).where(and(eq(pacotePeriodos.id, req.params.periodo_id), eq(pacotePeriodos.pacote_id, req.params.pacote_id))).limit(1))[0];
    if (!atual) return res.status(404).json({ erro: "Período não encontrado" });
    const inicio = dataPeriodo(req.body?.data_inicio ?? atual.data_inicio, "A data inicial");
    const fim = dataPeriodo(req.body?.data_fim ?? atual.data_fim, "A data final");
    const embarque = dataPeriodo(req.body?.data_embarque ?? atual.data_embarque, "A data de embarque", false);
    const retorno = dataPeriodo(req.body?.data_retorno ?? atual.data_retorno, "A data de retorno", false);
    validarIntervaloPeriodo(inicio!, fim!, embarque, retorno);
    const atualizado = (await db.update(pacotePeriodos).set({
      nome: req.body?.nome !== undefined ? String(req.body.nome).trim().slice(0, 255) : undefined,
      descricao: req.body?.descricao !== undefined ? String(req.body.descricao || "").trim().slice(0, 2000) || null : undefined,
      data_inicio: inicio!, data_fim: fim!, data_embarque: embarque, data_retorno: retorno,
      ordem: req.body?.ordem !== undefined ? Number(req.body.ordem) : undefined,
      ativo: req.body?.ativo !== undefined ? Boolean(req.body.ativo) : undefined,
      atualizado_em: new Date(),
    }).where(eq(pacotePeriodos.id, atual.id)).returning())[0];
    return res.json({ mensagem: "Período atualizado", periodo: atualizado });
  } catch (error: any) {
    console.error("[PACOTES] Erro ao atualizar período:", error);
    return res.status(400).json({ erro: error?.message || "Não foi possível atualizar o período" });
  }
});

router.delete("/:pacote_id/periodos/:periodo_id", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const periodo = (await db.select().from(pacotePeriodos).where(and(eq(pacotePeriodos.id, req.params.periodo_id), eq(pacotePeriodos.pacote_id, req.params.pacote_id))).limit(1))[0];
    if (!periodo) return res.status(404).json({ erro: "Período não encontrado" });
    const historico = await db.select({ id: reservas.id }).from(reservas).where(eq(reservas.periodo_id, periodo.id)).limit(1);
    if (historico.length > 0) {
      await db.update(pacotePeriodos).set({ ativo: false, atualizado_em: new Date() }).where(eq(pacotePeriodos.id, periodo.id));
      return res.json({ modo: "arquivado", mensagem: "Período desativado para preservar reservas e contratos existentes." });
    }
    await db.delete(pacotePeriodos).where(eq(pacotePeriodos.id, periodo.id));
    return res.json({ modo: "excluido", mensagem: "Período excluído definitivamente." });
  } catch (error) {
    console.error("[PACOTES] Erro ao excluir período:", error);
    return res.status(500).json({ erro: "Não foi possível excluir o período" });
  }
});

// Galeria do pacote: metadados e upload ficam separados da galeria da excursão.
router.get("/:pacote_id/fotos", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const fotos = await db.select().from(fotosPacote)
      .where(eq(fotosPacote.pacote_id, req.params.pacote_id))
      .orderBy(fotosPacote.ordem);
    return res.json({ fotos });
  } catch (error) {
    console.error("[PACOTES] Erro ao listar fotos:", error);
    return res.status(500).json({ erro: "Erro ao listar fotos do pacote" });
  }
});

router.post("/:pacote_id/fotos", authMiddleware, requireRole("admin"), uploadFotoPacote, async (req: Request, res: Response) => {
  let arquivoGravado: string | null = null;
  try {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ erro: "Selecione uma foto para enviar" });
    const pacote = (await db.select({ id: pacotes.id }).from(pacotes).where(eq(pacotes.id, req.params.pacote_id)).limit(1))[0];
    if (!pacote) return res.status(404).json({ erro: "Pacote não encontrado" });
    const nomeOriginal = decodeURIComponent(String(req.get("x-file-name") || "foto"));
    const extensao = path.extname(nomeOriginal).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(extensao)) return res.status(415).json({ erro: "Formato não permitido. Envie JPG, PNG ou WEBP" });
    const mime = detectarFotoPacote(req.body, extensao);
    if (!mime) return res.status(415).json({ erro: "O conteúdo do arquivo não corresponde a uma imagem permitida" });
    const mimeInformado = String(req.get("x-file-mime") || "").toLowerCase();
    if (mimeInformado && mimeInformado !== mime) return res.status(415).json({ erro: "Tipo da foto inconsistente com o arquivo enviado" });
    const existentes = await db.select({ id: fotosPacote.id, ordem: fotosPacote.ordem })
      .from(fotosPacote).where(eq(fotosPacote.pacote_id, req.params.pacote_id));
    if (existentes.length >= 5) return res.status(409).json({ erro: "Cada pacote pode ter até cinco fotos. Remova uma foto para substituir." });
    const fotoId = createId();
    const legenda = decodeURIComponent(String(req.get("x-file-caption") || "")).trim().slice(0, 500);
    const textoAlternativo = decodeURIComponent(String(req.get("x-file-alt") || "")).trim().slice(0, 500);
    const urlFoto = `/api/pacotes/${encodeURIComponent(req.params.pacote_id)}/fotos/${encodeURIComponent(fotoId)}/arquivo`;
    const arquivo = caminhoFotoPacote(req.params.pacote_id, fotoId, mime);
    const base = path.resolve(process.env.STORAGE_PATH || "./uploads");
    if (!arquivo.startsWith(`${base}${path.sep}`)) return res.status(400).json({ erro: "Caminho de armazenamento inválido" });
    await fs.mkdir(path.dirname(arquivo), { recursive: true });
    await fs.writeFile(arquivo, req.body, { flag: "wx" });
    arquivoGravado = arquivo;
    const proximaOrdem = existentes.reduce((maior, foto) => Math.max(maior, Number(foto.ordem || 0)), -1) + 1;
    const criada = (await db.insert(fotosPacote).values({
      id: fotoId,
      pacote_id: req.params.pacote_id,
      url_foto: urlFoto,
      legenda: legenda || null,
      alt_text: textoAlternativo || legenda || `Foto do pacote ${req.params.pacote_id}`,
      formato: mime,
      ordem: proximaOrdem,
      capa: existentes.length === 0,
    }).returning())[0];
    return res.status(201).json({ mensagem: "Foto enviada com sucesso", foto: criada });
  } catch (error) {
    if (arquivoGravado) await fs.unlink(arquivoGravado).catch(() => undefined);
    console.error("[PACOTES] Erro ao enviar foto:", error);
    return res.status(500).json({ erro: "Erro ao enviar foto do pacote" });
  }
});

router.get("/:pacote_id/fotos/:foto_id/arquivo", async (req: Request, res: Response) => {
  try {
    const foto = (await db.select({ id: fotosPacote.id, formato: fotosPacote.formato })
      .from(fotosPacote).innerJoin(pacotes, eq(pacotes.id, fotosPacote.pacote_id))
      .where(and(eq(fotosPacote.id, req.params.foto_id), eq(fotosPacote.pacote_id, req.params.pacote_id), eq(pacotes.ativo, true))).limit(1))[0];
    if (!foto?.formato?.startsWith("image/")) return res.status(404).json({ erro: "Foto não encontrada" });
    const arquivo = caminhoFotoPacote(req.params.pacote_id, foto.id, foto.formato);
    await fs.access(arquivo);
    res.setHeader("Content-Type", foto.formato);
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    return res.sendFile(arquivo);
  } catch {
    return res.status(404).json({ erro: "Foto não encontrada" });
  }
});

router.delete("/:pacote_id/fotos/:foto_id", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const existente = (await db.select({ id: fotosPacote.id, formato: fotosPacote.formato })
      .from(fotosPacote).where(and(eq(fotosPacote.id, req.params.foto_id), eq(fotosPacote.pacote_id, req.params.pacote_id))).limit(1))[0];
    if (!existente) return res.status(404).json({ erro: "Foto não encontrada" });
    await db.delete(fotosPacote).where(eq(fotosPacote.id, existente.id));
    if (existente.formato?.startsWith("image/")) await fs.unlink(caminhoFotoPacote(req.params.pacote_id, existente.id, existente.formato)).catch(() => undefined);
    return res.json({ mensagem: "Foto removida do pacote" });
  } catch (error) {
    console.error("[PACOTES] Erro ao remover foto:", error);
    return res.status(500).json({ erro: "Erro ao remover foto do pacote" });
  }
});

// Criar pacote/modalidade (admin)
router.post("/", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { lote_id, nome, descricao, valor_total, itens_selecionados, modalidade_hospedagem, disponibilidade, contrato_modelo, ativo } = req.body;
    const modalidadesValidas = ["camping", "quarto_ventilador", "quarto_ar_condicionado"];
    const disponibilidadesValidas = ["disponivel", "ultimas_vagas", "esgotado"];
    const modelosContratoValidos = ["auto", "hospedagem", "transporte", "hospedagem_transporte"];

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
      contrato_modelo: modeloContratoPorForma(comercial.forma_contratacao),
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
    const modelosContratoValidos = ["auto", "hospedagem", "transporte", "hospedagem_transporte"];

    if (modalidade_hospedagem && !modalidadesValidas.includes(modalidade_hospedagem)) {
      return res.status(400).json({ erro: "Modalidade de hospedagem inválida" });
    }
    if (disponibilidade && !disponibilidadesValidas.includes(disponibilidade)) {
      return res.status(400).json({ erro: "Disponibilidade inválida" });
    }
    if (contrato_modelo && !modelosContratoValidos.includes(contrato_modelo)) {
      return res.status(400).json({ erro: "Modelo de contrato inválido" });
    }
    const atual = (await db.select().from(pacotes).where(eq(pacotes.id, req.params.pacote_id)).limit(1))[0];
    if (!atual) return res.status(404).json({ erro: "Pacote não encontrado" });
    const finalComercial = validarConfiguracaoComercial({
      modalidade_hospedagem: modalidade_hospedagem ?? atual.modalidade_hospedagem,
      forma_contratacao: req.body.forma_contratacao ?? atual.forma_contratacao,
      onibus_config: req.body.onibus_config ?? atual.onibus_config,
      configuracao_pagamento: req.body.configuracao_pagamento ?? atual.configuracao_pagamento,
      data_limite_pagamento: req.body.data_limite_pagamento !== undefined ? req.body.data_limite_pagamento : atual.data_limite_pagamento,
    });

    const atualizado = await db.update(pacotes).set({
      nome: nome || undefined,
      descricao: descricao !== undefined ? descricao : undefined,
      valor_total: valor_total !== undefined ? String(valor_total) : undefined,
      itens_selecionados: itens_selecionados !== undefined ? itens_selecionados : undefined,
      modalidade_hospedagem: modalidade_hospedagem || undefined,
      disponibilidade: disponibilidade || undefined,
      contrato_modelo: modeloContratoPorForma(finalComercial.forma_contratacao),
      forma_contratacao: finalComercial.forma_contratacao,
      onibus_config: finalComercial.onibus_config,
      configuracao_pagamento: finalComercial.configuracao_pagamento,
      data_limite_pagamento: finalComercial.data_limite_pagamento,
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
    if (resultado.modo === "excluido") {
      const base = path.resolve(process.env.STORAGE_PATH || "./uploads");
      const pasta = path.resolve(base, "pacotes", req.params.pacote_id);
      if (pasta.startsWith(`${base}${path.sep}`)) await fs.rm(pasta, { recursive: true, force: true }).catch(() => undefined);
    }
    return res.json(resultado);
  } catch (error: any) {
    console.error("[PACOTES] Falha ao excluir ou arquivar pacote:", error);
    if (error?.message === "Pacote não encontrado") return res.status(404).json({ erro: error.message });
    return res.status(500).json({ erro: "Não foi possível excluir ou arquivar o pacote" });
  }
});

export default router;
