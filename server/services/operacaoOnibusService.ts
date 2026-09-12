import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { resolverRecursosContratacao } from "./contratacaoRecursos.js";

export type AssentoLayout = { numero: number; fileira: number; posicao: "A" | "B" | "C" | "D" };
export type StatusFilaOnibus = "em_venda" | "aguardando" | "esgotado";

export function classificarFilaOnibus<T extends { total_assentos?: number; capacidade?: number; ocupadas?: number; bloqueadas?: number; em_hold?: number }>(onibus: T[]): Array<T & { fila_status: StatusFilaOnibus; vagas_venda: number }> {
  const vagas = onibus.map((item) => Math.max(0,
    Number(item.total_assentos ?? item.capacidade ?? 0)
    - Number(item.ocupadas || 0)
    - Number(item.bloqueadas || 0)
    - Number(item.em_hold || 0),
  ));
  const indiceEmVenda = vagas.findIndex((total) => total > 0);
  return onibus.map((item, indice) => ({
    ...item,
    vagas_venda: vagas[indice],
    fila_status: vagas[indice] === 0 || indiceEmVenda === -1
      ? "esgotado"
      : indice === indiceEmVenda ? "em_venda" : "aguardando",
  }));
}

export function gerarLayoutAssentos(capacidade: number): AssentoLayout[] {
  if (!Number.isInteger(capacidade) || capacidade < 1 || capacidade > 100) {
    throw new Error("A capacidade deve ser um número inteiro entre 1 e 100");
  }
  const posicoes = ["A", "B", "C", "D"] as const;
  return Array.from({ length: capacidade }, (_, indice) => ({
    numero: indice + 1,
    fileira: Math.floor(indice / 4) + 1,
    posicao: posicoes[indice % 4],
  }));
}

function texto(valor: unknown, limite: number): string {
  return String(valor ?? "").trim().slice(0, limite);
}

function dataOpcional(valor: unknown): Date | null {
  if (!valor) return null;
  const data = new Date(String(valor));
  if (Number.isNaN(data.getTime())) throw new Error("Data inválida");
  return data;
}

function linhas(resultado: unknown): any[] {
  return Array.isArray((resultado as { rows?: unknown[] } | undefined)?.rows)
    ? (resultado as { rows: any[] }).rows
    : [];
}

async function registrar(tx: any, saidaId: string | null, entidade: string, entidadeId: string | null, acao: string, atorId: string, antes?: unknown, depois?: unknown) {
  await tx.execute(sql`INSERT INTO operacao_historico (id, saida_id, entidade, entidade_id, acao, ator_id, antes, depois, criado_em)
    VALUES (${createId()}, ${saidaId}, ${entidade}, ${entidadeId}, ${acao}, ${atorId}, ${antes ? JSON.stringify(antes) : null}::jsonb, ${depois ? JSON.stringify(depois) : null}::jsonb, CURRENT_TIMESTAMP)`);
}

export class OperacaoOnibusService {
  static async alocarPrimeiroDisponivel(loteId: string, reservaId: string, atorId: string) {
    for (let tentativa = 0; tentativa < 3; tentativa += 1) {
      const livre = linhas(await db.execute(sql`SELECT a.id
        FROM saidas_operacionais s
        JOIN onibus_operacionais o ON o.saida_id = s.id AND o.ativo = true
        JOIN assentos_onibus a ON a.onibus_id = o.id AND a.status = 'disponivel'
        WHERE s.lote_id = ${loteId} AND s.ativa = true
          AND NOT EXISTS (SELECT 1 FROM assento_alocacoes aa WHERE aa.assento_id = a.id AND aa.status = 'ativa')
          AND NOT EXISTS (SELECT 1 FROM assento_holds h WHERE h.assento_id = a.id AND h.status = 'ativo' AND h.expira_em > CURRENT_TIMESTAMP)
        ORDER BY o.venda_ordem, o.criado_em, a.numero LIMIT 1`))[0];
      if (!livre) return null;
      try {
        return await this.alocarAssento(livre.id, reservaId, null, atorId);
      } catch (error: any) {
        const mensagem = String(error?.message || "");
        if (!mensagem.includes("acabou de ser ocupada") && !mensagem.includes("aguarda liberação")) throw error;
      }
    }
    // A reserva comercial já foi criada; em contenção extrema a operação pode
    // atribuir depois pelo mapa, sem duplicar ou perder a venda.
    return null;
  }

