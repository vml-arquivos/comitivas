import { db } from "../db/index.js";
import { eventos, lotes, pacotes, pacotePeriodos, itens_addon, cupons, reservas, inventarioHolds, precosLedger, cuponsUtilizacoes, comissaoRegras, comissoes, reservaGrupos, reservaParticipantes, usuarios } from "../db/schema.js";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { normalizarGrupoHospedagem, normalizarFormasContratacao, resolverRecursosContratacao, type GrupoHospedagem, type RecursosContratados } from "./contratacaoRecursos.js";
import { InventoryService } from "./inventoryService.js";
import { LoteComercialService, normalizarFormaLote } from "./loteComercialService.js";

export interface ItemSelecionado { id: string; nome: string; tipo: string; valor: number; quantidade: number; }
export interface ParticipantePacote { nome_completo: string; cpf?: string; data_nascimento?: string; telefone?: string; email?: string; sexo_operacional?: GrupoHospedagem; }
export interface ConfiguracaoPacote { lote_id: string; pacote_id?: string; periodo_id?: string; lote_comercial_id?: string; forma_contratacao?: 'onibus' | 'hospedagem' | 'onibus_hospedagem'; itens: ItemSelecionado[]; cupom_codigo?: string; usuario_id?: string; vendedor_id?: string; grupo_hospedagem?: GrupoHospedagem; participantes?: ParticipantePacote[]; }
export interface ResultadoCalculo { valor_base: number; itens_selecionados: ItemSelecionado[]; subtotal: number; desconto_cupom: number; valor_total: number; pacote_id?: string; pacote_nome?: string; modalidade_hospedagem?: string; forma_contratacao?: string; lote_comercial_id?: string; lote_comercial_nome?: string; lote_comercial_valor?: number; cupom_id?: string; mensagem?: string; }

export interface OrigemReserva { lead_id?: string; vendedor_id?: string; codigo_origem?: string; }


function formasContratacaoPublicas(pacote: { formas_contratacao?: unknown; forma_contratacao?: unknown; modalidade_hospedagem?: unknown }) {
  return normalizarFormasContratacao(pacote.formas_contratacao, pacote.forma_contratacao, pacote.modalidade_hospedagem);
}

function validarFormaContratacaoSelecionada(config: ConfiguracaoPacote, pacote: typeof pacotes.$inferSelect | undefined) {
  if (!pacote) return null;
  const formas = formasContratacaoPublicas(pacote);
  if (formas.length === 0) throw new Error('Este pacote precisa ter ao menos um tipo de contratação configurado no Admin antes de ser vendido');
  const solicitada = String(config.forma_contratacao || formas[0]);
  if (!['onibus', 'hospedagem', 'onibus_hospedagem'].includes(solicitada)) throw new Error('Tipo de contratação inválido');
  if (!formas.includes(solicitada as typeof formas[number])) throw new Error('O tipo de contratação escolhido não está habilitado neste pacote');
  return solicitada as 'onibus' | 'hospedagem' | 'onibus_hospedagem';
}

function dinheiro(valor: Decimal): number { return valor.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(); }

function cpfNormalizado(valor: unknown): string {
  return String(valor ?? "").replace(/\D/g, "");
}

function normalizarParticipantes(valor: unknown): ParticipantePacote[] {
  if (!Array.isArray(valor)) return [];
  return valor.slice(0, 49).map((item: any) => ({
    nome_completo: String(item?.nome_completo || "").trim().slice(0, 255),
    cpf: cpfNormalizado(item?.cpf).slice(0, 11) || undefined,
    data_nascimento: item?.data_nascimento ? String(item.data_nascimento).slice(0, 10) : undefined,
    telefone: String(item?.telefone || "").trim().slice(0, 20) || undefined,
    email: String(item?.email || "").trim().slice(0, 255) || undefined,
    sexo_operacional: item?.sexo_operacional === "masculino" || item?.sexo_operacional === "feminino" ? item.sexo_operacional : undefined,
  })).filter((item) => item.nome_completo.length >= 3);
}

