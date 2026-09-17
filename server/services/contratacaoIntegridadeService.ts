import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { resolverRecursosContratacao, normalizarGrupoHospedagem, type GrupoHospedagem, type RecursosContratados } from "./contratacaoRecursos.js";
import { periodoOperacionalCompativel } from "./periodoOperacional.js";

const HOLD_DURATION_MS = 30 * 60 * 1000;

type ReservaOperacional = {
  id: string;
  usuario_id: string;
  lote_id: string;
  pacote_id: string | null;
  periodo_id: string | null;
  grupo_id: string | null;
  inventario_hold_id: string | null;
  checkout_estado: string | null;
  status: string | null;
  recursos_contratados: Record<string, unknown> | null;
  grupo_hospedagem: string | null;
  pacote_forma_contratacao: string | null;
  pacote_modalidade_hospedagem: string | null;
};

type PessoaOperacional = {
  participante_id: string | null;
  grupo_hospedagem: GrupoHospedagem | null;
  assento_id: string | null;
  quarto_id: string | null;
  vaga_quarto_id: string | null;
};

type HoldOperacional = {
  id: string;
  status: string;
  expira_em: Date | string;
  quantidade: number;
};

type GarantirOpcoes = {
  renovarHold?: boolean;
  converterHold?: boolean;
  origem?: string;
};

function recursosDoContratoValidado(snapshot: unknown): RecursosContratados | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const dados = snapshot as Record<string, any>;
  const modelo = String(dados.modelo_oficial || "").trim();
  const transporte = dados.transporte?.rodoviario_incluido === true || modelo === "transporte" || modelo === "hospedagem_transporte";
  const modalidade = String(dados.hospedagem?.modalidade || "").trim();
  const hospedagem = modelo === "hospedagem" || modelo === "hospedagem_transporte" || Boolean(modalidade);
  if (!modelo && typeof dados.transporte?.rodoviario_incluido !== "boolean" && !modalidade) return null;
  const estrutura_quarto = !hospedagem ? null
    : modalidade === "quarto_ar_condicionado" ? "ar_condicionado"
    : modalidade === "quarto_ventilador" ? "ventilador"
    : null;
  return { transporte, hospedagem, estrutura_quarto };
}

function recursosAutoritativos(reserva: ReservaOperacional, snapshotContratoValidado?: unknown): RecursosContratados {
  // Depois da assinatura, o contrato imutável é a autoridade máxima. Isso evita
  // que uma alteração posterior no catálogo ou um snapshot antigo da reserva
  // retire silenciosamente transporte/hospedagem que o cliente efetivamente assinou.
  const contratados = recursosDoContratoValidado(snapshotContratoValidado);
  if (contratados) return contratados;

  const derivados = reserva.pacote_id
    ? resolverRecursosContratacao(reserva.pacote_forma_contratacao, reserva.pacote_modalidade_hospedagem)
    : { transporte: false, hospedagem: false, estrutura_quarto: null };
  const salvos = reserva.recursos_contratados && typeof reserva.recursos_contratados === "object"
    ? reserva.recursos_contratados
    : {};
  if (typeof salvos.transporte === "boolean" && typeof salvos.hospedagem === "boolean") {
    return {
      transporte: salvos.transporte,
      hospedagem: salvos.hospedagem,
      estrutura_quarto: salvos.hospedagem
        ? (salvos.estrutura_quarto === "ventilador" || salvos.estrutura_quarto === "ar_condicionado"
          ? salvos.estrutura_quarto
          : derivados.estrutura_quarto)
        : null,
    };
  }
  return derivados;
}

function holdValido(hold: HoldOperacional | undefined, agora = new Date()): boolean {
  if (!hold) return false;
  if (hold.status === "convertido") return true;
  return hold.status === "ativo" && new Date(hold.expira_em).getTime() > agora.getTime();
}

