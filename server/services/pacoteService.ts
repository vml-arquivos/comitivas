import { db } from "../db/index.js";
import { eventos, lotes, pacotes, itens_addon, cupons, reservas, inventarioHolds, precosLedger, cuponsUtilizacoes, comissaoRegras, comissoes, reservaGrupos, reservaParticipantes, usuarios } from "../db/schema.js";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { normalizarGrupoHospedagem, resolverRecursosContratacao, type GrupoHospedagem, type RecursosContratados } from "./contratacaoRecursos.js";

export interface ItemSelecionado { id: string; nome: string; tipo: string; valor: number; quantidade: number; }
export interface ParticipantePacote { nome_completo: string; cpf?: string; data_nascimento?: string; telefone?: string; email?: string; sexo_operacional?: GrupoHospedagem; }
export interface ConfiguracaoPacote { lote_id: string; pacote_id?: string; itens: ItemSelecionado[]; cupom_codigo?: string; usuario_id?: string; vendedor_id?: string; grupo_hospedagem?: GrupoHospedagem; participantes?: ParticipantePacote[]; }
export interface ResultadoCalculo { valor_base: number; itens_selecionados: ItemSelecionado[]; subtotal: number; desconto_cupom: number; valor_total: number; pacote_id?: string; pacote_nome?: string; modalidade_hospedagem?: string; cupom_id?: string; mensagem?: string; }

export interface OrigemReserva { lead_id?: string; vendedor_id?: string; codigo_origem?: string; }

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

async function bloquearDuplicidadePorCpf(tx: any, loteId: string, usuarioId: string): Promise<void> {
  const pessoa = (await tx.execute(sql`SELECT cpf FROM usuarios WHERE id = ${usuarioId} FOR SHARE`)).rows[0] as { cpf: string | null } | undefined;
  const cpf = cpfNormalizado(pessoa?.cpf);
  if (!cpf) return;

  // O advisory lock serializa duas abas/contas concorrentes mesmo antes da consulta.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`reserva:${loteId}:${cpf}`}))`);
  const existente = (await tx.execute(sql`
    SELECT r.id
      FROM reservas r
      JOIN usuarios u ON u.id = r.usuario_id
     WHERE r.lote_id = ${loteId}
       AND regexp_replace(COALESCE(u.cpf, ''), '[^0-9]', '', 'g') = ${cpf}
       AND COALESCE(r.status::text, '') <> 'abandonado'
       AND COALESCE(r.checkout_estado, '') NOT IN ('expirado', 'cancelado', 'cancelado_cliente', 'cancelamento_aprovado')
     LIMIT 1
  `)).rows[0] as { id: string } | undefined;
  if (existente) {
    const erro = new Error("DUPLICIDADE_RESERVA_ATIVA");
    (erro as Error & { reservaId?: string }).reservaId = existente.id;
    throw erro;
  }
}

type PacoteOperacional = {
  id: string;
  lote_id: string;
  forma_contratacao: string;
  modalidade_hospedagem: string | null;
};

