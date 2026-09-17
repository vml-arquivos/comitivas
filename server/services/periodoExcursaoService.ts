import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "../db/index.js";

function linhas(resultado: any): any[] { return (resultado?.rows || []) as any[]; }
function texto(valor: unknown, limite: number): string { return String(valor ?? "").trim().slice(0, limite); }
function dataObrigatoria(valor: unknown, campo: string): Date {
  const data = new Date(String(valor || ""));
  if (!valor || Number.isNaN(data.getTime())) throw new Error(`${campo} inválida`);
  return data;
}
function dataOpcional(valor: unknown, campo: string): Date | null {
  if (valor === undefined || valor === null || String(valor).trim() === "") return null;
  return dataObrigatoria(valor, campo);
}
function capacidade(valor: unknown, campo: string): number | null {
  if (valor === undefined || valor === null || String(valor).trim() === "") return null;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 0) throw new Error(`${campo} deve ser um número inteiro maior ou igual a zero`);
  return numero;
}
function validarDatas(inicio: Date, fim: Date, embarque: Date | null, retorno: Date | null) {
  if (inicio.getTime() > fim.getTime()) throw new Error("A data inicial deve ser anterior à data final");
  if (embarque && retorno && embarque.getTime() > retorno.getTime()) throw new Error("A saída deve ocorrer antes do retorno");
}
async function validarDentroDaExcursao(tx: any, eventoId: string, inicio: Date, fim: Date) {
  const evento = linhas(await tx.execute(sql`SELECT id, data_inicio, data_fim FROM eventos WHERE id = ${eventoId} FOR SHARE`))[0];
  if (!evento) throw new Error("Excursão não encontrada");
  if (inicio.getTime() < new Date(evento.data_inicio).getTime() || fim.getTime() > new Date(evento.data_fim).getTime()) {
    throw new Error("O período deve estar dentro das datas da excursão");
  }
}

async function atualizarEspelhosVinculados(tx: any, eventoPeriodo: any) {
  // Apenas pacotes que escolheram este período são atualizados. Pacotes que
  // ainda não o selecionaram não ganham uma janela comercial automaticamente.
  await tx.execute(sql`
    UPDATE pacote_periodos
       SET nome = ${eventoPeriodo.nome}, descricao = ${eventoPeriodo.descricao},
           data_inicio = ${eventoPeriodo.data_inicio}, data_fim = ${eventoPeriodo.data_fim},
           data_embarque = ${eventoPeriodo.data_embarque}, data_retorno = ${eventoPeriodo.data_retorno},
           capacidade_transporte_planejada = ${eventoPeriodo.capacidade_transporte_planejada},
           capacidade_hospedagem_planejada = ${eventoPeriodo.capacidade_hospedagem_planejada},
           ordem = ${eventoPeriodo.ordem}, ativo = ${eventoPeriodo.ativo}, atualizado_em = CURRENT_TIMESTAMP
     WHERE evento_periodo_id = ${eventoPeriodo.id}
  `);
}

export class PeriodoExcursaoService {
  static async listar(eventoId: string) {
    const rows = await db.execute(sql`
      SELECT ep.*,
             (SELECT COUNT(*)::int FROM pacote_periodos pp JOIN pacotes p ON p.id = pp.pacote_id JOIN lotes l ON l.id = p.lote_id WHERE pp.evento_periodo_id = ep.id AND p.ativo = true) AS pacotes_total,
             (SELECT COUNT(*)::int FROM saidas_operacionais s WHERE s.evento_periodo_id = ep.id AND s.ativa = true) AS saidas_total,
             (SELECT COUNT(*)::int FROM quartos_hospedagem q WHERE q.evento_periodo_id = ep.id AND q.ativo = true) AS quartos_total
        FROM evento_periodos ep
       WHERE ep.evento_id = ${eventoId}
       ORDER BY ep.ordem, ep.data_inicio, ep.id
    `);
    return linhas(rows);
  }

