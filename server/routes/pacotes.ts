import { Router, Request, Response } from "express";
import { authMiddleware, requireRole } from "../middleware/authMiddleware.js";
import { PacoteService, ConfiguracaoPacote } from "../services/pacoteService.js";
import { db } from "../db/index.js";
import { eventos, lotes, pacotes, itens_addon, reservas, usuarios, leads_origem } from "../db/schema.js";
import { eq, and, desc, isNull, or } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

const router = Router();

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
  } catch (error) {
    console.error("[PACOTES] Erro ao calcular:", error);
    res.status(500).json({ erro: "Erro ao calcular valor" });
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

    const resultado = await PacoteService.reservarPacote(
      req.usuario.id,
      config.lote_id,
      config,
      ip
    );

    let leadAtualizado: Array<{ id: string }> = [];
    if (req.body.lead_id) {
      leadAtualizado = await db.update(leads_origem).set({
        usuario_id: req.usuario.id,
        lote_id: config.lote_id,
        pacote_id: config.pacote_id || null,
        status: "checkout_iniciado",
        atualizado_em: new Date(),
      }).where(and(
        eq(leads_origem.id, req.body.lead_id),
        or(isNull(leads_origem.usuario_id), eq(leads_origem.usuario_id, req.usuario.id)),
      )).returning({ id: leads_origem.id });
    }

    // Cadastro direto não possui lead_id no navegador. Atualiza o card ligado
    // à conta para que pacote e etapa também apareçam no CRM.
    if (leadAtualizado.length === 0) {
      const leadDaConta = await db.select({ id: leads_origem.id })
        .from(leads_origem)
        .where(eq(leads_origem.usuario_id, req.usuario.id))
        .orderBy(desc(leads_origem.atualizado_em))
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
    });
  } catch (error: any) {
    console.error("[PACOTES] Erro ao reservar:", error);
    res.status(500).json({ erro: error.message || "Erro ao criar reserva" });
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
        valor_total: reservas.valor_total,
        forma_pagamento: reservas.forma_pagamento,
        quantidade_parcelas: reservas.quantidade_parcelas,
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

    res.json({
      total: minhasReservas.length,
      reservas: minhasReservas.map(({ contrato_pdf_url, ...reserva }) => ({
        ...reserva,
        contrato_disponivel: Boolean(contrato_pdf_url),
        voucher_disponivel: reserva.status === "cliente_confirmado",
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
    if (reserva[0].usuario_id !== req.usuario.id && req.usuario.tipo !== "admin") {
      return res.status(403).json({ erro: "Acesso negado" });
    }

    const contratante = await db
      .select({
        nome: usuarios.nome,
        cpf: usuarios.cpf,
        rg: usuarios.rg,
        data_nascimento: usuarios.data_nascimento,
        estado_civil: usuarios.estado_civil,
        profissao: usuarios.profissao,
        endereco: usuarios.endereco,
        nacionalidade: usuarios.nacionalidade,
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
        })
        .from(pacotes)
        .where(eq(pacotes.id, reserva[0].pacote_id))
        .limit(1)
      : [];

    res.json({
      ...reserva[0],
      pacote_nome: pacoteSelecionado[0]?.nome || null,
      pacote_descricao: pacoteSelecionado[0]?.descricao || null,
      modalidade_hospedagem: pacoteSelecionado[0]?.modalidade_hospedagem || null,
      contratante: contratante[0] || null,
    });
  } catch (error) {
    console.error("[PACOTES] Erro ao buscar reserva:", error);
    res.status(500).json({ erro: "Erro ao buscar reserva" });
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
    const { lote_id, nome, descricao, valor_total, itens_selecionados, modalidade_hospedagem, disponibilidade, ativo } = req.body;
    const modalidadesValidas = ["camping", "quarto_ventilador", "quarto_ar_condicionado"];
    const disponibilidadesValidas = ["disponivel", "ultimas_vagas", "esgotado"];

    if (!lote_id || !nome || valor_total === undefined || !modalidade_hospedagem) {
      return res.status(400).json({ erro: "lote_id, nome, valor_total e modalidade_hospedagem são obrigatórios" });
    }
    if (!modalidadesValidas.includes(modalidade_hospedagem)) {
      return res.status(400).json({ erro: "Modalidade de hospedagem inválida" });
    }
    if (disponibilidade && !disponibilidadesValidas.includes(disponibilidade)) {
      return res.status(400).json({ erro: "Disponibilidade inválida" });
    }

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
    const { nome, descricao, valor_total, itens_selecionados, modalidade_hospedagem, disponibilidade, ativo } = req.body;
    const modalidadesValidas = ["camping", "quarto_ventilador", "quarto_ar_condicionado"];
    const disponibilidadesValidas = ["disponivel", "ultimas_vagas", "esgotado"];

    if (modalidade_hospedagem && !modalidadesValidas.includes(modalidade_hospedagem)) {
      return res.status(400).json({ erro: "Modalidade de hospedagem inválida" });
    }
    if (disponibilidade && !disponibilidadesValidas.includes(disponibilidade)) {
      return res.status(400).json({ erro: "Disponibilidade inválida" });
    }

    const atualizado = await db.update(pacotes).set({
      nome: nome || undefined,
      descricao: descricao !== undefined ? descricao : undefined,
      valor_total: valor_total !== undefined ? String(valor_total) : undefined,
      itens_selecionados: itens_selecionados !== undefined ? itens_selecionados : undefined,
      modalidade_hospedagem: modalidade_hospedagem || undefined,
      disponibilidade: disponibilidade || undefined,
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

// Despublicar pacote sem apagar histórico de reservas (admin)
router.delete("/:pacote_id", authMiddleware, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const despublicado = await db.update(pacotes).set({ ativo: false, atualizado_em: new Date() })
      .where(eq(pacotes.id, req.params.pacote_id)).returning();
    if (despublicado.length === 0) {
      return res.status(404).json({ erro: "Pacote não encontrado" });
    }
    res.json({ mensagem: "Pacote despublicado com sucesso", pacote: despublicado[0] });
  } catch (error: any) {
    console.error("[PACOTES] Erro ao despublicar pacote:", error);
    res.status(500).json({ erro: error.message || "Erro ao despublicar pacote" });
  }
});

export default router;