  static async listar() {
    const saidas = linhas(await db.execute(sql`
      SELECT s.*, l.nome AS lote_nome, l.vagas_totais, l."vagas_disponíveis" AS vagas_disponiveis,
        e.id AS evento_id, e.nome AS evento_nome,
        (SELECT COUNT(*)::int FROM onibus_operacionais o WHERE o.saida_id = s.id AND o.ativo) AS total_onibus,
        (SELECT COALESCE(SUM(o.capacidade), 0)::int FROM onibus_operacionais o WHERE o.saida_id = s.id AND o.ativo) AS capacidade_fisica,
        (SELECT COUNT(*)::int FROM assento_alocacoes aa
          JOIN assentos_onibus a ON a.id = aa.assento_id
          JOIN onibus_operacionais o ON o.id = a.onibus_id
          WHERE o.saida_id = s.id AND o.ativo AND aa.status = 'ativa') AS ocupadas,
        (SELECT COUNT(*)::int FROM assentos_onibus a
          JOIN onibus_operacionais o ON o.id = a.onibus_id
          WHERE o.saida_id = s.id AND o.ativo AND a.status = 'bloqueado') AS bloqueadas,
        (SELECT COUNT(*)::int FROM assento_holds h
          JOIN assentos_onibus a ON a.id = h.assento_id
          JOIN onibus_operacionais o ON o.id = a.onibus_id
          WHERE o.saida_id = s.id AND o.ativo AND h.status = 'ativo' AND h.expira_em > CURRENT_TIMESTAMP) AS em_hold,
        (SELECT COUNT(*)::int FROM checkins_operacao c WHERE c.saida_id = s.id AND c.status = 'presente') AS presentes
      FROM saidas_operacionais s
      JOIN lotes l ON l.id = s.lote_id
      JOIN eventos e ON e.id = l.evento_id
      WHERE s.ativa = true AND l.ativo = true AND e.ativo = true
      ORDER BY COALESCE(s.data_partida, l.data_embarque, l.data_inicio), s.criado_em DESC
    `));
    return saidas.map((saida) => ({
      ...saida,
      vagas_livres_fisicas: Math.max(0, Number(saida.capacidade_fisica) - Number(saida.ocupadas) - Number(saida.bloqueadas) - Number(saida.em_hold)),
      divergencia_capacidade: Number(saida.capacidade_fisica) - Number(saida.vagas_totais),
    }));
  }

  static async criarSaida(input: any, atorId: string) {
    const loteId = texto(input?.lote_id, 120);
    const nome = texto(input?.nome, 160);
    if (!loteId || !nome) throw new Error("Lote e nome da saída são obrigatórios");
    const partida = dataOpcional(input?.data_partida);
    const retorno = dataOpcional(input?.data_retorno);
    if (partida && retorno && retorno < partida) throw new Error("O retorno não pode ser anterior à partida");
    return db.transaction(async (tx) => {
      const lote = linhas(await tx.execute(sql`SELECT id FROM lotes WHERE id = ${loteId} FOR UPDATE`))[0];
      if (!lote) throw new Error("Lote não encontrado");
      const id = createId();
      const criada = linhas(await tx.execute(sql`INSERT INTO saidas_operacionais
        (id, lote_id, nome, data_partida, data_retorno, status, ativa, criado_por, criado_em, atualizado_em)
        VALUES (${id}, ${loteId}, ${nome}, ${partida}, ${retorno}, 'planejamento', true, ${atorId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *`))[0];
      await registrar(tx, id, "saida", id, "saida_criada", atorId, undefined, criada);
      return criada;
    });
  }

  static async atualizarSaida(id: string, input: any, atorId: string) {
    const nome = input?.nome === undefined ? null : texto(input.nome, 160);
    if (input?.nome !== undefined && !nome) throw new Error("O nome da saída não pode ficar vazio");
    const status = input?.status === undefined ? null : texto(input.status, 30);
    if (status && !["planejamento", "confirmada", "em_viagem", "concluida", "cancelada"].includes(status)) throw new Error("Status da saída inválido");
    const ativa = typeof input?.ativa === "boolean" ? input.ativa : null;
    const partida = input?.data_partida === undefined ? undefined : dataOpcional(input.data_partida);
    const retorno = input?.data_retorno === undefined ? undefined : dataOpcional(input.data_retorno);
    return db.transaction(async (tx) => {
      const antes = linhas(await tx.execute(sql`SELECT * FROM saidas_operacionais WHERE id = ${id} FOR UPDATE`))[0];
      if (!antes) throw new Error("Saída não encontrada");
      const partidaFinal = partida === undefined ? antes.data_partida : partida;
      const retornoFinal = retorno === undefined ? antes.data_retorno : retorno;
      if (partidaFinal && retornoFinal && new Date(retornoFinal) < new Date(partidaFinal)) throw new Error("O retorno não pode ser anterior à partida");
      const depois = linhas(await tx.execute(sql`UPDATE saidas_operacionais SET
        nome = COALESCE(${nome}, nome),
        data_partida = CASE WHEN ${partida === undefined} THEN data_partida ELSE ${partida ?? null} END,
        data_retorno = CASE WHEN ${retorno === undefined} THEN data_retorno ELSE ${retorno ?? null} END,
        status = COALESCE(${status}, status), ativa = COALESCE(${ativa}, ativa), atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ${id} RETURNING *`))[0];
      await registrar(tx, id, "saida", id, "saida_atualizada", atorId, antes, depois);
      return depois;
    });
  }

