import { Router, Request, Response } from "express";
import { authMiddleware, requireRole } from "../middleware/authMiddleware.js";
import { RelatorioService } from "../services/relatorioService.js";
import { EmailService } from "../services/emailService.js";
import { AuthService } from "../services/authService.js";
import { ContratoService } from "../services/contratoService.js";
import { ConfiguracaoService } from "../services/configuracaoService.js";
import { PacoteService, ConfiguracaoPacote } from "../services/pacoteService.js";
import { db } from "../db/index.js";
import { reservas, eventos, lotes, pacotes, usuarios, leads_origem, descontosAdministrativos, pagamentos, contratosDocumentos, videosEvento, fotos_evento, comissaoRegras, comissoes } from "../db/schema.js";
import { eq, and, inArray, or, sql, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import Decimal from "decimal.js";

const router = Router();

function somenteDigitos(valor: unknown): string {
  return String(valor ?? "").replace(/\D/g, "");
}

function cpfValido(cpf: string): boolean {
  if (!cpf) return true; // CPF é opcional para vendedor/admin cadastrados internamente
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcularDigito = (tamanho: number) => {
    let soma = 0;
    for (let indice = 0; indice < tamanho; indice += 1) {
      soma += Number(cpf[indice]) * (tamanho + 1 - indice);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return calcularDigito(9) === Number(cpf[9]) && calcularDigito(10) === Number(cpf[10]);
}

function erroDeUnicidade(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505");
}

function extrairYoutubeId(url: unknown): string | null {
  const valor = String(url || "").trim();
  const match = valor.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
  return match?.[1] || (/^[A-Za-z0-9_-]{11}$/.test(valor) ? valor : null);
}

function gerarSenhaTemporaria(): string {
  // Senha temporária forte o suficiente para satisfazer a política de senha
  // (mín. 8 caracteres). O admin deve orientar o usuário a trocá-la no
  // primeiro acesso; não há fluxo de "esqueci minha senha" para isso ainda.
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

// Aplicar middleware de admin em todas as rotas
router.use(authMiddleware);

// Dashboard - resumo geral
router.get("/dashboard", requireRole("admin", "vendedor"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });

    // Total de eventos
    const totalEventos = await db.select().from(eventos);

    // Admin vê a operação inteira. Vendedor vê apenas contatos atribuídos a
    // ele e as reservas desses clientes, evitando exposição entre carteiras.
    const totalLeads = req.usuario.tipo === "admin"
      ? await db.select().from(leads_origem)
      : await db.select().from(leads_origem)
        .where(eq(leads_origem.vendedor_id, req.usuario.id));
    const clienteIds = Array.from(new Set(
      totalLeads.flatMap((lead) => lead.usuario_id ? [lead.usuario_id] : []),
    ));

    const totalClientes = req.usuario.tipo === "admin"
      ? await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.tipo, "cliente"))
      : clienteIds.map((id) => ({ id }));
    const totalReservas = req.usuario.tipo === "admin"
      ? await db.select().from(reservas)
      : clienteIds.length > 0
        ? await db.select().from(reservas).where(inArray(reservas.usuario_id, clienteIds))
        : [];
    const reservasConfirmadas = totalReservas.filter((reserva) => reserva.status === "cliente_confirmado");
    const reservasPendentes = totalReservas.filter((reserva) => reserva.status === "aguardando_pagamento");
    const contratosGerados = totalReservas.filter((reserva) => Boolean(reserva.contrato_pdf_url));
    const clientesComReserva = new Set(totalReservas.map((reserva) => reserva.usuario_id));
    const cadastrosSemReserva = totalClientes.filter((cliente) => !clientesComReserva.has(cliente.id)).length;
    const leadsNovos = totalLeads.filter((l) => l.status === "novo").length;
    const leadsCadastrados = totalLeads.filter((l) => l.status === "cadastrado").length;

    res.json({
      resumo: {
        total_eventos: totalEventos.length,
        total_clientes: totalClientes.length,
        total_leads_crm: totalLeads.length,
        total_leads: totalLeads.length,
        leads_novos: leadsNovos,
        leads_cadastrados: leadsCadastrados,
        cadastros_sem_reserva: cadastrosSemReserva,
        total_reservas: totalReservas.length,
        reservas_confirmadas: reservasConfirmadas.length,
        reservas_pendentes: reservasPendentes.length,
        contratos_gerados: contratosGerados.length,
        taxa_conversao: totalReservas.length > 0
          ? ((reservasConfirmadas.length / totalReservas.length) * 100).toFixed(2)
          : 0,
      },
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro no dashboard:", error);
    res.status(500).json({ erro: "Erro ao carregar dashboard" });
  }
});

// Vendedores podem consultar reservas atribuídas e operar somente o módulo
// interno de vendas. As demais operações administrativas continuam exclusivas
// do administrador.
router.use((req: Request, res: Response, next) => {
  if (req.usuario?.tipo === "vendedor" && (
    (req.method === "GET" && req.path === "/reservas") ||
    req.path.startsWith("/vendas") ||
    req.path.startsWith("/contratos")
  )) return next();
  return requireRole("admin")(req, res, next);
});

function clientePodeSerOperado(req: Request, usuarioId: string): boolean {
  return Boolean(req.usuario && usuarioId && req.usuario.tipo !== "cliente");
}

async function resolverOrigemVenda(req: Request, usuarioId: string, vendedorSolicitado?: string, leadSolicitado?: string) {
  if (!req.usuario || !clientePodeSerOperado(req, usuarioId)) throw new Error("Cliente inválido para venda interna");

  const vendedorId = req.usuario.tipo === "vendedor" ? req.usuario.id : (vendedorSolicitado || undefined);
  if (vendedorId) {
    const vendedor = (await db.select({ id: usuarios.id, tipo: usuarios.tipo }).from(usuarios).where(eq(usuarios.id, vendedorId)).limit(1))[0];
    if (!vendedor || vendedor.tipo !== "vendedor") throw new Error("Vendedor inválido");
  }

  const condicoes = [eq(leads_origem.usuario_id, usuarioId)];
  if (leadSolicitado) condicoes.push(eq(leads_origem.id, leadSolicitado));
  if (vendedorId) condicoes.push(eq(leads_origem.vendedor_id, vendedorId));
  const lead = (await db.select({ id: leads_origem.id, vendedor_id: leads_origem.vendedor_id, codigo_origem: leads_origem.codigo_origem })
    .from(leads_origem)
    .where(and(...condicoes))
    .orderBy(desc(leads_origem.atualizado_em))
    .limit(1))[0];

  if (req.usuario.tipo === "vendedor" && !lead) throw new Error("O cliente não pertence à sua carteira comercial");
  return {
    lead_id: lead?.id,
    vendedor_id: lead?.vendedor_id || vendedorId,
    codigo_origem: lead?.codigo_origem || (vendedorId ? `interno-${vendedorId}` : undefined),
  };
}

function vendedorPodeOperarReserva(req: Request, reserva: { usuario_id: string; vendedor_id: string | null }): boolean {
  return Boolean(req.usuario && (req.usuario.tipo === "admin" || reserva.usuario_id === req.usuario.id || (req.usuario.tipo === "vendedor" && reserva.vendedor_id === req.usuario.id)));
}

router.get("/vendas/clientes", async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const busca = String(req.query.busca || "").trim();
    const pagina = Math.max(1, Number(req.query.pagina || 1));
    const limite = Math.min(50, Math.max(1, Number(req.query.limite || 20)));
    const condicoes = [eq(usuarios.tipo, "cliente" as const), eq(usuarios.ativo, true)];

    if (req.usuario.tipo === "vendedor") {
      const leads = await db.select({ usuario_id: leads_origem.usuario_id }).from(leads_origem).where(and(eq(leads_origem.vendedor_id, req.usuario.id), sql`${leads_origem.usuario_id} IS NOT NULL`));
      const ids = Array.from(new Set(leads.map((lead) => lead.usuario_id).filter((id): id is string => Boolean(id))));
      if (ids.length === 0) return res.json({ total: 0, pagina, limite, clientes: [] });
      condicoes.push(inArray(usuarios.id, ids));
    }
    if (busca) {
      const termo = `%${busca}%`;
      const digitos = somenteDigitos(busca);
      condicoes.push(or(sql`${usuarios.nome} ILIKE ${termo}`, sql`${usuarios.email} ILIKE ${termo}`, digitos ? sql`regexp_replace(COALESCE(${usuarios.cpf}, ''), '\\D', '', 'g') LIKE ${`%${digitos}%`}` : sql`false`)!);
    }

    const clientes = await db.select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, cpf: usuarios.cpf, telefone: usuarios.telefone, criado_em: usuarios.criado_em })
      .from(usuarios)
      .where(and(...condicoes))
      .orderBy(desc(usuarios.criado_em))
      .limit(limite)
      .offset((pagina - 1) * limite);
    return res.json({ total: clientes.length, pagina, limite, clientes });
  } catch (error: any) {
    console.error("[ADMIN/VENDAS] Erro ao buscar clientes:", error);
    return res.status(500).json({ erro: "Erro ao buscar clientes para venda" });
  }
});