export class ContratacaoIntegridadeService {
  static async converterHoldNaTransacao(tx: any, reservaId: string): Promise<void> {
    const agora = new Date();

    // Barreira atômica da assinatura: trava a reserva, os participantes e as
    // alocações físicas antes de converter o hold. Assim não existe janela entre
    // "conferir as vagas" e "assinar o contrato" em que uma poltrona/quarto
    // possa ser liberado por outra operação.
    const reserva = (await tx.execute(sql`
      SELECT r.id, r.lote_id, r.pacote_id, r.periodo_id, r.grupo_id, r.recursos_contratados, r.grupo_hospedagem,
             p.forma_contratacao AS pacote_forma_contratacao, p.modalidade_hospedagem AS pacote_modalidade_hospedagem
        FROM reservas r
        LEFT JOIN pacotes p ON p.id = r.pacote_id
       WHERE r.id = ${reservaId}
       FOR UPDATE OF r
    `)).rows[0] as ReservaOperacional | undefined;
    if (!reserva) throw new Error("Reserva não encontrada");
    const recursos = recursosAutoritativos(reserva);
    const participantes = (await tx.execute(sql`
      SELECT id
        FROM reserva_participantes
       WHERE reserva_id = ${reservaId}
          OR grupo_id = ${reserva.grupo_id || null}
       FOR SHARE
    `)).rows as Array<{ id: string }>;
    const quantidadePessoas = Math.max(1, participantes.length);
    const assentos = (await tx.execute(sql`
      SELECT id FROM assento_alocacoes
       WHERE reserva_id = ${reservaId} AND status = 'ativa'
       FOR SHARE
    `)).rows as Array<{ id: string }>;
    const quartos = (await tx.execute(sql`
      SELECT id FROM quarto_alocacoes
       WHERE reserva_id = ${reservaId} AND status = 'ativa'
       FOR SHARE
    `)).rows as Array<{ id: string }>;
    if (recursos.transporte && assentos.length !== quantidadePessoas) {
      throw new Error(`Integridade operacional: a assinatura exige ${quantidadePessoas} vaga(s) de transporte, mas existem ${assentos.length}`);
    }
    if (recursos.hospedagem && recursos.estrutura_quarto && quartos.length !== quantidadePessoas) {
      throw new Error(`Integridade operacional: a assinatura exige ${quantidadePessoas} vaga(s) de hospedagem, mas existem ${quartos.length}`);
    }
    if (!recursos.transporte && assentos.length !== 0) throw new Error("Integridade operacional: há transporte alocado sem estar contratado");
    if (!recursos.hospedagem && quartos.length !== 0) throw new Error("Integridade operacional: há hospedagem alocada sem estar contratada");

    const hold = (await tx.execute(sql`
      SELECT id, status, expira_em, quantidade
        FROM inventario_holds
       WHERE reserva_id = ${reservaId}
       ORDER BY criado_em DESC
       LIMIT 1
       FOR UPDATE
    `)).rows[0] as HoldOperacional | undefined;
    if (!hold) throw new Error("A reserva de inventário não existe; retome a contratação antes de validar o contrato");
    if (Number(hold.quantidade || 0) !== quantidadePessoas) throw new Error("A quantidade de vagas reservadas diverge da quantidade de viajantes");
    if (hold.status === "convertido") return;
    if (hold.status !== "ativo") throw new Error("A reserva de inventário não está ativa; retome a contratação antes de validar o contrato");
    if (new Date(hold.expira_em).getTime() <= agora.getTime()) {
      throw new Error("A reserva de inventário expirou; retome a contratação para confirmar novamente as vagas");
    }
    const atualizado = await tx.execute(sql`
      UPDATE inventario_holds
         SET status = 'convertido', convertido_em = ${agora}
       WHERE id = ${hold.id} AND status = 'ativo'
       RETURNING id
    `);
    if (!atualizado.rows.length) throw new Error("A reserva de inventário mudou durante a validação; tente novamente");
  }

