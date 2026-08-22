import { db } from "../db/index.js";
import { eventos, lotes, pacotes, itens_addon, cupons, reservas } from "../db/schema.js";
import { and, eq, sql } from "drizzle-orm";
import Decimal from "decimal.js";

export interface ItemSelecionado { id: string; nome: string; tipo: string; valor: number; quantidade: number; }
export interface ConfiguracaoPacote { lote_id: string; pacote_id?: string; itens: ItemSelecionado[]; cupom_codigo?: string; }
export interface ResultadoCalculo { valor_base: number; itens_selecionados: ItemSelecionado[]; subtotal: number; desconto_cupom: number; valor_total: number; pacote_id?: string; pacote_nome?: string; modalidade_hospedagem?: string; cupom_id?: string; mensagem?: string; }

function dinheiro(valor: Decimal): number { return valor.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(); }

export class PacoteService {
  static async buscarItensDisponiveis(lote_id: string) {
    return db.select().from(itens_addon).where(and(eq(itens_addon.lote_id, lote_id), eq(itens_addon.ativo, true)));
  }

  static async validarVagasDisponíveis(lote_id: string, quantidade = 1): Promise<boolean> {
    const lote = (await db.select({ vagas: lotes.vagas_disponíveis, ativo: lotes.ativo }).from(lotes).where(eq(lotes.id, lote_id)).limit(1))[0];
    return Boolean(lote?.ativo && Number(lote.vagas) >= quantidade);
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
      const cupom = (await db.select().from(cupons).where(and(eq(cupons.codigo, config.cupom_codigo.trim().toUpperCase()), eq(cupons.evento_id, lote.evento_id), eq(cupons.ativo, true))).limit(1))[0];
      if (!cupom) throw new Error("Cupom inválido para este evento");
      if (cupom.validade && new Date(cupom.validade).getTime() < Date.now()) throw new Error("Cupom expirado");
      if (cupom.uso_maximo !== null && Number(cupom.uso_atual || 0) >= Number(cupom.uso_maximo)) throw new Error("Cupom com limite de uso atingido");
      cupomId = cupom.id;
      if (cupom.desconto_percentual !== null) desconto = subtotal.times(new Decimal(cupom.desconto_percentual.toString())).div(100);
      else if (cupom.desconto_fixo !== null) desconto = new Decimal(cupom.desconto_fixo.toString());
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

  static async reservarPacote(usuario_id: string, lote_id: string, config: ConfiguracaoPacote, ip_origem: string) {
    if (config.lote_id !== lote_id) throw new Error("Lote inconsistente na configuração do pacote");
    const calculo = await this.calcularValorPacote(config);
    const reserva = await db.transaction(async (tx) => {
      const loteLock = await tx.execute(sql`SELECT id, "vagas_disponíveis" FROM lotes WHERE id = ${lote_id} FOR UPDATE`);
      const lote = loteLock.rows[0] as { id: string; vagas_disponíveis: number } | undefined;
      if (!lote || Number(lote.vagas_disponíveis) < 1) throw new Error("Vagas indisponíveis");

      if (calculo.cupom_id) {
        const consumo = await tx.execute(sql`UPDATE cupons SET uso_atual = COALESCE(uso_atual, 0) + 1 WHERE id = ${calculo.cupom_id} AND ativo = true AND (uso_maximo IS NULL OR uso_atual < uso_maximo) RETURNING id`);
        if (consumo.rows.length === 0) throw new Error("Cupom com limite de uso atingido");
      }
      const inserido = await tx.insert(reservas).values({
        usuario_id,
        lote_id,
        pacote_id: config.pacote_id || null,
        status: "pacote_montado",
        itens_selecionados: JSON.stringify(calculo.itens_selecionados),
        valor_total: calculo.valor_total.toFixed(2),
        cupom_id: calculo.cupom_id,
        desconto_aplicado: calculo.desconto_cupom.toFixed(2),
      }).returning();
      const novaReserva = inserido[0];
      if (!novaReserva) throw new Error("Não foi possível criar a reserva");
      return novaReserva;
    });
    return { reserva, calculo, ip_origem };
  }
}
