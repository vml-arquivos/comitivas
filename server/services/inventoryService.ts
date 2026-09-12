import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { cupons, inventarioHolds, lotes, reservas } from "../db/schema.js";

const HOLD_DURATION_MS = 30 * 60 * 1000;

export class InventoryService {
  static expirationDate(now = new Date()): Date {
    return new Date(now.getTime() + HOLD_DURATION_MS);
  }

  static async converterHold(reservaId: string): Promise<void> {
    const agora = new Date();
    await db.transaction(async (tx) => {
      const hold = (await tx.select().from(inventarioHolds).where(and(eq(inventarioHolds.reserva_id, reservaId), eq(inventarioHolds.status, "ativo"))).limit(1))[0];
      if (!hold) throw new Error("Reserva de inventário ausente ou expirada");
      if (new Date(hold.expira_em).getTime() <= agora.getTime()) throw new Error("A reserva de inventário expirou");
      await tx.update(inventarioHolds).set({ status: "convertido", convertido_em: agora }).where(and(eq(inventarioHolds.id, hold.id), eq(inventarioHolds.status, "ativo")));
    });
  }

  static async exigirHoldAtivo(reservaId: string): Promise<void> {
    const hold = (await db.select({ id: inventarioHolds.id, expira_em: inventarioHolds.expira_em }).from(inventarioHolds).where(and(eq(inventarioHolds.reserva_id, reservaId), eq(inventarioHolds.status, "ativo"))).limit(1))[0];
    if (!hold || new Date(hold.expira_em).getTime() <= Date.now()) throw new Error("A reserva de inventário expirou; retome o carrinho para renovar a disponibilidade");
  }

  static async liberarReservaNaTransacao(tx: any, reservaId: string, motivo = "Liberado manualmente", incluirConvertido = false): Promise<boolean> {
    const agora = new Date();
    const rows = await tx.execute(sql`
      SELECT h.id, h.reserva_id, h.lote_id, h.quantidade, r.cupom_id
      FROM inventario_holds h
      INNER JOIN reservas r ON r.id = h.reserva_id
      WHERE h.reserva_id = ${reservaId} AND (h.status = 'ativo' OR (${incluirConvertido} AND h.status = 'convertido'))
      FOR UPDATE OF h, r
    `);
    const row = rows.rows[0] as { id: string; reserva_id: string; lote_id: string; quantidade: number; cupom_id: string | null } | undefined;
    if (!row) return false;
    const alterado = await tx.execute(sql`UPDATE inventario_holds SET status = 'liberado', liberado_em = ${agora}, motivo_liberacao = ${motivo}
      WHERE id = ${row.id} AND (status = 'ativo' OR (${incluirConvertido} AND status = 'convertido')) RETURNING id`);
    if (alterado.rows.length === 0) return false;
    await this.liberarRecursosFisicosNaTransacao(tx, reservaId, motivo, agora);
    await tx.execute(sql`UPDATE lotes SET "vagas_disponíveis" = LEAST("vagas_totais", "vagas_disponíveis" + ${Number(row.quantidade)}), atualizado_em = ${agora} WHERE id = ${row.lote_id}`);
    if (row.cupom_id) await tx.execute(sql`UPDATE cupons SET uso_atual = GREATEST(0, COALESCE(uso_atual, 0) - 1) WHERE id = ${row.cupom_id}`);
    await tx.update(reservas).set({ inventario_hold_id: null, atualizado_em: agora }).where(eq(reservas.id, reservaId));
    return true;
  }

  static async liberarReserva(reservaId: string, motivo = "Liberado manualmente"): Promise<boolean> {
    return db.transaction((tx) => this.liberarReservaNaTransacao(tx, reservaId, motivo));
  }

  private static async liberarRecursosFisicosNaTransacao(tx: any, reservaId: string, motivo: string, agora: Date): Promise<void> {
    await tx.execute(sql`UPDATE assento_alocacoes SET status = 'cancelada', encerrado_em = ${agora}, motivo = ${motivo}
      WHERE reserva_id = ${reservaId} AND status = 'ativa'`);
    await tx.execute(sql`UPDATE quarto_alocacoes SET status = 'cancelada', encerrado_em = ${agora}, motivo = ${motivo}
      WHERE reserva_id = ${reservaId} AND status = 'ativa'`);
    await tx.execute(sql`UPDATE assento_holds SET status = 'liberado', liberado_em = COALESCE(liberado_em, ${agora})
      WHERE reserva_id = ${reservaId} AND status = 'ativo'`);
    await tx.execute(sql`UPDATE reservas SET saida_operacional_id = NULL, ponto_embarque_id = NULL, atualizado_em = ${agora}
      WHERE id = ${reservaId}`);
  }

  static async liberarExpirados(): Promise<number> {
    const agora = new Date();
    return db.transaction(async (tx) => {
      const rows = await tx.execute(sql`
        SELECT h.id, h.reserva_id, h.lote_id, h.quantidade, r.cupom_id, r.status
        FROM inventario_holds h
        INNER JOIN reservas r ON r.id = h.reserva_id
        WHERE h.status = 'ativo' AND h.expira_em <= ${agora}
        FOR UPDATE OF h, r SKIP LOCKED
      `);
      for (const row of rows.rows as Array<{ id: string; reserva_id: string; lote_id: string; quantidade: number; cupom_id: string | null; status: string | null }>) {
        const alterado = await tx.update(inventarioHolds).set({ status: "liberado", liberado_em: agora, motivo_liberacao: "Expiração do hold" }).where(and(eq(inventarioHolds.id, row.id), eq(inventarioHolds.status, "ativo"))).returning({ id: inventarioHolds.id });
        if (!alterado[0]) continue;
        await this.liberarRecursosFisicosNaTransacao(tx, row.reserva_id, "Expiração do checkout", agora);
        await tx.execute(sql`UPDATE lotes SET "vagas_disponíveis" = LEAST("vagas_totais", "vagas_disponíveis" + ${Number(row.quantidade)}), atualizado_em = ${agora} WHERE id = ${row.lote_id}`);
        if (row.cupom_id) {
          await tx.execute(sql`UPDATE cupons SET uso_atual = GREATEST(0, COALESCE(uso_atual, 0) - 1) WHERE id = ${row.cupom_id}`);
        }
        // A expiração do hold não significa desistência do cliente. O carrinho
        // continua no histórico e poderá ser revalidado quando ele retornar;
        // somente um cancelamento explícito usa `cancelado_cliente`.
        await tx.update(reservas).set({
          status: row.status === "abandonado" ? "pacote_montado" : row.status as any,
          checkout_estado: "carrinho_salvo",
          inventario_hold_id: null,
          atualizado_em: agora,
        }).where(eq(reservas.id, row.reserva_id));
      }
      return rows.rows.length;
    });
  }
}

export { HOLD_DURATION_MS };