router.post("/vendas/clientes", async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const nome = String(req.body?.nome || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const cpf = somenteDigitos(req.body?.cpf);
    if (!nome || !email || !cpf) return res.status(400).json({ erro: "Nome, e-mail e CPF são obrigatórios" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ erro: "Informe um e-mail válido" });
    if (!cpfValido(cpf)) return res.status(400).json({ erro: "Informe um CPF válido" });

    const senhaTemporaria = String(req.body?.senha || "").trim() || gerarSenhaTemporaria();
    if (senhaTemporaria.length < 8) return res.status(400).json({ erro: "Senha deve ter no mínimo 8 caracteres" });
    const vendedorId = req.usuario.tipo === "vendedor" ? req.usuario.id : String(req.body?.vendedor_id || "").trim() || undefined;
    if (vendedorId) {
      const vendedor = (await db.select({ id: usuarios.id, tipo: usuarios.tipo }).from(usuarios).where(eq(usuarios.id, vendedorId)).limit(1))[0];
      if (!vendedor || vendedor.tipo !== "vendedor") return res.status(400).json({ erro: "Vendedor inválido" });
    }

    const criado = await db.transaction(async (tx) => {
      const usuario = (await tx.insert(usuarios).values({
        nome,
        email,
        cpf,
        telefone: somenteDigitos(req.body?.telefone) || null,
        rg: String(req.body?.rg || "").trim() || null,
        endereco: String(req.body?.endereco || "").trim() || null,
        nacionalidade: String(req.body?.nacionalidade || "Brasileira").trim(),
        tipo: "cliente",
        senha_hash: await AuthService.hashPassword(senhaTemporaria),
        email_confirmado: true,
      }).returning(CAMPOS_PUBLICOS_USUARIO))[0];
      if (!usuario) throw new Error("Não foi possível criar o cliente");

      let lead = null;
      if (vendedorId) {
        lead = (await tx.insert(leads_origem).values({
          id: createId(),
          codigo_origem: `interno-${vendedorId}`,
          vendedor_id: vendedorId,
          usuario_id: usuario.id,
          nome,
          email,
          whatsapp: somenteDigitos(req.body?.telefone) || null,
          origem: "venda_interna",
          status: "cadastrado",
          atualizado_em: new Date(),
          criado_em: new Date(),
        }).returning({ id: leads_origem.id }))[0] || null;
      }
      return { usuario, lead };
    });
    return res.status(201).json({ ...criado, senha_gerada: req.body?.senha ? undefined : senhaTemporaria });
  } catch (error: any) {
    if (erroDeUnicidade(error)) return res.status(409).json({ erro: "E-mail ou CPF já cadastrado" });
    console.error("[ADMIN/VENDAS] Erro ao criar cliente:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível criar o cliente" });
  }
});

router.post("/vendas/calcular", async (req: Request, res: Response) => {
  try {
    const usuarioId = String(req.body?.usuario_id || "").trim();
    const cliente = (await db.select({ id: usuarios.id, ativo: usuarios.ativo }).from(usuarios).where(and(eq(usuarios.id, usuarioId), eq(usuarios.tipo, "cliente"))).limit(1))[0];
    if (!cliente || !cliente.ativo) return res.status(404).json({ erro: "Cliente ativo não encontrado" });
    const origem = await resolverOrigemVenda(req, usuarioId, req.body?.vendedor_id, req.body?.lead_id);
    const config: ConfiguracaoPacote = { ...req.body, usuario_id: usuarioId, vendedor_id: origem.vendedor_id };
    return res.json(await PacoteService.calcularValorPacote(config));
  } catch (error: any) {
    console.error("[ADMIN/VENDAS] Erro ao calcular:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível calcular a venda" });
  }
});

router.post("/vendas/reservar", async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const usuarioId = String(req.body?.usuario_id || "").trim();
    const cliente = (await db.select().from(usuarios).where(and(eq(usuarios.id, usuarioId), eq(usuarios.tipo, "cliente"), eq(usuarios.ativo, true))).limit(1))[0];
    if (!cliente) return res.status(404).json({ erro: "Cliente ativo não encontrado" });
    const origem = await resolverOrigemVenda(req, usuarioId, req.body?.vendedor_id, req.body?.lead_id);
    let origemFinal = origem;
    if (req.usuario.tipo === "admin" && req.body?.vendedor_id && !origem.lead_id) {
      const lead = (await db.insert(leads_origem).values({
        id: createId(),
        codigo_origem: `interno-${req.body.vendedor_id}`,
        vendedor_id: origem.vendedor_id || null,
        usuario_id: usuarioId,
        nome: cliente.nome,
        email: cliente.email,
        whatsapp: cliente.telefone,
        origem: "venda_interna",
        status: "checkout_iniciado",
        atualizado_em: new Date(),
        criado_em: new Date(),
      }).returning({ id: leads_origem.id }))[0];
      origemFinal = { ...origem, lead_id: lead?.id };
    }
    const config: ConfiguracaoPacote = { ...req.body, usuario_id: usuarioId, vendedor_id: origemFinal.vendedor_id };
    const resultado = await PacoteService.reservarPacote(usuarioId, String(req.body?.lote_id || ""), config, req.ip || req.socket.remoteAddress || "desconhecido", origemFinal);
    return res.status(201).json({ mensagem: "Venda interna registrada e vaga reservada", reserva_id: resultado.reserva.id, status: resultado.reserva.status, calculo: resultado.calculo, aguardando_cliente: true });
  } catch (error: any) {
    console.error("[ADMIN/VENDAS] Erro ao reservar:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível registrar a venda" });
  }
});

