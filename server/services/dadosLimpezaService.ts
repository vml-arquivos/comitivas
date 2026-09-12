import fs from "node:fs/promises";
import { createId } from "@paralleldrive/cuid2";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";

export type EscopoLimpezaIncompleta = {
  reservas?: boolean;
  reserva_ids?: string[];
  contratos?: boolean;
  leads_sem_contato?: boolean;
  leads_sem_reserva?: boolean;
};

type Ator = { id: string; tipo: string; ip?: string | null; userAgent?: string | null };

type Linha = Record<string, unknown>;

type ResultadoLimpeza = {
  reservas: number;
  contratos: number;
  leads_sem_contato: number;
  leads_sem_reserva: number;
  arquivos: string[];
};

const STATUS_RESERVA_INCOMPLETA = sql`(
  r.status IN ('visitante', 'cadastrado', 'pacote_montado', 'checkout_iniciado', 'aguardando_pagamento', 'contrato_gerado', 'abandonado')
  OR r.checkout_estado IN ('rascunho', 'inventario_reservado', 'otp_enviado', 'contrato_preparado', 'contrato_validado', 'expirado', 'cancelado', 'cancelado_cliente', 'cancelamento_aprovado')
)`;

const RESERVA_SEGURA_PARA_EXCLUSAO = sql`
  ${STATUS_RESERVA_INCOMPLETA}
  AND r.aceite_timestamp IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM contrato_validacoes cv WHERE cv.reserva_id = r.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM pagamentos p
    WHERE p.reserva_id = r.id
      AND (p.status = 'aprovado' OR p.status_reconciliado = 'quitado' OR COALESCE(p.valor_pago_centavos, 0) > 0)
  )
  AND NOT EXISTS (
    SELECT 1 FROM pagamento_parcelas pp
    WHERE pp.reserva_id = r.id
      AND (pp.status = 'aprovado' OR COALESCE(pp.valor_pago_centavos, 0) > 0 OR pp.pago_confirmado_em IS NOT NULL)
  )
  AND NOT EXISTS (
    SELECT 1 FROM contratos_documentos cd
    WHERE cd.reserva_id = r.id
      AND cd.status NOT IN ('rascunho', 'preparado', 'aguardando_validacao', 'invalidado')
  )
`;

function linhas(resultado: unknown): Linha[] {
  return ((resultado as { rows?: Linha[] })?.rows || []);
}

function quantidade(resultado: unknown): number {
  return Number(linhas(resultado)[0]?.total || 0);
}

function normalizarEscopo(escopo?: EscopoLimpezaIncompleta): Required<EscopoLimpezaIncompleta> {
  return {
    reservas: escopo?.reservas !== false,
    reserva_ids: Array.isArray(escopo?.reserva_ids) ? escopo!.reserva_ids!.filter(Boolean) : [],
    contratos: escopo?.contratos !== false,
    leads_sem_contato: escopo?.leads_sem_contato !== false,
    leads_sem_reserva: escopo?.leads_sem_reserva !== false,
  };
}

export class DadosLimpezaService {
  static async resumo(escopo?: EscopoLimpezaIncompleta) {
    const incluir = normalizarEscopo(escopo);
    const [reservasResult, contratosResult, leadsSemContatoResult, leadsSemReservaResult] = await Promise.all([
      incluir.reservas
        ? db.execute(sql`SELECT COUNT(*)::int AS total FROM reservas r WHERE ${RESERVA_SEGURA_PARA_EXCLUSAO}`)
        : { rows: [{ total: 0 }] },
      incluir.contratos
        ? db.execute(sql`SELECT COUNT(*)::int AS total FROM contratos_documentos cd JOIN reservas r ON r.id = cd.reserva_id WHERE cd.status IN ('rascunho', 'preparado', 'aguardando_validacao') AND ${RESERVA_SEGURA_PARA_EXCLUSAO}`)
        : { rows: [{ total: 0 }] },
      incluir.leads_sem_contato
        ? db.execute(sql`SELECT COUNT(*)::int AS total FROM leads_origem l WHERE l.usuario_id IS NULL AND COALESCE(NULLIF(BTRIM(l.whatsapp), ''), NULLIF(BTRIM(l.email), '')) IS NULL`)
        : { rows: [{ total: 0 }] },
      incluir.leads_sem_reserva
        ? db.execute(sql`SELECT COUNT(*)::int AS total FROM leads_origem l WHERE NOT EXISTS (SELECT 1 FROM reservas r WHERE r.usuario_id = l.usuario_id)`)
        : { rows: [{ total: 0 }] },
    ]);

    return {
      incluir,
      reservas_incompletas: quantidade(reservasResult),
      contratos_pendentes: quantidade(contratosResult),
      leads_sem_contato: quantidade(leadsSemContatoResult),
      leads_sem_reserva: quantidade(leadsSemReservaResult),
    };
  }

