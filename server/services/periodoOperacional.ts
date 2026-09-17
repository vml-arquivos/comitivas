import { sql } from "drizzle-orm";

type Alias = "s" | "o" | "so";

function periodoDaOperacao(alias: Alias) {
  return sql.raw(`COALESCE(${alias}.evento_periodo_id, ${alias}.periodo_id)`);
}

/**
 * Compara uma seleção de pacote ou período central com a operação física.
 * A comparação direta mantém o legado; o vínculo evento_periodo_id evita que
 * Camping e hospedagem precisem de ônibus duplicados para a mesma janela.
 */
export function periodoOperacionalCompativel(periodoId: string | null | undefined, saidaAlias: Alias = "s", onibusAlias: Alias = "o") {
  const solicitado = periodoId || null;
  const operacional = sql`COALESCE(${periodoDaOperacao(onibusAlias)}, ${periodoDaOperacao(saidaAlias)})`;
  return sql`(
    ${solicitado}::text IS NULL
    OR ${operacional} IS NULL
    OR ${operacional} = ${solicitado}
    OR EXISTS (
      SELECT 1
        FROM pacote_periodos periodo_solicitado
       WHERE periodo_solicitado.id = ${solicitado}
         AND periodo_solicitado.ativo = true
         AND (
           periodo_solicitado.evento_periodo_id = ${operacional}
           OR EXISTS (
             SELECT 1 FROM pacote_periodos periodo_operacional
              WHERE periodo_operacional.id = ${operacional}
                AND periodo_operacional.ativo = true
                AND DATE(periodo_solicitado.data_inicio) = DATE(periodo_operacional.data_inicio)
                AND DATE(periodo_solicitado.data_fim) = DATE(periodo_operacional.data_fim)
           )
           OR EXISTS (
             SELECT 1 FROM evento_periodos evento_operacional
              WHERE evento_operacional.id = ${operacional}
                AND evento_operacional.ativo = true
                AND DATE(periodo_solicitado.data_inicio) = DATE(evento_operacional.data_inicio)
                AND DATE(periodo_solicitado.data_fim) = DATE(evento_operacional.data_fim)
           )
         )
    )
    OR EXISTS (
      SELECT 1 FROM evento_periodos evento_solicitado
       WHERE evento_solicitado.id = ${solicitado}
         AND evento_solicitado.ativo = true
         AND evento_solicitado.id = ${operacional}
    )
  )`;
}

export function periodoReservadoCompativel(periodoReservaId: string | null | undefined, periodoOperacaoId: string | null | undefined) {
  const reserva = periodoReservaId || null;
  const operacao = periodoOperacaoId || null;
  return sql`(
    ${operacao}::text IS NULL
    OR ${reserva} = ${operacao}
    OR EXISTS (
      SELECT 1 FROM pacote_periodos periodo_reserva
       WHERE periodo_reserva.id = ${reserva}
         AND periodo_reserva.ativo = true
         AND (
           periodo_reserva.evento_periodo_id = ${operacao}
           OR EXISTS (
             SELECT 1 FROM pacote_periodos periodo_operacional
              WHERE periodo_operacional.id = ${operacao}
                AND periodo_operacional.ativo = true
                AND DATE(periodo_reserva.data_inicio) = DATE(periodo_operacional.data_inicio)
                AND DATE(periodo_reserva.data_fim) = DATE(periodo_operacional.data_fim)
           )
           OR EXISTS (
             SELECT 1 FROM evento_periodos evento_operacional
              WHERE evento_operacional.id = ${operacao}
                AND evento_operacional.ativo = true
                AND DATE(periodo_reserva.data_inicio) = DATE(evento_operacional.data_inicio)
                AND DATE(periodo_reserva.data_fim) = DATE(evento_operacional.data_fim)
           )
         )
    )
  )`;
}

export function periodoReservadoColunaCompativel(periodoReservaColuna: any, periodoOperacaoId: string | null | undefined) {
  const operacao = periodoOperacaoId || null;
  return sql`(
    ${operacao}::text IS NULL
    OR ${periodoReservaColuna} = ${operacao}
    OR EXISTS (
      SELECT 1 FROM pacote_periodos periodo_reserva
       WHERE periodo_reserva.id = ${periodoReservaColuna}
         AND periodo_reserva.ativo = true
         AND (
           periodo_reserva.evento_periodo_id = ${operacao}
           OR EXISTS (
             SELECT 1 FROM pacote_periodos periodo_operacional
              WHERE periodo_operacional.id = ${operacao}
                AND periodo_operacional.ativo = true
                AND DATE(periodo_reserva.data_inicio) = DATE(periodo_operacional.data_inicio)
                AND DATE(periodo_reserva.data_fim) = DATE(periodo_operacional.data_fim)
           )
           OR EXISTS (
             SELECT 1 FROM evento_periodos evento_operacional
              WHERE evento_operacional.id = ${operacao}
                AND evento_operacional.ativo = true
                AND DATE(periodo_reserva.data_inicio) = DATE(evento_operacional.data_inicio)
                AND DATE(periodo_reserva.data_fim) = DATE(evento_operacional.data_fim)
           )
         )
    )
  )`;
}