  static async criar(eventoId: string, input: any) {
    const nome = texto(input?.nome, 255);
    if (nome.length < 2) throw new Error("Informe um nome para o período");
    const inicio = dataObrigatoria(input?.data_inicio, "A data inicial");
    const fim = dataObrigatoria(input?.data_fim, "A data final");
    const embarque = dataOpcional(input?.data_embarque, "A data de embarque");
    const retorno = dataOpcional(input?.data_retorno, "A data de retorno");
    validarDatas(inicio, fim, embarque, retorno);
    const transporte = capacidade(input?.capacidade_transporte_planejada, "A capacidade planejada de transporte");
    const hospedagem = capacidade(input?.capacidade_hospedagem_planejada, "A capacidade planejada de hospedagem");
    return db.transaction(async (tx) => {
      await validarDentroDaExcursao(tx, eventoId, inicio, fim);
      const existente = linhas(await tx.execute(sql`
        SELECT id FROM evento_periodos
         WHERE evento_id = ${eventoId} AND DATE(data_inicio) = DATE(${inicio}) AND DATE(data_fim) = DATE(${fim}) AND ativo = true
         LIMIT 1 FOR UPDATE
      `))[0];
      if (existente) throw new Error("Já existe um período ativo com estas datas nesta excursão");
      const total = Number(linhas(await tx.execute(sql`SELECT COUNT(*)::int AS total FROM evento_periodos WHERE evento_id = ${eventoId}`))[0]?.total || 0);
      const criado = linhas(await tx.execute(sql`
        INSERT INTO evento_periodos (
          id, evento_id, nome, descricao, data_inicio, data_fim, data_embarque, data_retorno,
          capacidade_transporte_planejada, capacidade_hospedagem_planejada, ordem, ativo, criado_em, atualizado_em
        ) VALUES (
          ${createId()}, ${eventoId}, ${nome}, ${texto(input?.descricao, 2000) || null}, ${inicio}, ${fim}, ${embarque}, ${retorno},
          ${transporte}, ${hospedagem}, ${Number.isInteger(Number(input?.ordem)) ? Number(input.ordem) : total},
          ${input?.ativo !== false}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        ) RETURNING *
      `))[0];
      return criado;
    });
  }

  static async atualizar(eventoId: string, periodoId: string, input: any) {
    return db.transaction(async (tx) => {
      const atual = linhas(await tx.execute(sql`SELECT * FROM evento_periodos WHERE id = ${periodoId} AND evento_id = ${eventoId} FOR UPDATE`))[0];
      if (!atual) throw new Error("Período da excursão não encontrado");
      const inicio = input?.data_inicio === undefined ? new Date(atual.data_inicio) : dataObrigatoria(input.data_inicio, "A data inicial");
      const fim = input?.data_fim === undefined ? new Date(atual.data_fim) : dataObrigatoria(input.data_fim, "A data final");
      const embarque = input?.data_embarque === undefined ? (atual.data_embarque ? new Date(atual.data_embarque) : null) : dataOpcional(input.data_embarque, "A data de embarque");
      const retorno = input?.data_retorno === undefined ? (atual.data_retorno ? new Date(atual.data_retorno) : null) : dataOpcional(input.data_retorno, "A data de retorno");
      validarDatas(inicio, fim, embarque, retorno);
      await validarDentroDaExcursao(tx, eventoId, inicio, fim);
      const uso = Number(linhas(await tx.execute(sql`SELECT COUNT(*)::int AS total FROM reservas r WHERE r.evento_periodo_id = ${periodoId} AND r.status::text <> 'abandonado'`))[0]?.total || 0);
      if (uso > 0 && (inicio.getTime() !== new Date(atual.data_inicio).getTime() || fim.getTime() !== new Date(atual.data_fim).getTime())) {
        throw new Error("Não altere as datas de um período que já possui reservas; crie outro período ou arquive este");
      }
      const atualizado = linhas(await tx.execute(sql`
        UPDATE evento_periodos SET
          nome = ${input?.nome === undefined ? atual.nome : texto(input.nome, 255)},
          descricao = ${input?.descricao === undefined ? atual.descricao : (texto(input.descricao, 2000) || null)},
          data_inicio = ${inicio}, data_fim = ${fim}, data_embarque = ${embarque}, data_retorno = ${retorno},
          capacidade_transporte_planejada = ${input?.capacidade_transporte_planejada === undefined ? atual.capacidade_transporte_planejada : capacidade(input.capacidade_transporte_planejada, "A capacidade planejada de transporte")},
          capacidade_hospedagem_planejada = ${input?.capacidade_hospedagem_planejada === undefined ? atual.capacidade_hospedagem_planejada : capacidade(input.capacidade_hospedagem_planejada, "A capacidade planejada de hospedagem")},
          ordem = ${input?.ordem === undefined ? atual.ordem : Number(input.ordem)},
          ativo = ${input?.ativo === undefined ? atual.ativo : Boolean(input.ativo)}, atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ${periodoId} AND evento_id = ${eventoId}
        RETURNING *
      `))[0];
      await atualizarEspelhosVinculados(tx, atualizado);
      return atualizado;
    });
  }