async function alocarRecursosNaTransacao(
  tx: any,
  pacote: PacoteOperacional | undefined,
  reservaId: string,
  usuarioId: string,
  loteId: string,
  grupoHospedagem: GrupoHospedagem | null,
  quantidadePessoas = 1,
): Promise<{ recursos: RecursosContratados; assento_alocacao_id: string | null; quarto_alocacao_id: string | null }> {
  const recursos = pacote
    ? resolverRecursosContratacao(pacote.forma_contratacao, pacote.modalidade_hospedagem)
    : { transporte: false, hospedagem: false, estrutura_quarto: null };
  let assentoAlocacaoId: string | null = null;
  let quartoAlocacaoId: string | null = null;

  if (recursos.hospedagem && !grupoHospedagem) {
    throw new Error("Selecione o grupo de hospedagem masculino ou feminino");
  }

  if (recursos.transporte) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`capacidade-transporte:${loteId}`}))`);
    for (let pessoa = 0; pessoa < quantidadePessoas; pessoa += 1) {
      const assento = (await tx.execute(sql`
      SELECT a.id AS assento_id, a.numero, o.id AS onibus_id, o.nome AS onibus_nome, s.id AS saida_id
      FROM saidas_operacionais s
      JOIN onibus_operacionais o ON o.saida_id = s.id AND o.ativo = true
      JOIN assentos_onibus a ON a.onibus_id = o.id AND a.status = 'disponivel' AND a.numero <= o.capacidade
      WHERE s.lote_id = ${loteId} AND s.ativa = true
        AND NOT EXISTS (SELECT 1 FROM assento_alocacoes aa WHERE aa.assento_id = a.id AND aa.status = 'ativa')
        AND NOT EXISTS (SELECT 1 FROM assento_holds h WHERE h.assento_id = a.id AND h.status = 'ativo' AND h.expira_em > CURRENT_TIMESTAMP)
      ORDER BY o.venda_ordem, o.criado_em, a.numero
      LIMIT 1 FOR UPDATE OF a
      `)).rows[0] as { assento_id: string; numero: number; onibus_id: string; onibus_nome: string; saida_id: string } | undefined;
      if (!assento) throw new Error("As vagas de transporte deste período estão esgotadas");
      const alocacaoId = createId();
      if (!assentoAlocacaoId) assentoAlocacaoId = alocacaoId;
      await tx.execute(sql`INSERT INTO assento_alocacoes
      (id, assento_id, reserva_id, usuario_id, status, alocado_por, alocado_em)
      VALUES (${alocacaoId}, ${assento.assento_id}, ${reservaId}, ${usuarioId}, 'ativa', ${usuarioId}, CURRENT_TIMESTAMP)`);
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

  if (recursos.hospedagem && recursos.estrutura_quarto && grupoHospedagem) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`capacidade-hospedagem:${loteId}:${recursos.estrutura_quarto}:${grupoHospedagem}`}))`);
    for (let pessoa = 0; pessoa < quantidadePessoas; pessoa += 1) {
      const quarto = (await tx.execute(sql`
      SELECT q.id AS quarto_id, q.nome AS quarto_nome, vaga.numero AS numero_vaga
      FROM quartos_hospedagem q
      CROSS JOIN LATERAL generate_series(1, q.capacidade) AS vaga(numero)
      WHERE q.lote_id = ${loteId} AND q.ativo = true
        AND q.genero = ${grupoHospedagem}
        AND q.estrutura = ${recursos.estrutura_quarto}
        AND (q.pacote_id IS NULL OR q.pacote_id = ${pacote?.id || null})
        AND NOT EXISTS (
          SELECT 1 FROM quarto_alocacoes qa
          WHERE qa.quarto_id = q.id AND qa.numero_vaga = vaga.numero AND qa.status = 'ativa'
        )
      ORDER BY CASE WHEN q.pacote_id = ${pacote?.id || null} THEN 0 ELSE 1 END, q.nome, vaga.numero
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
      await tx.execute(sql`INSERT INTO operacao_historico
      (id, saida_id, entidade, entidade_id, acao, ator_id, depois, criado_em)
      VALUES (${createId()}, NULL, 'quarto_alocacao', ${alocacaoId}, 'hospede_alocado_checkout', ${usuarioId},
        ${JSON.stringify({ reserva_id: reservaId, quarto_id: quarto.quarto_id, quarto: quarto.quarto_nome, vaga: Number(quarto.numero_vaga), grupo: grupoHospedagem, estrutura: recursos.estrutura_quarto })}::jsonb, CURRENT_TIMESTAMP)`);
    }
  }

  await tx.execute(sql`UPDATE reservas SET
    grupo_hospedagem = ${recursos.hospedagem ? grupoHospedagem : null},
    recursos_contratados = ${JSON.stringify(recursos)}::jsonb,
    atualizado_em = CURRENT_TIMESTAMP
    WHERE id = ${reservaId}`);
  return { recursos, assento_alocacao_id: assentoAlocacaoId, quarto_alocacao_id: quartoAlocacaoId };
}

export class PacoteService {
  static async buscarItensDisponiveis(lote_id: string) {
    return db.select().from(itens_addon).where(and(eq(itens_addon.lote_id, lote_id), eq(itens_addon.ativo, true)));
  }

  static async validarVagasDisponíveis(lote_id: string, quantidade = 1): Promise<boolean> {
    const lote = (await db.select({ vagas: lotes.vagas_disponíveis, ativo: lotes.ativo }).from(lotes).where(eq(lotes.id, lote_id)).limit(1))[0];
    return Boolean(lote?.ativo && Number(lote.vagas) >= quantidade);
  }

  static async obterDisponibilidadeFisica(pacote: typeof pacotes.$inferSelect) {
    const recursos = resolverRecursosContratacao(pacote.forma_contratacao, pacote.modalidade_hospedagem);
    const lote = (await db.select({ vagas: lotes.vagas_disponíveis }).from(lotes).where(eq(lotes.id, pacote.lote_id)).limit(1))[0];
    const vagasLote = Math.max(0, Number(lote?.vagas || 0));
    let vagasTransporte: number | null = null;
    let vagasHospedagem: number | null = null;
    let vagasHospedagemPorGrupo: Record<GrupoHospedagem, number> | null = null;

    if (recursos.transporte) {
      const linha = (await db.execute(sql`SELECT COUNT(*)::int AS total
        FROM saidas_operacionais s
        JOIN onibus_operacionais o ON o.saida_id = s.id AND o.ativo = true
        JOIN assentos_onibus a ON a.onibus_id = o.id AND a.status = 'disponivel' AND a.numero <= o.capacidade
        WHERE s.lote_id = ${pacote.lote_id} AND s.ativa = true
          AND NOT EXISTS (SELECT 1 FROM assento_alocacoes aa WHERE aa.assento_id = a.id AND aa.status = 'ativa')
          AND NOT EXISTS (SELECT 1 FROM assento_holds h WHERE h.assento_id = a.id AND h.status = 'ativo' AND h.expira_em > CURRENT_TIMESTAMP)`)).rows[0] as { total: number } | undefined;
      vagasTransporte = Math.max(0, Number(linha?.total || 0));
    }

    if (recursos.hospedagem && recursos.estrutura_quarto) {
      const linhasGrupo = (await db.execute(sql`SELECT q.genero,
          COALESCE(SUM(q.capacidade - (SELECT COUNT(*) FROM quarto_alocacoes qa WHERE qa.quarto_id = q.id AND qa.status = 'ativa')), 0)::int AS total
        FROM quartos_hospedagem q
        WHERE q.lote_id = ${pacote.lote_id} AND q.ativo = true
          AND q.estrutura = ${recursos.estrutura_quarto}
          AND (q.pacote_id IS NULL OR q.pacote_id = ${pacote.id})
        GROUP BY q.genero`)).rows as Array<{ genero: GrupoHospedagem; total: number }>;
      vagasHospedagemPorGrupo = { masculino: 0, feminino: 0 };
      for (const linha of linhasGrupo) {
        if (linha.genero === "masculino" || linha.genero === "feminino") vagasHospedagemPorGrupo[linha.genero] = Math.max(0, Number(linha.total || 0));
      }
      vagasHospedagem = vagasHospedagemPorGrupo.masculino + vagasHospedagemPorGrupo.feminino;
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
    let pacoteSelecionado: typeof pacotes.$inferSelect | undefined;
    if (config.pacote_id) {
      pacoteSelecionado = (await db.select().from(pacotes).where(and(eq(pacotes.id, config.pacote_id), eq(pacotes.lote_id, config.lote_id), eq(pacotes.ativo, true))).limit(1))[0];
      if (!pacoteSelecionado) throw new Error("Pacote selecionado não encontrado, incompatível com o lote ou inativo");
      if (pacoteSelecionado.disponibilidade === "esgotado") throw new Error("Esta modalidade está esgotada");
      valorBase = new Decimal(pacoteSelecionado.valor_total.toString());
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
        ? (await tx.execute(sql`SELECT id, lote_id, forma_contratacao, modalidade_hospedagem
          FROM pacotes WHERE id = ${config.pacote_id} AND lote_id = ${lote_id} AND ativo = true FOR SHARE`)).rows[0] as PacoteOperacional | undefined
        : undefined;
      if (config.pacote_id && !pacoteOperacional) throw new Error("Pacote selecionado não encontrado, incompatível com o lote ou inativo");
      const grupoHospedagem = normalizarGrupoHospedagem(config.grupo_hospedagem);
      await bloquearDuplicidadePorCpf(tx, lote_id, usuario_id);
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
      const operacao = await alocarRecursosNaTransacao(tx, pacoteOperacional, novaReserva.id, usuario_id, lote_id, grupoHospedagem, quantidadePessoas);
      const grupoId = createId();
      const responsavel = (await tx.select({ nome: usuarios.nome, cpf: usuarios.cpf, data_nascimento: usuarios.data_nascimento, telefone: usuarios.telefone, email: usuarios.email }).from(usuarios).where(eq(usuarios.id, usuario_id)).limit(1))[0];
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
      await tx.insert(reservaParticipantes).values([
        {
          id: createId(), grupo_id: grupoId, reserva_id: novaReserva.id,
          nome_completo: responsavel?.nome || "Responsável pela reserva", cpf: responsavel?.cpf || null,
          data_nascimento: responsavel?.data_nascimento || null, telefone: responsavel?.telefone || null,
          email: responsavel?.email || null, sexo_operacional: grupoHospedagem || null,
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
      ]);
      await tx.update(reservas).set({ grupo_id: grupoId, atualizado_em: agora }).where(eq(reservas.id, novaReserva.id));
      const participantesGrupo = (await tx.execute(sql`
        SELECT id FROM reserva_participantes
        WHERE grupo_id = ${grupoId}
        ORDER BY CASE WHEN vinculo_responsavel = 'responsável' THEN 0 ELSE 1 END, id
      `)).rows as Array<{ id: string }>;
      if (operacao.recursos.transporte) {
        const alocacoesAssento = (await tx.execute(sql`
          SELECT id, assento_id FROM assento_alocacoes
          WHERE reserva_id = ${novaReserva.id} AND status = 'ativa'
          ORDER BY alocado_em, id
        `)).rows as Array<{ id: string; assento_id: string }>;
        for (let indice = 0; indice < Math.min(participantesGrupo.length, alocacoesAssento.length); indice += 1) {
          await tx.execute(sql`UPDATE reserva_participantes SET assento_id = ${alocacoesAssento[indice].assento_id}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ${participantesGrupo[indice].id}`);
        }
      }
      if (operacao.recursos.hospedagem) {
        const alocacoesQuarto = (await tx.execute(sql`
          SELECT id, quarto_id, numero_vaga FROM quarto_alocacoes
          WHERE reserva_id = ${novaReserva.id} AND status = 'ativa'
          ORDER BY alocado_em, id
        `)).rows as Array<{ id: string; quarto_id: string; numero_vaga: number }>;
        for (let indice = 0; indice < Math.min(participantesGrupo.length, alocacoesQuarto.length); indice += 1) {
          await tx.execute(sql`UPDATE reserva_participantes SET quarto_id = ${alocacoesQuarto[indice].quarto_id}, vaga_quarto_id = ${String(alocacoesQuarto[indice].numero_vaga)}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ${participantesGrupo[indice].id}`);
        }
      }
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
      await tx.insert(precosLedger).values(linhasLedger.map((linha) => ({ id: createId(), reserva_id: novaReserva.id, ...linha, criado_em: agora, metadados: { fonte: "PacoteService.calcularValorPacote", preco_versao: "2026.1" } })));
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