router.get("/vendas/reservas", async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const condicoes = [];
    if (req.usuario.tipo === "vendedor") condicoes.push(eq(reservas.vendedor_id, req.usuario.id));
    if (req.query.status) condicoes.push(eq(reservas.status, String(req.query.status) as any));
    if (req.query.usuario_id) condicoes.push(eq(reservas.usuario_id, String(req.query.usuario_id)));
    if (req.query.busca) {
      const termo = `%${String(req.query.busca).trim()}%`;
      condicoes.push(or(sql`${usuarios.nome} ILIKE ${termo}`, sql`${usuarios.email} ILIKE ${termo}`, sql`${eventos.nome} ILIKE ${termo}`)!);
    }
    const linhas = await db.select({
      id: reservas.id,
      status: reservas.status,
      checkout_estado: reservas.checkout_estado,
      valor_total: reservas.valor_total,
      forma_pagamento: reservas.forma_pagamento,
      desconto_pagamento: reservas.desconto_pagamento,
      criado_em: reservas.criado_em,
      atualizado_em: reservas.atualizado_em,
      vendedor_id: reservas.vendedor_id,
      cliente_id: usuarios.id,
      cliente_nome: usuarios.nome,
      cliente_email: usuarios.email,
      cliente_telefone: usuarios.telefone,
      evento_id: eventos.id,
      evento_nome: eventos.nome,
      lote_id: lotes.id,
      lote_nome: lotes.nome,
      pacote_id: pacotes.id,
      pacote_nome: pacotes.nome,
      modalidade_hospedagem: pacotes.modalidade_hospedagem,
    }).from(reservas)
      .innerJoin(usuarios, eq(reservas.usuario_id, usuarios.id))
      .innerJoin(lotes, eq(reservas.lote_id, lotes.id))
      .innerJoin(eventos, eq(lotes.evento_id, eventos.id))
      .leftJoin(pacotes, eq(reservas.pacote_id, pacotes.id))
      .where(condicoes.length ? and(...condicoes) : undefined)
      .orderBy(desc(reservas.criado_em))
      .limit(100);

    const ids = linhas.map((linha) => linha.id);
    const pagamentosRecentes = ids.length ? await db.select({ reserva_id: pagamentos.reserva_id, status: pagamentos.status, status_reconciliado: pagamentos.status_reconciliado, metodo: pagamentos.metodo, valor_centavos: pagamentos.valor_centavos, valor_pago_centavos: pagamentos.valor_pago_centavos, atualizado_em: pagamentos.atualizado_em }).from(pagamentos).where(inArray(pagamentos.reserva_id, ids)).orderBy(desc(pagamentos.atualizado_em)) : [];
    const documentos = ids.length ? await db.select({ reserva_id: contratosDocumentos.reserva_id, versao: contratosDocumentos.versao, status: contratosDocumentos.status, snapshot_sha256: contratosDocumentos.snapshot_sha256, pdf_sha256: contratosDocumentos.pdf_sha256, criado_em: contratosDocumentos.criado_em }).from(contratosDocumentos).where(inArray(contratosDocumentos.reserva_id, ids)).orderBy(desc(contratosDocumentos.versao)) : [];
    const pagamentoMap = new Map<string, typeof pagamentosRecentes[number]>();
    for (const pagamento of pagamentosRecentes) if (!pagamentoMap.has(pagamento.reserva_id)) pagamentoMap.set(pagamento.reserva_id, pagamento);
    const documentoMap = new Map<string, typeof documentos[number]>();
    for (const documento of documentos) if (!documentoMap.has(documento.reserva_id)) documentoMap.set(documento.reserva_id, documento);
    return res.json({ total: linhas.length, reservas: linhas.map((linha) => ({ ...linha, pagamento: pagamentoMap.get(linha.id) || null, contrato: documentoMap.get(linha.id) || null })) });
  } catch (error) {
    console.error("[ADMIN/VENDAS] Erro ao listar vendas:", error);
    return res.status(500).json({ erro: "Erro ao listar vendas internas" });
  }
});

router.get("/vendas/reservas/:reserva_id", async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const reserva = (await db.select({ id: reservas.id, usuario_id: reservas.usuario_id, vendedor_id: reservas.vendedor_id, status: reservas.status, checkout_estado: reservas.checkout_estado, valor_total: reservas.valor_total, forma_pagamento: reservas.forma_pagamento, quantidade_parcelas: reservas.quantidade_parcelas, valor_parcela: reservas.valor_parcela, criado_em: reservas.criado_em, cliente_nome: usuarios.nome, cliente_email: usuarios.email, cliente_cpf: usuarios.cpf, cliente_telefone: usuarios.telefone, evento_nome: eventos.nome, lote_nome: lotes.nome, pacote_nome: pacotes.nome }).from(reservas).innerJoin(usuarios, eq(reservas.usuario_id, usuarios.id)).innerJoin(lotes, eq(reservas.lote_id, lotes.id)).innerJoin(eventos, eq(lotes.evento_id, eventos.id)).leftJoin(pacotes, eq(reservas.pacote_id, pacotes.id)).where(eq(reservas.id, req.params.reserva_id)).limit(1))[0];
    if (!reserva) return res.status(404).json({ erro: "Venda não encontrada" });
    if (req.usuario.tipo === "vendedor" && reserva.vendedor_id !== req.usuario.id) return res.status(403).json({ erro: "Venda fora da sua carteira" });
    const [pagamentosDaReserva, contratosDaReserva] = await Promise.all([
      db.select({ id: pagamentos.id, status: pagamentos.status, status_reconciliado: pagamentos.status_reconciliado, metodo: pagamentos.metodo, valor: pagamentos.valor, valor_pago_centavos: pagamentos.valor_pago_centavos, gateway_id: pagamentos.gateway_id, atualizado_em: pagamentos.atualizado_em }).from(pagamentos).where(eq(pagamentos.reserva_id, reserva.id)).orderBy(desc(pagamentos.atualizado_em)),
      db.select({ id: contratosDocumentos.id, versao: contratosDocumentos.versao, status: contratosDocumentos.status, snapshot_sha256: contratosDocumentos.snapshot_sha256, pdf_sha256: contratosDocumentos.pdf_sha256, criado_em: contratosDocumentos.criado_em }).from(contratosDocumentos).where(eq(contratosDocumentos.reserva_id, reserva.id)).orderBy(desc(contratosDocumentos.versao)),
    ]);
    return res.json({ reserva, pagamentos: pagamentosDaReserva, contratos: contratosDaReserva });
  } catch (error) {
    console.error("[ADMIN/VENDAS] Erro ao detalhar venda:", error);
    return res.status(500).json({ erro: "Erro ao detalhar venda" });
  }
});

