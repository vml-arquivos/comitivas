import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";

function linhas(resultado: unknown): any[] {
  return Array.isArray((resultado as { rows?: unknown[] } | undefined)?.rows)
    ? (resultado as { rows: any[] }).rows
    : [];
}
function texto(valor: unknown, limite: number): string { return String(valor ?? "").trim().slice(0, limite); }

export type ConfiguracaoQuartosLote = {
  quantidade: number;
  capacidade: number;
  genero: "masculino" | "feminino";
  estrutura: "ar_condicionado" | "ventilador" | "sem_climatizacao" | "outro";
};

const ESTRUTURAS_QUARTO: Record<ConfiguracaoQuartosLote["estrutura"], string> = {
  ar_condicionado: "Ar-condicionado",
  ventilador: "Ventilador",
  sem_climatizacao: "Sem climatização",
  outro: "Outro",
};

export function normalizarConfiguracoesQuartos(valor: unknown): ConfiguracaoQuartosLote[] {
  if (!Array.isArray(valor) || valor.length < 1 || valor.length > 20) {
    throw new Error("Inclua de 1 a 20 configurações de quartos");
  }
  const configuracoes = valor.map((item: any) => {
    const quantidade = Number(item?.quantidade);
    const capacidade = Number(item?.capacidade);
    const genero = texto(item?.genero, 20) as ConfiguracaoQuartosLote["genero"];
    const estrutura = texto(item?.estrutura, 30) as ConfiguracaoQuartosLote["estrutura"];
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 50) throw new Error("A quantidade deve ficar entre 1 e 50 quartos por linha");
    if (!Number.isInteger(capacidade) || capacidade < 1 || capacidade > 30) throw new Error("Cada quarto deve possuir de 1 a 30 vagas");
    if (!["masculino", "feminino"].includes(genero)) throw new Error("Selecione o grupo masculino ou feminino");
    if (!Object.prototype.hasOwnProperty.call(ESTRUTURAS_QUARTO, estrutura)) throw new Error("Selecione a estrutura do quarto");
    return { quantidade, capacidade, genero, estrutura };
  });
  if (configuracoes.reduce((total, item) => total + item.quantidade, 0) > 100) {
    throw new Error("Cadastre no máximo 100 quartos por operação");
  }
  return configuracoes;
}

async function registrar(tx: any, entidade: string, entidadeId: string, acao: string, atorId: string, antes?: unknown, depois?: unknown) {
  await tx.execute(sql`INSERT INTO operacao_historico (id, saida_id, entidade, entidade_id, acao, ator_id, antes, depois, criado_em)
    VALUES (${createId()}, NULL, ${entidade}, ${entidadeId}, ${acao}, ${atorId}, ${antes ? JSON.stringify(antes) : null}::jsonb, ${depois ? JSON.stringify(depois) : null}::jsonb, CURRENT_TIMESTAMP)`);
}

