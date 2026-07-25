import { Router, Request, Response } from "express";
import { authMiddleware, requireRole } from "../middleware/authMiddleware.js";
import { RelatorioService } from "../services/relatorioService.js";
import { EmailService } from "../services/emailService.js";
import { AuthService } from "../services/authService.js";
import { ContratoService } from "../services/contratoService.js";
import { ConfiguracaoService } from "../services/configuracaoService.js";
import { db } from "../db/index.js";
import { reservas, eventos, lotes, usuarios, leads_origem } from "../db/schema.js";
import { eq, and, inArray, or, sql, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";

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

// As demais rotas administrativas são exclusivas do administrador.
router.use(requireRole("admin"));

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
    }

    try {
      const atualizado = await db
        .update(usuarios)
        .set(atualizacoes)
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
      .set({ ativo, atualizado_em: new Date() })
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
// Configurações de pagamento (regras de negócio, editáveis sem redeploy)
// ==========================================================================

// Devolve as regras configuráveis (desconto PIX, teto de parcelas do
// cartão, teto de meses de antecedência do boleto) e o status do gateway
// ativo — lido de variável de ambiente, nunca do banco. O token do gateway
// nunca é devolvido, mesmo que definido, apenas se está configurado ou não.
router.get("/configuracoes/pagamento", async (_req: Request, res: Response) => {
  try {
    const configuracoes = await ConfiguracaoService.obterConfiguracoesPagamento();
    const gateway = (process.env.PAYMENT_GATEWAY || "mercadopago").trim();
    const gatewayConfigurado = gateway === "mercadopago"
      ? Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN?.trim())
      : gateway === "asaas"
        ? Boolean(process.env.ASAAS_API_KEY?.trim())
        : gateway === "mock";

    res.json({
      configuracoes,
      gateway: {
        ativo: gateway,
        configurado: gatewayConfigurado,
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
// Geração de contrato diretamente pelo painel administrativo
// ==========================================================================

// Lista reservas com e sem contrato gerado, já com nome do cliente e do
// evento/lote, para alimentar a página "Contratos" do painel.
router.get("/contratos", async (req: Request, res: Response) => {
  try {
    const { status } = req.query; // "gerados" | "pendentes" | (vazio = todos)

    const linhas = await db
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
      .orderBy(desc(reservas.criado_em));

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

    const metodoPagamento = req.body?.metodo_pagamento ?? reserva.forma_pagamento;
    const quantidadeParcelas = req.body?.quantidade_parcelas ?? reserva.quantidade_parcelas;
    if (!metodoPagamento) {
      return res.status(400).json({ erro: "Informe a forma de pagamento para gerar o contrato" });
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

      condicaoPagamento = ContratoService.calcularCondicaoPagamento(
        reserva.valor_total.toString(),
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
        atualizado_em: new Date(),
      })
      .where(eq(reservas.id, reserva_id));

    await ContratoService.registrarAceiteContrato(reserva_id, `gerado-pelo-admin:${req.usuario.id}`);

    res.json({
      mensagem: "Contrato gerado com sucesso",
      reserva_id,
      status: "contrato_gerado",
      condicao_pagamento: condicaoPagamento,
    });
  } catch (error: any) {
    console.error("[ADMIN] Erro ao gerar contrato:", error);
    res.status(500).json({ erro: error.message || "Erro ao gerar contrato" });
  }
});

export default router;
