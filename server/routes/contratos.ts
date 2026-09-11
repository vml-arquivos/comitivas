import { Router, Request, Response } from "express";
import { authMiddleware, isAdminOrDev } from "../middleware/authMiddleware.js";
import { ContratoService, REGRAS_CONVIVENCIA_OFICIAIS, REGRAS_CONVIVENCIA_VERSION } from "../services/contratoService.js";
import { ConfiguracaoService } from "../services/configuracaoService.js";
import { db } from "../db/index.js";
import { eventos, lotes, pacotes, reservas, usuarios, pagamentos, contratosDocumentos, contratoValidacoes } from "../db/schema.js";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import fs from "fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { generateBrandedPdfBuffer } from "../../packages/contract-engine/brandedPdfLayout.js";
import { OtpService } from "../services/otpService.js";
import { cadastroAprovadoComEvidencia, camposFaltantesCadastroMinimo } from "../security/governance.js";

const router = Router();

async function podeAcessarReserva(req: Request, reserva: { usuario_id: string; vendedor_id: string | null }, somenteCliente = false): Promise<boolean> {
  if (!req.usuario) return false;
  if (req.usuario.tipo !== "dev") {
    const alvo = (await db.select({ tipo: usuarios.tipo }).from(usuarios).where(eq(usuarios.id, reserva.usuario_id)).limit(1))[0];
    if (!alvo || alvo.tipo === "dev") return false;
  }
  if (isAdminOrDev(req.usuario.tipo)) return true;
  if (reserva.usuario_id === req.usuario.id) return true;
  return !somenteCliente && req.usuario.tipo === "vendedor" && reserva.vendedor_id === req.usuario.id;
}

function escaparHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatarData(valor: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(valor);
}

function formatarDataHora(valor: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(valor);
}

async function cadastroAprovado(reservaId: string): Promise<boolean> {
  const registro = (await db.select({ ativo: usuarios.ativo, cadastro_status: usuarios.cadastro_status, aprovado_em: usuarios.aprovado_em, aprovado_por: usuarios.aprovado_por }).from(reservas).innerJoin(usuarios, eq(reservas.usuario_id, usuarios.id)).where(eq(reservas.id, reservaId)).limit(1))[0];
  return cadastroAprovadoComEvidencia(registro);
}

async function emailConfirmado(reservaId: string): Promise<boolean> {
  const registro = (await db.select({ email_confirmado: usuarios.email_confirmado })
    .from(reservas)
    .innerJoin(usuarios, eq(reservas.usuario_id, usuarios.id))
    .where(eq(reservas.id, reservaId))
    .limit(1))[0];
  return registro?.email_confirmado === true;
}

async function camposCadastroFaltantes(reservaId: string): Promise<string[]> {
  const registro = (await db.select({ nome: usuarios.nome, email: usuarios.email, cpf: usuarios.cpf, telefone: usuarios.telefone, data_nascimento: usuarios.data_nascimento, endereco: usuarios.endereco })
    .from(reservas)
    .innerJoin(usuarios, eq(reservas.usuario_id, usuarios.id))
    .where(eq(reservas.id, reservaId))
    .limit(1))[0];
  return camposFaltantesCadastroMinimo(registro);
}