// Listar reservas com filtros
router.get("/reservas", async (req: Request, res: Response) => {
  try {
    const { evento_id, status, pagina = "1", limite = "20" } = req.query;
    const statusValidos: Array<NonNullable<typeof reservas.$inferSelect.status>> = [
      "visitante",
      "cadastrado",
      "pacote_montado",
      "checkout_iniciado",
      "aguardando_pagamento",
      "contrato_gerado",
      "cliente_confirmado",
      "abandonado",
    ];

    const condicoes = [];

    if (evento_id) {
      // reservas não tem evento_id direto, só lote_id — buscar os lotes do evento primeiro
      const lotesDoEvento = await db
        .select()
        .from(lotes)
        .where(eq(lotes.evento_id, evento_id as string));
      const loteIds = lotesDoEvento.map((l) => l.id);
      condicoes.push(
        loteIds.length > 0 ? inArray(reservas.lote_id, loteIds) : eq(reservas.id, "__nenhum__")
      );
    }

    if (status) {
      if (!statusValidos.includes(status as NonNullable<typeof reservas.$inferSelect.status>)) {
        return res.status(400).json({ erro: "Status de reserva inválido" });
      }
      condicoes.push(eq(reservas.status, status as NonNullable<typeof reservas.$inferSelect.status>));
    }

    if (req.usuario?.tipo === "vendedor") {
      condicoes.push(eq(reservas.vendedor_id, req.usuario.id));
    }

    let query = db.select().from(reservas).$dynamic();
    if (condicoes.length > 0) {
      query = query.where(and(...condicoes));
    }

    const offset = (parseInt(pagina as string) - 1) * parseInt(limite as string);
    const resultado = await query.limit(parseInt(limite as string)).offset(offset);

    res.json({
      total: resultado.length,
      pagina: parseInt(pagina as string),
      limite: parseInt(limite as string),
      reservas: resultado,
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao listar reservas:", error);
    res.status(500).json({ erro: "Erro ao listar reservas" });
  }
});

// Relatório de ocupação
router.get("/relatorios/ocupacao/:evento_id", async (req: Request, res: Response) => {
  try {
    const { evento_id } = req.params;

    const relatorio = await RelatorioService.relatorioOcupacao(evento_id);

    res.json({
      evento_id,
      relatorio,
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao gerar relatório:", error);
    res.status(500).json({ erro: "Erro ao gerar relatório" });
  }
});

// Relatório de faturamento
router.get("/relatorios/faturamento/:evento_id", async (req: Request, res: Response) => {
  try {
    const { evento_id } = req.params;

    const relatorio = await RelatorioService.relatorioFaturamento(evento_id);

    res.json({
      evento_id,
      ...relatorio,
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao gerar relatório:", error);
    res.status(500).json({ erro: "Erro ao gerar relatório" });
  }
});

// Relatório de pacotes mais vendidos
router.get("/relatorios/pacotes/:evento_id", async (req: Request, res: Response) => {
  try {
    const { evento_id } = req.params;

    const relatorio = await RelatorioService.relatorioPacotesMaisVendidos(evento_id);

    res.json({
      evento_id,
      relatorio,
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao gerar relatório:", error);
    res.status(500).json({ erro: "Erro ao gerar relatório" });
  }
});

// Relatório de uso de cupons
router.get("/relatorios/cupons/:evento_id", async (req: Request, res: Response) => {
  try {
    const { evento_id } = req.params;

    const relatorio = await RelatorioService.relatorioUsoCupons(evento_id);

    res.json({
      evento_id,
      relatorio,
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao gerar relatório:", error);
    res.status(500).json({ erro: "Erro ao gerar relatório" });
  }
});

// Reenviar contrato manualmente
router.post("/reenviar-contrato/:reserva_id", async (req: Request, res: Response) => {
  try {
    const { reserva_id } = req.params;

    const enviado = await EmailService.reenviarContrato(reserva_id);

    if (enviado) {
      res.json({ mensagem: "Contrato reenviado com sucesso" });
    } else {
      res.status(500).json({ erro: "Erro ao enviar e-mail" });
    }
  } catch (error: any) {
    console.error("[ADMIN] Erro ao reenviar:", error);
    res.status(500).json({ erro: "Erro ao reenviar contrato" });
  }
});

// Exportar reservas em CSV
router.get("/exportar/reservas/:evento_id", async (req: Request, res: Response) => {
  try {
    const { evento_id } = req.params;

    // Buscar lotes do evento
    const lotesResult = await db
      .select()
      .from(lotes)
      .where(eq(lotes.evento_id, evento_id));

    const loteIds = lotesResult.map((l) => l.id);

    // Buscar reservas
    let query = db.select().from(reservas).$dynamic();
    if (loteIds.length > 0) {
      query = query.where(inArray(reservas.lote_id, loteIds));
    }

    const reservasResult = await query;

    // Gerar CSV
    const headers = ["ID", "Usuário", "Email", "Status", "Valor Total", "Data Criação"];
    const rows = [];

    for (const reserva of reservasResult) {
      const usuario = await db
        .select()
        .from(usuarios)
        .where(eq(usuarios.id, reserva.usuario_id))
        .limit(1);

      rows.push([
        reserva.id,
        usuario[0]?.nome || "Desconhecido",
        usuario[0]?.email || "Desconhecido",
        reserva.status,
        reserva.valor_total,
        reserva.criado_em.toISOString(),
      ]);
    }

    // Montar CSV
    const csv = [
      headers.join(","),
      ...rows.map((r) => r.map((v) => `"${v}"`).join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="reservas-${evento_id}.csv"`);
    res.send(csv);
  } catch (error: any) {
    console.error("[ADMIN] Erro ao exportar:", error);
    res.status(500).json({ erro: "Erro ao exportar dados" });
  }
});

// ==========================================================================
// Cadastro de clientes/usuários (clientes, vendedores e administradores)
// ==========================================================================

const CAMPOS_PUBLICOS_USUARIO = {
  id: usuarios.id,
  nome: usuarios.nome,
  email: usuarios.email,
  cpf: usuarios.cpf,
  rg: usuarios.rg,
  telefone: usuarios.telefone,
  tipo: usuarios.tipo,
  data_nascimento: usuarios.data_nascimento,
  estado_civil: usuarios.estado_civil,
  profissao: usuarios.profissao,
  endereco: usuarios.endereco,
  nacionalidade: usuarios.nacionalidade,
  ativo: usuarios.ativo,
  criado_em: usuarios.criado_em,
  atualizado_em: usuarios.atualizado_em,
};

router.get("/usuarios", async (req: Request, res: Response) => {
  try {
    const { tipo, busca, pagina = "1", limite = "20" } = req.query;

    const condicoes = [];
    if (tipo && ["cliente", "vendedor", "admin"].includes(tipo as string)) {
      condicoes.push(eq(usuarios.tipo, tipo as "cliente" | "vendedor" | "admin"));
    }
    if (busca) {
      const termo = `%${String(busca).trim()}%`;
      const buscaDigitos = somenteDigitos(busca);
      condicoes.push(
        or(
          sql`${usuarios.nome} ILIKE ${termo}`,
          sql`${usuarios.email} ILIKE ${termo}`,
          buscaDigitos ? sql`regexp_replace(COALESCE(${usuarios.cpf}, ''), '\\D', '', 'g') LIKE ${`%${buscaDigitos}%`}` : sql`false`,
        )
      );
    }

    let query = db.select(CAMPOS_PUBLICOS_USUARIO).from(usuarios).$dynamic();
    if (condicoes.length > 0) {
      query = query.where(and(...condicoes));
    }

    const offset = (parseInt(pagina as string) - 1) * parseInt(limite as string);
    const resultado = await query
      .orderBy(desc(usuarios.criado_em))
      .limit(parseInt(limite as string))
      .offset(offset);

    res.json({
      total: resultado.length,
      pagina: parseInt(pagina as string),
      limite: parseInt(limite as string),
      usuarios: resultado,
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao listar usuários:", error);
    res.status(500).json({ erro: "Erro ao listar usuários" });
  }
});

router.get("/usuarios/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const usuarioResult = await db
      .select(CAMPOS_PUBLICOS_USUARIO)
      .from(usuarios)
      .where(eq(usuarios.id, id))
      .limit(1);

    if (usuarioResult.length === 0) {
      return res.status(404).json({ erro: "Usuário não encontrado" });
    }

    const reservasDoUsuario = await db
      .select()
      .from(reservas)
      .where(eq(reservas.usuario_id, id))
      .orderBy(desc(reservas.criado_em));

    res.json({ usuario: usuarioResult[0], reservas: reservasDoUsuario });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao buscar usuário:", error);
    res.status(500).json({ erro: "Erro ao buscar usuário" });
  }
});

router.post("/usuarios", async (req: Request, res: Response) => {
  try {
    const {
      nome, email, cpf, rg, telefone, tipo,
      data_nascimento, estado_civil, profissao, endereco, nacionalidade,
      senha,
    } = req.body ?? {};

    const nomeNormalizado = String(nome || "").trim();
    const emailNormalizado = String(email || "").trim().toLowerCase();
    const cpfNormalizado = somenteDigitos(cpf);
    const telefoneNormalizado = somenteDigitos(telefone);
    const tipoNormalizado = ["cliente", "vendedor", "admin"].includes(tipo) ? tipo : "cliente";

    if (!nomeNormalizado || !emailNormalizado) {
      return res.status(400).json({ erro: "Nome e e-mail são obrigatórios" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
      return res.status(400).json({ erro: "Informe um e-mail válido" });
    }
    if (cpfNormalizado && !cpfValido(cpfNormalizado)) {
      return res.status(400).json({ erro: "Informe um CPF válido" });
    }
    if (tipoNormalizado === "cliente" && !cpfNormalizado) {
      return res.status(400).json({ erro: "CPF é obrigatório para cadastro de cliente" });
    }

    const dataNascimento = data_nascimento ? new Date(data_nascimento) : null;
    if (data_nascimento && Number.isNaN(dataNascimento?.getTime())) {
      return res.status(400).json({ erro: "Data de nascimento inválida" });
    }

    const senhaTemporaria = String(senha || "").trim() || gerarSenhaTemporaria();
    if (senhaTemporaria.length < 8) {
      return res.status(400).json({ erro: "Senha deve ter no mínimo 8 caracteres" });
    }
    const senhaHash = await AuthService.hashPassword(senhaTemporaria);

    try {
      const criado = await db
        .insert(usuarios)
        .values({
          nome: nomeNormalizado,
          email: emailNormalizado,
          cpf: cpfNormalizado || null,
          rg: String(rg || "").trim() || null,
          telefone: telefoneNormalizado || null,
          tipo: tipoNormalizado,
          data_nascimento: dataNascimento,
          estado_civil: String(estado_civil || "").trim() || null,
          profissao: String(profissao || "").trim() || null,
          endereco: String(endereco || "").trim() || null,
          nacionalidade: String(nacionalidade || "").trim() || "Brasileira",
          senha_hash: senhaHash,
        })
        .returning(CAMPOS_PUBLICOS_USUARIO);

      res.status(201).json({
        usuario: criado[0],
        senha_gerada: senha ? undefined : senhaTemporaria,
      });
    } catch (error: any) {
      if (erroDeUnicidade(error)) {
        return res.status(409).json({ erro: "E-mail ou CPF já cadastrado" });
      }
      throw error;
    }
  } catch (error: any) {
    console.error("[ADMIN] Erro ao criar usuário:", error);
    res.status(500).json({ erro: "Erro ao criar usuário" });
  }
});

router.put("/usuarios/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      nome, email, cpf, rg, telefone, tipo,
      data_nascimento, estado_civil, profissao, endereco, nacionalidade,
      senha,
    } = req.body ?? {};

    const existente = await db.select().from(usuarios).where(eq(usuarios.id, id)).limit(1);
    if (existente.length === 0) {
      return res.status(404).json({ erro: "Usuário não encontrado" });
    }

    const atualizacoes: Partial<typeof usuarios.$inferInsert> = { atualizado_em: new Date() };
    let revogarSessoes = false;

    if (nome !== undefined) {
      const nomeNormalizado = String(nome).trim();
      if (!nomeNormalizado) return res.status(400).json({ erro: "Nome não pode ser vazio" });
      atualizacoes.nome = nomeNormalizado;
    }
    if (email !== undefined) {
      const emailNormalizado = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
        return res.status(400).json({ erro: "Informe um e-mail válido" });
      }
      atualizacoes.email = emailNormalizado;
    }
    if (cpf !== undefined) {
      const cpfNormalizado = somenteDigitos(cpf);
      if (cpfNormalizado && !cpfValido(cpfNormalizado)) {
        return res.status(400).json({ erro: "Informe um CPF válido" });
      }
      atualizacoes.cpf = cpfNormalizado || null;
    }
    if (rg !== undefined) atualizacoes.rg = String(rg).trim() || null;
    if (telefone !== undefined) atualizacoes.telefone = somenteDigitos(telefone) || null;
    if (tipo !== undefined && ["cliente", "vendedor", "admin"].includes(tipo)) {
      atualizacoes.tipo = tipo;
      revogarSessoes = tipo !== existente[0].tipo;
    }
    if (data_nascimento !== undefined) {
      const dataNascimento = data_nascimento ? new Date(data_nascimento) : null;
      if (data_nascimento && Number.isNaN(dataNascimento?.getTime())) {
        return res.status(400).json({ erro: "Data de nascimento inválida" });
      }
      atualizacoes.data_nascimento = dataNascimento;
    }
    if (estado_civil !== undefined) atualizacoes.estado_civil = String(estado_civil).trim() || null;
    if (profissao !== undefined) atualizacoes.profissao = String(profissao).trim() || null;
    if (endereco !== undefined) atualizacoes.endereco = String(endereco).trim() || null;
    if (nacionalidade !== undefined) atualizacoes.nacionalidade = String(nacionalidade).trim() || "Brasileira";
    if (senha) {
      if (String(senha).length < 8) {
        return res.status(400).json({ erro: "Senha deve ter no mínimo 8 caracteres" });
      }
      atualizacoes.senha_hash = await AuthService.hashPassword(String(senha));
      revogarSessoes = true;
    }

    try {
      const atualizado = await db
        .update(usuarios)
        .set({
          ...atualizacoes,
          ...(revogarSessoes ? { session_version: sql`COALESCE(${usuarios.session_version}, 1) + 1` } : {}),
        })
        .where(eq(usuarios.id, id))
        .returning(CAMPOS_PUBLICOS_USUARIO);

      res.json({ usuario: atualizado[0] });
    } catch (error: any) {
      if (erroDeUnicidade(error)) {
        return res.status(409).json({ erro: "E-mail ou CPF já cadastrado para outro usuário" });
      }
      throw error;
    }
  } catch (error: any) {
    console.error("[ADMIN] Erro ao atualizar usuário:", error);
    res.status(500).json({ erro: "Erro ao atualizar usuário" });
  }
});

router.patch("/usuarios/:id/status", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { ativo } = req.body ?? {};

    if (typeof ativo !== "boolean") {
      return res.status(400).json({ erro: "Informe o campo 'ativo' (true/false)" });
    }

    const atualizado = await db
      .update(usuarios)
      .set({
        ativo,
        atualizado_em: new Date(),
        session_version: sql`COALESCE(${usuarios.session_version}, 1) + 1`,
      })
      .where(eq(usuarios.id, id))
      .returning(CAMPOS_PUBLICOS_USUARIO);

    if (atualizado.length === 0) {
      return res.status(404).json({ erro: "Usuário não encontrado" });
    }

    res.json({ usuario: atualizado[0] });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao atualizar status do usuário:", error);
    res.status(500).json({ erro: "Erro ao atualizar status do usuário" });
  }
});

// ==========================================================================
// Vídeos do YouTube — administração sem embed automático
router.get("/videos", requireRole("admin"), async (_req: Request, res: Response) => {
  try { return res.json({ videos: await db.select().from(videosEvento).orderBy(videosEvento.ordem, desc(videosEvento.criado_em)) }); }
  catch (error) { console.error("[ADMIN] Erro ao listar vídeos:", error); return res.status(500).json({ erro: "Erro ao listar vídeos" }); }
});

router.post("/videos", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const youtubeId = extrairYoutubeId(req.body?.url);
    if (!youtubeId || !req.body?.evento_id) return res.status(400).json({ erro: "Informe URL do YouTube válida e evento" });
    const video = (await db.insert(videosEvento).values({ id: randomUUID(), evento_id: String(req.body.evento_id), url: String(req.body.url), youtube_id: youtubeId, titulo: req.body.titulo ? String(req.body.titulo).slice(0, 255) : null, descricao: req.body.descricao ? String(req.body.descricao) : null, ordem: Number(req.body.ordem || 0), ativo: req.body.ativo !== false, destaque: req.body.destaque === true }).returning())[0];
    return res.status(201).json({ video });
  } catch (error: any) { console.error("[ADMIN] Erro ao criar vídeo:", error); return res.status(400).json({ erro: "Não foi possível salvar o vídeo" }); }
});

router.patch("/videos/:id", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const youtubeId = req.body?.url ? extrairYoutubeId(req.body.url) : undefined;
    if (req.body?.url && !youtubeId) return res.status(400).json({ erro: "URL do YouTube inválida" });
    const video = (await db.update(videosEvento).set({ ...(youtubeId ? { url: String(req.body.url), youtube_id: youtubeId } : {}), ...(req.body.titulo !== undefined ? { titulo: String(req.body.titulo).slice(0, 255) } : {}), ...(req.body.descricao !== undefined ? { descricao: String(req.body.descricao) } : {}), ...(req.body.ordem !== undefined ? { ordem: Number(req.body.ordem) } : {}), ...(req.body.ativo !== undefined ? { ativo: Boolean(req.body.ativo) } : {}), ...(req.body.destaque !== undefined ? { destaque: Boolean(req.body.destaque) } : {}), atualizado_em: new Date() }).where(eq(videosEvento.id, req.params.id)).returning())[0];
    if (!video) return res.status(404).json({ erro: "Vídeo não encontrado" });
    return res.json({ video });
  } catch (error) { console.error("[ADMIN] Erro ao atualizar vídeo:", error); return res.status(400).json({ erro: "Não foi possível atualizar o vídeo" }); }
});

router.delete("/videos/:id", requireRole("admin"), async (req: Request, res: Response) => {
  try { const excluido = await db.delete(videosEvento).where(eq(videosEvento.id, req.params.id)).returning({ id: videosEvento.id }); if (!excluido[0]) return res.status(404).json({ erro: "Vídeo não encontrado" }); return res.status(204).send(); }
  catch (error) { console.error("[ADMIN] Erro ao remover vídeo:", error); return res.status(400).json({ erro: "Não foi possível remover o vídeo" }); }
});

// Fotos da galeria — metadados editoriais acessíveis e controláveis
router.get("/fotos", requireRole("admin"), async (_req: Request, res: Response) => {
  try { return res.json({ fotos: await db.select().from(fotos_evento).orderBy(desc(fotos_evento.ordem), desc(fotos_evento.criado_em)) }); }
  catch (error) { console.error("[ADMIN] Erro ao listar fotos:", error); return res.status(500).json({ erro: "Erro ao listar fotos" }); }
});

router.post("/fotos", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const url = String(req.body?.url_foto || req.body?.url || "").trim();
    if (!req.body?.evento_id || !url || !req.body?.alt_text?.trim()) return res.status(400).json({ erro: "evento_id, url e alt_text são obrigatórios" });
    if (!url.startsWith("/") && !url.toLowerCase().startsWith("https://")) return res.status(400).json({ erro: "A URL da foto deve usar HTTPS" });
    const foto = (await db.insert(fotos_evento).values({ id: randomUUID(), evento_id: String(req.body.evento_id), url_foto: url, legenda: req.body.legenda ? String(req.body.legenda).slice(0, 500) : null, alt_text: String(req.body.alt_text).slice(0, 500), categoria: req.body.categoria ? String(req.body.categoria).slice(0, 80) : "evento", destaque: req.body.destaque === true, capa: req.body.capa === true, formato: req.body.formato ? String(req.body.formato).slice(0, 30) : null, ordem: Number(req.body.ordem || 0) }).returning())[0];
    return res.status(201).json({ foto });
  } catch (error) { console.error("[ADMIN] Erro ao criar foto:", error); return res.status(400).json({ erro: "Não foi possível salvar a foto" }); }
});

router.patch("/fotos/:id", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const foto = (await db.update(fotos_evento).set({ ...(req.body?.url_foto || req.body?.url ? { url_foto: String(req.body.url_foto || req.body.url) } : {}), ...(req.body?.legenda !== undefined ? { legenda: String(req.body.legenda).slice(0, 500) } : {}), ...(req.body?.alt_text !== undefined ? { alt_text: String(req.body.alt_text).slice(0, 500) } : {}), ...(req.body?.categoria !== undefined ? { categoria: String(req.body.categoria).slice(0, 80) } : {}), ...(req.body?.destaque !== undefined ? { destaque: Boolean(req.body.destaque) } : {}), ...(req.body?.capa !== undefined ? { capa: Boolean(req.body.capa) } : {}), ...(req.body?.ordem !== undefined ? { ordem: Number(req.body.ordem) } : {}), ...(req.body?.formato !== undefined ? { formato: String(req.body.formato).slice(0, 30) } : {}) }).where(eq(fotos_evento.id, req.params.id)).returning())[0];
    if (!foto) return res.status(404).json({ erro: "Foto não encontrada" });
    return res.json({ foto });
  } catch (error) { console.error("[ADMIN] Erro ao atualizar foto:", error); return res.status(400).json({ erro: "Não foi possível atualizar a foto" }); }
});

router.delete("/fotos/:id", requireRole("admin"), async (req: Request, res: Response) => {
  try { const removida = await db.delete(fotos_evento).where(eq(fotos_evento.id, req.params.id)).returning({ id: fotos_evento.id }); if (!removida[0]) return res.status(404).json({ erro: "Foto não encontrada" }); return res.status(204).send(); }
  catch (error) { console.error("[ADMIN] Erro ao remover foto:", error); return res.status(400).json({ erro: "Não foi possível remover a foto" }); }
});

// Configurações de pagamento (regras de negócio, editáveis sem redeploy)
// ==========================================================================

// Devolve as regras configuráveis (desconto PIX, teto de parcelas do
// cartão, teto de meses de antecedência do boleto) e o status do gateway
// ativo — lido de variável de ambiente, nunca do banco. O token do gateway
// nunca é devolvido, mesmo que definido, apenas se está configurado ou não.
router.get("/configuracoes/pagamento", async (_req: Request, res: Response) => {
  try {
    const configuracoes = await ConfiguracaoService.obterConfiguracoesPagamento();
    const gateway = process.env.PAYMENT_GATEWAY === "mock" && process.env.NODE_ENV !== "production" ? "mock" : "cora";
    const gatewayConfigurado = gateway === "mock"
      ? true
      : Boolean(process.env.CORA_CLIENT_ID?.trim() && process.env.CORA_CERT_PATH?.trim() && process.env.CORA_PRIVATE_KEY_PATH?.trim());

    res.json({
      configuracoes,
      gateway: {
        ativo: gateway,
        nome: gateway === "cora" ? "Banco Cora" : "Mock de testes locais",
        ambiente: process.env.CORA_ENV === "production" ? "production" : "stage",
        configurado: gatewayConfigurado,
        metodos: ["pix", "boleto", "boleto_pix", "carne"],
      },
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao ler configurações de pagamento:", error);
    res.status(500).json({ erro: "Erro ao ler configurações de pagamento" });
  }
});

router.put("/configuracoes/pagamento", async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });

    const { pix_desconto_percentual, credito_parcelas_maximo, boleto_meses_maximo_antecedencia } = req.body ?? {};
    const dados: Record<string, number> = {};
    if (pix_desconto_percentual !== undefined) dados.pix_desconto_percentual = Number(pix_desconto_percentual);
    if (credito_parcelas_maximo !== undefined) dados.credito_parcelas_maximo = Number(credito_parcelas_maximo);
    if (boleto_meses_maximo_antecedencia !== undefined) dados.boleto_meses_maximo_antecedencia = Number(boleto_meses_maximo_antecedencia);

    if (Object.keys(dados).length === 0) {
      return res.status(400).json({ erro: "Informe ao menos um campo para atualizar" });
    }

    const configuracoes = await ConfiguracaoService.atualizarConfiguracoesPagamento(dados as any, req.usuario.id);
    res.json({ configuracoes });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao atualizar configurações de pagamento:", error);
    res.status(400).json({ erro: error.message || "Erro ao atualizar configurações de pagamento" });
  }
});

// ==========================================================================
// Desconto administrativo controlado e auditável
router.post("/reservas/:reserva_id/desconto", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    const motivo = String(req.body?.motivo || "").trim();
    const tipo = String(req.body?.tipo || "").trim().toLowerCase();
    const informado = new Decimal(String(req.body?.valor ?? "0"));
    if (motivo.length < 5) return res.status(400).json({ erro: "Motivo obrigatório para desconto administrativo" });
    if (!["fixo", "percentual"].includes(tipo)) return res.status(400).json({ erro: "Tipo deve ser fixo ou percentual" });
    if (!informado.isFinite() || informado.lessThanOrEqualTo(0)) return res.status(400).json({ erro: "Informe um desconto maior que zero" });

    const reserva = (await db.select().from(reservas).where(eq(reservas.id, req.params.reserva_id)).limit(1))[0];
    if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    const pagamentoExistente = (await db.select({ id: pagamentos.id }).from(pagamentos).where(eq(pagamentos.reserva_id, reserva.id)).limit(1))[0];
    if (pagamentoExistente) return res.status(409).json({ erro: "Não é permitido alterar o total depois de criar uma cobrança" });
    const subtotalOriginal = new Decimal(reserva.valor_total.toString());
    if (tipo === "percentual" && informado.greaterThan(100)) return res.status(400).json({ erro: "Percentual não pode exceder 100%" });
    const desconto = tipo === "percentual" ? subtotalOriginal.times(informado).div(100) : informado;
    const valorDesconto = Decimal.min(desconto, subtotalOriginal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const totalFinal = subtotalOriginal.minus(valorDesconto).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const resultado = await db.transaction(async (tx) => {
      const atualizado = await tx.update(reservas).set({ valor_total: totalFinal.toFixed(2), valor_total_centavos: totalFinal.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(), atualizado_em: new Date() }).where(and(eq(reservas.id, reserva.id), sql`${reservas.status} IN ('pacote_montado', 'checkout_iniciado', 'contrato_gerado')`)).returning({ id: reservas.id, valor_total: reservas.valor_total, valor_total_centavos: reservas.valor_total_centavos });
      if (!atualizado[0]) throw new Error("A reserva não está em uma etapa que permita desconto");
      const registro = await tx.insert(descontosAdministrativos).values({ reserva_id: reserva.id, administrador_id: req.usuario!.id, motivo, tipo, valor_informado: informado.toFixed(2), subtotal_original: subtotalOriginal.toFixed(2), valor_desconto: valorDesconto.toFixed(2), total_final: totalFinal.toFixed(2) }).returning();
      return registro[0];
    });
    return res.status(201).json({ desconto: resultado, total_final: totalFinal.toFixed(2) });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao aplicar desconto:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível aplicar o desconto" });
  }
});

// Geração de contrato diretamente pelo painel administrativo
// ==========================================================================

router.post("/contratos/preview/:reserva_id", async (req: Request, res: Response) => {
  try {
    const reserva = (await db.select({ id: reservas.id, usuario_id: reservas.usuario_id, vendedor_id: reservas.vendedor_id }).from(reservas).where(eq(reservas.id, req.params.reserva_id)).limit(1))[0];
    if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada" });
    if (!vendedorPodeOperarReserva(req, reserva)) return res.status(403).json({ erro: "Reserva fora da sua carteira" });
    const snapshot = await ContratoService.gerarSnapshot({ reserva_id: reserva.id, formulario: req.body?.formulario });
    const html = await ContratoService.gerarContratoHTML({ reserva_id: reserva.id, snapshot });
    return res.json({ snapshot, html, template: "2026.1-oficial", editavel: ["contratante", "hospedagem", "transporte", "bagagem", "seguro", "uso_imagem", "observacoes_especificas"] });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao visualizar preview contratual:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível gerar o preview" });
  }
});

// Lista reservas com e sem contrato gerado, já com nome do cliente e do
// evento/lote, para alimentar a página "Contratos" do painel.
router.get("/contratos", async (req: Request, res: Response) => {
  try {
    const { status } = req.query; // "gerados" | "pendentes" | (vazio = todos)

    const query = db
      .select({
        reserva_id: reservas.id,
        status_reserva: reservas.status,
        valor_total: reservas.valor_total,
        forma_pagamento: reservas.forma_pagamento,
        quantidade_parcelas: reservas.quantidade_parcelas,
        contrato_pdf_url: reservas.contrato_pdf_url,
        aceite_timestamp: reservas.aceite_timestamp,
        aceite_ip: reservas.aceite_ip,
        criado_em: reservas.criado_em,
        cliente_nome: usuarios.nome,
        cliente_email: usuarios.email,
        cliente_cpf: usuarios.cpf,
        evento_nome: eventos.nome,
        lote_nome: lotes.nome,
      })
      .from(reservas)
      .innerJoin(usuarios, eq(reservas.usuario_id, usuarios.id))
      .innerJoin(lotes, eq(reservas.lote_id, lotes.id))
      .innerJoin(eventos, eq(lotes.evento_id, eventos.id))
      .$dynamic();

    if (req.usuario?.tipo === "vendedor") query.where(eq(reservas.vendedor_id, req.usuario.id));
    const linhas = await query.orderBy(desc(reservas.criado_em));

    const filtradas = status === "gerados"
      ? linhas.filter((linha) => Boolean(linha.contrato_pdf_url))
      : status === "pendentes"
        ? linhas.filter((linha) => !linha.contrato_pdf_url)
        : linhas;

    res.json({
      total: filtradas.length,
      contratos: filtradas.map((linha) => ({
        ...linha,
        contrato_gerado: Boolean(linha.contrato_pdf_url),
      })),
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao listar contratos:", error);
    res.status(500).json({ erro: "Erro ao listar contratos" });
  }
});

router.post("/contratos/gerar/:reserva_id", async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });

    const { reserva_id } = req.params;

    const reservaResult = await db.select().from(reservas).where(eq(reservas.id, reserva_id)).limit(1);
    if (reservaResult.length === 0) {
      return res.status(404).json({ erro: "Reserva não encontrada" });
    }
    const reserva = reservaResult[0];
    if (!vendedorPodeOperarReserva(req, reserva)) return res.status(403).json({ erro: "Reserva fora da sua carteira" });

    const metodoPagamento = req.body?.metodo_pagamento ?? reserva.forma_pagamento;
    const quantidadeParcelas = req.body?.quantidade_parcelas ?? reserva.quantidade_parcelas;
    if (!metodoPagamento) {
      return res.status(400).json({ erro: "Informe a forma de pagamento para gerar o contrato" });
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
      const dataLimitePagamento = loteResult[0]?.data_embarque || loteResult[0]?.data_inicio;
      const configPagamento = await ConfiguracaoService.obterConfiguracoesPagamento();
      const parcelasMaximasBoleto = ContratoService.calcularParcelasMaximasBoleto(
        dataLimitePagamento,
        new Date(),
        configPagamento.boleto_meses_maximo_antecedencia,
      );

      const valorBaseSemDescontoPagamento = Number(reserva.valor_total) + Number(reserva.desconto_pagamento || 0);
      condicaoPagamento = ContratoService.calcularCondicaoPagamento(
        valorBaseSemDescontoPagamento.toFixed(2),
        metodoPagamento,
        quantidadeParcelas,
        parcelasMaximasBoleto,
        {
          percentualDescontoPix: configPagamento.pix_desconto_percentual,
          parcelasMaximasCredito: configPagamento.credito_parcelas_maximo,
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
        atualizado_em: new Date(),
      })
      .where(eq(reservas.id, reserva_id));

    await ContratoService.registrarAceiteContrato(reserva_id, `gerado-pelo-admin:${req.usuario.id}`, req.body?.formulario);

    res.json({
      mensagem: "Contrato preparado e aguardando validação eletrônica do cliente",
      reserva_id,
      status: "aguardando_validacao",
      condicao_pagamento: condicaoPagamento,
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao gerar contrato:", error);
    res.status(500).json({ erro: error.message || "Erro ao gerar contrato" });
  }
});

router.get("/contratos/modelos", async (_req: Request, res: Response) => {
  return res.json({
    modelos: [
      {
        id: "hospedagem-2026",
        nome: "Contrato de pacote — hospedagem",
        versao: "2026",
        status: "oficial",
        fonte: "Contrato HOSPEDAGEM EXCMTV 2026 - papel timbrado.docx",
        descricao: "Fonte oficial enviada para hospedagem, serviços inclusos, pagamento e regras da excursão.",
      },
      {
        id: "transporte-2026",
        nome: "Contrato de pacote — transporte",
        versao: "2026",
        status: "oficial",
        fonte: "TRANSPORTE EXCMTV 2026 - papel timbrado.docx",
        descricao: "Fonte oficial enviada para transporte e cláusulas operacionais do pacote.",
      },
    ],
    regra: "O sistema gera o documento a partir do snapshot da venda e não altera o conteúdo jurídico sem nova fonte versionada.",
  });
});

router.get("/pagamentos", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const condicoes = [];
    if (req.query.status) condicoes.push(eq(pagamentos.status, String(req.query.status) as any));
    if (req.query.reconciliado) condicoes.push(eq(pagamentos.status_reconciliado, String(req.query.reconciliado)));
    if (req.query.busca) {
      const termo = `%${String(req.query.busca).trim()}%`;
      condicoes.push(or(sql`${usuarios.nome} ILIKE ${termo}`, sql`${usuarios.email} ILIKE ${termo}`, sql`${eventos.nome} ILIKE ${termo}`)!);
    }
    const linhas = await db.select({
      id: pagamentos.id,
      reserva_id: pagamentos.reserva_id,
      status: pagamentos.status,
      status_reconciliado: pagamentos.status_reconciliado,
      metodo: pagamentos.metodo,
      valor: pagamentos.valor,
      valor_centavos: pagamentos.valor_centavos,
      valor_pago_centavos: pagamentos.valor_pago_centavos,
      gateway_id: pagamentos.gateway_id,
      criado_em: pagamentos.criado_em,
      atualizado_em: pagamentos.atualizado_em,
      cliente_nome: usuarios.nome,
      cliente_email: usuarios.email,
      evento_nome: eventos.nome,
      lote_nome: lotes.nome,
    }).from(pagamentos)
      .innerJoin(reservas, eq(pagamentos.reserva_id, reservas.id))
      .innerJoin(usuarios, eq(reservas.usuario_id, usuarios.id))
      .innerJoin(lotes, eq(reservas.lote_id, lotes.id))
      .innerJoin(eventos, eq(lotes.evento_id, eventos.id))
      .where(condicoes.length ? and(...condicoes) : undefined)
      .orderBy(desc(pagamentos.atualizado_em))
      .limit(200);
    return res.json({ total: linhas.length, pagamentos: linhas });
  } catch (error) {
    console.error("[ADMIN] Erro ao listar pagamentos:", error);
    return res.status(500).json({ erro: "Erro ao carregar pagamentos" });
  }
});

router.get("/comissoes/regras", authMiddleware, requireRole("admin"), async (_req: Request, res: Response) => {
  try {
    const regras = await db.select().from(comissaoRegras).orderBy(desc(comissaoRegras.criado_em));
    return res.json({ regras });
  } catch (error) {
    console.error("[ADMIN] Erro ao listar regras de comissão:", error);
    return res.status(500).json({ erro: "Erro ao listar regras de comissão" });
  }
});

router.post("/comissoes/regras", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const vendedorId = String(req.body?.vendedor_id || "").trim();
    const tipo = String(req.body?.tipo || "").trim().toLowerCase();
    const valor = Number(req.body?.valor);
    if (!vendedorId || !["percentual", "fixo"].includes(tipo) || !Number.isFinite(valor) || valor < 0) return res.status(400).json({ erro: "vendedor_id, tipo percentual/fixo e valor válido são obrigatórios" });
    const vendedor = await db.select({ id: usuarios.id, tipo: usuarios.tipo }).from(usuarios).where(eq(usuarios.id, vendedorId)).limit(1);
    if (vendedor[0]?.tipo !== "vendedor") return res.status(400).json({ erro: "A regra só pode ser atribuída a um usuário vendedor" });
    if (tipo === "percentual" && valor > 100) return res.status(400).json({ erro: "A comissão percentual não pode exceder 100%" });
    const criado = await db.insert(comissaoRegras).values({ id: randomUUID(), vendedor_id: vendedorId, evento_id: req.body?.evento_id ? String(req.body.evento_id) : null, pacote_id: req.body?.pacote_id ? String(req.body.pacote_id) : null, tipo, valor: valor.toFixed(4), ativo: req.body?.ativo !== false, criado_em: new Date(), atualizado_em: new Date() }).returning();
    return res.status(201).json({ regra: criado[0] });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao criar regra de comissão:", error);
    return res.status(400).json({ erro: error.message || "Erro ao criar regra de comissão" });
  }
});

router.get("/comissoes", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const vendedorId = req.query.vendedor_id ? String(req.query.vendedor_id) : undefined;
    const lista = await db.select().from(comissoes).where(vendedorId ? eq(comissoes.vendedor_id, vendedorId) : undefined).orderBy(desc(comissoes.criado_em));
    return res.json({ total: lista.length, comissoes: lista });
  } catch (error) {
    console.error("[ADMIN] Erro ao listar comissões:", error);
    return res.status(500).json({ erro: "Erro ao listar comissões" });
  }
});

export default router;