export class HospedagemService {
  static async obterMapa(loteId: string) {
    const lote = linhas(await db.execute(sql`SELECT l.*, e.nome AS evento_nome FROM lotes l JOIN eventos e ON e.id = l.evento_id WHERE l.id = ${loteId}`))[0];
    if (!lote) throw new Error("Lote não encontrado");
    const quartos = linhas(await db.execute(sql`SELECT q.*, p.nome AS pacote_nome,
      COUNT(qa.id) FILTER (WHERE qa.status = 'ativa')::int AS ocupadas
      FROM quartos_hospedagem q LEFT JOIN pacotes p ON p.id = q.pacote_id
      LEFT JOIN quarto_alocacoes qa ON qa.quarto_id = q.id AND qa.status = 'ativa'
      WHERE q.lote_id = ${loteId} AND q.ativo = true GROUP BY q.id, p.nome ORDER BY q.genero, q.nome`));
    const alocacoes = linhas(await db.execute(sql`SELECT qa.*, q.nome AS quarto_nome, q.genero, u.nome AS cliente_nome,
      u.email AS cliente_email, p.nome AS pacote_nome
      FROM quarto_alocacoes qa JOIN quartos_hospedagem q ON q.id = qa.quarto_id
      JOIN usuarios u ON u.id = qa.usuario_id JOIN reservas r ON r.id = qa.reserva_id
      LEFT JOIN pacotes p ON p.id = r.pacote_id
      WHERE q.lote_id = ${loteId} AND qa.status = 'ativa' ORDER BY q.genero, q.nome, qa.numero_vaga`));
    const reservas = linhas(await db.execute(sql`SELECT r.id, r.usuario_id, u.nome AS cliente_nome, u.email AS cliente_email,
      r.pacote_id, p.nome AS pacote_nome
      FROM reservas r JOIN usuarios u ON u.id = r.usuario_id AND u.tipo = 'cliente'
      LEFT JOIN pacotes p ON p.id = r.pacote_id
      LEFT JOIN quarto_alocacoes qa ON qa.reserva_id = r.id AND qa.status = 'ativa'
      WHERE r.lote_id = ${loteId} AND r.status <> 'abandonado' AND qa.id IS NULL
      ORDER BY u.nome, r.criado_em`));
    const capacidade = quartos.reduce((total, q) => total + Number(q.capacidade || 0), 0);
    return { lote, local_hospedagem: lote.local_hospedagem || null, quartos: quartos.map((q) => ({ ...q, livres: Math.max(0, Number(q.capacidade) - Number(q.ocupadas)) })), alocacoes, reservas_disponiveis: reservas, resumo: { quartos: quartos.length, capacidade, ocupadas: alocacoes.length, livres: Math.max(0, capacidade - alocacoes.length), masculinas: quartos.filter((q) => q.genero === "masculino").reduce((t, q) => t + Number(q.capacidade), 0), femininas: quartos.filter((q) => q.genero === "feminino").reduce((t, q) => t + Number(q.capacidade), 0) } };
  }

  static async salvarQuarto(loteId: string, id: string | null, input: any, atorId: string) {
    const nome = texto(input?.nome, 120);
    const genero = texto(input?.genero, 20);
    const capacidade = Number(input?.capacidade);
    const pacoteId = texto(input?.pacote_id, 120) || null;
    if (!nome || !["masculino", "feminino"].includes(genero)) throw new Error("Informe nome e grupo do quarto");
    if (!Number.isInteger(capacidade) || capacidade < 1 || capacidade > 30) throw new Error("A capacidade deve ficar entre 1 e 30");
    return db.transaction(async (tx) => {
      const lote = linhas(await tx.execute(sql`SELECT id FROM lotes WHERE id = ${loteId} FOR UPDATE`))[0];
      if (!lote) throw new Error("Lote não encontrado");
      if (pacoteId) {
        const pacote = linhas(await tx.execute(sql`SELECT id FROM pacotes WHERE id = ${pacoteId} AND lote_id = ${loteId}`))[0];
        if (!pacote) throw new Error("Pacote inválido para este lote");
      }
      if (!id) {
        const novoId = createId();
        const criado = linhas(await tx.execute(sql`INSERT INTO quartos_hospedagem (id, lote_id, pacote_id, nome, genero, capacidade, observacoes, ativo, criado_por, criado_em, atualizado_em)
          VALUES (${novoId}, ${loteId}, ${pacoteId}, ${nome}, ${genero}, ${capacidade}, ${texto(input?.observacoes, 2000) || null}, true, ${atorId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING *`))[0];
        await registrar(tx, "quarto", novoId, "quarto_criado", atorId, undefined, criado);
        return criado;
      }
      const antes = linhas(await tx.execute(sql`SELECT * FROM quartos_hospedagem WHERE id = ${id} AND lote_id = ${loteId} FOR UPDATE`))[0];
      if (!antes) throw new Error("Quarto não encontrado");
      const ocupadas = Number(linhas(await tx.execute(sql`SELECT COUNT(*)::int AS total FROM quarto_alocacoes WHERE quarto_id = ${id} AND status = 'ativa'`))[0]?.total || 0);
      if (capacidade < ocupadas) throw new Error("A capacidade não pode ser menor que a ocupação atual");
      const depois = linhas(await tx.execute(sql`UPDATE quartos_hospedagem SET pacote_id = ${pacoteId}, nome = ${nome}, genero = ${genero}, capacidade = ${capacidade}, observacoes = ${texto(input?.observacoes, 2000) || null}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *`))[0];
      await registrar(tx, "quarto", id, "quarto_atualizado", atorId, antes, depois);
      return depois;
    });
  }