async function lerArquivoContrato(caminhos: Array<string | null | undefined>): Promise<Buffer | null> {
  const base = path.resolve(process.env.STORAGE_PATH || "./uploads");
  const candidatos = new Set<string>();

  for (const caminhoInformado of caminhos) {
    if (!caminhoInformado) continue;
    const resolvido = path.resolve(caminhoInformado);
    if (resolvido.startsWith(`${base}${path.sep}`)) candidatos.add(resolvido);
    // Instalações antigas podem ter persistido o caminho absoluto do contêiner
    // anterior. Preservamos também o caminho relativo abaixo do diretório de
    // uploads, sem aceitar travessia para fora do storage atual.
    const normalizado = caminhoInformado.replace(/\\/g, "/");
    for (const marcador of ["/uploads/", "/storage/"]) {
      const indice = normalizado.lastIndexOf(marcador);
      if (indice >= 0) candidatos.add(path.resolve(base, normalizado.slice(indice + marcador.length)));
    }
    candidatos.add(path.join(base, path.basename(caminhoInformado)));
  }

  for (const candidato of candidatos) {
    if (!candidato.startsWith(`${base}${path.sep}`)) continue;
    try {
      return await fs.readFile(candidato);
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return null;
}

function regrasDoPacote(pacote: typeof pacotes.$inferSelect | undefined) {
  const configuracao = pacote?.configuracao_pagamento && typeof pacote.configuracao_pagamento === "object"
    ? pacote.configuracao_pagamento as Record<string, unknown>
    : {};
  const formasPermitidas = Array.isArray(configuracao.formas_permitidas)
    ? configuracao.formas_permitidas.map(String).filter((forma) => ["pix", "boleto", "credito"].includes(forma))
    : ["pix", "boleto"];
  const limiteConfigurado = Number(configuracao.boleto_parcelas_maximo);
  const limiteCredito = Number(configuracao.credito_parcelas_maximo);
  return {
    formasPermitidas: formasPermitidas.length ? formasPermitidas : ["pix", "boleto"],
    boletoParcelasMaximo: Number.isInteger(limiteConfigurado) && limiteConfigurado > 0 ? limiteConfigurado : undefined,
    creditoParcelasMaximo: Number.isInteger(limiteCredito) && limiteCredito > 0 ? limiteCredito : undefined,
    creditoTaxaPercentual: Number(configuracao.credito_taxa_percentual) || 0,
    creditoJurosMensalPercentual: Number(configuracao.credito_juros_mensal_percentual) || 0,
    prazoSegurancaDias: Number.isInteger(Number(configuracao.prazo_seguranca_dias)) ? Math.max(0, Number(configuracao.prazo_seguranca_dias)) : 0,
    dataLimitePagamento: pacote?.data_limite_pagamento,
  };
}

// Preparar a versão contratual que será exibida e validada pelo cliente.
router.post("/preparar/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const reserva = (await db.select().from(reservas).where(eq(reservas.id, req.params.reserva_id)).limit(1))[0];
    if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    if (!(await podeAcessarReserva(req, reserva))) return res.status(403).json({ erro: "Acesso negado" });
    if (!(await emailConfirmado(reserva.id))) return res.status(409).json({ erro: "Confirme o e-mail do cliente antes de preparar o contrato" });
    if (!(await cadastroAprovado(reserva.id))) return res.status(409).json({ erro: "O cadastro do cliente precisa ser aprovado antes de preparar o contrato" });
    const faltantes = await camposCadastroFaltantes(reserva.id);
    if (faltantes.length) return res.status(409).json({ erro: `Complete os dados essenciais antes do contrato: ${faltantes.join(", ")}` });
    const documento = await ContratoService.prepararContrato(req.params.reserva_id);
    return res.json({ documento });
  } catch (error: any) {
    console.error("[CONTRATOS] Erro ao preparar:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível preparar o contrato" });
  }
});

router.get("/regras-convivencia", (_req: Request, res: Response) => {
  res.json({ versao: REGRAS_CONVIVENCIA_VERSION, titulo: "Regras de Convivência — Excursão das Comitivas", conteudo: REGRAS_CONVIVENCIA_OFICIAIS });
});

router.post("/otp/solicitar/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    if (!(await emailConfirmado(req.params.reserva_id))) return res.status(409).json({ erro: "Confirme seu e-mail antes da validação contratual" });
    if (!(await cadastroAprovado(req.params.reserva_id))) return res.status(409).json({ erro: "O cadastro do cliente precisa ser aprovado antes da validação contratual" });
    const resultado = await OtpService.solicitar({ usuario_id: req.usuario.id, reserva_id: req.params.reserva_id, contrato_id: req.body?.contrato_id, canal: req.body?.canal });
    if (!resultado.enviado) return res.status(503).json({ erro: resultado.motivo || "Canal de validação não configurado", ...resultado });
    return res.json(resultado);
  } catch (error: any) {
    console.error("[CONTRATOS] Erro ao solicitar OTP:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível enviar o código" });
  }
});

