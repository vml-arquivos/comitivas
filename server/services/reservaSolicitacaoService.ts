import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { InventoryService } from "./inventoryService.js";

type Ator = { id: string; tipo: string };
const TIPOS = new Set(["cancelamento", "troca_pacote", "reinicio"]);
const STATUS = new Set(["pendente", "em_analise", "aprovada", "rejeitada", "concluida"]);
const REEMBOLSOS = new Set(["nao_aplicavel", "a_analisar", "aprovado", "negado", "processado"]);

function linhas(resultado: unknown): any[] {
  return Array.isArray((resultado as { rows?: unknown[] } | undefined)?.rows)
    ? (resultado as { rows: any[] }).rows
    : [];
}

function texto(valor: unknown, limite: number): string {
  return String(valor ?? "").trim().slice(0, limite);
}

export class ReservaSolicitacaoService {
  static async criar(reservaId: string, ator: Ator, input: any) {
    const tipo = texto(input?.tipo, 30);
    const motivo = texto(input?.motivo, 2000);
    const pacoteDestinoId = texto(input?.pacote_destino_id, 120) || null;
    if (!TIPOS.has(tipo)) throw new Error("Tipo de solicitação inválido");
    if (motivo.length < 5) throw new Error("Informe o motivo da solicitação");
    if (tipo === "troca_pacote" && !pacoteDestinoId) throw new Error("Escolha o pacote desejado");

    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`solicitacao:${reservaId}:${tipo}`}))`);
      const reserva = linhas(await tx.execute(sql`SELECT r.id, r.usuario_id, r.vendedor_id, r.lote_id, r.status, u.tipo AS usuario_tipo
        FROM reservas r JOIN usuarios u ON u.id = r.usuario_id WHERE r.id = ${reservaId} FOR UPDATE OF r`))[0];
      if (!reserva || reserva.usuario_tipo !== "cliente") throw new Error("Reserva não encontrada");
      const autorizado = ator.tipo === "dev" || ator.tipo === "admin" || reserva.usuario_id === ator.id || (ator.tipo === "vendedor" && reserva.vendedor_id === ator.id);
      if (!autorizado) throw new Error("Você não pode alterar esta reserva");
      if (reserva.status === "abandonado") throw new Error("Esta reserva já está encerrada");

      if (pacoteDestinoId) {
        const destino = linhas(await tx.execute(sql`SELECT id FROM pacotes WHERE id = ${pacoteDestinoId} AND lote_id = ${reserva.lote_id} AND ativo = true`))[0];
        if (!destino) throw new Error("O pacote de destino não pertence a esta viagem ou está indisponível");
      }
      const aberta = linhas(await tx.execute(sql`SELECT id FROM reserva_solicitacoes WHERE reserva_id = ${reservaId} AND tipo = ${tipo} AND status IN ('pendente', 'em_analise', 'aprovada')`))[0];
      if (aberta) throw new Error("Já existe uma solicitação deste tipo em análise");

      const id = createId();
      const reembolso = tipo === "cancelamento" ? "a_analisar" : "nao_aplicavel";
      const criada = linhas(await tx.execute(sql`INSERT INTO reserva_solicitacoes
        (id, reserva_id, usuario_id, solicitado_por, solicitado_por_tipo, tipo, pacote_destino_id, motivo, status, reembolso_status, criado_em, atualizado_em)
        VALUES (${id}, ${reservaId}, ${reserva.usuario_id}, ${ator.id}, ${ator.tipo}, ${tipo}, ${pacoteDestinoId}, ${motivo}, 'pendente', ${reembolso}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *`))[0];
      await tx.execute(sql`INSERT INTO cliente_historico (id, usuario_id, tipo, titulo, descricao, metadados, criado_por, criado_em)
        VALUES (${createId()}, ${reserva.usuario_id}, ${`cliente_${tipo}`}, ${tipo === "cancelamento" ? "Solicitação de cancelamento enviada" : tipo === "troca_pacote" ? "Solicitação de alteração de pacote enviada" : "Solicitação para recomeçar enviada"}, ${motivo}, ${JSON.stringify({ solicitacao_id: id, reserva_id: reservaId, status: "pendente", pacote_destino_id: pacoteDestinoId })}::jsonb, ${ator.id}, CURRENT_TIMESTAMP)`);
      return criada;
    });
  }

  static async listar(ator: Ator, filtros: { status?: unknown; tipo?: unknown } = {}) {
    const status = texto(filtros.status, 20);
    const tipo = texto(filtros.tipo, 30);
    const escopo = ator.tipo === "vendedor"
      ? sql`AND r.vendedor_id = ${ator.id}`
      : ator.tipo === "cliente" ? sql`AND s.usuario_id = ${ator.id}` : sql``;
    const filtroStatus = status && STATUS.has(status) ? sql`AND s.status = ${status}` : sql``;
    const filtroTipo = tipo && TIPOS.has(tipo) ? sql`AND s.tipo = ${tipo}` : sql``;
    return linhas(await db.execute(sql`SELECT s.*, u.nome AS cliente_nome, u.email AS cliente_email,
      e.nome AS evento_nome, l.nome AS lote_nome, p.nome AS pacote_nome, pd.nome AS pacote_destino_nome,
      v.nome AS vendedor_nome
      FROM reserva_solicitacoes s
      JOIN reservas r ON r.id = s.reserva_id
      JOIN usuarios u ON u.id = s.usuario_id
      JOIN lotes l ON l.id = r.lote_id
      JOIN eventos e ON e.id = l.evento_id
      LEFT JOIN pacotes p ON p.id = r.pacote_id
      LEFT JOIN pacotes pd ON pd.id = s.pacote_destino_id
      LEFT JOIN usuarios v ON v.id = r.vendedor_id
      WHERE 1 = 1 ${escopo} ${filtroStatus} ${filtroTipo}
      ORDER BY CASE s.status WHEN 'pendente' THEN 0 WHEN 'em_analise' THEN 1 WHEN 'aprovada' THEN 2 ELSE 3 END, s.criado_em DESC
      LIMIT 300`));
  }

  static async processar(id: string, ator: Ator, input: any) {
    if (ator.tipo !== "admin" && ator.tipo !== "dev") throw new Error("Somente a administração pode decidir solicitações");
    const status = texto(input?.status, 20);
    const parecer = texto(input?.parecer, 3000);
    const reembolsoStatus = texto(input?.reembolso_status, 30) || undefined;
    const valorReembolso = input?.valor_reembolso_centavos === undefined || input?.valor_reembolso_centavos === null || input?.valor_reembolso_centavos === ""
      ? null : Math.round(Number(input.valor_reembolso_centavos));
    if (!STATUS.has(status) || status === "pendente") throw new Error("Situação de análise inválida");
    if (["aprovada", "rejeitada", "concluida"].includes(status) && parecer.length < 5) throw new Error("Registre o parecer da análise");
    if (reembolsoStatus && !REEMBOLSOS.has(reembolsoStatus)) throw new Error("Situação de estorno inválida");
    if (valorReembolso !== null && (!Number.isInteger(valorReembolso) || valorReembolso < 0)) throw new Error("Valor de estorno inválido");

    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`solicitacao-processar:${id}`}))`);
      const atual = linhas(await tx.execute(sql`SELECT s.*, COALESCE((SELECT SUM(COALESCE(pg.valor_pago_centavos, 0)) FROM pagamentos pg WHERE pg.reserva_id = s.reserva_id), 0)::int AS total_pago
        FROM reserva_solicitacoes s WHERE s.id = ${id} FOR UPDATE OF s`))[0];
      if (!atual) throw new Error("Solicitação não encontrada");
      if (["rejeitada", "concluida"].includes(atual.status)) throw new Error("Esta solicitação já foi encerrada");
      const reembolsoFinal = reembolsoStatus || atual.reembolso_status;
      if (status === "concluida") {
        if (atual.status !== "aprovada") throw new Error("A solicitação precisa ser aprovada antes da conclusão");
        if (atual.tipo === "cancelamento" && Number(atual.total_pago) > 0 && !["processado", "negado"].includes(reembolsoFinal)) {
          throw new Error("Registre o resultado do estorno antes de concluir o cancelamento");
        }
        await InventoryService.liberarReservaNaTransacao(tx, atual.reserva_id, atual.tipo === "cancelamento" ? "Cancelamento concluído após análise" : "Alteração de contratação aprovada", true);
        await tx.execute(sql`UPDATE contratos_documentos SET status = 'invalidado', invalidado_em = CURRENT_TIMESTAMP,
          motivo_invalidacao = ${atual.tipo === "cancelamento" ? "Cancelamento concluído após análise" : "Alteração de contratação aprovada"}
          WHERE reserva_id = ${atual.reserva_id} AND validado_em IS NULL AND invalidado_em IS NULL`);
        await tx.execute(sql`UPDATE assento_alocacoes SET status = 'cancelada', encerrado_em = CURRENT_TIMESTAMP, motivo = ${parecer}
          WHERE reserva_id = ${atual.reserva_id} AND status = 'ativa'`);
        await tx.execute(sql`UPDATE quarto_alocacoes SET status = 'cancelada', encerrado_em = CURRENT_TIMESTAMP, motivo = ${parecer}
          WHERE reserva_id = ${atual.reserva_id} AND status = 'ativa'`);
        await tx.execute(sql`UPDATE reservas SET status = 'abandonado', checkout_estado = ${atual.tipo === "cancelamento" ? "cancelado_admin" : "alteracao_aprovada"}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ${atual.reserva_id}`);
      }
      const atualizada = linhas(await tx.execute(sql`UPDATE reserva_solicitacoes SET status = ${status}, parecer = ${parecer || null},
        reembolso_status = ${reembolsoFinal}, valor_reembolso_centavos = ${valorReembolso}, decidido_por = ${ator.id},
        atualizado_em = CURRENT_TIMESTAMP, concluido_em = ${["rejeitada", "concluida"].includes(status) ? new Date() : null}
        WHERE id = ${id} RETURNING *`))[0];
      await tx.execute(sql`INSERT INTO cliente_historico (id, usuario_id, tipo, titulo, descricao, metadados, criado_por, criado_em)
        VALUES (${createId()}, ${atual.usuario_id}, 'analise_solicitacao', ${status === "rejeitada" ? "Solicitação não aprovada" : status === "concluida" ? "Solicitação concluída" : status === "aprovada" ? "Solicitação aprovada" : "Solicitação em análise"}, ${parecer || null}, ${JSON.stringify({ solicitacao_id: id, reserva_id: atual.reserva_id, tipo: atual.tipo, status, reembolso_status: reembolsoFinal, valor_reembolso_centavos: valorReembolso })}::jsonb, ${ator.id}, CURRENT_TIMESTAMP)`);
      return atualizada;
    });
  }
}