  static async limpar(escopo: EscopoLimpezaIncompleta | undefined, ator: Ator): Promise<ResultadoLimpeza> {
    const incluir = normalizarEscopo(escopo);
    const reservaFiltro = incluir.reserva_ids.length
      ? sql`AND r.id IN (${sql.join(incluir.reserva_ids.map((id) => sql`${id}`), sql`, `)})`
      : sql``;
    const resultado: ResultadoLimpeza = { reservas: 0, contratos: 0, leads_sem_contato: 0, leads_sem_reserva: 0, arquivos: [] };

    await db.transaction(async (tx) => {
      if (incluir.reservas) {
        const reservas = linhas(await tx.execute(sql`
          SELECT r.id, r.usuario_id, r.grupo_id, r.valor_total, r.status, r.checkout_estado,
            (SELECT COUNT(*)::int FROM contratos_documentos cd WHERE cd.reserva_id = r.id) AS contrato_count,
            ARRAY(
              SELECT cd.arquivo FROM contratos_documentos cd
              WHERE cd.reserva_id = r.id AND cd.arquivo IS NOT NULL
            ) AS contrato_arquivos,
            ARRAY(
              SELECT d.arquivo FROM cliente_documentos d
              WHERE d.reserva_id = r.id AND d.arquivo IS NOT NULL
            ) AS documento_arquivos
          FROM reservas r
          WHERE ${RESERVA_SEGURA_PARA_EXCLUSAO} ${reservaFiltro}
          FOR UPDATE
        `));

        for (const reserva of reservas) {
          const reservaId = String(reserva.id);
          const arquivos = [
            ...(Array.isArray(reserva.contrato_arquivos) ? reserva.contrato_arquivos : []),
            ...(Array.isArray(reserva.documento_arquivos) ? reserva.documento_arquivos : []),
          ].filter((arquivo): arquivo is string => typeof arquivo === "string" && arquivo.length > 0);
          resultado.arquivos.push(...arquivos);

          await tx.execute(sql`
            INSERT INTO auditoria_admin (id, ator_id, ator_tipo, acao, entidade, entidade_id, antes, depois, ip, user_agent, criado_em)
            VALUES (
              ${createId()}, ${ator.id}, ${ator.tipo}, 'dados_incompletos_excluidos', 'reserva', ${reservaId},
              ${JSON.stringify({ status: reserva.status, checkout_estado: reserva.checkout_estado, valor_total: reserva.valor_total })}::jsonb,
              ${JSON.stringify({ motivo: 'limpeza_administrativa_de_dados_incompletos' })}::jsonb,
              ${ator.ip || null}, ${ator.userAgent || null}, CURRENT_TIMESTAMP
            )
          `);

          // Dependências de checkout, operação, comunicação, pagamento e contrato.
          await tx.execute(sql`DELETE FROM notificacoes_outbox WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM emails_enviados WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM otp_desafios WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM contrato_eventos WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM contrato_validacoes WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM contratos_documentos WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM cliente_documentos WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM consentimentos_imagem WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM precos_ledger WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM quarto_alocacoes WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM assento_alocacoes WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM assento_holds WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM checkins_operacao WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM reserva_solicitacoes WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM inventario_holds WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM descontos_administrativos WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM comissoes WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM cupons_utilizacoes WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM pagamento_parcelas WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM pagamento_idempotencias WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM pagamentos WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM reserva_participantes WHERE reserva_id = ${reservaId}`);
          await tx.execute(sql`DELETE FROM reservas WHERE id = ${reservaId}`);

          if (reserva.grupo_id) {
            await tx.execute(sql`DELETE FROM reserva_grupos rg WHERE rg.id = ${String(reserva.grupo_id)} AND NOT EXISTS (SELECT 1 FROM reserva_participantes rp WHERE rp.grupo_id = rg.id)`);
          }
          resultado.contratos += Number(reserva.contrato_count || 0);
          resultado.reservas += 1;
        }
      }

      if (incluir.contratos && !incluir.reservas) {
        const contratos = linhas(await tx.execute(sql`
          SELECT cd.id, cd.arquivo FROM contratos_documentos cd
          JOIN reservas r ON r.id = cd.reserva_id
          WHERE cd.status IN ('rascunho', 'preparado', 'aguardando_validacao')
            AND ${RESERVA_SEGURA_PARA_EXCLUSAO}
          FOR UPDATE OF cd
        `));
        for (const contrato of contratos) {
          const contratoId = String(contrato.id);
          if (contrato.arquivo) resultado.arquivos.push(String(contrato.arquivo));
          await tx.execute(sql`
            INSERT INTO auditoria_admin (id, ator_id, ator_tipo, acao, entidade, entidade_id, antes, depois, ip, user_agent, criado_em)
            VALUES (${createId()}, ${ator.id}, ${ator.tipo}, 'contrato_incompleto_excluido', 'contrato', ${contratoId},
              ${JSON.stringify({ arquivo: contrato.arquivo })}::jsonb,
              ${JSON.stringify({ motivo: 'limpeza_administrativa_de_dados_incompletos' })}::jsonb,
              ${ator.ip || null}, ${ator.userAgent || null}, CURRENT_TIMESTAMP)
          `);
          await tx.execute(sql`DELETE FROM otp_desafios WHERE contrato_id = ${contratoId}`);
          await tx.execute(sql`DELETE FROM contrato_eventos WHERE contrato_id = ${contratoId}`);
          await tx.execute(sql`DELETE FROM contratos_documentos WHERE id = ${contratoId}`);
          resultado.contratos += 1;
        }
      }

      if (incluir.leads_sem_contato) {
        const leads = linhas(await tx.execute(sql`SELECT id FROM leads_origem WHERE usuario_id IS NULL AND COALESCE(NULLIF(BTRIM(whatsapp), ''), NULLIF(BTRIM(email), '')) IS NULL FOR UPDATE`));
        for (const lead of leads) {
          await tx.execute(sql`
            INSERT INTO auditoria_admin (id, ator_id, ator_tipo, acao, entidade, entidade_id, antes, depois, ip, user_agent, criado_em)
            VALUES (${createId()}, ${ator.id}, ${ator.tipo}, 'lead_sem_contato_excluido', 'lead', ${String(lead.id)},
              '{}'::jsonb, ${JSON.stringify({ motivo: 'limpeza_administrativa_de_leads_sem_contato' })}::jsonb,
              ${ator.ip || null}, ${ator.userAgent || null}, CURRENT_TIMESTAMP)
          `);
          await tx.execute(sql`DELETE FROM leads_origem WHERE id = ${String(lead.id)}`);
          resultado.leads_sem_contato += 1;
        }
      }

      if (incluir.leads_sem_reserva) {
        const leads = linhas(await tx.execute(sql`SELECT id FROM leads_origem l WHERE NOT EXISTS (SELECT 1 FROM reservas r WHERE r.usuario_id = l.usuario_id) FOR UPDATE`));
        for (const lead of leads) {
          await tx.execute(sql`
            INSERT INTO auditoria_admin (id, ator_id, ator_tipo, acao, entidade, entidade_id, antes, depois, ip, user_agent, criado_em)
            VALUES (${createId()}, ${ator.id}, ${ator.tipo}, 'lead_sem_reserva_excluido', 'lead', ${String(lead.id)},
              '{}'::jsonb, ${JSON.stringify({ motivo: 'limpeza_administrativa_de_leads_sem_reserva' })}::jsonb,
              ${ator.ip || null}, ${ator.userAgent || null}, CURRENT_TIMESTAMP)
          `);
          await tx.execute(sql`DELETE FROM leads_origem WHERE id = ${String(lead.id)}`);
          resultado.leads_sem_reserva += 1;
        }
      }
    });

    const arquivosUnicos = Array.from(new Set(resultado.arquivos));
    await Promise.all(arquivosUnicos.map(async (arquivo) => {
      await fs.unlink(arquivo).catch(() => undefined);
    }));
    resultado.arquivos = arquivosUnicos;
    return resultado;
  }
}