router.post("/otp/confirmar/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    if (!(await emailConfirmado(req.params.reserva_id))) return res.status(409).json({ erro: "Confirme seu e-mail antes da validação contratual" });
    if (!(await cadastroAprovado(req.params.reserva_id))) return res.status(409).json({ erro: "O cadastro do cliente precisa ser aprovado antes da validação contratual" });
    const resultado = await OtpService.confirmar({
      usuario_id: req.usuario.id,
      reserva_id: req.params.reserva_id,
      codigo: req.body?.codigo,
      aceite_contrato: req.body?.aceite_contrato === true,
      aceite_regras: req.body?.aceite_regras === true,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get("user-agent"),
      idioma: req.body?.idioma || req.get("accept-language")?.split(",")[0],
      timezone: req.body?.timezone,
      geolocalizacao: req.body?.geolocalizacao,
    });
    return res.json({ mensagem: "Contrato validado com sucesso", ...resultado });
  } catch (error: any) {
    console.error("[CONTRATOS] Erro ao confirmar OTP:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível validar o contrato" });
  }
});

router.get("/estado/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const reserva = (await db.select().from(reservas).where(eq(reservas.id, req.params.reserva_id)).limit(1))[0];
    if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    if (!(await podeAcessarReserva(req, reserva))) return res.status(403).json({ erro: "Acesso negado" });
    const documento = (await db.select({ id: contratosDocumentos.id, versao: contratosDocumentos.versao, status: contratosDocumentos.status, snapshot_sha256: contratosDocumentos.snapshot_sha256, pdf_sha256: contratosDocumentos.pdf_sha256, pdf_disponivel: sql<boolean>`${contratosDocumentos.arquivo} IS NOT NULL` }).from(contratosDocumentos).where(eq(contratosDocumentos.reserva_id, reserva.id)).orderBy(desc(contratosDocumentos.versao)).limit(1))[0] || null;
    const pagamento = (await db.select().from(pagamentos).where(eq(pagamentos.reserva_id, reserva.id)).orderBy(desc(pagamentos.criado_em)).limit(1))[0] || null;
    const checkoutEstado = reserva.checkout_estado || (reserva.status === "cliente_confirmado" ? "primeira_parcela_confirmada" : reserva.status === "aguardando_pagamento" ? "aguardando_pagamento" : reserva.status === "contrato_gerado" ? "contrato_validado" : reserva.status);
    return res.json({ reserva_id: reserva.id, status: reserva.status, checkout_estado: checkoutEstado, contrato: documento, pagamento: pagamento ? { id: pagamento.id, status: pagamento.status, gateway_id: pagamento.gateway_id, valor: pagamento.valor, valor_pago_centavos: pagamento.valor_pago_centavos, resposta: pagamento.gateway_resposta } : null });
  } catch (error) {
    console.error("[CONTRATOS] Erro ao consultar estado:", error);
    return res.status(500).json({ erro: "Erro ao consultar estado do checkout" });
  }
});

router.get("/validacao/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const reserva = (await db.select().from(reservas).where(eq(reservas.id, req.params.reserva_id)).limit(1))[0];
    if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    if (!(await podeAcessarReserva(req, reserva))) return res.status(403).json({ erro: "Acesso negado" });
    const validacao = (await db.select().from(contratoValidacoes).where(eq(contratoValidacoes.reserva_id, req.params.reserva_id)).orderBy(desc(contratoValidacoes.confirmado_em)).limit(1))[0];
    if (!validacao) return res.status(404).json({ erro: "Validação ainda não registrada" });
    return res.json({ validacao });
  } catch (error) {
    console.error("[CONTRATOS] Erro ao consultar validação:", error);
    return res.status(500).json({ erro: "Erro ao consultar validação" });
  }
});

