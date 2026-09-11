import { db } from "../db/index.js";
import { reservas, pagamentos, cupons, eventos, lotes } from "../db/schema.js";
import { eq, and, gte, lte, count, sum } from "drizzle-orm";
import Decimal from "decimal.js";

export class RelatorioService {
  static async relatorioOcupacao(evento_id: string) {
    try {
      // Buscar lotes do evento
      const lotesResult = await db
        .select()
        .from(lotes)
        .where(eq(lotes.evento_id, evento_id));

      const relatorio = [];

      for (const lote of lotesResult) {
        // Contar reservas confirmadas
        const confirmadas = await db
          .select({ count: count() })
          .from(reservas)
          .where(
            and(
              eq(reservas.lote_id, lote.id),
              eq(reservas.status, "cliente_confirmado")
            )
          );

        const totalVagas = parseInt(lote.vagas_totais.toString());
        const vagasOcupadas = confirmadas[0]?.count || 0;
        const percentualOcupacao = ((vagasOcupadas / totalVagas) * 100).toFixed(2);

        relatorio.push({
          lote_id: lote.id,
          lote_nome: lote.nome,
          vagas_totais: totalVagas,
          vagas_ocupadas: vagasOcupadas,
          vagas_disponiveis: totalVagas - vagasOcupadas,
          percentual_ocupacao: parseFloat(percentualOcupacao),
        });
      }

      return relatorio;
    } catch (error) {
      console.error("[RelatorioService] Erro ao gerar relatório de ocupação:", error);
      throw error;
    }
  }

  static async relatorioFaturamento(evento_id: string) {
    try {
      // Buscar lotes do evento
      const lotesResult = await db
        .select()
        .from(lotes)
        .where(eq(lotes.evento_id, evento_id));

      let faturamentoTotal = new Decimal(0);
      let descontoTotal = new Decimal(0);
      const relatorio = [];

      for (const lote of lotesResult) {
        // Buscar reservas confirmadas
        const reservasConfirmadas = await db
          .select()
          .from(reservas)
          .where(
            and(
              eq(reservas.lote_id, lote.id),
              eq(reservas.status, "cliente_confirmado")
            )
          );

        let faturamentoLote = new Decimal(0);
        let descontoLote = new Decimal(0);

        for (const reserva of reservasConfirmadas) {
          const valor = new Decimal(reserva.valor_total.toString());
          const desconto = new Decimal(reserva.desconto_aplicado?.toString() || "0");

          faturamentoLote = faturamentoLote.plus(valor);
          descontoLote = descontoLote.plus(desconto);
        }

        faturamentoTotal = faturamentoTotal.plus(faturamentoLote);
        descontoTotal = descontoTotal.plus(descontoLote);

        relatorio.push({
          lote_id: lote.id,
          lote_nome: lote.nome,
          reservas_confirmadas: reservasConfirmadas.length,
          faturamento: parseFloat(faturamentoLote.toString()),
          desconto_total: parseFloat(descontoLote.toString()),
        });
      }

      return {
        relatorio,
        resumo: {
          faturamento_total: parseFloat(faturamentoTotal.toString()),
          desconto_total: parseFloat(descontoTotal.toString()),
          valor_liquido: parseFloat(faturamentoTotal.minus(descontoTotal).toString()),
        },
      };
    } catch (error) {
      console.error("[RelatorioService] Erro ao gerar relatório de faturamento:", error);
      throw error;
    }
  }

  static async relatorioPacotesMaisVendidos(evento_id: string) {
    try {
      // Buscar lotes do evento
      const lotesResult = await db
        .select()
        .from(lotes)
        .where(eq(lotes.evento_id, evento_id));

      const pacotesMap = new Map<string, { nome: string; quantidade: number; faturamento: Decimal }>();

      for (const lote of lotesResult) {
        // Buscar reservas confirmadas
        const reservasConfirmadas = await db
          .select()
          .from(reservas)
          .where(
            and(
              eq(reservas.lote_id, lote.id),
              eq(reservas.status, "cliente_confirmado")
            )
          );

        for (const reserva of reservasConfirmadas) {
          const itens = typeof reserva.itens_selecionados === "string"
            ? JSON.parse(reserva.itens_selecionados)
            : reserva.itens_selecionados;

          for (const item of itens) {
            const chave = `${item.tipo}-${item.nome}`;
            const existente = pacotesMap.get(chave);
            const valor = new Decimal(reserva.valor_total.toString());

            if (existente) {
              existente.quantidade += item.quantidade;
              existente.faturamento = existente.faturamento.plus(valor);
            } else {
              pacotesMap.set(chave, {
                nome: item.nome,
                quantidade: item.quantidade,
                faturamento: valor,
              });
            }
          }
        }
      }

      // Converter para array e ordenar
      const relatorio = Array.from(pacotesMap.entries())
        .map(([chave, dados]) => ({
          pacote: dados.nome,
          quantidade_vendida: dados.quantidade,
          faturamento: parseFloat(dados.faturamento.toString()),
        }))
        .sort((a, b) => b.quantidade_vendida - a.quantidade_vendida);

      return relatorio;
    } catch (error) {
      console.error("[RelatorioService] Erro ao gerar relatório de pacotes:", error);
      throw error;
    }
  }

  static async relatorioUsoCupons(evento_id: string) {
    try {
      const cuponsList = await db
        .select()
        .from(cupons)
        .where(eq(cupons.evento_id, evento_id));

      const relatorio = cuponsList.map((cupom) => ({
        codigo: cupom.codigo,
        desconto_percentual: cupom.desconto_percentual,
        desconto_fixo: cupom.desconto_fixo,
        uso_atual: cupom.uso_atual || 0,
        uso_maximo: cupom.uso_maximo || "Ilimitado",
        ativo: cupom.ativo,
      }));

      return relatorio;
    } catch (error) {
      console.error("[RelatorioService] Erro ao gerar relatório de cupons:", error);
      throw error;
    }
  }
}