  static async criarOnibus(saidaId: string, input: any, atorId: string) {
    const nome = texto(input?.nome, 120);
    const capacidade = Number(input?.capacidade);
    const layout = gerarLayoutAssentos(capacidade);
    if (!nome) throw new Error("Informe o nome do ônibus");
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`saida:${saidaId}`}))`);
      const saida = linhas(await tx.execute(sql`SELECT id FROM saidas_operacionais WHERE id = ${saidaId} AND ativa = true FOR UPDATE`))[0];
      if (!saida) throw new Error("Saída não encontrada ou arquivada");
      const proximaOrdem = Number(linhas(await tx.execute(sql`SELECT COALESCE(MAX(venda_ordem), 0)::int + 1 AS ordem FROM onibus_operacionais WHERE saida_id = ${saidaId} AND ativo = true`))[0]?.ordem || 1);
      const id = createId();
      const onibus = linhas(await tx.execute(sql`INSERT INTO onibus_operacionais
        (id, saida_id, nome, identificacao, placa, capacidade, venda_ordem, motorista_nome, motorista_telefone, responsavel_nome, status, ativo, criado_em, atualizado_em)
        VALUES (${id}, ${saidaId}, ${nome}, ${texto(input?.identificacao, 120) || null}, ${texto(input?.placa, 12).toUpperCase() || null}, ${capacidade}, ${proximaOrdem},
          ${texto(input?.motorista_nome, 160) || null}, ${texto(input?.motorista_telefone, 20) || null}, ${texto(input?.responsavel_nome, 160) || null},
          'planejamento', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING *`))[0];
      for (const assento of layout) {
        await tx.execute(sql`INSERT INTO assentos_onibus (id, onibus_id, numero, fileira, posicao, status, atualizado_em)
          VALUES (${createId()}, ${id}, ${assento.numero}, ${assento.fileira}, ${assento.posicao}, 'disponivel', CURRENT_TIMESTAMP)`);
      }
      await registrar(tx, saidaId, "onibus", id, "onibus_criado", atorId, undefined, { ...onibus, assentos: capacidade });
      return onibus;
    });
  }

  static async atualizarOnibus(id: string, input: any, atorId: string) {
    const status = input?.status === undefined ? null : texto(input.status, 30);
    if (status && !["planejamento", "confirmado", "em_viagem", "concluido", "cancelado"].includes(status)) throw new Error("Status do ônibus inválido");
    const capacidade = input?.capacidade === undefined ? null : Number(input.capacidade);
    if (capacidade !== null) gerarLayoutAssentos(capacidade);
    return db.transaction(async (tx) => {
      const antes = linhas(await tx.execute(sql`SELECT * FROM onibus_operacionais WHERE id = ${id} FOR UPDATE`))[0];
      if (!antes) throw new Error("Ônibus não encontrado");
      if (input?.ativo === false) {
        const ocupadas = linhas(await tx.execute(sql`SELECT COUNT(*)::int AS total FROM assento_alocacoes aa JOIN assentos_onibus a ON a.id = aa.assento_id WHERE a.onibus_id = ${id} AND aa.status = 'ativa'`))[0];
        if (Number(ocupadas?.total) > 0) throw new Error("Mova ou libere as poltronas ocupadas antes de arquivar o ônibus");
      }
      if (capacidade !== null && capacidade !== Number(antes.capacidade)) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`capacidade-onibus:${id}`}))`);
        if (capacidade < Number(antes.capacidade)) {
          const protegida = linhas(await tx.execute(sql`SELECT a.numero
            FROM assentos_onibus a
            WHERE a.onibus_id = ${id} AND a.numero > ${capacidade}
              AND (
                (a.status = 'bloqueado' AND COALESCE(a.motivo_bloqueio, '') <> 'Fora da capacidade atual')
                OR EXISTS (SELECT 1 FROM assento_alocacoes aa WHERE aa.assento_id = a.id AND aa.status = 'ativa')
                OR EXISTS (SELECT 1 FROM assento_holds h WHERE h.assento_id = a.id AND h.status = 'ativo' AND h.expira_em > CURRENT_TIMESTAMP)
              )
            ORDER BY a.numero LIMIT 1 FOR UPDATE OF a`))[0];
          if (protegida) throw new Error(`A capacidade não pode ser reduzida: a poltrona ${protegida.numero} está ocupada ou bloqueada`);
          await tx.execute(sql`UPDATE assentos_onibus SET status = 'bloqueado', motivo_bloqueio = 'Fora da capacidade atual', atualizado_em = CURRENT_TIMESTAMP
            WHERE onibus_id = ${id} AND numero > ${capacidade}`);
        } else {
          for (const assento of gerarLayoutAssentos(capacidade)) {
            await tx.execute(sql`INSERT INTO assentos_onibus (id, onibus_id, numero, fileira, posicao, status, atualizado_em)
              VALUES (${createId()}, ${id}, ${assento.numero}, ${assento.fileira}, ${assento.posicao}, 'disponivel', CURRENT_TIMESTAMP)
              ON CONFLICT (onibus_id, numero) DO UPDATE SET
                fileira = EXCLUDED.fileira,
                posicao = EXCLUDED.posicao,
                status = CASE WHEN assentos_onibus.motivo_bloqueio = 'Fora da capacidade atual' THEN 'disponivel' ELSE assentos_onibus.status END,
                motivo_bloqueio = CASE WHEN assentos_onibus.motivo_bloqueio = 'Fora da capacidade atual' THEN NULL ELSE assentos_onibus.motivo_bloqueio END,
                atualizado_em = CURRENT_TIMESTAMP`);
          }
        }
      }
      const depois = linhas(await tx.execute(sql`UPDATE onibus_operacionais SET
        nome = COALESCE(${input?.nome === undefined ? null : texto(input.nome, 120)}, nome),
        identificacao = CASE WHEN ${input?.identificacao === undefined} THEN identificacao ELSE ${texto(input?.identificacao, 120) || null} END,
        placa = CASE WHEN ${input?.placa === undefined} THEN placa ELSE ${texto(input?.placa, 12).toUpperCase() || null} END,
        motorista_nome = CASE WHEN ${input?.motorista_nome === undefined} THEN motorista_nome ELSE ${texto(input?.motorista_nome, 160) || null} END,
        motorista_telefone = CASE WHEN ${input?.motorista_telefone === undefined} THEN motorista_telefone ELSE ${texto(input?.motorista_telefone, 20) || null} END,
        responsavel_nome = CASE WHEN ${input?.responsavel_nome === undefined} THEN responsavel_nome ELSE ${texto(input?.responsavel_nome, 160) || null} END,
        capacidade = COALESCE(${capacidade}, capacidade), status = COALESCE(${status}, status), ativo = COALESCE(${typeof input?.ativo === "boolean" ? input.ativo : null}, ativo), atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ${id} RETURNING *`))[0];
      await registrar(tx, antes.saida_id, "onibus", id, "onibus_atualizado", atorId, antes, depois);
      return depois;
    });
  }

  static async excluirOuArquivarOnibus(id: string, atorId: string) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`onibus-excluir:${id}`}))`);
      const antes = linhas(await tx.execute(sql`SELECT * FROM onibus_operacionais WHERE id = ${id} FOR UPDATE`))[0];
      if (!antes) throw new Error("Ônibus não encontrado");
      const protegido = linhas(await tx.execute(sql`SELECT
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM assento_alocacoes aa WHERE aa.assento_id = a.id AND aa.status = 'ativa'))::int AS ocupadas,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM assento_holds h WHERE h.assento_id = a.id AND h.status = 'ativo' AND h.expira_em > CURRENT_TIMESTAMP))::int AS temporarias,
        COUNT(*) FILTER (WHERE a.status = 'bloqueado' AND COALESCE(a.motivo_bloqueio, '') <> 'Fora da capacidade atual')::int AS bloqueadas
        FROM assentos_onibus a WHERE a.onibus_id = ${id}`))[0];
      if (Number(protegido?.ocupadas || 0) + Number(protegido?.temporarias || 0) + Number(protegido?.bloqueadas || 0) > 0) {
        throw new Error("Remaneje as pessoas e desbloqueie os lugares antes de excluir o ônibus");
      }
      const depois = linhas(await tx.execute(sql`UPDATE onibus_operacionais SET ativo = false,
        status = CASE WHEN status = 'concluido' THEN status ELSE 'cancelado' END,
        atualizado_em = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *`))[0];
      await registrar(tx, antes.saida_id, "onibus", id, "onibus_arquivado", atorId, antes, depois);
      return {
        modo: "arquivado",
        mensagem: "Ônibus sem ocupação retirado da operação; o histórico foi preservado.",
      };
    });
  }

  static async excluirOuArquivarSaida(id: string, atorId: string) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`saida-excluir:${id}`}))`);
      const antes = linhas(await tx.execute(sql`SELECT * FROM saidas_operacionais WHERE id = ${id} FOR UPDATE`))[0];
      if (!antes) throw new Error("Saída não encontrada");

      await tx.execute(sql`UPDATE reservas SET saida_operacional_id = NULL, ponto_embarque_id = NULL, atualizado_em = CURRENT_TIMESTAMP
        WHERE saida_operacional_id = ${id}`);
      await tx.execute(sql`UPDATE assento_holds SET status = 'liberado', liberado_em = COALESCE(liberado_em, CURRENT_TIMESTAMP)
        WHERE status = 'ativo' AND assento_id IN (
          SELECT a.id FROM assentos_onibus a JOIN onibus_operacionais o ON o.id = a.onibus_id WHERE o.saida_id = ${id}
        )`);
      await tx.execute(sql`UPDATE assento_alocacoes SET status = 'cancelada', encerrado_em = CURRENT_TIMESTAMP,
        motivo = 'Saída retirada da operação'
        WHERE status = 'ativa' AND assento_id IN (
          SELECT a.id FROM assentos_onibus a JOIN onibus_operacionais o ON o.id = a.onibus_id WHERE o.saida_id = ${id}
        )`);
      await tx.execute(sql`UPDATE pontos_embarque_operacao SET ativo = false WHERE saida_id = ${id}`);
      await tx.execute(sql`UPDATE onibus_operacionais SET ativo = false,
        status = CASE WHEN status = 'concluido' THEN status ELSE 'cancelado' END,
        atualizado_em = CURRENT_TIMESTAMP WHERE saida_id = ${id}`);
      const depois = linhas(await tx.execute(sql`UPDATE saidas_operacionais SET ativa = false,
        status = CASE WHEN status = 'concluida' THEN status ELSE 'cancelada' END,
        atualizado_em = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *`))[0];
      await registrar(tx, id, "saida", id, "saida_arquivada", atorId, antes, depois);
      return {
        modo: "arquivado",
        mensagem: "Saída retirada da operação. Ônibus, passageiros e histórico foram preservados.",
      };
    });
  }

  static async adicionarPonto(saidaId: string, input: any, atorId: string) {
    const nome = texto(input?.nome, 160);
    if (!nome) throw new Error("Informe o nome do ponto de embarque");
    const horario = dataOpcional(input?.horario);
    return db.transaction(async (tx) => {
      const saida = linhas(await tx.execute(sql`SELECT id FROM saidas_operacionais WHERE id = ${saidaId} AND ativa = true`))[0];
      if (!saida) throw new Error("Saída não encontrada ou arquivada");
      const id = createId();
      const ponto = linhas(await tx.execute(sql`INSERT INTO pontos_embarque_operacao (id, saida_id, nome, endereco, horario, ordem, ativo, criado_em)
        VALUES (${id}, ${saidaId}, ${nome}, ${texto(input?.endereco, 1000) || null}, ${horario}, ${Math.max(0, Number(input?.ordem) || 0)}, true, CURRENT_TIMESTAMP) RETURNING *`))[0];
      await registrar(tx, saidaId, "ponto_embarque", id, "ponto_criado", atorId, undefined, ponto);
      return ponto;
    });
  }

  static async obterMapa(saidaId: string) {
    await db.execute(sql`UPDATE assento_holds SET status = 'expirado', liberado_em = CURRENT_TIMESTAMP WHERE status = 'ativo' AND expira_em <= CURRENT_TIMESTAMP`);
    const saida = linhas(await db.execute(sql`SELECT s.*, l.nome AS lote_nome, l.vagas_totais, l."vagas_disponíveis" AS vagas_disponiveis, e.id AS evento_id, e.nome AS evento_nome
      FROM saidas_operacionais s JOIN lotes l ON l.id = s.lote_id JOIN eventos e ON e.id = l.evento_id WHERE s.id = ${saidaId}`))[0];
    if (!saida) throw new Error("Saída não encontrada");
    const onibusBrutos = linhas(await db.execute(sql`SELECT o.*,
      COUNT(a.id)::int AS total_assentos,
      COUNT(aa.id) FILTER (WHERE aa.status = 'ativa')::int AS ocupadas,
      COUNT(a.id) FILTER (WHERE a.status = 'bloqueado')::int AS bloqueadas,
      COUNT(h.id) FILTER (WHERE h.status = 'ativo' AND h.expira_em > CURRENT_TIMESTAMP)::int AS em_hold
      FROM onibus_operacionais o LEFT JOIN assentos_onibus a ON a.onibus_id = o.id AND a.numero <= o.capacidade
      LEFT JOIN assento_alocacoes aa ON aa.assento_id = a.id AND aa.status = 'ativa'
      LEFT JOIN assento_holds h ON h.assento_id = a.id AND h.status = 'ativo' AND h.expira_em > CURRENT_TIMESTAMP
      WHERE o.saida_id = ${saidaId} AND o.ativo = true GROUP BY o.id ORDER BY o.venda_ordem, o.criado_em`));
    const onibus = classificarFilaOnibus(onibusBrutos);
    const assentos = linhas(await db.execute(sql`SELECT a.*, o.nome AS onibus_nome,
      aa.id AS alocacao_id, aa.reserva_id, aa.usuario_id, aa.ponto_embarque_id, aa.alocado_em,
      u.nome AS cliente_nome, u.telefone AS cliente_telefone, r.status AS reserva_status,
      p.nome AS ponto_embarque_nome,
      CASE WHEN h.id IS NOT NULL THEN true ELSE false END AS em_hold
      FROM assentos_onibus a JOIN onibus_operacionais o ON o.id = a.onibus_id
      LEFT JOIN assento_alocacoes aa ON aa.assento_id = a.id AND aa.status = 'ativa'
      LEFT JOIN reservas r ON r.id = aa.reserva_id
      LEFT JOIN usuarios u ON u.id = aa.usuario_id
      LEFT JOIN pontos_embarque_operacao p ON p.id = aa.ponto_embarque_id
      LEFT JOIN assento_holds h ON h.assento_id = a.id AND h.status = 'ativo' AND h.expira_em > CURRENT_TIMESTAMP
      WHERE o.saida_id = ${saidaId} AND o.ativo = true AND a.numero <= o.capacidade ORDER BY o.venda_ordem, o.criado_em, a.numero`));
    const pontos = linhas(await db.execute(sql`SELECT * FROM pontos_embarque_operacao WHERE saida_id = ${saidaId} AND ativo = true ORDER BY ordem, horario NULLS LAST, nome`));
    const reservasDisponiveis = linhas(await db.execute(sql`SELECT r.id, r.usuario_id, r.status, r.valor_total, u.nome AS cliente_nome, u.email AS cliente_email, p.nome AS pacote_nome
      FROM reservas r JOIN usuarios u ON u.id = r.usuario_id AND u.tipo = 'cliente'
      LEFT JOIN pacotes p ON p.id = r.pacote_id
      LEFT JOIN assento_alocacoes aa ON aa.reserva_id = r.id AND aa.status = 'ativa'
      WHERE r.lote_id = ${saida.lote_id} AND r.status <> 'abandonado' AND aa.id IS NULL
        AND (
          COALESCE((r.recursos_contratados->>'transporte')::boolean, false) = true
          OR (r.recursos_contratados = '{}'::jsonb AND (p.modalidade_hospedagem = 'camping' OR p.forma_contratacao IN ('onibus', 'onibus_hospedagem')))
        )
      ORDER BY u.nome, r.criado_em`));
    const capacidade = onibus.reduce((total, item) => total + Number(item.capacidade || 0), 0);
    const ocupadas = onibus.reduce((total, item) => total + Number(item.ocupadas || 0), 0);
    const bloqueadas = assentos.filter((assento) => assento.status === "bloqueado").length;
    const emHold = assentos.filter((assento) => assento.em_hold).length;
    return { saida, onibus, assentos, pontos, reservas_disponiveis: reservasDisponiveis, resumo: { capacidade, ocupadas, livres: Math.max(0, capacidade - ocupadas - bloqueadas - emHold), bloqueadas, em_hold: emHold, divergencia_lote: capacidade - Number(saida.vagas_totais || 0) } };
  }

  static async bloquearAssento(assentoId: string, bloqueado: boolean, motivo: unknown, atorId: string) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`assento:${assentoId}`}))`);
      const antes = linhas(await tx.execute(sql`SELECT a.*, o.saida_id FROM assentos_onibus a JOIN onibus_operacionais o ON o.id = a.onibus_id WHERE a.id = ${assentoId} FOR UPDATE`))[0];
      if (!antes) throw new Error("Poltrona não encontrada");
      if (bloqueado) {
        const ocupada = linhas(await tx.execute(sql`SELECT id FROM assento_alocacoes WHERE assento_id = ${assentoId} AND status = 'ativa'`))[0];
        const hold = linhas(await tx.execute(sql`SELECT id FROM assento_holds WHERE assento_id = ${assentoId} AND status = 'ativo' AND expira_em > CURRENT_TIMESTAMP`))[0];
        if (ocupada || hold) throw new Error("A poltrona está ocupada ou temporariamente reservada");
      }
      const depois = linhas(await tx.execute(sql`UPDATE assentos_onibus SET status = ${bloqueado ? "bloqueado" : "disponivel"}, motivo_bloqueio = ${bloqueado ? texto(motivo, 1000) || "Bloqueio operacional" : null}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ${assentoId} RETURNING *`))[0];
      await registrar(tx, antes.saida_id, "assento", assentoId, bloqueado ? "assento_bloqueado" : "assento_desbloqueado", atorId, antes, depois);
      return depois;
    });
  }

  static async alocarAssento(assentoId: string, reservaId: string, pontoId: string | null, atorId: string) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`assento:${assentoId}`})), pg_advisory_xact_lock(hashtext(${`reserva-assento:${reservaId}`}))`);
      const alvo = linhas(await tx.execute(sql`SELECT a.id AS assento_id, a.numero, a.status AS assento_status, o.id AS onibus_id, o.nome AS onibus_nome, o.saida_id, o.ativo AS onibus_ativo, s.lote_id, s.ativa AS saida_ativa
        FROM assentos_onibus a JOIN onibus_operacionais o ON o.id = a.onibus_id JOIN saidas_operacionais s ON s.id = o.saida_id WHERE a.id = ${assentoId} FOR UPDATE OF a`))[0];
      if (!alvo || !alvo.onibus_ativo || !alvo.saida_ativa) throw new Error("Poltrona não encontrada ou indisponível");
      if (alvo.assento_status !== "disponivel") throw new Error("A poltrona está bloqueada");
      const reserva = linhas(await tx.execute(sql`SELECT r.id, r.usuario_id, r.lote_id, r.status, r.recursos_contratados,
        u.tipo, p.forma_contratacao, p.modalidade_hospedagem
        FROM reservas r JOIN usuarios u ON u.id = r.usuario_id LEFT JOIN pacotes p ON p.id = r.pacote_id
        WHERE r.id = ${reservaId} FOR UPDATE OF r`))[0];
      if (!reserva || reserva.tipo !== "cliente" || reserva.lote_id !== alvo.lote_id || reserva.status === "abandonado") throw new Error("A reserva não pertence a esta saída ou não está disponível");
      const recursosRegistrados = reserva.recursos_contratados;
      const recursos = typeof recursosRegistrados?.transporte === "boolean" && typeof recursosRegistrados?.hospedagem === "boolean"
        ? recursosRegistrados
        : resolverRecursosContratacao(reserva.forma_contratacao, reserva.modalidade_hospedagem);
      if (!recursos.transporte) throw new Error("Este pacote não inclui transporte");
      const atual = linhas(await tx.execute(sql`SELECT aa.*, a.numero, o.nome AS onibus_nome FROM assento_alocacoes aa JOIN assentos_onibus a ON a.id = aa.assento_id JOIN onibus_operacionais o ON o.id = a.onibus_id WHERE aa.reserva_id = ${reservaId} AND aa.status = 'ativa' FOR UPDATE OF aa`))[0];
      if (atual?.assento_id === assentoId) return atual;
      if (atual) throw new Error(`A reserva já ocupa a poltrona ${atual.numero} do ${atual.onibus_nome}; use a ação Mover`);
      const ocupada = linhas(await tx.execute(sql`SELECT id FROM assento_alocacoes WHERE assento_id = ${assentoId} AND status = 'ativa'`))[0];
      const hold = linhas(await tx.execute(sql`SELECT id FROM assento_holds WHERE assento_id = ${assentoId} AND status = 'ativo' AND expira_em > CURRENT_TIMESTAMP`))[0];
      if (ocupada || hold) throw new Error("A poltrona acabou de ser ocupada; escolha outra");
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`fila-onibus:${alvo.saida_id}`}))`);
      const onibusEmVenda = linhas(await tx.execute(sql`SELECT o.id, o.nome, o.venda_ordem
        FROM onibus_operacionais o
        WHERE o.saida_id = ${alvo.saida_id} AND o.ativo = true
          AND EXISTS (
            SELECT 1 FROM assentos_onibus livre
            WHERE livre.onibus_id = o.id AND livre.status = 'disponivel'
              AND NOT EXISTS (SELECT 1 FROM assento_alocacoes aa WHERE aa.assento_id = livre.id AND aa.status = 'ativa')
              AND NOT EXISTS (SELECT 1 FROM assento_holds h WHERE h.assento_id = livre.id AND h.status = 'ativo' AND h.expira_em > CURRENT_TIMESTAMP)
          )
        ORDER BY o.venda_ordem, o.criado_em LIMIT 1`))[0];
      if (!onibusEmVenda) throw new Error("Todos os ônibus desta saída estão esgotados");
      if (onibusEmVenda.id !== alvo.onibus_id) throw new Error(`Este ônibus ainda aguarda liberação. Complete primeiro o ${onibusEmVenda.nome}`);
      if (pontoId) {
        const ponto = linhas(await tx.execute(sql`SELECT id FROM pontos_embarque_operacao WHERE id = ${pontoId} AND saida_id = ${alvo.saida_id} AND ativo = true`))[0];
        if (!ponto) throw new Error("Ponto de embarque inválido para esta saída");
      }
      const id = createId();
      const alocacao = linhas(await tx.execute(sql`INSERT INTO assento_alocacoes (id, assento_id, reserva_id, usuario_id, ponto_embarque_id, status, alocado_por, alocado_em)
        VALUES (${id}, ${assentoId}, ${reservaId}, ${reserva.usuario_id}, ${pontoId}, 'ativa', ${atorId}, CURRENT_TIMESTAMP) RETURNING *`))[0];
      await tx.execute(sql`UPDATE reservas SET saida_operacional_id = ${alvo.saida_id}, ponto_embarque_id = ${pontoId}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ${reservaId}`);
      await tx.execute(sql`INSERT INTO checkins_operacao (id, saida_id, reserva_id, status, atualizado_em) VALUES (${createId()}, ${alvo.saida_id}, ${reservaId}, 'pendente', CURRENT_TIMESTAMP) ON CONFLICT (saida_id, reserva_id) DO NOTHING`);
      await registrar(tx, alvo.saida_id, "alocacao", id, "assento_alocado", atorId, undefined, { reserva_id: reservaId, usuario_id: reserva.usuario_id, onibus_id: alvo.onibus_id, poltrona: alvo.numero, ponto_embarque_id: pontoId });
      return alocacao;
    });
  }

  static async moverAlocacao(alocacaoId: string, novoAssentoId: string, pontoId: string | null | undefined, atorId: string) {
    return db.transaction(async (tx) => {
      const atual = linhas(await tx.execute(sql`SELECT aa.*, a.numero, o.nome AS onibus_nome, o.saida_id FROM assento_alocacoes aa JOIN assentos_onibus a ON a.id = aa.assento_id JOIN onibus_operacionais o ON o.id = a.onibus_id WHERE aa.id = ${alocacaoId} AND aa.status = 'ativa' FOR UPDATE OF aa`))[0];
      if (!atual) throw new Error("Alocação ativa não encontrada");
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`assento:${novoAssentoId}`})), pg_advisory_xact_lock(hashtext(${`reserva-assento:${atual.reserva_id}`}))`);
      const novo = linhas(await tx.execute(sql`SELECT a.*, o.nome AS onibus_nome, o.saida_id, o.ativo FROM assentos_onibus a JOIN onibus_operacionais o ON o.id = a.onibus_id WHERE a.id = ${novoAssentoId} FOR UPDATE OF a`))[0];
      if (!novo || !novo.ativo || novo.saida_id !== atual.saida_id || novo.status !== "disponivel") throw new Error("A nova poltrona não pertence à mesma saída ou está indisponível");
      const ocupada = linhas(await tx.execute(sql`SELECT id FROM assento_alocacoes WHERE assento_id = ${novoAssentoId} AND status = 'ativa'`))[0];
      const hold = linhas(await tx.execute(sql`SELECT id FROM assento_holds WHERE assento_id = ${novoAssentoId} AND status = 'ativo' AND expira_em > CURRENT_TIMESTAMP`))[0];
      if (ocupada || hold) throw new Error("A nova poltrona acabou de ser ocupada");
      const pontoFinal = pontoId === undefined ? atual.ponto_embarque_id : pontoId;
      if (pontoFinal) {
        const ponto = linhas(await tx.execute(sql`SELECT id FROM pontos_embarque_operacao WHERE id = ${pontoFinal} AND saida_id = ${atual.saida_id} AND ativo = true`))[0];
        if (!ponto) throw new Error("Ponto de embarque inválido");
      }
      await tx.execute(sql`UPDATE assento_alocacoes SET status = 'movida', encerrado_em = CURRENT_TIMESTAMP, motivo = 'Mudança de poltrona' WHERE id = ${alocacaoId}`);
      const id = createId();
      const criada = linhas(await tx.execute(sql`INSERT INTO assento_alocacoes (id, assento_id, reserva_id, usuario_id, ponto_embarque_id, status, alocado_por, alocado_em)
        VALUES (${id}, ${novoAssentoId}, ${atual.reserva_id}, ${atual.usuario_id}, ${pontoFinal}, 'ativa', ${atorId}, CURRENT_TIMESTAMP) RETURNING *`))[0];
      await tx.execute(sql`UPDATE reservas SET ponto_embarque_id = ${pontoFinal}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ${atual.reserva_id}`);
      await registrar(tx, atual.saida_id, "alocacao", id, "assento_movido", atorId, { onibus: atual.onibus_nome, poltrona: atual.numero }, { onibus: novo.onibus_nome, poltrona: novo.numero, ponto_embarque_id: pontoFinal });
      return criada;
    });
  }

  static async liberarAlocacao(alocacaoId: string, motivo: unknown, atorId: string) {
    return db.transaction(async (tx) => {
      const atual = linhas(await tx.execute(sql`SELECT aa.*, o.saida_id, a.numero, o.nome AS onibus_nome FROM assento_alocacoes aa JOIN assentos_onibus a ON a.id = aa.assento_id JOIN onibus_operacionais o ON o.id = a.onibus_id WHERE aa.id = ${alocacaoId} AND aa.status = 'ativa' FOR UPDATE OF aa`))[0];
      if (!atual) throw new Error("Alocação ativa não encontrada");
      const justificativa = texto(motivo, 1000) || "Liberação operacional";
      await tx.execute(sql`UPDATE assento_alocacoes SET status = 'cancelada', encerrado_em = CURRENT_TIMESTAMP, motivo = ${justificativa} WHERE id = ${alocacaoId}`);
      await tx.execute(sql`UPDATE reservas SET saida_operacional_id = NULL, ponto_embarque_id = NULL, atualizado_em = CURRENT_TIMESTAMP WHERE id = ${atual.reserva_id} AND saida_operacional_id = ${atual.saida_id}`);
      await registrar(tx, atual.saida_id, "alocacao", alocacaoId, "assento_liberado", atorId, atual, { motivo: justificativa });
      return { id: alocacaoId, status: "cancelada" };
    });
  }

  static async registrarCheckin(saidaId: string, reservaId: string, status: string, observacoes: unknown, atorId: string) {
    if (!["pendente", "presente", "ausente"].includes(status)) throw new Error("Status de embarque inválido");
    return db.transaction(async (tx) => {
      const alocacao = linhas(await tx.execute(sql`SELECT aa.id FROM assento_alocacoes aa JOIN assentos_onibus a ON a.id = aa.assento_id JOIN onibus_operacionais o ON o.id = a.onibus_id WHERE o.saida_id = ${saidaId} AND aa.reserva_id = ${reservaId} AND aa.status = 'ativa'`))[0];
      if (!alocacao) throw new Error("A reserva não possui poltrona ativa nesta saída");
      const checkin = linhas(await tx.execute(sql`INSERT INTO checkins_operacao (id, saida_id, reserva_id, status, confirmado_em, confirmado_por, observacoes, atualizado_em)
        VALUES (${createId()}, ${saidaId}, ${reservaId}, ${status}, ${status === "presente" ? new Date() : null}, ${atorId}, ${texto(observacoes, 1000) || null}, CURRENT_TIMESTAMP)
        ON CONFLICT (saida_id, reserva_id) DO UPDATE SET status = EXCLUDED.status, confirmado_em = EXCLUDED.confirmado_em, confirmado_por = EXCLUDED.confirmado_por, observacoes = EXCLUDED.observacoes, atualizado_em = CURRENT_TIMESTAMP RETURNING *`))[0];
      await registrar(tx, saidaId, "checkin", checkin.id, "checkin_atualizado", atorId, undefined, { reserva_id: reservaId, status });
      return checkin;
    });
  }

  static async obterManifesto(saidaId: string) {
    const mapa = await this.obterMapa(saidaId);
    const passageiros = linhas(await db.execute(sql`SELECT aa.reserva_id, u.nome, u.cpf, u.telefone, u.email, o.nome AS onibus, o.identificacao, a.numero AS poltrona,
      p.nome AS ponto_embarque, p.endereco AS ponto_endereco, p.horario AS ponto_horario, c.status AS checkin_status, c.confirmado_em
      FROM assento_alocacoes aa JOIN assentos_onibus a ON a.id = aa.assento_id JOIN onibus_operacionais o ON o.id = a.onibus_id
      JOIN usuarios u ON u.id = aa.usuario_id LEFT JOIN pontos_embarque_operacao p ON p.id = aa.ponto_embarque_id
      LEFT JOIN checkins_operacao c ON c.saida_id = o.saida_id AND c.reserva_id = aa.reserva_id
      WHERE o.saida_id = ${saidaId} AND aa.status = 'ativa' ORDER BY o.nome, a.numero`));
    return { saida: mapa.saida, resumo: mapa.resumo, passageiros };
  }
}
