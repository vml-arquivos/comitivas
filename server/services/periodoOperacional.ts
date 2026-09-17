import { sql } from "drizzle-orm";

type Alias = "s" | "o" | "so";

function periodoDaOperacao(alias: Alias) {
  return sql.raw(`${alias}.periodo_id`);
}

/**
 * Períodos comerciais pertencem aos pacotes e, por isso, possuem IDs distintos
 * mesmo quando representam a mesma permanência. A operação física pertence ao
 * lote e deve compartilhar ônibus entre esses períodos equivalentes.
 *
 * As queries consumidoras informam os aliases `s` (saída) e `o` (ônibus), ou
 * `so` (saída usado na consulta da fila). Um período sem vínculo continua
 * sendo geral para todo o lote; um período vinculado só atende o mesmo
 * intervalo de calendário.
 */
export function periodoOperacionalCompativel(
  periodoId: string | null | undefined,
  saidaAlias: Alias = "s",
  onibusAlias: Alias = "o",
) {
  const solicitado = periodoId || null;
  const periodoOperacional = sql`COALESCE(${periodoDaOperacao(onibusAlias)}, ${periodoDaOperacao(saidaAlias)})`;
  return sql`(
    ${solicitado}::text IS NULL
    OR ${periodoOperacional} IS NULL
    OR ${periodoOperacional} = ${solicitado}
    OR EXISTS (
      SELECT 1
        FROM pacote_periodos periodo_solicitado
        JOIN pacote_periodos periodo_operacional
          ON periodo_operacional.id = ${periodoOperacional}
       WHERE periodo_solicitado.id = ${solicitado}
         AND periodo_solicitado.ativo = true
         AND periodo_operacional.ativo = true
         AND DATE(periodo_solicitado.data_inicio) = DATE(periodo_operacional.data_inicio)
         AND DATE(periodo_solicitado.data_fim) = DATE(periodo_operacional.data_fim)
    )
  )`;
}

export function periodoReservadoCompativel(
  periodoReservaId: string | null | undefined,
  periodoOperacaoId: string | null | undefined,
) {
  const reserva = periodoReservaId || null;
  const operacao = periodoOperacaoId || null;
  return sql`(
    ${operacao}::text IS NULL
    OR ${reserva} = ${operacao}
    OR EXISTS (
      SELECT 1
        FROM pacote_periodos periodo_reserva
        JOIN pacote_periodos periodo_operacional
          ON periodo_operacional.id = ${operacao}
       WHERE periodo_reserva.id = ${reserva}
         AND periodo_reserva.ativo = true
         AND periodo_operacional.ativo = true
         AND DATE(periodo_reserva.data_inicio) = DATE(periodo_operacional.data_inicio)
         AND DATE(periodo_reserva.data_fim) = DATE(periodo_operacional.data_fim)
    )
  )`;
}

/** Variante para consultas que já possuem a coluna de período da reserva. */
export function periodoReservadoColunaCompativel(
  periodoReservaColuna: any,
  periodoOperacaoId: string | null | undefined,
) {
  const operacao = periodoOperacaoId || null;
  return sql`(
    ${operacao}::text IS NULL
    OR ${periodoReservaColuna} = ${operacao}
    OR EXISTS (
      SELECT 1
        FROM pacote_periodos periodo_reserva
        JOIN pacote_periodos periodo_operacional
          ON periodo_operacional.id = ${operacao}
       WHERE periodo_reserva.id = ${periodoReservaColuna}
         AND periodo_reserva.ativo = true
         AND periodo_operacional.ativo = true
         AND DATE(periodo_reserva.data_inicio) = DATE(periodo_operacional.data_inicio)
         AND DATE(periodo_reserva.data_fim) = DATE(periodo_operacional.data_fim)
    )
  )`;
}