// Compatibilidade: o endpoint antigo agora apenas prepara uma versão aguardando validação OTP.
router.post("/aceitar/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({ erro: "Não autenticado" });
    }

    const { reserva_id } = req.params;

    // Buscar reserva
    const reservaResult = await db
      .select()
      .from(reservas)
      .where(eq(reservas.id, reserva_id))
      .limit(1);

    if (reservaResult.length === 0) {
      return res.status(404).json({ erro: "Reserva não encontrada" });
    }

    const reserva = reservaResult[0];

    // Verificar se é do usuário
    if (reserva.usuario_id !== req.usuario.id) {
      return res.status(403).json({ erro: "Acesso negado" });
    }
    if (!(await emailConfirmado(reserva.id))) return res.status(409).json({ erro: "Confirme seu e-mail antes de aceitar o contrato" });
    if (!(await cadastroAprovado(reserva.id))) return res.status(409).json({ erro: "O cadastro do cliente precisa ser aprovado antes de aceitar o contrato" });
    const faltantes = await camposCadastroFaltantes(reserva.id);
    if (faltantes.length) return res.status(409).json({ erro: `Complete os dados essenciais antes do contrato: ${faltantes.join(", ")}` });

    // Verificar status
    if (reserva.status !== "pacote_montado" && reserva.status !== "checkout_iniciado") {
      return res.status(400).json({ erro: "Reserva não pode aceitar contrato neste status" });
    }

    // O contrato deve registrar a condição selecionada no checkout antes de ser
    // gerado. Não inferimos a modalidade, pois isso poderia produzir um PDF com
    // forma de pagamento diferente daquela aceita pelo cliente.
    const metodoPagamento = req.body?.metodo_pagamento ?? reserva.forma_pagamento;
    const quantidadeParcelas = req.body?.quantidade_parcelas ?? reserva.quantidade_parcelas;
    if (!metodoPagamento) {
      return res.status(400).json({ erro: "Selecione a forma de pagamento antes de aceitar o contrato" });
    }
    if (!["pix", "boleto"].includes(String(metodoPagamento))) {
      return res.status(400).json({ erro: "O checkout Cora oferece somente PIX e boleto" });
    }

    let condicaoPagamento;
    try {
      const loteResult = await db
        .select({ data_embarque: lotes.data_embarque, data_inicio: lotes.data_inicio })
        .from(lotes)
        .where(eq(lotes.id, reserva.lote_id))
        .limit(1);
      const pacote = reserva.pacote_id
        ? (await db.select().from(pacotes).where(eq(pacotes.id, reserva.pacote_id)).limit(1))[0]
        : undefined;
      const regrasPacote = regrasDoPacote(pacote);
      if (!regrasPacote.formasPermitidas.includes(String(metodoPagamento))) {
        throw new Error("A forma de pagamento não está disponível para este pacote");
      }
      const dataViagem = loteResult[0]?.data_embarque || loteResult[0]?.data_inicio;
      const dataLimitePagamento = ContratoService.calcularDataLimiteEfetiva(regrasPacote.dataLimitePagamento, dataViagem, regrasPacote.prazoSegurancaDias);
      const configPagamento = await ConfiguracaoService.obterConfiguracoesPagamento();
      const parcelasPorData = ContratoService.calcularParcelasMaximasBoleto(
        dataLimitePagamento,
        new Date(),
        configPagamento.boleto_meses_maximo_antecedencia,
      );
      const parcelasMaximasBoleto = Math.min(parcelasPorData, regrasPacote.boletoParcelasMaximo || parcelasPorData);
      const parcelasMaximasCredito = Math.min(parcelasPorData, regrasPacote.creditoParcelasMaximo || configPagamento.credito_parcelas_maximo, configPagamento.credito_parcelas_maximo);

      // O valor_total persistido já pode conter o desconto da condição anterior.
      // Reconstituímos a base somando apenas o desconto financeiro anterior para
      // impedir que uma retomada aplique o desconto PIX cumulativamente.
      const valorBaseSemDescontoPagamento = Number(reserva.valor_total) + Number(reserva.desconto_pagamento || 0);
      condicaoPagamento = ContratoService.calcularCondicaoPagamento(
        valorBaseSemDescontoPagamento.toFixed(2),
        metodoPagamento,
        quantidadeParcelas,
        parcelasMaximasBoleto,
        {
          percentualDescontoPix: configPagamento.pix_desconto_percentual,
          parcelasMaximasCredito,
          percentualTaxaCredito: regrasPacote.creditoTaxaPercentual,
          percentualJurosMensalCredito: regrasPacote.creditoJurosMensalPercentual,
        },
      );
    } catch (error: any) {
      return res.status(400).json({ erro: error.message || "Condição de pagamento inválida" });
    }

    await db
      .update(reservas)
      .set({
        forma_pagamento: condicaoPagamento.forma_pagamento,
        quantidade_parcelas: condicaoPagamento.quantidade_parcelas,
        valor_parcela: condicaoPagamento.valor_parcela,
        desconto_pagamento: condicaoPagamento.desconto_pagamento,
        valor_total: condicaoPagamento.valor_total,
        valor_total_centavos: Math.round(Number(condicaoPagamento.valor_total) * 100),
        checkout_estado: "contrato_preparado",
        atualizado_em: new Date(),
      })
      .where(eq(reservas.id, reserva_id));

    const documento = await ContratoService.prepararContrato(reserva_id, undefined, condicaoPagamento);
    res.json({
      mensagem: "Contrato preparado e aguardando validação eletrônica",
      reserva_id,
      status: "aguardando_validacao",
      documento,
      condicao_pagamento: condicaoPagamento,
    });
  } catch (error: any) {
    console.error("[CONTRATOS] Erro ao aceitar:", error);
    res.status(500).json({ erro: error.message || "Erro ao aceitar contrato" });
  }
});