  static async garantirReserva(reservaId: string, opcoes: GarantirOpcoes = {}) {
    const renovarHold = opcoes.renovarHold !== false;
    const converterHold = opcoes.converterHold === true;
    const origem = String(opcoes.origem || "integridade_contratacao");

    return db.transaction(async (tx) => {
      const reserva = (await tx.execute(sql`
        SELECT r.id, r.usuario_id, r.lote_id, r.pacote_id, r.periodo_id, r.grupo_id, r.inventario_hold_id,
               r.checkout_estado, r.status, r.recursos_contratados, r.grupo_hospedagem,
               p.forma_contratacao AS pacote_forma_contratacao,
               p.modalidade_hospedagem AS pacote_modalidade_hospedagem
          FROM reservas r
          LEFT JOIN pacotes p ON p.id = r.pacote_id
         WHERE r.id = ${reservaId}
         FOR UPDATE OF r
      `)).rows[0] as ReservaOperacional | undefined;
      if (!reserva) throw new Error("Reserva não encontrada");
      if (["cancelado_cliente", "cancelado", "cancelamento_aprovado", "troca_pacote_cliente", "reiniciado_cliente"].includes(String(reserva.checkout_estado || ""))) {
        throw new Error("Esta reserva não está ativa para contratação");
      }

      const contratoValidado = (await tx.execute(sql`
        SELECT snapshot
          FROM contratos_documentos
         WHERE reserva_id = ${reserva.id} AND validado_em IS NOT NULL AND status <> 'invalidado'
         ORDER BY versao DESC
         LIMIT 1
         FOR SHARE
      `)).rows[0] as { snapshot: unknown } | undefined;
      const recursos = recursosAutoritativos(reserva, contratoValidado?.snapshot);
      const usuario = (await tx.execute(sql`SELECT sexo FROM usuarios WHERE id = ${reserva.usuario_id} FOR SHARE`)).rows[0] as { sexo: string | null } | undefined;
      const participantes = (await tx.execute(sql`
        SELECT id AS participante_id, sexo_operacional, assento_id, quarto_id, vaga_quarto_id
          FROM reserva_participantes
         WHERE reserva_id = ${reserva.id}
            OR grupo_id = ${reserva.grupo_id || null}
         ORDER BY CASE WHEN vinculo_responsavel = 'responsável' THEN 0 ELSE 1 END, criado_em, id
         FOR UPDATE
      `)).rows as Array<{ participante_id: string; sexo_operacional: string | null; assento_id: string | null; quarto_id: string | null; vaga_quarto_id: string | null }>;
      const grupoResponsavel = normalizarGrupoHospedagem(usuario?.sexo) || normalizarGrupoHospedagem(reserva.grupo_hospedagem);
      const pessoas: PessoaOperacional[] = participantes.length
        ? participantes.map((p) => ({
            participante_id: p.participante_id,
            grupo_hospedagem: normalizarGrupoHospedagem(p.sexo_operacional) || grupoResponsavel,
            assento_id: p.assento_id,
            quarto_id: p.quarto_id,
            vaga_quarto_id: p.vaga_quarto_id,
          }))
        : [{ participante_id: null, grupo_hospedagem: grupoResponsavel, assento_id: null, quarto_id: null, vaga_quarto_id: null }];
      const quantidadePessoas = Math.max(1, pessoas.length);
      if (recursos.hospedagem && recursos.estrutura_quarto && pessoas.some((p) => !p.grupo_hospedagem)) {
        throw new Error("Informe o sexo de todas as pessoas antes de reservar a hospedagem");
      }

      const agora = new Date();
      let hold = (await tx.execute(sql`
        SELECT id, status, expira_em, quantidade
          FROM inventario_holds
         WHERE reserva_id = ${reserva.id}
         ORDER BY CASE WHEN id = ${reserva.inventario_hold_id} THEN 0 ELSE 1 END, criado_em DESC
         LIMIT 1
         FOR UPDATE
      `)).rows[0] as HoldOperacional | undefined;

      if (!holdValido(hold, agora)) {
        if (!renovarHold) throw new Error("A reserva de inventário expirou; retome a contratação para confirmar as vagas");
        if (hold?.status === "ativo") {
          // O scheduler ainda não liberou os recursos físicos nem devolveu a vaga
          // geral do lote. Estender o hold sob lock evita dupla baixa de inventário.
          await tx.execute(sql`
            UPDATE inventario_holds
               SET expira_em = ${new Date(agora.getTime() + HOLD_DURATION_MS)},
                   liberado_em = NULL, convertido_em = NULL
             WHERE id = ${hold.id} AND status = 'ativo'
          `);
          hold = { ...hold, expira_em: new Date(agora.getTime() + HOLD_DURATION_MS) };
        } else {
          const lote = (await tx.execute(sql`SELECT id, "vagas_disponíveis" FROM lotes WHERE id = ${reserva.lote_id} FOR UPDATE`)).rows[0] as { id: string; vagas_disponíveis: number } | undefined;
          if (!lote || Number(lote.vagas_disponíveis) < quantidadePessoas) {
            throw new Error("Não há vagas gerais suficientes para restaurar esta contratação");
          }
          const baixa = await tx.execute(sql`
            UPDATE lotes
               SET "vagas_disponíveis" = "vagas_disponíveis" - ${quantidadePessoas}, atualizado_em = ${agora}
             WHERE id = ${reserva.lote_id} AND "vagas_disponíveis" >= ${quantidadePessoas}
             RETURNING id
          `);
          if (!baixa.rows.length) throw new Error("As vagas gerais mudaram durante a contratação; tente novamente");
          if (hold) {
            await tx.execute(sql`
              UPDATE inventario_holds
                 SET lote_id = ${reserva.lote_id}, quantidade = ${quantidadePessoas}, status = 'ativo',
                     expira_em = ${new Date(agora.getTime() + HOLD_DURATION_MS)}, liberado_em = NULL,
                     motivo_liberacao = NULL, convertido_em = NULL
               WHERE id = ${hold.id}
            `);
            hold = { ...hold, status: "ativo", quantidade: quantidadePessoas, expira_em: new Date(agora.getTime() + HOLD_DURATION_MS) };
          } else {
            const holdId = createId();
            await tx.execute(sql`
              INSERT INTO inventario_holds (id, reserva_id, lote_id, modalidade, quantidade, status, expira_em, criado_em)
              VALUES (${holdId}, ${reserva.id}, ${reserva.lote_id}, ${reserva.pacote_modalidade_hospedagem}, ${quantidadePessoas}, 'ativo', ${new Date(agora.getTime() + HOLD_DURATION_MS)}, ${agora})
            `);
            await tx.execute(sql`UPDATE reservas SET inventario_hold_id = ${holdId}, atualizado_em = ${agora} WHERE id = ${reserva.id}`);
            hold = { id: holdId, status: "ativo", quantidade: quantidadePessoas, expira_em: new Date(agora.getTime() + HOLD_DURATION_MS) };
          }
        }
      }

      if (hold?.status === "ativo" && Number(hold.quantidade || 0) !== quantidadePessoas) {
        const quantidadeAnterior = Math.max(0, Number(hold.quantidade || 0));
        const diferenca = quantidadePessoas - quantidadeAnterior;
        await tx.execute(sql`SELECT id FROM lotes WHERE id = ${reserva.lote_id} FOR UPDATE`);
        if (diferenca > 0) {
          const baixaAdicional = await tx.execute(sql`
            UPDATE lotes SET "vagas_disponíveis" = "vagas_disponíveis" - ${diferenca}, atualizado_em = ${agora}
             WHERE id = ${reserva.lote_id} AND "vagas_disponíveis" >= ${diferenca}
             RETURNING id
          `);
          if (!baixaAdicional.rows.length) throw new Error("Não há vagas gerais suficientes para todas as pessoas desta contratação");
        } else if (diferenca < 0) {
          await tx.execute(sql`
            UPDATE lotes SET "vagas_disponíveis" = LEAST("vagas_totais", "vagas_disponíveis" + ${Math.abs(diferenca)}), atualizado_em = ${agora}
             WHERE id = ${reserva.lote_id}
          `);
        }
        await tx.execute(sql`UPDATE inventario_holds SET quantidade = ${quantidadePessoas} WHERE id = ${hold.id} AND status = 'ativo'`);
        hold = { ...hold, quantidade: quantidadePessoas };
      } else if (hold?.status === "convertido" && Number(hold.quantidade || 0) !== quantidadePessoas) {
        throw new Error("A quantidade de viajantes mudou depois da confirmação da reserva; é necessário refazer a contratação para preservar contrato e inventário");
      }

      if (recursos.transporte) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`capacidade-transporte:${reserva.lote_id}`}))`);
        const existentes = (await tx.execute(sql`
          SELECT aa.id AS alocacao_id, aa.assento_id, a.numero, o.id AS onibus_id, o.nome AS onibus_nome, s.id AS saida_id
            FROM assento_alocacoes aa
            JOIN assentos_onibus a ON a.id = aa.assento_id
            JOIN onibus_operacionais o ON o.id = a.onibus_id
            JOIN saidas_operacionais s ON s.id = o.saida_id
               WHERE aa.reserva_id = ${reserva.id} AND aa.status = 'ativa'
                 AND ${periodoOperacionalCompativel(reserva.periodo_id)}
           ORDER BY aa.alocado_em, aa.id
           FOR UPDATE OF aa
        `)).rows as Array<{ alocacao_id: string; assento_id: string; numero: number; onibus_id: string; onibus_nome: string; saida_id: string }>;
        const usados = new Set<string>();
        let saidaPreferida = existentes[0]?.saida_id || null;
        for (const pessoa of pessoas) {
          let alocacao = pessoa.assento_id
            ? existentes.find((item) => item.assento_id === pessoa.assento_id && !usados.has(item.alocacao_id))
            : undefined;
          if (!alocacao) alocacao = existentes.find((item) => !usados.has(item.alocacao_id));
          if (!alocacao) {
            const assento = (await tx.execute(sql`
              SELECT a.id AS assento_id, a.numero, o.id AS onibus_id, o.nome AS onibus_nome, s.id AS saida_id
                FROM saidas_operacionais s
                JOIN onibus_operacionais o ON o.saida_id = s.id AND o.ativo = true
                JOIN assentos_onibus a ON a.onibus_id = o.id AND a.status = 'disponivel' AND a.numero <= o.capacidade
               WHERE s.lote_id = ${reserva.lote_id} AND s.ativa = true
                 AND ${periodoOperacionalCompativel(reserva.periodo_id)}
                 AND NOT EXISTS (SELECT 1 FROM assento_alocacoes aa WHERE aa.assento_id = a.id AND aa.status = 'ativa')
                 AND NOT EXISTS (SELECT 1 FROM assento_holds ah WHERE ah.assento_id = a.id AND ah.status = 'ativo' AND ah.expira_em > CURRENT_TIMESTAMP)
               ORDER BY CASE WHEN s.id = ${saidaPreferida} THEN 0 ELSE 1 END,
                        CASE WHEN COALESCE(o.periodo_id, s.periodo_id) = ${reserva.periodo_id} THEN 0 WHEN COALESCE(o.periodo_id, s.periodo_id) IS NULL THEN 1 ELSE 2 END,
                        o.venda_ordem, o.criado_em, a.numero
               LIMIT 1 FOR UPDATE OF a
            `)).rows[0] as { assento_id: string; numero: number; onibus_id: string; onibus_nome: string; saida_id: string } | undefined;
            if (!assento) throw new Error("O contrato inclui transporte, mas não há poltrona disponível para todas as pessoas");
            const alocacaoId = createId();
            await tx.execute(sql`
              INSERT INTO assento_alocacoes (id, assento_id, reserva_id, usuario_id, status, alocado_por, alocado_em)
              VALUES (${alocacaoId}, ${assento.assento_id}, ${reserva.id}, ${reserva.usuario_id}, 'ativa', ${reserva.usuario_id}, ${agora})
            `);
            alocacao = { alocacao_id: alocacaoId, ...assento };
            existentes.push(alocacao);
            if (!saidaPreferida) saidaPreferida = assento.saida_id;
            await tx.execute(sql`
              INSERT INTO operacao_historico (id, saida_id, entidade, entidade_id, acao, ator_id, depois, criado_em)
              VALUES (${createId()}, ${assento.saida_id}, 'alocacao', ${alocacaoId}, 'assento_reconciliado_contratacao', ${reserva.usuario_id},
                ${JSON.stringify({ reserva_id: reserva.id, onibus_id: assento.onibus_id, onibus_nome: assento.onibus_nome, poltrona: assento.numero, origem })}::jsonb, ${agora})
            `);
          }
          usados.add(alocacao.alocacao_id);
          if (pessoa.participante_id) {
            await tx.execute(sql`UPDATE reserva_participantes SET assento_id = ${alocacao.assento_id}, atualizado_em = ${agora} WHERE id = ${pessoa.participante_id} AND reserva_id = ${reserva.id}`);
          }
          await tx.execute(sql`
            INSERT INTO checkins_operacao (id, saida_id, reserva_id, status, atualizado_em)
            VALUES (${createId()}, ${alocacao.saida_id}, ${reserva.id}, 'pendente', ${agora})
            ON CONFLICT (saida_id, reserva_id) DO NOTHING
          `);
        }
        const extras = existentes.filter((item) => !usados.has(item.alocacao_id));
        for (const extra of extras) {
          await tx.execute(sql`UPDATE assento_alocacoes SET status = 'cancelada', encerrado_em = ${agora}, motivo = 'Reconciliação de quantidade contratada' WHERE id = ${extra.alocacao_id} AND status = 'ativa'`);
        }
        await tx.execute(sql`UPDATE reservas SET saida_operacional_id = ${saidaPreferida}, atualizado_em = ${agora} WHERE id = ${reserva.id}`);
      } else {
        await tx.execute(sql`UPDATE assento_alocacoes SET status = 'cancelada', encerrado_em = ${agora}, motivo = 'Transporte não contratado' WHERE reserva_id = ${reserva.id} AND status = 'ativa'`);
        await tx.execute(sql`UPDATE reserva_participantes SET assento_id = NULL, atualizado_em = ${agora} WHERE reserva_id = ${reserva.id}`);
        await tx.execute(sql`UPDATE reservas SET saida_operacional_id = NULL, ponto_embarque_id = NULL, atualizado_em = ${agora} WHERE id = ${reserva.id}`);
      }

      if (recursos.hospedagem && recursos.estrutura_quarto) {
        const existentes = (await tx.execute(sql`
          SELECT qa.id AS alocacao_id, qa.quarto_id, qa.numero_vaga, q.genero, q.estrutura, q.nome AS quarto_nome
            FROM quarto_alocacoes qa
            JOIN quartos_hospedagem q ON q.id = qa.quarto_id
           WHERE qa.reserva_id = ${reserva.id} AND qa.status = 'ativa'
           ORDER BY qa.alocado_em, qa.id
           FOR UPDATE OF qa
        `)).rows as Array<{ alocacao_id: string; quarto_id: string; numero_vaga: number; genero: string; estrutura: string; quarto_nome: string }>;
        const usados = new Set<string>();
        for (const pessoa of pessoas) {
          const grupo = pessoa.grupo_hospedagem!;
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`capacidade-hospedagem:${reserva.lote_id}:${recursos.estrutura_quarto}:${grupo}`}))`);
          let alocacao = pessoa.quarto_id && pessoa.vaga_quarto_id
            ? existentes.find((item) => item.quarto_id === pessoa.quarto_id && String(item.numero_vaga) === String(pessoa.vaga_quarto_id) && item.genero === grupo && item.estrutura === recursos.estrutura_quarto && !usados.has(item.alocacao_id))
            : undefined;
          if (!alocacao) alocacao = existentes.find((item) => item.genero === grupo && item.estrutura === recursos.estrutura_quarto && !usados.has(item.alocacao_id));
          if (!alocacao) {
            const quarto = (await tx.execute(sql`
              SELECT q.id AS quarto_id, q.nome AS quarto_nome, q.genero, q.estrutura, vaga.numero AS numero_vaga
                FROM quartos_hospedagem q
                CROSS JOIN LATERAL generate_series(1, q.capacidade) AS vaga(numero)
                 WHERE q.lote_id = ${reserva.lote_id} AND q.ativo = true
                 AND (${reserva.periodo_id}::text IS NULL OR q.periodo_id IS NULL OR q.periodo_id = ${reserva.periodo_id})
                 AND q.genero = ${grupo}
                 AND q.estrutura = ${recursos.estrutura_quarto}
                 AND (q.pacote_id IS NULL OR q.pacote_id = ${reserva.pacote_id})
                 AND NOT EXISTS (
                   SELECT 1 FROM quarto_alocacoes qa
                    WHERE qa.quarto_id = q.id AND qa.numero_vaga = vaga.numero AND qa.status = 'ativa'
                 )
               ORDER BY CASE WHEN q.periodo_id = ${reserva.periodo_id} THEN 0 WHEN q.periodo_id IS NULL THEN 1 ELSE 2 END,
                        CASE WHEN q.pacote_id = ${reserva.pacote_id} THEN 0 ELSE 1 END, q.nome, vaga.numero
               LIMIT 1 FOR UPDATE OF q
            `)).rows[0] as { quarto_id: string; quarto_nome: string; genero: string; estrutura: string; numero_vaga: number } | undefined;
            if (!quarto) throw new Error(`O contrato inclui hospedagem, mas não há vaga de quarto ${recursos.estrutura_quarto === "ar_condicionado" ? "com ar-condicionado" : "com ventilador"} para o grupo ${grupo}`);
            const alocacaoId = createId();
            await tx.execute(sql`
              INSERT INTO quarto_alocacoes (id, quarto_id, reserva_id, usuario_id, numero_vaga, status, alocado_por, alocado_em)
              VALUES (${alocacaoId}, ${quarto.quarto_id}, ${reserva.id}, ${reserva.usuario_id}, ${Number(quarto.numero_vaga)}, 'ativa', ${reserva.usuario_id}, ${agora})
            `);
            alocacao = { alocacao_id: alocacaoId, ...quarto };
            existentes.push(alocacao);
            await tx.execute(sql`
              INSERT INTO operacao_historico (id, saida_id, entidade, entidade_id, acao, ator_id, depois, criado_em)
              VALUES (${createId()}, NULL, 'quarto_alocacao', ${alocacaoId}, 'hospede_reconciliado_contratacao', ${reserva.usuario_id},
                ${JSON.stringify({ reserva_id: reserva.id, quarto_id: quarto.quarto_id, quarto: quarto.quarto_nome, vaga: Number(quarto.numero_vaga), grupo, estrutura: recursos.estrutura_quarto, origem })}::jsonb, ${agora})
            `);
          }
          usados.add(alocacao.alocacao_id);
          if (pessoa.participante_id) {
            await tx.execute(sql`UPDATE reserva_participantes SET quarto_id = ${alocacao.quarto_id}, vaga_quarto_id = ${String(alocacao.numero_vaga)}, atualizado_em = ${agora} WHERE id = ${pessoa.participante_id} AND reserva_id = ${reserva.id}`);
          }
        }
        const extras = existentes.filter((item) => !usados.has(item.alocacao_id));
        for (const extra of extras) {
          await tx.execute(sql`UPDATE quarto_alocacoes SET status = 'cancelada', encerrado_em = ${agora}, motivo = 'Reconciliação de quantidade contratada' WHERE id = ${extra.alocacao_id} AND status = 'ativa'`);
        }
      } else if (!recursos.hospedagem) {
        await tx.execute(sql`UPDATE quarto_alocacoes SET status = 'cancelada', encerrado_em = ${agora}, motivo = 'Hospedagem não contratada' WHERE reserva_id = ${reserva.id} AND status = 'ativa'`);
        await tx.execute(sql`UPDATE reserva_participantes SET quarto_id = NULL, vaga_quarto_id = NULL, atualizado_em = ${agora} WHERE reserva_id = ${reserva.id}`);
      }

      const assentosAtivos = Number(((await tx.execute(sql`SELECT COUNT(*)::int AS total FROM assento_alocacoes WHERE reserva_id = ${reserva.id} AND status = 'ativa'`)).rows[0] as any)?.total || 0);
      const quartosAtivos = Number(((await tx.execute(sql`SELECT COUNT(*)::int AS total FROM quarto_alocacoes WHERE reserva_id = ${reserva.id} AND status = 'ativa'`)).rows[0] as any)?.total || 0);
      if (recursos.transporte && assentosAtivos !== quantidadePessoas) {
        throw new Error(`Integridade operacional: contrato exige ${quantidadePessoas} vaga(s) de transporte, mas existem ${assentosAtivos}`);
      }
      if (recursos.hospedagem && recursos.estrutura_quarto && quartosAtivos !== quantidadePessoas) {
        throw new Error(`Integridade operacional: contrato exige ${quantidadePessoas} vaga(s) de hospedagem, mas existem ${quartosAtivos}`);
      }
      if (!recursos.transporte && assentosAtivos !== 0) throw new Error("Integridade operacional: há transporte alocado sem estar contratado");
      if (!recursos.hospedagem && quartosAtivos !== 0) throw new Error("Integridade operacional: há hospedagem alocada sem estar contratada");

      await tx.execute(sql`
        UPDATE reservas
           SET recursos_contratados = ${JSON.stringify(recursos)}::jsonb,
               grupo_hospedagem = ${recursos.hospedagem ? pessoas[0]?.grupo_hospedagem || null : null},
               atualizado_em = ${agora}
         WHERE id = ${reserva.id}
      `);

      if (converterHold) await this.converterHoldNaTransacao(tx, reserva.id);

      return {
        reserva_id: reserva.id,
        recursos,
        quantidade_pessoas: quantidadePessoas,
        assentos_ativos: assentosAtivos,
        quartos_ativos: quartosAtivos,
        hold_status: converterHold ? "convertido" : hold?.status || null,
      };
    });
  }

  static async reconciliarContratosValidados(limite = 100) {
    const candidatos = (await db.execute(sql`
      SELECT DISTINCT r.id
        FROM reservas r
        JOIN contratos_documentos cd ON cd.reserva_id = r.id AND cd.validado_em IS NOT NULL AND cd.status <> 'invalidado'
        LEFT JOIN inventario_holds ih ON ih.reserva_id = r.id
       WHERE COALESCE(r.checkout_estado, '') NOT IN ('cancelado_cliente', 'cancelado', 'cancelamento_aprovado', 'troca_pacote_cliente', 'reiniciado_cliente')
         AND (
           ih.id IS NULL OR ih.status <> 'convertido'
           OR r.recursos_contratados = '{}'::jsonb
           OR (
             (r.recursos_contratados->>'transporte' = 'true' OR cd.snapshot->'transporte'->>'rodoviario_incluido' = 'true' OR cd.snapshot->>'modelo_oficial' IN ('transporte', 'hospedagem_transporte'))
             AND (SELECT COUNT(*) FROM assento_alocacoes aa WHERE aa.reserva_id = r.id AND aa.status = 'ativa')
                 <> GREATEST(1, (SELECT COUNT(*) FROM reserva_participantes rp WHERE rp.reserva_id = r.id OR (r.grupo_id IS NOT NULL AND rp.grupo_id = r.grupo_id)))
           )
           OR (
             (r.recursos_contratados->>'hospedagem' = 'true' OR cd.snapshot->>'modelo_oficial' IN ('hospedagem', 'hospedagem_transporte'))
             AND (
               COALESCE(r.recursos_contratados->>'estrutura_quarto', '') IN ('ventilador', 'ar_condicionado')
               OR cd.snapshot->'hospedagem'->>'modalidade' IN ('quarto_ventilador', 'quarto_ar_condicionado')
             )
             AND (SELECT COUNT(*) FROM quarto_alocacoes qa WHERE qa.reserva_id = r.id AND qa.status = 'ativa')
                 <> GREATEST(1, (SELECT COUNT(*) FROM reserva_participantes rp WHERE rp.reserva_id = r.id OR (r.grupo_id IS NOT NULL AND rp.grupo_id = r.grupo_id)))
           )
         )
       ORDER BY r.id
       LIMIT ${Math.max(1, Math.min(500, limite))}
    `)).rows as Array<{ id: string }>;

    let corrigidas = 0;
    const falhas: Array<{ reserva_id: string; erro: string }> = [];
    for (const candidato of candidatos) {
      try {
        await this.garantirReserva(candidato.id, { renovarHold: true, converterHold: true, origem: "reconciliacao_startup" });
        corrigidas += 1;
      } catch (error: any) {
        const erro = error?.message || "falha não detalhada";
        falhas.push({ reserva_id: candidato.id, erro });
        await db.execute(sql`
          INSERT INTO operacao_historico (id, saida_id, entidade, entidade_id, acao, ator_id, depois, criado_em)
          VALUES (${createId()}, NULL, 'integridade_contratacao', ${candidato.id}, 'reconciliacao_operacional_falhou', NULL,
            ${JSON.stringify({ reserva_id: candidato.id, erro })}::jsonb, CURRENT_TIMESTAMP)
        `).catch(() => undefined);
      }
    }
    return { analisadas: candidatos.length, corrigidas, falhas };
  }
}