async function bloquearDuplicidadePorCpf(tx: any, loteId: string, usuarioId: string, participantes: ParticipantePacote[] = []): Promise<void> {
  const pessoa = (await tx.execute(sql`SELECT cpf FROM usuarios WHERE id = ${usuarioId} FOR SHARE`)).rows[0] as { cpf: string | null } | undefined;
  const cpfsInformados = [cpfNormalizado(pessoa?.cpf), ...participantes.map((participante) => cpfNormalizado(participante.cpf))]
    .filter((cpf) => cpf.length === 11);
  if (new Set(cpfsInformados).size !== cpfsInformados.length) throw new Error("Uma mesma pessoa não pode ocupar duas vagas nesta reserva");

  // Locks em ordem estável serializam abas e grupos concorrentes sem deadlock.
  for (const cpf of [...cpfsInformados].sort()) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`reserva:${loteId}:${cpf}`}))`);
    const existente = (await tx.execute(sql`
      SELECT r.id
        FROM reservas r
        JOIN usuarios u ON u.id = r.usuario_id
       WHERE r.lote_id = ${loteId}
         AND (
           regexp_replace(COALESCE(u.cpf, ''), '[^0-9]', '', 'g') = ${cpf}
           OR EXISTS (
             SELECT 1 FROM reserva_participantes rp
             WHERE rp.reserva_id = r.id
               AND regexp_replace(COALESCE(rp.cpf, ''), '[^0-9]', '', 'g') = ${cpf}
           )
         )
         AND COALESCE(r.status::text, '') <> 'abandonado'
         AND COALESCE(r.checkout_estado, '') NOT IN ('expirado', 'cancelado', 'cancelado_cliente', 'troca_pacote_cliente', 'reiniciado_cliente', 'cancelamento_aprovado')
       LIMIT 1
    `)).rows[0] as { id: string } | undefined;
    if (existente) {
      const erro = new Error("DUPLICIDADE_RESERVA_ATIVA");
      (erro as Error & { reservaId?: string }).reservaId = existente.id;
      throw erro;
    }
  }
}

type PacoteOperacional = {
  id: string;
  lote_id: string;
  forma_contratacao: string;
  formas_contratacao?: unknown;
  modalidade_hospedagem: string | null;
};

type PessoaAlocacao = {
  participanteId: string | null;
  grupoHospedagem: GrupoHospedagem | null;
};

async function alocarRecursosNaTransacao(
  tx: any,
  pacote: PacoteOperacional | undefined,
  reservaId: string,
  usuarioId: string,
  loteId: string,
  periodoId: string | null | undefined,
  pessoas: PessoaAlocacao[],
  formaEscolhida?: string | null,
): Promise<{ recursos: RecursosContratados; assento_alocacao_id: string | null; quarto_alocacao_id: string | null }> {
  const recursos = pacote
    ? resolverRecursosContratacao(formaEscolhida || pacote.forma_contratacao, pacote.modalidade_hospedagem)
    : { transporte: false, hospedagem: false, estrutura_quarto: null };
  let assentoAlocacaoId: string | null = null;
  let quartoAlocacaoId: string | null = null;

  const pessoasDaReserva = pessoas.length ? pessoas : [{ participanteId: null, grupoHospedagem: null }];

  if (recursos.hospedagem && pessoasDaReserva.some((pessoa) => !pessoa.grupoHospedagem)) {
    throw new Error("Informe o sexo de todas as pessoas para direcionar a hospedagem");
  }

  if (recursos.transporte) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`capacidade-transporte:${loteId}`}))`);
    for (const pessoa of pessoasDaReserva) {
      const assento = (await tx.execute(sql`
      SELECT a.id AS assento_id, a.numero, o.id AS onibus_id, o.nome AS onibus_nome, s.id AS saida_id
      FROM saidas_operacionais s
      JOIN onibus_operacionais o ON o.saida_id = s.id AND o.ativo = true
      JOIN assentos_onibus a ON a.onibus_id = o.id AND a.status = 'disponivel' AND a.numero <= o.capacidade
      WHERE s.lote_id = ${loteId} AND s.ativa = true
        AND (${periodoId || null}::text IS NULL OR COALESCE(o.periodo_id, s.periodo_id) IS NULL OR COALESCE(o.periodo_id, s.periodo_id) = ${periodoId || null})
        AND NOT EXISTS (SELECT 1 FROM assento_alocacoes aa WHERE aa.assento_id = a.id AND aa.status = 'ativa')
        AND NOT EXISTS (SELECT 1 FROM assento_holds h WHERE h.assento_id = a.id AND h.status = 'ativo' AND h.expira_em > CURRENT_TIMESTAMP)
      ORDER BY CASE WHEN COALESCE(o.periodo_id, s.periodo_id) = ${periodoId || null} THEN 0 WHEN COALESCE(o.periodo_id, s.periodo_id) IS NULL THEN 1 ELSE 2 END,
        o.venda_ordem, o.criado_em, a.numero
      LIMIT 1 FOR UPDATE OF a
      `)).rows[0] as { assento_id: string; numero: number; onibus_id: string; onibus_nome: string; saida_id: string } | undefined;
      if (!assento) throw new Error("As vagas de transporte deste período estão esgotadas");
      const alocacaoId = createId();
      if (!assentoAlocacaoId) assentoAlocacaoId = alocacaoId;
      await tx.execute(sql`INSERT INTO assento_alocacoes
      (id, assento_id, reserva_id, usuario_id, status, alocado_por, alocado_em)
      VALUES (${alocacaoId}, ${assento.assento_id}, ${reservaId}, ${usuarioId}, 'ativa', ${usuarioId}, CURRENT_TIMESTAMP)`);
      if (pessoa.participanteId) {
        await tx.execute(sql`UPDATE reserva_participantes SET assento_id = ${assento.assento_id}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ${pessoa.participanteId} AND reserva_id = ${reservaId}`);
      }
      await tx.execute(sql`UPDATE reservas SET saida_operacional_id = ${assento.saida_id}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ${reservaId}`);
      await tx.execute(sql`INSERT INTO checkins_operacao (id, saida_id, reserva_id, status, atualizado_em)
      VALUES (${createId()}, ${assento.saida_id}, ${reservaId}, 'pendente', CURRENT_TIMESTAMP)
      ON CONFLICT (saida_id, reserva_id) DO NOTHING`);
      await tx.execute(sql`INSERT INTO operacao_historico
      (id, saida_id, entidade, entidade_id, acao, ator_id, depois, criado_em)
      VALUES (${createId()}, ${assento.saida_id}, 'alocacao', ${alocacaoId}, 'assento_alocado_checkout', ${usuarioId},
        ${JSON.stringify({ reserva_id: reservaId, onibus_id: assento.onibus_id, onibus_nome: assento.onibus_nome, poltrona: assento.numero })}::jsonb, CURRENT_TIMESTAMP)`);
    }
  }

  if (recursos.hospedagem && recursos.estrutura_quarto) {
    for (const pessoa of pessoasDaReserva) {
      const grupoHospedagem = pessoa.grupoHospedagem!;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`capacidade-hospedagem:${loteId}:${recursos.estrutura_quarto}:${grupoHospedagem}`}))`);
      const quarto = (await tx.execute(sql`
      SELECT q.id AS quarto_id, q.nome AS quarto_nome, vaga.numero AS numero_vaga
      FROM quartos_hospedagem q
      CROSS JOIN LATERAL generate_series(1, q.capacidade) AS vaga(numero)
      WHERE q.lote_id = ${loteId} AND q.ativo = true
        AND q.genero = ${grupoHospedagem}
        AND q.estrutura = ${recursos.estrutura_quarto}
        AND (q.pacote_id IS NULL OR q.pacote_id = ${pacote?.id || null})
        AND (${periodoId || null}::text IS NULL OR q.periodo_id IS NULL OR q.periodo_id = ${periodoId || null})
        AND NOT EXISTS (
          SELECT 1 FROM quarto_alocacoes qa
          WHERE qa.quarto_id = q.id AND qa.numero_vaga = vaga.numero AND qa.status = 'ativa'
        )
      ORDER BY CASE WHEN q.periodo_id = ${periodoId || null} THEN 0 WHEN q.periodo_id IS NULL THEN 1 ELSE 2 END,
        CASE WHEN q.pacote_id = ${pacote?.id || null} THEN 0 ELSE 1 END, q.nome, vaga.numero
      LIMIT 1 FOR UPDATE OF q
      `)).rows[0] as { quarto_id: string; quarto_nome: string; numero_vaga: number } | undefined;
      if (!quarto) {
        const estrutura = recursos.estrutura_quarto === "ar_condicionado" ? "com ar-condicionado" : "com ventilador";
        throw new Error(`As vagas de quarto ${estrutura} para o grupo ${grupoHospedagem} estão esgotadas`);
      }
      const alocacaoId = createId();
      if (!quartoAlocacaoId) quartoAlocacaoId = alocacaoId;
      await tx.execute(sql`INSERT INTO quarto_alocacoes
      (id, quarto_id, reserva_id, usuario_id, numero_vaga, status, alocado_por, alocado_em)
      VALUES (${alocacaoId}, ${quarto.quarto_id}, ${reservaId}, ${usuarioId}, ${Number(quarto.numero_vaga)}, 'ativa', ${usuarioId}, CURRENT_TIMESTAMP)`);
      if (pessoa.participanteId) {
        await tx.execute(sql`UPDATE reserva_participantes SET quarto_id = ${quarto.quarto_id}, vaga_quarto_id = ${String(quarto.numero_vaga)}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ${pessoa.participanteId} AND reserva_id = ${reservaId}`);
      }
      await tx.execute(sql`INSERT INTO operacao_historico
      (id, saida_id, entidade, entidade_id, acao, ator_id, depois, criado_em)
      VALUES (${createId()}, NULL, 'quarto_alocacao', ${alocacaoId}, 'hospede_alocado_checkout', ${usuarioId},
        ${JSON.stringify({ reserva_id: reservaId, quarto_id: quarto.quarto_id, quarto: quarto.quarto_nome, vaga: Number(quarto.numero_vaga), grupo: grupoHospedagem, estrutura: recursos.estrutura_quarto })}::jsonb, CURRENT_TIMESTAMP)`);
    }
  }

  await tx.execute(sql`UPDATE reservas SET
    grupo_hospedagem = ${recursos.hospedagem ? pessoasDaReserva[0]?.grupoHospedagem || null : null},
    recursos_contratados = ${JSON.stringify({ ...recursos, forma_contratacao: formaEscolhida || pacote?.forma_contratacao || null })}::jsonb,
    atualizado_em = CURRENT_TIMESTAMP
    WHERE id = ${reservaId}`);
  return { recursos, assento_alocacao_id: assentoAlocacaoId, quarto_alocacao_id: quartoAlocacaoId };
}

function recursosPersistidosOuPublicados(reserva: any, pacote: PacoteOperacional | undefined): RecursosContratados {
  const derivados = pacote
    ? resolverRecursosContratacao(pacote.forma_contratacao, pacote.modalidade_hospedagem)
    : { transporte: false, hospedagem: false, estrutura_quarto: null };
  const salvos = reserva?.recursos_contratados && typeof reserva.recursos_contratados === "object" ? reserva.recursos_contratados : {};
  if (typeof salvos.transporte === "boolean" && typeof salvos.hospedagem === "boolean") {
    return {
      transporte: salvos.transporte,
      hospedagem: salvos.hospedagem,
      estrutura_quarto: salvos.hospedagem
        ? (salvos.estrutura_quarto === "ventilador" || salvos.estrutura_quarto === "ar_condicionado" ? salvos.estrutura_quarto : derivados.estrutura_quarto)
        : null,
    };
  }
  return derivados;
}

function recursosDivergem(a: RecursosContratados, b: RecursosContratados): boolean {
  return a.transporte !== b.transporte || a.hospedagem !== b.hospedagem || (a.estrutura_quarto || null) !== (b.estrutura_quarto || null);
}

export class PacoteService {
  /**
   * Retoma o único carrinho não concluído do cliente para o lote informado.
   * A operação é idempotente: um carrinho com hold válido apenas é devolvido;
   * um hold expirado é renovado com nova reserva de inventário, sem duplicar a
   * reserva, o contrato ou a comissão.
   */
  static async retomarCarrinho(usuario_id: string, lote_id: string, esperado?: Pick<ConfiguracaoPacote, "pacote_id" | "periodo_id" | "forma_contratacao">) {
    return db.transaction(async (tx) => {
      const existente = (await tx.execute(sql`
        SELECT *
          FROM reservas
         WHERE usuario_id = ${usuario_id}
           AND lote_id = ${lote_id}
           AND COALESCE(checkout_estado, '') NOT IN ('cancelado_cliente', 'troca_pacote_cliente', 'reiniciado_cliente', 'cancelamento_aprovado')
         ORDER BY criado_em DESC
         LIMIT 1
         FOR UPDATE
      `)).rows[0] as any | undefined;
      if (!existente) return null;

      const pacote = existente.pacote_id
        ? (await tx.execute(sql`SELECT id, lote_id, forma_contratacao, formas_contratacao, modalidade_hospedagem FROM pacotes WHERE id = ${existente.pacote_id} FOR SHARE`)).rows[0] as PacoteOperacional | undefined
        : undefined;
      const recursosPublicados = pacote
        ? resolverRecursosContratacao(pacote.forma_contratacao, pacote.modalidade_hospedagem)
        : { transporte: false, hospedagem: false, estrutura_quarto: null };
      const recursos = recursosPersistidosOuPublicados(existente, pacote);

      if (esperado) {
        const pacoteDiferente = String(esperado.pacote_id || "") !== String(existente.pacote_id || "");
        const periodoDiferente = String(esperado.periodo_id || "") !== String(existente.periodo_id || "");
        const formaEsperada = esperado.forma_contratacao ? String(esperado.forma_contratacao) : null;
        const formasPublicadas = pacote ? formasContratacaoPublicas(pacote) : [];
        const recursosEsperados = pacote && formaEsperada
          ? resolverRecursosContratacao(formaEsperada, pacote.modalidade_hospedagem)
          : recursosPublicados;
        const formaDiferente = Boolean(formaEsperada && !formasPublicadas.includes(formaEsperada as typeof formasPublicadas[number]));
        const snapshotDivergenteDoCatalogo = Boolean(pacote && formaEsperada && recursosDivergem(recursos, recursosEsperados));
        if (pacoteDiferente || periodoDiferente || formaDiferente || snapshotDivergenteDoCatalogo) {
          const contratoValidado = (await tx.execute(sql`
            SELECT 1 FROM contratos_documentos
             WHERE reserva_id = ${existente.id} AND validado_em IS NOT NULL AND status <> 'invalidado'
             LIMIT 1
          `)).rows.length > 0;
          const pagamentosAtivos = Number(((await tx.execute(sql`
            SELECT COUNT(*)::int AS total FROM pagamentos
             WHERE reserva_id = ${existente.id}
               AND status NOT IN ('cancelado', 'recusado', 'reembolsado')
               AND (COALESCE(valor_pago_centavos, 0) > 0 OR status_reconciliado IN ('pendente', 'parcial', 'quitado'))
          `)).rows[0] as { total: number } | undefined)?.total || 0) > 0;
          if (contratoValidado || pagamentosAtivos) {
            throw new Error("Já existe uma contratação avançada para este evento. Abra Minhas reservas para continuar ou solicite a troca do pacote.");
          }
          await InventoryService.liberarReservaNaTransacao(tx, existente.id, "Troca de pacote no checkout", true);
          await tx.update(reservas).set({ status: "abandonado", checkout_estado: "troca_pacote_cliente", inventario_hold_id: null, atualizado_em: new Date() }).where(eq(reservas.id, existente.id));
          return null;
        }
      }

      const participantesExistentes = (await tx.execute(sql`
        SELECT id, sexo_operacional
          FROM reserva_participantes
         WHERE reserva_id = ${existente.id} OR grupo_id = ${existente.grupo_id || null}
         ORDER BY CASE WHEN vinculo_responsavel = 'responsável' THEN 0 ELSE 1 END, criado_em, id
      `)).rows as Array<{ id: string; sexo_operacional: string | null }>;
      const cadastro = (await tx.select({ sexo: usuarios.sexo }).from(usuarios).where(eq(usuarios.id, usuario_id)).limit(1))[0];
      const grupoHospedagem = normalizarGrupoHospedagem(cadastro?.sexo) || normalizarGrupoHospedagem(existente.grupo_hospedagem);
      const pessoas: PessoaAlocacao[] = participantesExistentes.length
        ? participantesExistentes.map((participante) => ({
          participanteId: participante.id,
          grupoHospedagem: normalizarGrupoHospedagem(participante.sexo_operacional) || grupoHospedagem,
        }))
        : [{ participanteId: null, grupoHospedagem }];
      const quantidadePessoas = pessoas.length;

      // A rotina de expiração libera o hold e limpa reservas.inventario_hold_id,
      // mas inventario_holds.reserva_id é histórico e UNIQUE. Sempre localize o
      // registro pela reserva, priorizando a referência atual quando existir;
      // assim a retomada reativa o mesmo hold em vez de tentar inserir outro.
      const hold = (await tx.execute(sql`
        SELECT id, status, expira_em
          FROM inventario_holds
         WHERE reserva_id = ${existente.id}
         ORDER BY CASE WHEN id = ${existente.inventario_hold_id || null} THEN 0 ELSE 1 END, criado_em DESC
         LIMIT 1
         FOR UPDATE
      `)).rows[0] as { id: string; status: string; expira_em: Date } | undefined;
      const holdValido = hold && (hold.status === "convertido" || (hold.status === "ativo" && new Date(hold.expira_em).getTime() > Date.now()));
      if (holdValido) {
        return {
          reserva: existente,
          calculo: { valor_total: Number(existente.valor_total || 0), valor_base: Number(existente.valor_total || 0), subtotal: Number(existente.valor_total || 0), desconto_cupom: Number(existente.desconto_aplicado || 0), itens_selecionados: [] },
          operacao: { recursos, assento_alocacao_id: null, quarto_alocacao_id: null },
          quantidade_pessoas: quantidadePessoas,
          retomada: false,
        };
      }

      const contratoValidado = (await tx.execute(sql`
        SELECT 1
          FROM contratos_documentos
         WHERE reserva_id = ${existente.id}
           AND validado_em IS NOT NULL
           AND status <> 'invalidado'
         LIMIT 1
      `)).rows.length > 0;
      const pagamentosPendentes = (await tx.execute(sql`
        SELECT COUNT(*)::int AS total
          FROM pagamentos
         WHERE reserva_id = ${existente.id}
           AND status NOT IN ('cancelado', 'recusado', 'reembolsado')
           AND (COALESCE(valor_pago_centavos, 0) > 0 OR status_reconciliado IN ('pendente', 'parcial', 'quitado'))
      `)).rows[0] as { total: number } | undefined;
      if (contratoValidado || Number(pagamentosPendentes?.total || 0) > 0) {
        return {
          reserva: existente,
          calculo: { valor_total: Number(existente.valor_total || 0), valor_base: Number(existente.valor_total || 0), subtotal: Number(existente.valor_total || 0), desconto_cupom: Number(existente.desconto_aplicado || 0), itens_selecionados: [] },
          operacao: { recursos, assento_alocacao_id: null, quarto_alocacao_id: null },
          quantidade_pessoas: quantidadePessoas,
          retomada: false,
        };
      }

      if (hold?.status === "ativo") {
        await InventoryService.liberarReservaNaTransacao(tx, existente.id, "Renovação do carrinho", false);
      }

      const lote = (await tx.execute(sql`SELECT id, "vagas_disponíveis" FROM lotes WHERE id = ${lote_id} FOR UPDATE`)).rows[0] as { id: string; vagas_disponíveis: number } | undefined;
      if (!lote || Number(lote.vagas_disponíveis) < quantidadePessoas) throw new Error("A excursão ficou sem vagas para retomar este carrinho");
      const baixa = await tx.execute(sql`UPDATE lotes SET "vagas_disponíveis" = "vagas_disponíveis" - ${quantidadePessoas}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ${lote_id} AND "vagas_disponíveis" >= ${quantidadePessoas} RETURNING id`);
      if (!baixa.rows.length) throw new Error("A excursão ficou sem vagas para retomar este carrinho");

      const formaRetomada = String((recursos as any).forma_contratacao || esperado?.forma_contratacao || pacote?.forma_contratacao || "");
      let loteComercialRetomado: { id: string; nome: string } | null = null;
      if (pacote && existente.lote_comercial_id) {
        loteComercialRetomado = await LoteComercialService.renovarNaTransacao(tx, existente.lote_comercial_id, quantidadePessoas);
      } else if (pacote) {
        const novoLoteComercial = await LoteComercialService.reservarNaTransacao(tx, pacote.id, existente.periodo_id, normalizarFormaLote(formaRetomada), quantidadePessoas);
        loteComercialRetomado = novoLoteComercial ? { id: novoLoteComercial.id, nome: novoLoteComercial.nome } : null;
      }
      const operacao = await alocarRecursosNaTransacao(tx, pacote, existente.id, usuario_id, lote_id, existente.periodo_id, pessoas, formaRetomada);
      const holdId = hold?.id || createId();
      const agora = new Date();
      if (hold) {
        await tx.update(inventarioHolds).set({ lote_id, modalidade: pacote?.modalidade_hospedagem || null, quantidade: quantidadePessoas, status: "ativo", expira_em: InventoryService.expirationDate(agora), liberado_em: null, motivo_liberacao: null, convertido_em: null }).where(eq(inventarioHolds.id, hold.id));
      } else {
        await tx.insert(inventarioHolds).values({ id: holdId, reserva_id: existente.id, lote_id, modalidade: pacote?.modalidade_hospedagem || null, quantidade: quantidadePessoas, status: "ativo", expira_em: InventoryService.expirationDate(agora), criado_em: agora });
      }
      if (existente.cupom_id) {
        await tx.execute(sql`UPDATE cupons SET uso_atual = COALESCE(uso_atual, 0) + 1 WHERE id = ${existente.cupom_id}`);
      }
      await tx.update(reservas).set({
        status: existente.status === "abandonado" ? "pacote_montado" : existente.status,
        checkout_estado: existente.status === "abandonado" || existente.checkout_estado === "carrinho_salvo" ? "inventario_reservado" : existente.checkout_estado,
        inventario_hold_id: holdId,
        lote_comercial_id: loteComercialRetomado?.id || existente.lote_comercial_id || null,
        atualizado_em: agora,
      }).where(eq(reservas.id, existente.id));
      const atualizada = (await tx.select().from(reservas).where(eq(reservas.id, existente.id)).limit(1))[0] || existente;
      return { reserva: atualizada, calculo: { valor_total: Number(atualizada.valor_total || 0), valor_base: Number(atualizada.valor_total || 0), subtotal: Number(atualizada.valor_total || 0), desconto_cupom: Number(atualizada.desconto_aplicado || 0), itens_selecionados: [] }, operacao, quantidade_pessoas: quantidadePessoas, retomada: true };
    });
  }

  static async buscarItensDisponiveis(lote_id: string) {
    return db.select().from(itens_addon).where(and(eq(itens_addon.lote_id, lote_id), eq(itens_addon.ativo, true)));
  }

  static async validarVagasDisponíveis(lote_id: string, quantidade = 1): Promise<boolean> {
    const lote = (await db.select({ vagas: lotes.vagas_disponíveis, ativo: lotes.ativo, operacional: lotes.operacional_interno }).from(lotes).where(eq(lotes.id, lote_id)).limit(1))[0];
    return Boolean(lote?.ativo && (lote.operacional || Number(lote.vagas) >= quantidade));
  }

  static async obterDisponibilidadeFisica(
    pacote: Pick<typeof pacotes.$inferSelect, 'id' | 'lote_id' | 'forma_contratacao' | 'formas_contratacao' | 'modalidade_hospedagem' | 'disponibilidade'>,
    periodoId?: string | null,
    formaEscolhida?: string | null,
  ) {
    const formas = normalizarFormasContratacao(pacote.formas_contratacao, pacote.forma_contratacao, pacote.modalidade_hospedagem);
    const forma = formaEscolhida || formas[0] || pacote.forma_contratacao;
    const recursos = resolverRecursosContratacao(forma, pacote.modalidade_hospedagem);
    const lote = (await db.select({ vagas: lotes.vagas_disponíveis, operacional: lotes.operacional_interno }).from(lotes).where(eq(lotes.id, pacote.lote_id)).limit(1))[0];
    const vagasLote = lote?.operacional ? null : Math.max(0, Number(lote?.vagas || 0));
    const planejamento = periodoId
      ? (await db.select({ transporte: pacotePeriodos.capacidade_transporte_planejada, hospedagem: pacotePeriodos.capacidade_hospedagem_planejada })
        .from(pacotePeriodos).where(and(eq(pacotePeriodos.id, periodoId), eq(pacotePeriodos.pacote_id, pacote.id))).limit(1))[0]
      : undefined;
    let vagasTransporte: number | null = null;
    let vagasHospedagem: number | null = null;
    let vagasHospedagemPorGrupo: Record<GrupoHospedagem, number> | null = null;

    if (recursos.transporte) {
      const linha = (await db.execute(sql`SELECT COUNT(*)::int AS total
        FROM saidas_operacionais s
        JOIN onibus_operacionais o ON o.saida_id = s.id AND o.ativo = true
        JOIN assentos_onibus a ON a.onibus_id = o.id AND a.status = 'disponivel' AND a.numero <= o.capacidade
        WHERE s.lote_id = ${pacote.lote_id} AND s.ativa = true
          AND (${periodoId || null}::text IS NULL OR COALESCE(o.periodo_id, s.periodo_id) IS NULL OR COALESCE(o.periodo_id, s.periodo_id) = ${periodoId || null})
          AND NOT EXISTS (SELECT 1 FROM assento_alocacoes aa WHERE aa.assento_id = a.id AND aa.status = 'ativa')
          AND NOT EXISTS (SELECT 1 FROM assento_holds h WHERE h.assento_id = a.id AND h.status = 'ativo' AND h.expira_em > CURRENT_TIMESTAMP)`)).rows[0] as { total: number } | undefined;
      vagasTransporte = Math.max(0, Number(linha?.total || 0));
      if (planejamento?.transporte !== null && planejamento?.transporte !== undefined) vagasTransporte = Math.min(vagasTransporte, Number(planejamento.transporte));
    }

    if (recursos.hospedagem && recursos.estrutura_quarto) {
      const linhasGrupo = (await db.execute(sql`SELECT q.genero,
          COALESCE(SUM(q.capacidade - (SELECT COUNT(*) FROM quarto_alocacoes qa WHERE qa.quarto_id = q.id AND qa.status = 'ativa')), 0)::int AS total
        FROM quartos_hospedagem q
        WHERE q.lote_id = ${pacote.lote_id} AND q.ativo = true
          AND q.estrutura = ${recursos.estrutura_quarto}
          AND (q.pacote_id IS NULL OR q.pacote_id = ${pacote.id})
          AND (${periodoId || null}::text IS NULL OR q.periodo_id IS NULL OR q.periodo_id = ${periodoId || null})
        GROUP BY q.genero`)).rows as Array<{ genero: GrupoHospedagem; total: number }>;
      vagasHospedagemPorGrupo = { masculino: 0, feminino: 0 };
      for (const linha of linhasGrupo) {
        if (linha.genero === "masculino" || linha.genero === "feminino") vagasHospedagemPorGrupo[linha.genero] = Math.max(0, Number(linha.total || 0));
      }
      vagasHospedagem = vagasHospedagemPorGrupo.masculino + vagasHospedagemPorGrupo.feminino;
      if (planejamento?.hospedagem !== null && planejamento?.hospedagem !== undefined) vagasHospedagem = Math.min(vagasHospedagem, Number(planejamento.hospedagem));
    }

    const limites = [vagasLote, vagasTransporte, vagasHospedagem].filter((valor): valor is number => valor !== null);
    const vagasDisponiveis = Math.max(0, Math.min(...limites));
    const disponibilidade = pacote.disponibilidade === "esgotado" || vagasDisponiveis === 0
      ? "esgotado"
      : vagasDisponiveis <= 5 ? "ultimas_vagas" : pacote.disponibilidade || "disponivel";
    return {
      recursos,
      vagas_disponiveis: vagasDisponiveis,
      vagas_transporte: vagasTransporte,
      vagas_hospedagem: vagasHospedagem,
      vagas_hospedagem_por_grupo: vagasHospedagemPorGrupo,
      disponibilidade,
    };
  }

  static async calcularValorPacote(config: ConfiguracaoPacote): Promise<ResultadoCalculo> {
    const lote = (await db.select().from(lotes).where(and(eq(lotes.id, config.lote_id), eq(lotes.ativo, true))).limit(1))[0];
    if (!lote) throw new Error("Lote não encontrado ou inativo");
    const evento = (await db.select({ id: eventos.id, ativo: eventos.ativo }).from(eventos).where(eq(eventos.id, lote.evento_id)).limit(1))[0];
    if (!evento?.ativo) throw new Error("Evento não encontrado ou inativo");

    let valorBase = new Decimal(lote.valor_base.toString());
    let loteComercialAtivo: Awaited<ReturnType<typeof LoteComercialService.obterStatus>>["lote"] = null;
    let pacoteSelecionado: typeof pacotes.$inferSelect | undefined;
    let formaSelecionada: string | undefined;
    if (config.pacote_id) {
      pacoteSelecionado = (await db.select().from(pacotes).where(and(eq(pacotes.id, config.pacote_id), eq(pacotes.lote_id, config.lote_id), eq(pacotes.ativo, true))).limit(1))[0];
      if (!pacoteSelecionado) throw new Error("Pacote selecionado não encontrado, incompatível com o lote ou inativo");
      if (pacoteSelecionado.disponibilidade === "esgotado") throw new Error("Esta modalidade está esgotada");
      formaSelecionada = validarFormaContratacaoSelecionada(config, pacoteSelecionado) || undefined;
      const periodosAtivos = await db.select({ id: pacotePeriodos.id }).from(pacotePeriodos)
        .where(and(eq(pacotePeriodos.pacote_id, pacoteSelecionado.id), eq(pacotePeriodos.ativo, true)));
      if (periodosAtivos.length > 0 && !config.periodo_id) throw new Error("Escolha o período da viagem para continuar");
      if (config.periodo_id && !periodosAtivos.some((periodo) => periodo.id === config.periodo_id)) throw new Error("O período escolhido não pertence a este pacote ou está indisponível");
      valorBase = new Decimal(pacoteSelecionado.valor_total.toString());
      const formaComercial = normalizarFormaLote(formaSelecionada || pacoteSelecionado.forma_contratacao);
      const statusComercial = await LoteComercialService.obterStatus(pacoteSelecionado.id, config.periodo_id || null, formaComercial);
      if (statusComercial.configurado) {
        if (statusComercial.status === "aguardando") throw new Error("Nenhuma condição comercial está disponível no momento. Verifique a data de início da venda.");
        if (statusComercial.status === "esgotado" || !statusComercial.lote) throw new Error("Os lotes comerciais deste pacote, período e forma de contratação estão esgotados.");
        if (config.lote_comercial_id && config.lote_comercial_id !== statusComercial.lote.id) throw new Error("O lote comercial mudou. Atualize a página para continuar com a condição vigente.");
        loteComercialAtivo = statusComercial.lote;
        valorBase = new Decimal(statusComercial.lote.valor);
      } else if (config.lote_comercial_id) {
        throw new Error("O lote comercial selecionado não está mais disponível para este pacote e período.");
      }
    }

    const itensValidados: ItemSelecionado[] = [];
    let subtotal = valorBase;
    for (const item of config.itens || []) {
      const itemDb = (await db.select().from(itens_addon).where(and(eq(itens_addon.id, item.id), eq(itens_addon.lote_id, config.lote_id), eq(itens_addon.ativo, true))).limit(1))[0];
      if (!itemDb) throw new Error(`Adicional inválido ou incompatível com o lote: ${item.id}`);
      const quantidade = Number(item.quantidade);
      if (!Number.isInteger(quantidade) || quantidade < 1) throw new Error(`Quantidade inválida para o adicional ${itemDb.nome}`);
      const itemValor = new Decimal(itemDb.valor.toString());
      itensValidados.push({ id: itemDb.id, nome: itemDb.nome, tipo: itemDb.tipo, valor: itemValor.toNumber(), quantidade });
      subtotal = subtotal.plus(itemValor.times(quantidade));
    }

    let desconto = new Decimal(0);
    let cupomId: string | undefined;
    if (config.cupom_codigo?.trim()) {
      const cupom = (await db.select().from(cupons).where(and(
        eq(cupons.codigo, config.cupom_codigo.trim().toUpperCase()),
        eq(cupons.evento_id, lote.evento_id),
        eq(cupons.ativo, true),
        or(isNull(cupons.pacote_id), config.pacote_id ? eq(cupons.pacote_id, config.pacote_id) : isNull(cupons.pacote_id)),
        or(isNull(cupons.lote_comercial_id), loteComercialAtivo ? eq(cupons.lote_comercial_id, loteComercialAtivo.id) : isNull(cupons.lote_comercial_id)),
        or(isNull(cupons.vendedor_id), config.vendedor_id ? eq(cupons.vendedor_id, config.vendedor_id) : isNull(cupons.vendedor_id)),
      )).limit(1))[0];
      if (!cupom) throw new Error("Cupom inválido para este evento");
      if (cupom.validade && new Date(cupom.validade).getTime() < Date.now()) throw new Error("Cupom expirado");
      if (cupom.uso_maximo !== null && Number(cupom.uso_atual || 0) >= Number(cupom.uso_maximo)) throw new Error("Cupom com limite de uso atingido");
      if (cupom.valor_minimo !== null && subtotal.lessThan(new Decimal(cupom.valor_minimo.toString()))) throw new Error(`Este cupom exige valor mínimo de R$ ${cupom.valor_minimo}`);
      if (cupom.limite_por_cliente && config.usuario_id) {
        const usos = await db.select({ id: cuponsUtilizacoes.id }).from(cuponsUtilizacoes).where(and(eq(cuponsUtilizacoes.cupom_id, cupom.id), eq(cuponsUtilizacoes.usuario_id, config.usuario_id))).limit(1);
        if (usos.length >= Number(cupom.limite_por_cliente)) throw new Error("Este cupom já atingiu o limite por cliente");
      }
      cupomId = cupom.id;
      if (cupom.desconto_percentual !== null) {
        const percentual = new Decimal(cupom.desconto_percentual.toString());
        if (percentual.lessThanOrEqualTo(0) || percentual.greaterThan(100)) throw new Error("Percentual de cupom inválido");
        desconto = subtotal.times(percentual).div(100);
      } else if (cupom.desconto_fixo !== null) {
        desconto = new Decimal(cupom.desconto_fixo.toString());
        if (desconto.lessThanOrEqualTo(0)) throw new Error("Valor de cupom inválido");
      }
      desconto = Decimal.min(desconto, subtotal);
    }

    const total = subtotal.minus(desconto).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return {
      valor_base: dinheiro(valorBase),
      itens_selecionados: itensValidados,
      subtotal: dinheiro(subtotal),
      desconto_cupom: dinheiro(desconto),
      valor_total: dinheiro(total),
      pacote_id: pacoteSelecionado?.id,
      pacote_nome: pacoteSelecionado?.nome,
      modalidade_hospedagem: pacoteSelecionado?.modalidade_hospedagem || undefined,
      forma_contratacao: formaSelecionada,
      lote_comercial_id: loteComercialAtivo?.id,
      lote_comercial_nome: loteComercialAtivo?.nome,
      lote_comercial_valor: loteComercialAtivo ? Number(loteComercialAtivo.valor) : undefined,
      cupom_id: cupomId,
    };
  }

  static async reservarPacote(usuario_id: string, lote_id: string, config: ConfiguracaoPacote, ip_origem: string, origem: OrigemReserva = {}) {
    if (config.lote_id !== lote_id) throw new Error("Lote inconsistente na configuração do pacote");
    const participantes = normalizarParticipantes(config.participantes);
    const quantidadePessoas = participantes.length + 1;
    const calculo = await this.calcularValorPacote({ ...config, usuario_id, vendedor_id: origem.vendedor_id });
    const resultadoTransacao = await db.transaction(async (tx) => {
      const loteLock = await tx.execute(sql`SELECT id, "vagas_disponíveis" FROM lotes WHERE id = ${lote_id} FOR UPDATE`);
      const lote = loteLock.rows[0] as { id: string; vagas_disponíveis: number } | undefined;
      if (!lote || Number(lote.vagas_disponíveis) < quantidadePessoas) throw new Error("Não há vagas suficientes para todas as pessoas adicionadas");
      const pacoteOperacional = config.pacote_id
        ? (await tx.execute(sql`SELECT id, lote_id, forma_contratacao, formas_contratacao, modalidade_hospedagem
          FROM pacotes WHERE id = ${config.pacote_id} AND lote_id = ${lote_id} AND ativo = true FOR SHARE`)).rows[0] as PacoteOperacional | undefined
        : undefined;
      if (config.pacote_id && !pacoteOperacional) throw new Error("Pacote selecionado não encontrado, incompatível com o lote ou inativo");
      if (config.pacote_id) {
        const periodosAtivos = (await tx.execute(sql`SELECT id FROM pacote_periodos WHERE pacote_id = ${config.pacote_id} AND ativo = true ORDER BY ordem, data_inicio`)).rows as Array<{ id: string }>;
        if (periodosAtivos.length > 0 && !config.periodo_id) throw new Error("Escolha o período da viagem para continuar");
        if (config.periodo_id && !periodosAtivos.some((periodo) => periodo.id === config.periodo_id)) throw new Error("O período escolhido não pertence a este pacote ou está indisponível");
      } else if (config.periodo_id) {
        throw new Error("O período só pode ser escolhido junto com um pacote");
      }
      const formaComercial = normalizarFormaLote(calculo.forma_contratacao || pacoteOperacional?.forma_contratacao);
      const loteComercial = pacoteOperacional
        ? await LoteComercialService.reservarNaTransacao(tx, pacoteOperacional.id, config.periodo_id || null, formaComercial, quantidadePessoas, config.lote_comercial_id ? Number(calculo.valor_base) : undefined)
        : null;
      if (config.lote_comercial_id && (!loteComercial || loteComercial.id !== config.lote_comercial_id)) {
        throw new Error("O lote comercial mudou. Atualize a página para continuar com a condição vigente.");
      }
      const responsavel = (await tx.select({ nome: usuarios.nome, cpf: usuarios.cpf, data_nascimento: usuarios.data_nascimento, telefone: usuarios.telefone, email: usuarios.email, sexo: usuarios.sexo }).from(usuarios).where(eq(usuarios.id, usuario_id)).limit(1))[0];
      const grupoHospedagem = normalizarGrupoHospedagem(responsavel?.sexo) || normalizarGrupoHospedagem(config.grupo_hospedagem);
      const recursosPacote = pacoteOperacional
        ? resolverRecursosContratacao(calculo.forma_contratacao || pacoteOperacional.forma_contratacao, pacoteOperacional.modalidade_hospedagem)
        : { transporte: false, hospedagem: false, estrutura_quarto: null };
      if (recursosPacote.hospedagem && (!grupoHospedagem || participantes.some((participante) => !participante.sexo_operacional))) {
        throw new Error("Informe o sexo de todas as pessoas para direcionar a hospedagem");
      }
      await bloquearDuplicidadePorCpf(tx, lote_id, usuario_id, participantes);
      const baixa = await tx.execute(sql`UPDATE lotes SET "vagas_disponíveis" = "vagas_disponíveis" - ${quantidadePessoas}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ${lote_id} AND "vagas_disponíveis" >= ${quantidadePessoas} RETURNING id`);
      if (baixa.rows.length === 0) throw new Error("Vagas indisponíveis");

      if (calculo.cupom_id) {
        if (usuario_id) {
          const cupomBloqueado = (await tx.execute(sql`SELECT limite_por_cliente FROM cupons WHERE id = ${calculo.cupom_id} FOR UPDATE`)).rows[0] as { limite_por_cliente: number | null } | undefined;
          if (cupomBloqueado?.limite_por_cliente) {
            const usosCliente = (await tx.execute(sql`SELECT COUNT(*)::int AS total FROM cupons_utilizacoes WHERE cupom_id = ${calculo.cupom_id} AND usuario_id = ${usuario_id}`)).rows[0] as { total: number } | undefined;
            if (Number(usosCliente?.total || 0) >= Number(cupomBloqueado.limite_por_cliente)) throw new Error("Este cupom já atingiu o limite por cliente");
          }
        }
        const consumo = await tx.execute(sql`UPDATE cupons SET uso_atual = COALESCE(uso_atual, 0) + 1 WHERE id = ${calculo.cupom_id} AND ativo = true AND (validade IS NULL OR validade > CURRENT_TIMESTAMP) AND (uso_maximo IS NULL OR uso_atual < uso_maximo) RETURNING id`);
        if (consumo.rows.length === 0) throw new Error("Cupom com limite de uso atingido");
      }
      const reservaId = createId();
      const agora = new Date();
      const holdId = createId();
      const regras = origem.vendedor_id
        ? await tx.select().from(comissaoRegras).where(and(
          eq(comissaoRegras.vendedor_id, origem.vendedor_id),
          eq(comissaoRegras.ativo, true),
          or(isNull(comissaoRegras.evento_id), eq(comissaoRegras.evento_id, (await tx.select({ evento_id: lotes.evento_id }).from(lotes).where(eq(lotes.id, lote_id)).limit(1))[0]?.evento_id || "")),
          or(isNull(comissaoRegras.pacote_id), config.pacote_id ? eq(comissaoRegras.pacote_id, config.pacote_id) : isNull(comissaoRegras.pacote_id)),
        )).orderBy(desc(comissaoRegras.criado_em))
        : [];
      const regra = regras.sort((a, b) => (Number(Boolean(b.pacote_id)) - Number(Boolean(a.pacote_id))) || (Number(Boolean(b.evento_id)) - Number(Boolean(a.evento_id))))[0];
      const baseComissaoCentavos = Math.round(calculo.valor_total * 100 * quantidadePessoas);
      const comissaoCentavos = regra
        ? regra.tipo === "percentual" ? Math.round(baseComissaoCentavos * Number(regra.valor) / 100) : Math.min(baseComissaoCentavos, Math.round(Number(regra.valor) * 100))
        : 0;
      const regraSnapshot = regra ? { id: regra.id, tipo: regra.tipo, valor: String(regra.valor), base_centavos: baseComissaoCentavos } : null;
      const inserido = await tx.insert(reservas).values({
        id: reservaId,
        usuario_id,
        lote_id,
        pacote_id: config.pacote_id || null,
        periodo_id: config.periodo_id || null,
        lote_comercial_id: loteComercial?.id || null,
        status: "pacote_montado",
        checkout_estado: "inventario_reservado",
        // A FK aponta para inventario_holds, que referencia esta reserva.
        // Portanto, o hold precisa existir antes de preencher esta coluna.
        inventario_hold_id: null,
        valor_total_centavos: Math.round(calculo.valor_total * 100 * quantidadePessoas),
        preco_versao: "2026.1",
        itens_selecionados: JSON.stringify(calculo.itens_selecionados),
        valor_total: (calculo.valor_total * quantidadePessoas).toFixed(2),
        cupom_id: calculo.cupom_id,
        desconto_aplicado: (calculo.desconto_cupom * quantidadePessoas).toFixed(2),
        vendedor_id: origem.vendedor_id || null,
        lead_id: origem.lead_id || null,
        origem_comercial: origem.codigo_origem || null,
        comissao_regra_snapshot: regraSnapshot,
        comissao_centavos: comissaoCentavos,
        criado_em: agora,
        atualizado_em: agora,
      }).returning();
      const novaReserva = inserido[0];
      if (!novaReserva) throw new Error("Não foi possível criar a reserva");
      const grupoId = createId();
      await tx.insert(reservaGrupos).values({
        id: grupoId,
        responsavel_id: usuario_id,
        lote_id,
        vendedor_id: origem.vendedor_id || null,
        status: "rascunho",
        quantidade_participantes: quantidadePessoas,
        valor_total_centavos: Math.round(calculo.valor_total * 100 * quantidadePessoas),
        criado_em: agora,
        atualizado_em: agora,
      });
      const participantesPersistidos = [
        {
          id: createId(), grupo_id: grupoId, reserva_id: novaReserva.id,
          nome_completo: responsavel?.nome || "Responsável pela reserva", cpf: responsavel?.cpf || null,
          data_nascimento: responsavel?.data_nascimento || null, telefone: responsavel?.telefone || null,
          email: responsavel?.email || null, sexo_operacional: normalizarGrupoHospedagem(responsavel?.sexo) || grupoHospedagem || null,
          vinculo_responsavel: "responsável", menor_idade: false, documento_status: "nao_iniciada",
          criado_em: agora, atualizado_em: agora,
        },
        ...participantes.map((participante) => ({
          id: createId(), grupo_id: grupoId, reserva_id: novaReserva.id,
          nome_completo: participante.nome_completo, cpf: participante.cpf || null,
          data_nascimento: participante.data_nascimento ? new Date(`${participante.data_nascimento}T12:00:00Z`) : null,
          telefone: participante.telefone || null, email: participante.email || null,
          sexo_operacional: participante.sexo_operacional || grupoHospedagem || null,
          vinculo_responsavel: "acompanhante", menor_idade: false, documento_status: "nao_iniciada",
          criado_em: agora, atualizado_em: agora,
        })),
      ];
      await tx.insert(reservaParticipantes).values(participantesPersistidos);
      await tx.update(reservas).set({ grupo_id: grupoId, atualizado_em: agora }).where(eq(reservas.id, novaReserva.id));
      const pessoas: PessoaAlocacao[] = participantesPersistidos.map((participante) => ({
        participanteId: participante.id,
        grupoHospedagem: normalizarGrupoHospedagem(participante.sexo_operacional),
      }));
      const operacao = await alocarRecursosNaTransacao(tx, pacoteOperacional, novaReserva.id, usuario_id, lote_id, config.periodo_id, pessoas, calculo.forma_contratacao || pacoteOperacional?.forma_contratacao);
      if (calculo.cupom_id && usuario_id) {
        await tx.insert(cuponsUtilizacoes).values({ id: createId(), cupom_id: calculo.cupom_id, usuario_id, reserva_id: novaReserva.id });
      }
      if (regra && origem.vendedor_id && comissaoCentavos > 0) {
        await tx.insert(comissoes).values({ id: createId(), reserva_id: novaReserva.id, vendedor_id: origem.vendedor_id, regra_id: regra.id, base_centavos: baseComissaoCentavos, valor_centavos: comissaoCentavos, regra_snapshot: regraSnapshot || {}, status: "prevista", criado_em: agora, atualizado_em: agora });
      }
      await tx.insert(inventarioHolds).values({ id: holdId, reserva_id: novaReserva.id, lote_id, modalidade: calculo.modalidade_hospedagem || null, quantidade: quantidadePessoas, status: "ativo", expira_em: new Date(agora.getTime() + 30 * 60 * 1000), criado_em: agora });
      await tx.update(reservas).set({ inventario_hold_id: holdId, atualizado_em: agora }).where(eq(reservas.id, novaReserva.id));
      const linhasLedger = [
        { tipo: "pacote", codigo: calculo.pacote_id || "lote-base", descricao: calculo.pacote_nome || "Pacote base", quantidade: quantidadePessoas, valor_unitario_centavos: Math.round(calculo.valor_base * 100), valor_total_centavos: Math.round(calculo.valor_base * 100 * quantidadePessoas) },
        ...calculo.itens_selecionados.map((item) => ({ tipo: "adicional", codigo: item.id, descricao: item.nome, quantidade: item.quantidade, valor_unitario_centavos: Math.round(item.valor * 100), valor_total_centavos: Math.round(item.valor * item.quantidade * 100) })),
        ...(calculo.desconto_cupom > 0 ? [{ tipo: "cupom", codigo: calculo.cupom_id, descricao: "Desconto de cupom", quantidade: quantidadePessoas, valor_unitario_centavos: -Math.round(calculo.desconto_cupom * 100), valor_total_centavos: -Math.round(calculo.desconto_cupom * 100 * quantidadePessoas) }] : []),
      ];
      await tx.insert(precosLedger).values(linhasLedger.map((linha) => ({ id: createId(), reserva_id: novaReserva.id, ...linha, criado_em: agora, metadados: { fonte: "PacoteService.calcularValorPacote", preco_versao: "2026.1", lote_comercial_id: loteComercial?.id || null, lote_comercial_nome: loteComercial?.nome || null } })));
      return { reserva: novaReserva, operacao };
    });
    const calculoGrupo = quantidadePessoas === 1 ? calculo : {
      ...calculo,
      valor_base: dinheiro(new Decimal(calculo.valor_base).times(quantidadePessoas)),
      subtotal: dinheiro(new Decimal(calculo.subtotal).times(quantidadePessoas)),
      desconto_cupom: dinheiro(new Decimal(calculo.desconto_cupom).times(quantidadePessoas)),
      valor_total: dinheiro(new Decimal(calculo.valor_total).times(quantidadePessoas)),
    };
    return { reserva: resultadoTransacao.reserva, calculo: calculoGrupo, operacao: resultadoTransacao.operacao, ip_origem, quantidade_pessoas: quantidadePessoas };
  }
}