// Baixar contrato
router.get("/download/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({ erro: "Não autenticado" });
    }

    const { reserva_id } = req.params;

    // Buscar reserva
    const reservaResult = await db
      .select()
      .from(reservas)
      .where(eq(reservas.id, reserva_id))
      .limit(1);

    if (reservaResult.length === 0) {
      return res.status(404).json({ erro: "Reserva não encontrada" });
    }

    const reserva = reservaResult[0];

    if (!(await podeAcessarReserva(req, reserva))) {
      return res.status(403).json({ erro: "Acesso negado" });
    }

    const contratoId = String(req.query.contrato_id || "").trim();
    const condicaoDocumento = contratoId
      ? and(eq(contratosDocumentos.reserva_id, reserva_id), eq(contratosDocumentos.id, contratoId), ne(contratosDocumentos.status, "invalidado"))
      : and(eq(contratosDocumentos.reserva_id, reserva_id), ne(contratosDocumentos.status, "invalidado"));
    const documento = (await db.select({ id: contratosDocumentos.id, arquivo: contratosDocumentos.arquivo, pdf_sha256: contratosDocumentos.pdf_sha256, versao: contratosDocumentos.versao })
      .from(contratosDocumentos)
      .where(condicaoDocumento)
      .orderBy(desc(contratosDocumentos.versao))
      .limit(1))[0];

    if (contratoId && !documento) return res.status(404).json({ erro: "Versão contratual não encontrada" });
    if (documento && !documento.arquivo) return res.status(404).json({ erro: "O PDF da versão vigente ainda não está disponível" });
    if (!documento && !reserva.contrato_pdf_url) {
      return res.status(404).json({ erro: "Contrato não disponível" });
    }

    const pdfBuffer = await lerArquivoContrato(documento ? [documento.arquivo] : [reserva.contrato_pdf_url]);
    if (!pdfBuffer) return res.status(404).json({ erro: "Arquivo do contrato não encontrado. O registro e o histórico foram preservados." });
    if (documento?.pdf_sha256 && createHash("sha256").update(pdfBuffer).digest("hex") !== documento.pdf_sha256) {
      return res.status(409).json({ erro: "O arquivo do contrato não corresponde à versão validada. Nenhuma regeneração foi realizada." });
    }

    // Enviar arquivo
    res.setHeader("Content-Type", "application/pdf");
    const disposicao = req.query.inline === "1" ? "inline" : "attachment";
    res.setHeader(
      "Content-Disposition",
      `${disposicao}; filename="contrato-${reserva_id}${documento ? `-v${documento.versao}` : ""}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error("[CONTRATOS] Erro ao baixar:", error);
    res.status(500).json({ erro: "Erro ao baixar contrato" });
  }
});

router.get("/evidencias/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const reserva = (await db.select({ id: reservas.id, usuario_id: reservas.usuario_id, vendedor_id: reservas.vendedor_id }).from(reservas).where(eq(reservas.id, req.params.reserva_id)).limit(1))[0];
    if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    if (!(await podeAcessarReserva(req, reserva))) return res.status(403).json({ erro: "Acesso negado" });
    const validacao = (await db.select().from(contratoValidacoes).where(eq(contratoValidacoes.reserva_id, reserva.id)).orderBy(desc(contratoValidacoes.confirmado_em)).limit(1))[0];
    if (!validacao) return res.status(404).json({ erro: "Relatório de evidências não disponível" });
    return res.json({ protocolo: validacao.protocolo, contrato_id: validacao.contrato_id, reserva_id: validacao.reserva_id, versao: validacao.versao, snapshot_sha256: validacao.snapshot_sha256, pdf_sha256: validacao.pdf_sha256, aceite_contrato: validacao.aceite_contrato, aceite_regras: validacao.aceite_regras, aceite_contrato_texto: validacao.aceite_contrato_texto, aceite_regras_texto: validacao.aceite_regras_texto, regras_versao: validacao.regras_versao, aviso_privacidade_versao: validacao.aviso_privacidade_versao, canal: validacao.canal, destinatario_mascarado: validacao.destinatario_mascarado, confirmado_em: validacao.confirmado_em, servidor_utc: validacao.servidor_utc, navegador: validacao.navegador, sistema_operacional: validacao.sistema_operacional, idioma: validacao.idioma, timezone: validacao.timezone, geolocalizacao_consentida: validacao.geolocalizacao_consentida });
  } catch (error) {
    console.error("[CONTRATOS] Erro ao baixar evidências:", error);
    return res.status(500).json({ erro: "Erro ao consultar evidências" });
  }
});

// Voucher de embarque: emitido somente após a confirmação real do pagamento.
router.get("/voucher/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });

    const dados = await db.select({
      reserva_id: reservas.id,
      usuario_id: reservas.usuario_id,
      status: reservas.status,
      valor_total: reservas.valor_total,
      passageiro: usuarios.nome,
      cpf: usuarios.cpf,
      telefone: usuarios.telefone,
      evento: eventos.nome,
      local: eventos.local,
      data_inicio: lotes.data_inicio,
      data_fim: lotes.data_fim,
      data_embarque: lotes.data_embarque,
      data_retorno: lotes.data_retorno,
      local_embarque: lotes.local_embarque,
      lote: lotes.nome,
      pacote: pacotes.nome,
      modalidade: pacotes.modalidade_hospedagem,
    })
      .from(reservas)
      .innerJoin(usuarios, eq(reservas.usuario_id, usuarios.id))
      .innerJoin(lotes, eq(reservas.lote_id, lotes.id))
      .innerJoin(eventos, eq(lotes.evento_id, eventos.id))
      .leftJoin(pacotes, eq(reservas.pacote_id, pacotes.id))
      .where(eq(reservas.id, req.params.reserva_id))
      .limit(1);

    const voucher = dados[0];
    if (!voucher) return res.status(404).json({ erro: "Reserva não encontrada" });
    if (!(await podeAcessarReserva(req, { usuario_id: voucher.usuario_id, vendedor_id: null }, true))) {
      return res.status(403).json({ erro: "Acesso negado" });
    }
    if (voucher.status !== "cliente_confirmado") {
      return res.status(409).json({ erro: "O voucher será liberado após a confirmação do pagamento" });
    }
    const pagamentoQuitado = (await db.select({ status_reconciliado: pagamentos.status_reconciliado, valor_pago_centavos: pagamentos.valor_pago_centavos, valor_centavos: pagamentos.valor_centavos })
      .from(pagamentos)
      .where(eq(pagamentos.reserva_id, voucher.reserva_id))
      .orderBy(desc(pagamentos.atualizado_em))
      .limit(1))[0];
    const validacaoContrato = (await db.select({ id: contratoValidacoes.id, aceite_contrato: contratoValidacoes.aceite_contrato, aceite_regras: contratoValidacoes.aceite_regras })
      .from(contratoValidacoes)
      .where(eq(contratoValidacoes.reserva_id, voucher.reserva_id))
      .orderBy(desc(contratoValidacoes.confirmado_em))
      .limit(1))[0];
    if (!validacaoContrato?.aceite_contrato || !validacaoContrato.aceite_regras) {
      return res.status(409).json({ erro: "O voucher será liberado após a validação eletrônica do contrato" });
    }
    if (pagamentoQuitado?.status_reconciliado !== "quitado" || Number(pagamentoQuitado.valor_pago_centavos || 0) < Number(pagamentoQuitado.valor_centavos || 0)) {
      return res.status(409).json({ erro: "O voucher será liberado após a quitação integral do pagamento" });
    }

    const modalidades: Record<string, string> = {
      camping: "Camping",
      quarto_ventilador: "Quarto com ventilador",
      quarto_ar_condicionado: "Quarto com ar-condicionado",
    };
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #1f2937; }
    .voucher { border: 2px solid #991b1b; border-radius: 18px; overflow: hidden; }
    .topo { padding: 22px 26px; background: #7f1d1d; color: white; }
    .topo p { margin: 0 0 5px; font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
    .topo h1 { margin: 0; font-size: 28px; }
    .conteudo { padding: 26px; }
    .confirmado { display: inline-block; border-radius: 999px; padding: 7px 12px; background: #dcfce7; color: #166534; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .evento { margin: 18px 0 22px; font-size: 24px; color: #7f1d1d; }
    dl { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 24px; margin: 0; }
    dt { margin-bottom: 4px; color: #6b7280; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    dd { margin: 0; font-size: 14px; font-weight: 700; }
    .codigo { margin-top: 24px; border-top: 1px dashed #d1d5db; padding-top: 18px; text-align: center; }
    .codigo strong { display: block; margin-top: 5px; font-family: monospace; font-size: 18px; letter-spacing: .08em; }
    .aviso { margin: 20px 0 0; border-radius: 10px; background: #fff7ed; padding: 12px; color: #7c2d12; font-size: 11px; line-height: 1.5; }
  </style>
</head>
<body>
  <section class="voucher">
    <header class="topo"><p>Documento de embarque</p><h1>Voucher confirmado</h1></header>
    <div class="conteudo">
      <span class="confirmado">Pagamento confirmado</span>
      <h2 class="evento">${escaparHtml(voucher.evento)}</h2>
      <dl>
        <div><dt>Passageiro</dt><dd>${escaparHtml(voucher.passageiro)}</dd></div>
        <div><dt>CPF</dt><dd>${escaparHtml(voucher.cpf || "Não informado")}</dd></div>
        <div><dt>Período</dt><dd>${formatarData(voucher.data_inicio)} a ${formatarData(voucher.data_fim)}</dd></div>
        <div><dt>Destino / local</dt><dd>${escaparHtml(voucher.local)}</dd></div>
        <div><dt>Lote</dt><dd>${escaparHtml(voucher.lote)}</dd></div>
        <div><dt>Hospedagem</dt><dd>${escaparHtml(modalidades[voucher.modalidade || ""] || voucher.pacote || "Conforme contrato")}</dd></div>
        <div><dt>Embarque</dt><dd>${voucher.data_embarque ? formatarDataHora(voucher.data_embarque) : "A confirmar"} · ${escaparHtml(voucher.local_embarque || "Local comunicado pela organização")}</dd></div>
        <div><dt>Retorno</dt><dd>${voucher.data_retorno ? formatarDataHora(voucher.data_retorno) : "A confirmar"}</dd></div>
      </dl>
      <div class="codigo"><span>Código da reserva</span><strong>${escaparHtml(voucher.reserva_id)}</strong></div>
      <p class="aviso">Apresente este voucher e um documento oficial com foto no embarque. Horários e ponto de encontro são comunicados pela equipe responsável.</p>
    </div>
  </section>
</body>
</html>`;

    const pdf = await generateBrandedPdfBuffer(html, { brand: "comitiva" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="voucher-${voucher.reserva_id}.pdf"`);
    res.send(pdf);
  } catch (error: any) {
    console.error("[CONTRATOS] Erro ao gerar voucher:", error);
    res.status(500).json({ erro: "Erro ao gerar voucher" });
  }
});

// Visualizar contrato (HTML)
router.get("/visualizar/:reserva_id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({ erro: "Não autenticado" });
    }

    const { reserva_id } = req.params;

    // Buscar reserva
    const reservaResult = await db
      .select()
      .from(reservas)
      .where(eq(reservas.id, reserva_id))
      .limit(1);

    if (reservaResult.length === 0) {
      return res.status(404).json({ erro: "Reserva não encontrada" });
    }

    const reserva = reservaResult[0];

    // Verificar se é do usuário ou admin
    if (!(await podeAcessarReserva(req, reserva))) {
      return res.status(403).json({ erro: "Acesso negado" });
    }

    // Gerar HTML do contrato
    const documento = (await db.select().from(contratosDocumentos).where(eq(contratosDocumentos.reserva_id, reserva_id)).orderBy(desc(contratosDocumentos.versao)).limit(1))[0];
    if (!documento || documento.status === "invalidado") return res.status(404).json({ erro: "Versão contratual não disponível" });
    await ContratoService.marcarVisualizacao(documento.id, reserva_id, req.usuario.id, req.ip || req.socket.remoteAddress, req.get("user-agent"));
    const html = await ContratoService.gerarContratoHTML({ reserva_id, contrato_id: documento.id, snapshot: documento.snapshot as any, aceite_ip: reserva.aceite_ip || "desconhecido" });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error: any) {
    console.error("[CONTRATOS] Erro ao visualizar:", error);
    res.status(500).json({ erro: "Erro ao visualizar contrato" });
  }
});

export default router;
