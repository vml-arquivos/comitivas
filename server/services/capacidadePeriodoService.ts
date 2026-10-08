import { sql } from "drizzle-orm";

/** O teto pertence ao período compartilhado, não a cada pacote. */
export async function validarLimitesPeriodoNaTransacao(
  tx: { execute: (consulta: any) => Promise<any> },
  periodoId: string | null | undefined,
  quantidade: number,
  recursos: { transporte: boolean; hospedagem: boolean },
  reservaId?: string,
) {
  if (!periodoId || (!recursos.transporte && !recursos.hospedagem)) return;
  const vinculo = (await tx.execute(sql`SELECT evento_periodo_id FROM pacote_periodos WHERE id = ${periodoId}`)).rows[0];
  const centralId = vinculo?.evento_periodo_id || null;
  const chave = centralId || periodoId;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`limite-periodo:${chave}`}))`);
  const periodo = centralId
    ? (await tx.execute(sql`SELECT capacidade_transporte_planejada, capacidade_hospedagem_planejada FROM evento_periodos WHERE id = ${centralId} FOR SHARE`)).rows[0]
    : (await tx.execute(sql`SELECT capacidade_transporte_planejada, capacidade_hospedagem_planejada FROM pacote_periodos WHERE id = ${periodoId} FOR SHARE`)).rows[0];
  if (!periodo) throw new Error("Período não encontrado");
  for (const tipo of ["transporte", "hospedagem"] as const) {
    const teto = periodo[`capacidade_${tipo}_planejada`];
    if (!recursos[tipo] || teto === null || teto === undefined) continue;
    const tabela = tipo === "transporte" ? sql`assento_alocacoes` : sql`quarto_alocacoes`;
    const ocupacao = (await tx.execute(sql`SELECT COUNT(*)::int AS total FROM ${tabela} a
      JOIN reservas r ON r.id = a.reserva_id
      LEFT JOIN pacote_periodos p ON p.id = r.periodo_id
      WHERE a.status = 'ativa' AND (${reservaId || null}::text IS NULL OR a.reserva_id <> ${reservaId || null}) AND (CASE WHEN ${centralId}::text IS NOT NULL
        THEN COALESCE(r.evento_periodo_id, p.evento_periodo_id) = ${centralId}
        ELSE r.periodo_id = ${periodoId} END)`)).rows[0];
    if (Number(ocupacao?.total || 0) + quantidade > Number(teto)) {
      throw new Error(`O limite de ${tipo} deste período foi atingido`);
    }
  }
}
