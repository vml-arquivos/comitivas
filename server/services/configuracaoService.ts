import { db } from "../db/index.js";
import { configuracoesPagamento } from "../db/schema.js";
import { eq } from "drizzle-orm";

export interface ConfiguracoesPagamento {
  pix_desconto_percentual: number;
  credito_parcelas_maximo: number;
  boleto_meses_maximo_antecedencia: number;
  boleto_modo: "manual" | "gateway";
  atualizado_em: Date;
  atualizado_por: string | null;
}

const PADRAO: ConfiguracoesPagamento = {
  pix_desconto_percentual: 5,
  credito_parcelas_maximo: 10,
  boleto_meses_maximo_antecedencia: 20,
  boleto_modo: "manual",
  atualizado_em: new Date(0),
  atualizado_por: null,
};

function mapearLinha(linha: typeof configuracoesPagamento.$inferSelect): ConfiguracoesPagamento {
  return {
    pix_desconto_percentual: Number(linha.pix_desconto_percentual),
    credito_parcelas_maximo: linha.credito_parcelas_maximo,
    boleto_meses_maximo_antecedencia: linha.boleto_meses_maximo_antecedencia,
    boleto_modo: linha.boleto_modo === "gateway" ? "gateway" : "manual",
    atualizado_em: linha.atualizado_em,
    atualizado_por: linha.atualizado_por,
  };
}

// Cache simples em memória: as regras de pagamento são lidas em todo
// checkout/geração de contrato, então evitamos uma consulta ao banco por
// requisição. Invalidado sempre que o admin salva uma alteração.
let cache: ConfiguracoesPagamento | null = null;

export class ConfiguracaoService {
  static invalidarCache(): void {
    cache = null;
  }

  static async obterConfiguracoesPagamento(): Promise<ConfiguracoesPagamento> {
    if (cache) return cache;

    try {
      const linha = await db
        .select()
        .from(configuracoesPagamento)
        .where(eq(configuracoesPagamento.id, "default"))
        .limit(1);

      if (linha.length === 0) {
        // Garante o registro singleton mesmo se a migration ainda não tiver
        // rodado o insert (ex.: banco provisionado manualmente).
        const criado = await db
          .insert(configuracoesPagamento)
          .values({ id: "default" })
          .onConflictDoNothing()
          .returning();
        cache = criado[0] ? mapearLinha(criado[0]) : { ...PADRAO };
        return cache;
      }

      cache = mapearLinha(linha[0]);
      return cache;
    } catch (error) {
      // Em produção, nunca congelar contrato ou cobrança com uma regra
      // possivelmente obsoleta quando a fonte de verdade está indisponível.
      if (process.env.NODE_ENV === "production") {
        console.error("[ConfiguracaoService] Configuração financeira indisponível em produção:", error);
        throw new Error("Configuração financeira indisponível; operação bloqueada com segurança");
      }
      console.error("[ConfiguracaoService] Erro ao ler configurações, usando padrão local:", error);
      return { ...PADRAO };
    }
  }

  static async atualizarConfiguracoesPagamento(
    dados: Partial<Pick<
      ConfiguracoesPagamento,
      "pix_desconto_percentual" | "credito_parcelas_maximo" | "boleto_meses_maximo_antecedencia" | "boleto_modo"
    >>,
    atualizadoPor: string,
  ): Promise<ConfiguracoesPagamento> {
    if (dados.pix_desconto_percentual !== undefined) {
      if (!Number.isFinite(dados.pix_desconto_percentual) || dados.pix_desconto_percentual < 0 || dados.pix_desconto_percentual > 100) {
        throw new Error("Desconto do PIX deve ser um percentual entre 0 e 100");
      }
    }
    if (dados.credito_parcelas_maximo !== undefined) {
      if (!Number.isInteger(dados.credito_parcelas_maximo) || dados.credito_parcelas_maximo < 1 || dados.credito_parcelas_maximo > 24) {
        throw new Error("Máximo de parcelas do cartão deve ser um número inteiro entre 1 e 24");
      }
    }
    if (dados.boleto_meses_maximo_antecedencia !== undefined) {
      if (!Number.isInteger(dados.boleto_meses_maximo_antecedencia) || dados.boleto_meses_maximo_antecedencia < 1 || dados.boleto_meses_maximo_antecedencia > 36) {
        throw new Error("Máximo de meses de antecedência do boleto deve ser um número inteiro entre 1 e 36");
      }
    }
    if (dados.boleto_modo !== undefined && !["manual", "gateway"].includes(dados.boleto_modo)) {
      throw new Error("Modo de boleto inválido");
    }

    await db
      .insert(configuracoesPagamento)
      .values({ id: "default" })
      .onConflictDoNothing();

    const atualizado = await db
      .update(configuracoesPagamento)
      .set({
        ...(dados.pix_desconto_percentual !== undefined
          ? { pix_desconto_percentual: dados.pix_desconto_percentual.toString() }
          : {}),
        ...(dados.credito_parcelas_maximo !== undefined
          ? { credito_parcelas_maximo: dados.credito_parcelas_maximo }
          : {}),
        ...(dados.boleto_meses_maximo_antecedencia !== undefined
          ? { boleto_meses_maximo_antecedencia: dados.boleto_meses_maximo_antecedencia }
          : {}),
        ...(dados.boleto_modo !== undefined ? { boleto_modo: dados.boleto_modo } : {}),
        atualizado_em: new Date(),
        atualizado_por: atualizadoPor,
      })
      .where(eq(configuracoesPagamento.id, "default"))
      .returning();

    cache = mapearLinha(atualizado[0]);
    return cache;
  }
}