  static async excluir(eventoId: string, periodoId: string) {
    return db.transaction(async (tx) => {
      const periodo = linhas(await tx.execute(sql`SELECT * FROM evento_periodos WHERE id = ${periodoId} AND evento_id = ${eventoId} FOR UPDATE`))[0];
      if (!periodo) throw new Error("Período da excursão não encontrado");
      const uso = Number(linhas(await tx.execute(sql`
        SELECT (
          (SELECT COUNT(*) FROM reservas WHERE evento_periodo_id = ${periodoId} AND status::text <> 'abandonado') +
          (SELECT COUNT(*) FROM pacote_lotes_comerciais plc JOIN pacote_periodos pp ON pp.id = plc.periodo_id WHERE pp.evento_periodo_id = ${periodoId} AND plc.ativo = true) +
          (SELECT COUNT(*) FROM saidas_operacionais WHERE evento_periodo_id = ${periodoId}) +
          (SELECT COUNT(*) FROM quartos_hospedagem WHERE evento_periodo_id = ${periodoId})
        )::int AS total
      `))[0]?.total || 0);
      if (uso > 0) {
        await tx.execute(sql`UPDATE evento_periodos SET ativo = false, atualizado_em = CURRENT_TIMESTAMP WHERE id = ${periodoId}`);
        await tx.execute(sql`UPDATE pacote_periodos SET ativo = false, atualizado_em = CURRENT_TIMESTAMP WHERE evento_periodo_id = ${periodoId}`);
        return { modo: "arquivado", mensagem: "Período arquivado para preservar vendas, recursos e histórico." };
      }
      await tx.execute(sql`DELETE FROM pacote_periodos WHERE evento_periodo_id = ${periodoId}`);
      await tx.execute(sql`DELETE FROM evento_periodos WHERE id = ${periodoId}`);
      return { modo: "excluido", mensagem: "Período excluído definitivamente." };
    });
  }

  /** Vincula uma janela central a um pacote, criando apenas o espelho escolhido. */
  static async adicionarAoPacote(pacoteId: string, eventoPeriodoId: string) {
    return db.transaction(async (tx) => {
      const contexto = linhas(await tx.execute(sql`
        SELECT p.id AS pacote_id, l.evento_id
          FROM pacotes p JOIN lotes l ON l.id = p.lote_id
         WHERE p.id = ${pacoteId} AND p.ativo = true
         FOR SHARE OF p
      `))[0];
      if (!contexto) throw new Error("Pacote não encontrado ou inativo");
      const central = linhas(await tx.execute(sql`SELECT * FROM evento_periodos WHERE id = ${eventoPeriodoId} AND evento_id = ${contexto.evento_id} AND ativo = true FOR SHARE`))[0];
      if (!central) throw new Error("Período não encontrado para a excursão deste pacote");
      const existente = linhas(await tx.execute(sql`SELECT * FROM pacote_periodos WHERE pacote_id = ${pacoteId} AND evento_periodo_id = ${eventoPeriodoId} LIMIT 1 FOR UPDATE`))[0];
      if (existente) return existente;
      const mesmoIntervalo = linhas(await tx.execute(sql`
        SELECT * FROM pacote_periodos
         WHERE pacote_id = ${pacoteId} AND evento_periodo_id IS NULL
           AND DATE(data_inicio) = DATE(${central.data_inicio}) AND DATE(data_fim) = DATE(${central.data_fim})
         ORDER BY criado_em, id LIMIT 1 FOR UPDATE
      `))[0];
      if (mesmoIntervalo) {
        const atualizado = linhas(await tx.execute(sql`UPDATE pacote_periodos SET evento_periodo_id = ${eventoPeriodoId}, nome = ${central.nome}, descricao = ${central.descricao}, data_inicio = ${central.data_inicio}, data_fim = ${central.data_fim}, data_embarque = ${central.data_embarque}, data_retorno = ${central.data_retorno}, capacidade_transporte_planejada = ${central.capacidade_transporte_planejada}, capacidade_hospedagem_planejada = ${central.capacidade_hospedagem_planejada}, ordem = ${central.ordem}, ativo = ${central.ativo}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ${mesmoIntervalo.id} RETURNING *`))[0];
        return atualizado;
      }
      return linhas(await tx.execute(sql`
        INSERT INTO pacote_periodos (
          id, pacote_id, evento_periodo_id, nome, descricao, data_inicio, data_fim, data_embarque, data_retorno,
          capacidade_transporte_planejada, capacidade_hospedagem_planejada, ordem, ativo, criado_em, atualizado_em
        ) VALUES (
          ${createId()}, ${pacoteId}, ${eventoPeriodoId}, ${central.nome}, ${central.descricao}, ${central.data_inicio}, ${central.data_fim},
          ${central.data_embarque}, ${central.data_retorno}, ${central.capacidade_transporte_planejada}, ${central.capacidade_hospedagem_planejada},
          ${central.ordem}, ${central.ativo}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        ) RETURNING *
      `))[0];
    });
  }

