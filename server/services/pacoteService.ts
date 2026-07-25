import { db } from "../db/index.js";
import { lotes, pacotes, itens_addon, cupons, reservas } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import Decimal from "decimal.js";

export interface ItemSelecionado {
  id: string;
  nome: string;
  tipo: string;
  valor: number;
  quantidade: number;
}

export interface ConfiguracaoPacote {
  lote_id: string;
  pacote_id?: string;
  itens: ItemSelecionado[];
  cupom_codigo?: string;
}

export interface ResultadoCalculo {
  valor_base: number;
  itens_selecionados: ItemSelecionado[];
  subtotal: number;
  desconto_cupom: number;
  valor_total: number;
  pacote_id?: string;
  pacote_nome?: string;
  modalidade_hospedagem?: string;
  cupom_id?: string;
  mensagem?: string;
}

export class PacoteService {
  static async buscarItensDisponiveis(lote_id: string) {
    try {
      const itens = await db
        .select()
        .from(itens_addon)
        .where(and(eq(itens_addon.lote_id, lote_id), eq(itens_addon.ativo, true)));

      return itens;
    } catch (error) {
      console.error("[PacoteService] Erro ao buscar itens:", error);
      throw error;
    }
  }

  static async validarVagasDisponíveis(lote_id: string, quantidade: number = 1): Promise<boolean> {
    try {
      const lote = await db
        .select()
        .from(lotes)
        .where(eq(lotes.id, lote_id))
        .limit(1);

      if (lote.length === 0) {
        return false;
      }

      const vagasDisponiveis = parseInt(lote[0].vagas_disponíveis.toString());
      return vagasDisponiveis >= quantidade;
    } catch (error) {
      console.error("[PacoteService] Erro ao validar vagas:", error);
      return false;
    }
  }

  static async calcularValorPacote(config: ConfiguracaoPacote): Promise<ResultadoCalculo> {
    try {
      // Buscar lote para pegar valor base
      const loteResult = await db
        .select()
        .from(lotes)
        .where(eq(lotes.id, config.lote_id))
        .limit(1);

      if (loteResult.length === 0) {
        throw new Error("Lote não encontrado");
      }

      const lote = loteResult[0];
      let valorBase = new Decimal(lote.valor_base.toString());
      let pacoteSelecionado: typeof pacotes.$inferSelect | undefined;

      if (config.pacote_id) {
        const pacoteResult = await db
          .select()
          .from(pacotes)
          .where(and(eq(pacotes.id, config.pacote_id), eq(pacotes.lote_id, config.lote_id), eq(pacotes.ativo, true)))
          .limit(1);

        if (pacoteResult.length === 0) {
          throw new Error("Pacote selecionado não encontrado ou indisponível");
        }

        pacoteSelecionado = pacoteResult[0];
        if (pacoteSelecionado.disponibilidade === "esgotado") {
          throw new Error("Esta modalidade está esgotada");
        }
        valorBase = new Decimal(pacoteSelecionado.valor_total.toString());
      }

      // Validar itens selecionados e calcular subtotal
      const itensValidados: ItemSelecionado[] = [];
      let subtotal = new Decimal(valorBase);

      for (const item of config.itens) {
        // Buscar item no banco para validar
        const itemDb = await db
          .select()
          .from(itens_addon)
          .where(and(eq(itens_addon.id, item.id), eq(itens_addon.ativo, true)))
          .limit(1);

        if (itemDb.length === 0) {
          continue; // Ignorar itens inválidos
        }

        const itemValor = new Decimal(itemDb[0].valor.toString());
        const quantidade = Math.max(1, item.quantidade || 1);
        const valorItem = itemValor.times(quantidade);

        itensValidados.push({
          id: item.id,
          nome: itemDb[0].nome,
          tipo: itemDb[0].tipo,
          valor: parseFloat(itemValor.toString()),
          quantidade,
        });

        subtotal = subtotal.plus(valorItem);
      }

      // Aplicar cupom se fornecido
      let desconto = new Decimal(0);
      let cupom_id: string | undefined;

      if (config.cupom_codigo) {
        const cupomResult = await db
          .select()
          .from(cupons)
          .where(and(
            eq(cupons.codigo, config.cupom_codigo),
            eq(cupons.ativo, true)
          ))
          .limit(1);

        if (cupomResult.length > 0) {
          const cupom = cupomResult[0];

          // Validar validade
          if (cupom.validade && new Date(cupom.validade) < new Date()) {
            return {
              valor_base: parseFloat(valorBase.toString()),
              itens_selecionados: itensValidados,
              subtotal: parseFloat(subtotal.toString()),
              desconto_cupom: 0,
              valor_total: parseFloat(subtotal.toString()),
              mensagem: "Cupom expirado",
            };
          }

          // Validar uso máximo
          if (cupom.uso_maximo && cupom.uso_atual && cupom.uso_atual >= cupom.uso_maximo) {
            return {
              valor_base: parseFloat(valorBase.toString()),
              itens_selecionados: itensValidados,
              subtotal: parseFloat(subtotal.toString()),
              desconto_cupom: 0,
              valor_total: parseFloat(subtotal.toString()),
              mensagem: "Cupom com limite de uso atingido",
            };
          }

          cupom_id = cupom.id;

          // Calcular desconto
          if (cupom.desconto_percentual) {
            const percentual = new Decimal(cupom.desconto_percentual.toString());
            desconto = subtotal.times(percentual).div(100);
          } else if (cupom.desconto_fixo) {
            desconto = new Decimal(cupom.desconto_fixo.toString());
          }

          // Limitar desconto ao valor total
          desconto = Decimal.min(desconto, subtotal);
        }
      }

      const valorTotal = subtotal.minus(desconto);

      return {
        valor_base: parseFloat(valorBase.toString()),
        itens_selecionados: itensValidados,
        subtotal: parseFloat(subtotal.toString()),
        desconto_cupom: parseFloat(desconto.toString()),
        valor_total: parseFloat(valorTotal.toString()),
        pacote_id: pacoteSelecionado?.id,
        pacote_nome: pacoteSelecionado?.nome,
        modalidade_hospedagem: pacoteSelecionado?.modalidade_hospedagem || undefined,
        cupom_id,
      };
    } catch (error) {
      console.error("[PacoteService] Erro ao calcular valor:", error);
      throw error;
    }
  }

  static async reservarPacote(
    usuario_id: string,
    lote_id: string,
    config: ConfiguracaoPacote,
    ip_origem: string
  ) {
    try {
      // Validar vagas
      const vagasOk = await this.validarVagasDisponíveis(lote_id);
      if (!vagasOk) {
        throw new Error("Vagas indisponíveis");
      }

      // Calcular valor
      const calculo = await this.calcularValorPacote(config);

      // Criar reserva
      const reserva = await db
        .insert(reservas)
        .values({
          usuario_id,
          lote_id,
          pacote_id: config.pacote_id || null,
          status: "pacote_montado",
          itens_selecionados: JSON.stringify(calculo.itens_selecionados),
          valor_total: calculo.valor_total.toString(),
          cupom_id: calculo.cupom_id,
          desconto_aplicado: calculo.desconto_cupom.toString(),
        })
        .returning();

      return {
        reserva: reserva[0],
        calculo,
      };
    } catch (error) {
      console.error("[PacoteService] Erro ao reservar pacote:", error);
      throw error;
    }
  }
}