  static async criarQuartosEmLote(loteId: string, input: any, atorId: string) {
    const titulo = texto(input?.titulo, 72);
    const pacoteId = texto(input?.pacote_id, 120) || null;
    const observacoes = texto(input?.observacoes, 2000) || null;
    const chaveIdempotencia = texto(input?.chave_idempotencia, 120);
    const configuracoes = normalizarConfiguracoesQuartos(input?.configuracoes);
    if (titulo.length < 3) throw new Error("Informe um título para identificar os quartos");
    if (!/^[a-zA-Z0-9_-]{12,120}$/.test(chaveIdempotencia)) throw new Error("Identificador da operação inválido; abra o formulário novamente");

    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`quartos-lote:${chaveIdempotencia}`}))`);
      const repetida = linhas(await tx.execute(sql`SELECT id FROM operacao_historico
        WHERE entidade = 'quartos_lote' AND entidade_id = ${chaveIdempotencia} AND acao = 'quartos_criados_em_lote' LIMIT 1`))[0];
      if (repetida) return { quantidade: 0, quartos: [], reutilizado: true };

      const lote = linhas(await tx.execute(sql`SELECT id FROM lotes WHERE id = ${loteId} FOR UPDATE`))[0];
      if (!lote) throw new Error("Lote não encontrado");
      if (pacoteId) {
        const pacote = linhas(await tx.execute(sql`SELECT id FROM pacotes WHERE id = ${pacoteId} AND lote_id = ${loteId} AND ativo = true`))[0];
        if (!pacote) throw new Error("Pacote inválido ou inativo para este período");
      }

      const criados: any[] = [];
      const sequencias = new Map<string, number>();
      for (const configuracao of configuracoes) {
        const estrutura = ESTRUTURAS_QUARTO[configuracao.estrutura];
        const grupo = configuracao.genero === "feminino" ? "F" : "M";
        const prefixo = `${titulo} · ${estrutura} · ${grupo}`;
        let sequencia = sequencias.get(prefixo);
        if (sequencia === undefined) {
          sequencia = Number(linhas(await tx.execute(sql`SELECT COUNT(*)::int AS total FROM quartos_hospedagem
            WHERE lote_id = ${loteId} AND nome LIKE ${`${prefixo}%`}`))[0]?.total || 0);
        }
        for (let indice = 0; indice < configuracao.quantidade; indice += 1) {
          sequencia += 1;
          const id = createId();
          const nome = `${prefixo}${String(sequencia).padStart(2, "0")}`;
          const criado = linhas(await tx.execute(sql`INSERT INTO quartos_hospedagem
            (id, lote_id, pacote_id, nome, genero, capacidade, observacoes, ativo, criado_por, criado_em, atualizado_em)
            VALUES (${id}, ${loteId}, ${pacoteId}, ${nome}, ${configuracao.genero}, ${configuracao.capacidade}, ${observacoes}, true, ${atorId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING *`))[0];
          criados.push(criado);
          await registrar(tx, "quarto", id, "quarto_criado", atorId, undefined, { ...criado, origem: "lote", chave_idempotencia: chaveIdempotencia });
        }
        sequencias.set(prefixo, sequencia);
      }
      await registrar(tx, "quartos_lote", chaveIdempotencia, "quartos_criados_em_lote", atorId, undefined, {
        lote_id: loteId,
        pacote_id: pacoteId,
        titulo,
        quantidade: criados.length,
        ids: criados.map((quarto) => quarto.id),
      });
      return { quantidade: criados.length, quartos: criados, reutilizado: false };
    });
  }

  static async arquivarQuarto(id: string, atorId: string) {
    return db.transaction(async (tx) => {
      const antes = linhas(await tx.execute(sql`SELECT * FROM quartos_hospedagem WHERE id = ${id} FOR UPDATE`))[0];
      if (!antes) throw new Error("Quarto não encontrado");
      const ocupadas = Number(linhas(await tx.execute(sql`SELECT COUNT(*)::int AS total FROM quarto_alocacoes WHERE quarto_id = ${id} AND status = 'ativa'`))[0]?.total || 0);
      if (ocupadas > 0) throw new Error("Remaneje ou libere os hóspedes antes de excluir o quarto");
      const depois = linhas(await tx.execute(sql`UPDATE quartos_hospedagem SET ativo = false, atualizado_em = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *`))[0];
      await registrar(tx, "quarto", id, "quarto_arquivado", atorId, antes, depois);
      return depois;
    });
  }

  static async alocar(quartoId: string, reservaId: string, atorId: string) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`quarto:${quartoId}`})), pg_advisory_xact_lock(hashtext(${`reserva-quarto:${reservaId}`}))`);
      const quarto = linhas(await tx.execute(sql`SELECT * FROM quartos_hospedagem WHERE id = ${quartoId} AND ativo = true FOR UPDATE`))[0];
      if (!quarto) throw new Error("Quarto não encontrado");
      const reserva = linhas(await tx.execute(sql`SELECT r.id, r.usuario_id, r.lote_id, r.pacote_id, r.status, u.tipo FROM reservas r JOIN usuarios u ON u.id = r.usuario_id WHERE r.id = ${reservaId} FOR UPDATE OF r`))[0];
      if (!reserva || reserva.tipo !== "cliente" || reserva.status === "abandonado" || reserva.lote_id !== quarto.lote_id) throw new Error("A reserva não pertence a esta hospedagem");
      if (quarto.pacote_id && quarto.pacote_id !== reserva.pacote_id) throw new Error("Este quarto é exclusivo de outro pacote");
      const existente = linhas(await tx.execute(sql`SELECT id FROM quarto_alocacoes WHERE reserva_id = ${reservaId} AND status = 'ativa'`))[0];
      if (existente) throw new Error("A reserva já possui quarto; use Remanejar");
      const vaga = linhas(await tx.execute(sql`SELECT serie.numero FROM generate_series(1, ${Number(quarto.capacidade)}) AS serie(numero)
        WHERE NOT EXISTS (SELECT 1 FROM quarto_alocacoes qa WHERE qa.quarto_id = ${quartoId} AND qa.numero_vaga = serie.numero AND qa.status = 'ativa') ORDER BY serie.numero LIMIT 1`))[0];
      if (!vaga) throw new Error("Este quarto está lotado");
      const id = createId();
      const criada = linhas(await tx.execute(sql`INSERT INTO quarto_alocacoes (id, quarto_id, reserva_id, usuario_id, numero_vaga, status, alocado_por, alocado_em)
        VALUES (${id}, ${quartoId}, ${reservaId}, ${reserva.usuario_id}, ${Number(vaga.numero)}, 'ativa', ${atorId}, CURRENT_TIMESTAMP) RETURNING *`))[0];
      await registrar(tx, "quarto_alocacao", id, "hospede_alocado", atorId, undefined, { ...criada, genero: quarto.genero, quarto: quarto.nome });
      return criada;
    });
  }

  static async mover(alocacaoId: string, quartoId: string, atorId: string) {
    return db.transaction(async (tx) => {
      const atual = linhas(await tx.execute(sql`SELECT qa.*, q.lote_id, q.nome AS quarto_nome FROM quarto_alocacoes qa JOIN quartos_hospedagem q ON q.id = qa.quarto_id WHERE qa.id = ${alocacaoId} AND qa.status = 'ativa' FOR UPDATE OF qa`))[0];
      if (!atual) throw new Error("Alocação ativa não encontrada");
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`quarto:${quartoId}`})), pg_advisory_xact_lock(hashtext(${`reserva-quarto:${atual.reserva_id}`}))`);
      const destino = linhas(await tx.execute(sql`SELECT q.*, q.pacote_id AS quarto_pacote_id, r.pacote_id AS reserva_pacote_id FROM quartos_hospedagem q JOIN reservas r ON r.id = ${atual.reserva_id} WHERE q.id = ${quartoId} AND q.ativo = true FOR UPDATE OF q`))[0];
      if (!destino || destino.lote_id !== atual.lote_id) throw new Error("O quarto de destino não pertence à mesma viagem");
      if (destino.quarto_pacote_id && destino.quarto_pacote_id !== destino.reserva_pacote_id) throw new Error("O quarto de destino pertence a outro pacote");
      const vaga = linhas(await tx.execute(sql`SELECT serie.numero FROM generate_series(1, ${Number(destino.capacidade)}) AS serie(numero)
        WHERE NOT EXISTS (SELECT 1 FROM quarto_alocacoes qa WHERE qa.quarto_id = ${quartoId} AND qa.numero_vaga = serie.numero AND qa.status = 'ativa') ORDER BY serie.numero LIMIT 1`))[0];
      if (!vaga) throw new Error("O quarto de destino está lotado");
      await tx.execute(sql`UPDATE quarto_alocacoes SET status = 'movida', encerrado_em = CURRENT_TIMESTAMP, motivo = 'Remanejamento de quarto' WHERE id = ${alocacaoId}`);
      const id = createId();
      const criada = linhas(await tx.execute(sql`INSERT INTO quarto_alocacoes (id, quarto_id, reserva_id, usuario_id, numero_vaga, status, alocado_por, alocado_em)
        VALUES (${id}, ${quartoId}, ${atual.reserva_id}, ${atual.usuario_id}, ${Number(vaga.numero)}, 'ativa', ${atorId}, CURRENT_TIMESTAMP) RETURNING *`))[0];
      await registrar(tx, "quarto_alocacao", id, "hospede_remanejado", atorId, { quarto: atual.quarto_nome, vaga: atual.numero_vaga }, { quarto: destino.nome, vaga: vaga.numero, genero: destino.genero });
      return criada;
    });
  }

  static async liberar(alocacaoId: string, motivo: unknown, atorId: string) {
    return db.transaction(async (tx) => {
      const atual = linhas(await tx.execute(sql`SELECT qa.*, q.nome AS quarto_nome FROM quarto_alocacoes qa JOIN quartos_hospedagem q ON q.id = qa.quarto_id WHERE qa.id = ${alocacaoId} AND qa.status = 'ativa' FOR UPDATE OF qa`))[0];
      if (!atual) throw new Error("Alocação ativa não encontrada");
      const justificativa = texto(motivo, 1000) || "Liberação operacional";
      await tx.execute(sql`UPDATE quarto_alocacoes SET status = 'cancelada', encerrado_em = CURRENT_TIMESTAMP, motivo = ${justificativa} WHERE id = ${alocacaoId}`);
      await registrar(tx, "quarto_alocacao", alocacaoId, "hospede_liberado", atorId, atual, { motivo: justificativa });
      return { id: alocacaoId, status: "cancelada" };
    });
  }
}