  static async removerDoPacote(pacoteId: string, eventoPeriodoId: string) {
    return db.transaction(async (tx) => {
      const periodo = linhas(await tx.execute(sql`SELECT pp.* FROM pacote_periodos pp WHERE pp.pacote_id = ${pacoteId} AND pp.evento_periodo_id = ${eventoPeriodoId} FOR UPDATE`))[0];
      if (!periodo) return { modo: "inexistente", mensagem: "Período já não estava selecionado neste pacote." };
      const uso = Number(linhas(await tx.execute(sql`
        SELECT (
          (SELECT COUNT(*) FROM reservas WHERE periodo_id = ${periodo.id} OR evento_periodo_id = ${eventoPeriodoId}) +
          (SELECT COUNT(*) FROM pacote_lotes_comerciais WHERE periodo_id = ${periodo.id} AND ativo = true) +
          (SELECT COUNT(*) FROM quartos_hospedagem WHERE periodo_id = ${periodo.id} OR evento_periodo_id = ${eventoPeriodoId})
        )::int AS total
      `))[0]?.total || 0);
      if (uso > 0) {
        await tx.execute(sql`UPDATE pacote_periodos SET ativo = false, atualizado_em = CURRENT_TIMESTAMP WHERE id = ${periodo.id}`);
        return { modo: "arquivado", mensagem: "Período desativado para preservar vendas e recursos existentes." };
      }
      await tx.execute(sql`DELETE FROM pacote_periodos WHERE id = ${periodo.id}`);
      return { modo: "excluido", mensagem: "Período retirado do pacote." };
    });
  }

  /** Compatibilidade para o editor legado de período por pacote. */
  static async vincularPeriodoPacote(periodoPacoteId: string) {
    return db.transaction(async (tx) => {
      const pacotePeriodo = linhas(await tx.execute(sql`SELECT pp.*, p.id AS pacote_id, l.evento_id FROM pacote_periodos pp JOIN pacotes p ON p.id = pp.pacote_id JOIN lotes l ON l.id = p.lote_id WHERE pp.id = ${periodoPacoteId} FOR UPDATE`))[0];
      if (!pacotePeriodo) return null;
      let central = pacotePeriodo.evento_periodo_id ? linhas(await tx.execute(sql`SELECT * FROM evento_periodos WHERE id = ${pacotePeriodo.evento_periodo_id} FOR UPDATE`))[0] : undefined;
      if (!central) {
        central = linhas(await tx.execute(sql`SELECT * FROM evento_periodos WHERE evento_id = ${pacotePeriodo.evento_id} AND DATE(data_inicio) = DATE(${pacotePeriodo.data_inicio}) AND DATE(data_fim) = DATE(${pacotePeriodo.data_fim}) ORDER BY ativo DESC, ordem, id LIMIT 1 FOR UPDATE`))[0];
      }
      if (!central) {
        central = linhas(await tx.execute(sql`INSERT INTO evento_periodos (id, evento_id, nome, descricao, data_inicio, data_fim, data_embarque, data_retorno, capacidade_transporte_planejada, capacidade_hospedagem_planejada, ordem, ativo, criado_em, atualizado_em) VALUES (${createId()}, ${pacotePeriodo.evento_id}, ${pacotePeriodo.nome}, ${pacotePeriodo.descricao}, ${pacotePeriodo.data_inicio}, ${pacotePeriodo.data_fim}, ${pacotePeriodo.data_embarque}, ${pacotePeriodo.data_retorno}, ${pacotePeriodo.capacidade_transporte_planejada}, ${pacotePeriodo.capacidade_hospedagem_planejada}, ${pacotePeriodo.ordem}, ${pacotePeriodo.ativo}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING *`))[0];
      }
      await tx.execute(sql`UPDATE pacote_periodos SET evento_periodo_id = ${central.id}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ${periodoPacoteId}`);
      return central;
    });
  }
}
