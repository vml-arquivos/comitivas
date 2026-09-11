import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";

export type ResultadoExclusao = {
  modo: "excluido" | "arquivado";
  mensagem: string;
};

function linhas(resultado: unknown): any[] {
  return Array.isArray((resultado as { rows?: unknown[] } | undefined)?.rows)
    ? (resultado as { rows: any[] }).rows
    : [];
}

async function auditar(tx: any, ator: { id: string; tipo: string }, entidade: string, entidadeId: string, modo: ResultadoExclusao["modo"], antes: unknown) {
  await tx.execute(sql`INSERT INTO auditoria_admin
    (id, ator_id, ator_tipo, acao, entidade, entidade_id, antes, depois, criado_em)
    VALUES (${createId()}, ${ator.id}, ${ator.tipo}, ${`${entidade}_${modo}`}, ${entidade}, ${entidadeId},
      ${JSON.stringify(antes)}::jsonb, ${JSON.stringify({ modo })}::jsonb, CURRENT_TIMESTAMP)`);
}

async function arquivarOperacaoDoLote(tx: any, loteId: string) {
  await tx.execute(sql`UPDATE assento_holds SET status = 'liberado', liberado_em = COALESCE(liberado_em, CURRENT_TIMESTAMP)
    WHERE status = 'ativo' AND assento_id IN (
      SELECT a.id FROM assentos_onibus a JOIN onibus_operacionais o ON o.id = a.onibus_id
      JOIN saidas_operacionais s ON s.id = o.saida_id WHERE s.lote_id = ${loteId}
    )`);
  await tx.execute(sql`UPDATE pontos_embarque_operacao SET ativo = false WHERE saida_id IN (SELECT id FROM saidas_operacionais WHERE lote_id = ${loteId})`);
  await tx.execute(sql`UPDATE onibus_operacionais SET ativo = false,
    status = CASE WHEN status = 'concluido' THEN status ELSE 'cancelado' END, atualizado_em = CURRENT_TIMESTAMP
    WHERE saida_id IN (SELECT id FROM saidas_operacionais WHERE lote_id = ${loteId})`);
  await tx.execute(sql`UPDATE saidas_operacionais SET ativa = false,
    status = CASE WHEN status = 'concluida' THEN status ELSE 'cancelada' END, atualizado_em = CURRENT_TIMESTAMP
    WHERE lote_id = ${loteId}`);
}

async function excluirEstruturaDoLote(tx: any, loteId: string) {
  await tx.execute(sql`DELETE FROM assento_holds WHERE assento_id IN (
    SELECT a.id FROM assentos_onibus a JOIN onibus_operacionais o ON o.id = a.onibus_id
    JOIN saidas_operacionais s ON s.id = o.saida_id WHERE s.lote_id = ${loteId}
  )`);
  await tx.execute(sql`DELETE FROM assento_alocacoes WHERE assento_id IN (
    SELECT a.id FROM assentos_onibus a JOIN onibus_operacionais o ON o.id = a.onibus_id
    JOIN saidas_operacionais s ON s.id = o.saida_id WHERE s.lote_id = ${loteId}
  )`);
  await tx.execute(sql`DELETE FROM checkins_operacao WHERE saida_id IN (SELECT id FROM saidas_operacionais WHERE lote_id = ${loteId})`);
  await tx.execute(sql`DELETE FROM operacao_historico WHERE saida_id IN (SELECT id FROM saidas_operacionais WHERE lote_id = ${loteId})`);
  await tx.execute(sql`DELETE FROM pontos_embarque_operacao WHERE saida_id IN (SELECT id FROM saidas_operacionais WHERE lote_id = ${loteId})`);
  await tx.execute(sql`DELETE FROM assentos_onibus WHERE onibus_id IN (
    SELECT o.id FROM onibus_operacionais o JOIN saidas_operacionais s ON s.id = o.saida_id WHERE s.lote_id = ${loteId}
  )`);
  await tx.execute(sql`DELETE FROM onibus_operacionais WHERE saida_id IN (SELECT id FROM saidas_operacionais WHERE lote_id = ${loteId})`);
  await tx.execute(sql`DELETE FROM saidas_operacionais WHERE lote_id = ${loteId}`);
  await tx.execute(sql`DELETE FROM inventario_holds WHERE lote_id = ${loteId}`);
  await tx.execute(sql`DELETE FROM comissao_regras WHERE pacote_id IN (SELECT id FROM pacotes WHERE lote_id = ${loteId})`);
  await tx.execute(sql`DELETE FROM cupons WHERE pacote_id IN (SELECT id FROM pacotes WHERE lote_id = ${loteId})`);
  await tx.execute(sql`DELETE FROM pacotes WHERE lote_id = ${loteId}`);
  await tx.execute(sql`DELETE FROM itens_addon WHERE lote_id = ${loteId}`);
}

export class CatalogoExclusaoService {
  static async pacote(pacoteId: string, ator: { id: string; tipo: string }): Promise<ResultadoExclusao> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`pacote-excluir:${pacoteId}`}))`);
      const pacote = linhas(await tx.execute(sql`SELECT * FROM pacotes WHERE id = ${pacoteId} FOR UPDATE`))[0];
      if (!pacote) throw new Error("Pacote não encontrado");
      const dependencia = linhas(await tx.execute(sql`SELECT EXISTS (
        SELECT 1 FROM reservas WHERE pacote_id = ${pacoteId}
        UNION ALL SELECT 1 FROM reservas WHERE cupom_id IN (SELECT id FROM cupons WHERE pacote_id = ${pacoteId})
        UNION ALL SELECT 1 FROM leads_origem WHERE pacote_id = ${pacoteId}
        UNION ALL SELECT 1 FROM cupons_utilizacoes WHERE cupom_id IN (SELECT id FROM cupons WHERE pacote_id = ${pacoteId})
        UNION ALL SELECT 1 FROM comissoes WHERE regra_id IN (SELECT id FROM comissao_regras WHERE pacote_id = ${pacoteId})
      ) AS possui_historico`))[0];

      if (Boolean(dependencia?.possui_historico)) {
        await tx.execute(sql`UPDATE pacotes SET ativo = false, disponibilidade = 'esgotado', atualizado_em = CURRENT_TIMESTAMP WHERE id = ${pacoteId}`);
        await tx.execute(sql`UPDATE cupons SET ativo = false WHERE pacote_id = ${pacoteId}`);
        await tx.execute(sql`UPDATE comissao_regras SET ativo = false, atualizado_em = CURRENT_TIMESTAMP WHERE pacote_id = ${pacoteId}`);
        await auditar(tx, ator, "pacote", pacoteId, "arquivado", pacote);
        return { modo: "arquivado", mensagem: "Pacote retirado do sistema e arquivado para preservar vendas e contratos existentes." };
      }

      await tx.execute(sql`DELETE FROM comissao_regras WHERE pacote_id = ${pacoteId}`);
      await tx.execute(sql`DELETE FROM cupons WHERE pacote_id = ${pacoteId}`);
      await tx.execute(sql`DELETE FROM pacotes WHERE id = ${pacoteId}`);
      await auditar(tx, ator, "pacote", pacoteId, "excluido", pacote);
      return { modo: "excluido", mensagem: "Pacote excluído definitivamente." };
    });
  }

  static async lote(loteId: string, ator: { id: string; tipo: string }): Promise<ResultadoExclusao> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`lote-excluir:${loteId}`}))`);
      const lote = linhas(await tx.execute(sql`SELECT * FROM lotes WHERE id = ${loteId} FOR UPDATE`))[0];
      if (!lote) throw new Error("Lote não encontrado");
      const dependencia = linhas(await tx.execute(sql`SELECT EXISTS (
        SELECT 1 FROM reservas WHERE lote_id = ${loteId}
        UNION ALL SELECT 1 FROM reservas WHERE cupom_id IN (SELECT id FROM cupons WHERE pacote_id IN (SELECT id FROM pacotes WHERE lote_id = ${loteId}))
        UNION ALL SELECT 1 FROM leads_origem WHERE lote_id = ${loteId} OR pacote_id IN (SELECT id FROM pacotes WHERE lote_id = ${loteId})
        UNION ALL SELECT 1 FROM operacao_historico WHERE saida_id IN (SELECT id FROM saidas_operacionais WHERE lote_id = ${loteId})
        UNION ALL SELECT 1 FROM cupons_utilizacoes WHERE cupom_id IN (SELECT id FROM cupons WHERE pacote_id IN (SELECT id FROM pacotes WHERE lote_id = ${loteId}))
        UNION ALL SELECT 1 FROM comissoes WHERE regra_id IN (SELECT id FROM comissao_regras WHERE pacote_id IN (SELECT id FROM pacotes WHERE lote_id = ${loteId}))
      ) AS possui_historico`))[0];

      if (Boolean(dependencia?.possui_historico)) {
        await tx.execute(sql`UPDATE pacotes SET ativo = false, disponibilidade = 'esgotado', atualizado_em = CURRENT_TIMESTAMP WHERE lote_id = ${loteId}`);
        await tx.execute(sql`UPDATE itens_addon SET ativo = false WHERE lote_id = ${loteId}`);
        await tx.execute(sql`UPDATE cupons SET ativo = false WHERE pacote_id IN (SELECT id FROM pacotes WHERE lote_id = ${loteId})`);
        await tx.execute(sql`UPDATE comissao_regras SET ativo = false, atualizado_em = CURRENT_TIMESTAMP WHERE pacote_id IN (SELECT id FROM pacotes WHERE lote_id = ${loteId})`);
        await arquivarOperacaoDoLote(tx, loteId);
        await tx.execute(sql`UPDATE lotes SET ativo = false, atualizado_em = CURRENT_TIMESTAMP WHERE id = ${loteId}`);
        await auditar(tx, ator, "lote", loteId, "arquivado", lote);
        return { modo: "arquivado", mensagem: "Período retirado do sistema e arquivado para preservar passageiros, contratos e pagamentos." };
      }

      await excluirEstruturaDoLote(tx, loteId);
      await tx.execute(sql`DELETE FROM lotes WHERE id = ${loteId}`);
      await auditar(tx, ator, "lote", loteId, "excluido", lote);
      return { modo: "excluido", mensagem: "Período e suas configurações foram excluídos definitivamente." };
    });
  }

  static async evento(eventoId: string, ator: { id: string; tipo: string }): Promise<ResultadoExclusao> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`evento-excluir:${eventoId}`}))`);
      const evento = linhas(await tx.execute(sql`SELECT * FROM eventos WHERE id = ${eventoId} FOR UPDATE`))[0];
      if (!evento) throw new Error("Excursão não encontrada");
      const dependencia = linhas(await tx.execute(sql`SELECT EXISTS (
        SELECT 1 FROM reservas WHERE lote_id IN (SELECT id FROM lotes WHERE evento_id = ${eventoId})
        UNION ALL SELECT 1 FROM reservas WHERE cupom_id IN (
          SELECT id FROM cupons WHERE evento_id = ${eventoId} OR pacote_id IN (
            SELECT p.id FROM pacotes p JOIN lotes l ON l.id = p.lote_id WHERE l.evento_id = ${eventoId}
          )
        )
        UNION ALL SELECT 1 FROM leads_origem WHERE evento_id = ${eventoId} OR lote_id IN (SELECT id FROM lotes WHERE evento_id = ${eventoId})
        UNION ALL SELECT 1 FROM operacao_historico WHERE saida_id IN (SELECT s.id FROM saidas_operacionais s JOIN lotes l ON l.id = s.lote_id WHERE l.evento_id = ${eventoId})
        UNION ALL SELECT 1 FROM avaliacoes WHERE evento_id = ${eventoId}
        UNION ALL SELECT 1 FROM cupons_utilizacoes WHERE cupom_id IN (SELECT id FROM cupons WHERE evento_id = ${eventoId})
        UNION ALL SELECT 1 FROM comissoes WHERE regra_id IN (
          SELECT id FROM comissao_regras WHERE evento_id = ${eventoId} OR pacote_id IN (
            SELECT p.id FROM pacotes p JOIN lotes l ON l.id = p.lote_id WHERE l.evento_id = ${eventoId}
          )
        )
      ) AS possui_historico`))[0];

      const loteIds = linhas(await tx.execute(sql`SELECT id FROM lotes WHERE evento_id = ${eventoId}`)).map((item) => String(item.id));
      if (Boolean(dependencia?.possui_historico)) {
        for (const loteId of loteIds) {
          await tx.execute(sql`UPDATE pacotes SET ativo = false, disponibilidade = 'esgotado', atualizado_em = CURRENT_TIMESTAMP WHERE lote_id = ${loteId}`);
          await tx.execute(sql`UPDATE itens_addon SET ativo = false WHERE lote_id = ${loteId}`);
          await arquivarOperacaoDoLote(tx, loteId);
        }
        await tx.execute(sql`UPDATE cupons SET ativo = false WHERE evento_id = ${eventoId} OR pacote_id IN (
          SELECT p.id FROM pacotes p JOIN lotes l ON l.id = p.lote_id WHERE l.evento_id = ${eventoId}
        )`);
        await tx.execute(sql`UPDATE comissao_regras SET ativo = false, atualizado_em = CURRENT_TIMESTAMP WHERE evento_id = ${eventoId} OR pacote_id IN (SELECT p.id FROM pacotes p JOIN lotes l ON l.id = p.lote_id WHERE l.evento_id = ${eventoId})`);
        await tx.execute(sql`UPDATE videos_evento SET ativo = false, atualizado_em = CURRENT_TIMESTAMP WHERE evento_id = ${eventoId}`);
        await tx.execute(sql`UPDATE lotes SET ativo = false, atualizado_em = CURRENT_TIMESTAMP WHERE evento_id = ${eventoId}`);
        await tx.execute(sql`UPDATE eventos SET ativo = false, atualizado_em = CURRENT_TIMESTAMP WHERE id = ${eventoId}`);
        await auditar(tx, ator, "evento", eventoId, "arquivado", evento);
        return { modo: "arquivado", mensagem: "Excursão retirada do sistema e arquivada com todo o histórico preservado." };
      }

      for (const loteId of loteIds) await excluirEstruturaDoLote(tx, loteId);
      await tx.execute(sql`DELETE FROM comissao_regras WHERE evento_id = ${eventoId}`);
      await tx.execute(sql`DELETE FROM cupons WHERE evento_id = ${eventoId} OR pacote_id IN (
        SELECT p.id FROM pacotes p JOIN lotes l ON l.id = p.lote_id WHERE l.evento_id = ${eventoId}
      )`);
      await tx.execute(sql`DELETE FROM fotos_evento WHERE evento_id = ${eventoId}`);
      await tx.execute(sql`DELETE FROM videos_evento WHERE evento_id = ${eventoId}`);
      await tx.execute(sql`DELETE FROM lotes WHERE evento_id = ${eventoId}`);
      await tx.execute(sql`DELETE FROM eventos WHERE id = ${eventoId}`);
      await auditar(tx, ator, "evento", eventoId, "excluido", evento);
      return { modo: "excluido", mensagem: "Excursão e suas configurações foram excluídas definitivamente." };
    });
  }
}
