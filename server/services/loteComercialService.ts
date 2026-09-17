import { db } from "../db/index.js";
import { sql } from "drizzle-orm";

export type FormaLoteComercial = "onibus_hospedagem" | "hospedagem" | "onibus";
export type StatusLoteComercial = "disponivel" | "ultimas_vagas" | "esgotado" | "aguardando";

export type LoteComercial = {
  id: string;
  pacote_id: string;
  periodo_id: string | null;
  forma_contratacao: FormaLoteComercial;
  nome: string;
  descricao: string | null;
  ordem: number;
  vagas_totais: number;
  vagas_disponiveis: number;
  valor: string;
  data_inicio: Date;
  data_fim: Date | null;
  saldo_migrado_em: Date | null;
  ativo: boolean;
  criado_em?: Date;
  atualizado_em?: Date;
};

export type StatusComercial = {
  status: StatusLoteComercial;
  lote: LoteComercial | null;
  proximos: LoteComercial[];
  configurado: boolean;
};

type Executor = typeof db | any;

const formasValidas = new Set<FormaLoteComercial>(["onibus_hospedagem", "hospedagem", "onibus"]);

export function normalizarFormaLote(valor: unknown): FormaLoteComercial {
  return formasValidas.has(valor as FormaLoteComercial) ? valor as FormaLoteComercial : "onibus_hospedagem";
}

function mapear(row: any): LoteComercial {
  return {
    id: String(row.id),
    pacote_id: String(row.pacote_id),
    periodo_id: row.periodo_id ? String(row.periodo_id) : null,
    forma_contratacao: normalizarFormaLote(row.forma_contratacao),
    nome: String(row.nome),
    descricao: row.descricao === null || row.descricao === undefined ? null : String(row.descricao),
    ordem: Number(row.ordem || 0),
    vagas_totais: Number(row.vagas_totais || 0),
    vagas_disponiveis: Number(row.vagas_disponiveis || 0),
    valor: String(row.valor),
    data_inicio: new Date(row.data_inicio),
    data_fim: row.data_fim ? new Date(row.data_fim) : null,
    saldo_migrado_em: row.saldo_migrado_em ? new Date(row.saldo_migrado_em) : null,
    ativo: Boolean(row.ativo),
    criado_em: row.criado_em ? new Date(row.criado_em) : undefined,
    atualizado_em: row.atualizado_em ? new Date(row.atualizado_em) : undefined,
  };
}

async function consultar(executor: Executor, pacoteId: string, periodoId: string | null, forma: FormaLoteComercial, bloquear = false): Promise<LoteComercial[]> {
  const lock = bloquear ? sql` FOR UPDATE` : sql``;
  const rows = periodoId
    ? await executor.execute(sql`
        SELECT id, pacote_id, periodo_id, forma_contratacao, nome, descricao, ordem, vagas_totais, vagas_disponiveis,
               valor, data_inicio, data_fim, saldo_migrado_em, ativo, criado_em, atualizado_em
          FROM pacote_lotes_comerciais
         WHERE pacote_id = ${pacoteId} AND periodo_id = ${periodoId} AND forma_contratacao = ${forma} AND ativo = true
         ORDER BY ordem ASC, data_inicio ASC, criado_em ASC, id ASC${lock}`)
    : await executor.execute(sql`
        SELECT id, pacote_id, periodo_id, forma_contratacao, nome, descricao, ordem, vagas_totais, vagas_disponiveis,
               valor, data_inicio, data_fim, saldo_migrado_em, ativo, criado_em, atualizado_em
          FROM pacote_lotes_comerciais
         WHERE pacote_id = ${pacoteId} AND periodo_id IS NULL AND forma_contratacao = ${forma} AND ativo = true
         ORDER BY ordem ASC, data_inicio ASC, criado_em ASC, id ASC${lock}`);
  return (rows.rows || []).map(mapear);
}

async function consultarCandidatos(executor: Executor, pacoteId: string, periodoId: string | null, forma: FormaLoteComercial, bloquear = false): Promise<LoteComercial[]> {
  if (periodoId) {
    const exatos = await consultar(executor, pacoteId, periodoId, forma, bloquear);
    if (exatos.length > 0) return exatos;
  }
  return consultar(executor, pacoteId, null, forma, bloquear);
}

function estaAberto(lote: LoteComercial, agora: Date) {
  return lote.ativo && agora.getTime() >= lote.data_inicio.getTime()
    && (!lote.data_fim || agora.getTime() <= lote.data_fim.getTime());
}

function estaFuturo(lote: LoteComercial, agora: Date) {
  return lote.ativo && agora.getTime() < lote.data_inicio.getTime();
}

async function migrarSaldoEncerradoNaTransacao(tx: any, lotes: LoteComercial[], agora: Date) {
  for (let indice = 0; indice < lotes.length - 1; indice += 1) {
    const atual = lotes[indice];
    const proximo = lotes[indice + 1];
    if (!atual.data_fim || agora.getTime() <= atual.data_fim.getTime() || atual.vagas_disponiveis <= 0 || atual.saldo_migrado_em) continue;
    const saldo = atual.vagas_disponiveis;
    const atualizado = await tx.execute(sql`
      UPDATE pacote_lotes_comerciais
         SET vagas_disponiveis = 0, saldo_migrado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ${atual.id} AND saldo_migrado_em IS NULL AND vagas_disponiveis > 0
       RETURNING id`);
    if (!atualizado.rows?.length) continue;
    await tx.execute(sql`
      UPDATE pacote_lotes_comerciais
         SET vagas_totais = vagas_totais + ${saldo}, vagas_disponiveis = vagas_disponiveis + ${saldo}, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ${proximo.id}`);
    proximo.vagas_totais += saldo;
    proximo.vagas_disponiveis += saldo;
    atual.vagas_disponiveis = 0;
    atual.saldo_migrado_em = agora;
  }
}

export class LoteComercialService {
  static async listar(pacoteId: string, periodoId?: string | null, forma?: FormaLoteComercial) {
    if (forma) return consultarCandidatos(db, pacoteId, periodoId || null, forma);
    const rows = await db.execute(sql`
      SELECT id, pacote_id, periodo_id, forma_contratacao, nome, descricao, ordem, vagas_totais, vagas_disponiveis,
             valor, data_inicio, data_fim, saldo_migrado_em, ativo, criado_em, atualizado_em
        FROM pacote_lotes_comerciais
       WHERE pacote_id = ${pacoteId} AND ativo = true
       ORDER BY periodo_id NULLS FIRST, forma_contratacao, ordem, data_inicio, criado_em, id`);
    return (rows.rows || []).map(mapear);
  }

  static async obterStatus(pacoteId: string, periodoId: string | null | undefined, forma: FormaLoteComercial, agora = new Date()): Promise<StatusComercial> {
    return db.transaction(async (tx) => {
    const candidatos = await consultarCandidatos(tx, pacoteId, periodoId || null, forma, true);
    if (candidatos.length === 0) return { status: "disponivel", lote: null, proximos: [], configurado: false };
    await migrarSaldoEncerradoNaTransacao(tx, candidatos, agora);
    const proximos = candidatos.filter((lote) => estaFuturo(lote, agora));
    for (const lote of candidatos) {
      if (!estaAberto(lote, agora) || lote.vagas_disponiveis <= 0) continue;
      return { status: lote.vagas_disponiveis <= 5 ? "ultimas_vagas" : "disponivel", lote, proximos, configurado: true };
    }
    return { status: proximos.length > 0 ? "aguardando" : "esgotado", lote: null, proximos, configurado: true };
    });
  }

  static async reservarNaTransacao(tx: any, pacoteId: string, periodoId: string | null, forma: FormaLoteComercial, quantidade: number, valorEsperado?: number): Promise<LoteComercial | null> {
    const candidatos = await consultarCandidatos(tx, pacoteId, periodoId, forma, true);
    const agora = new Date();
    await migrarSaldoEncerradoNaTransacao(tx, candidatos, agora);
    const quantidadeInteira = Math.max(1, Math.floor(Number(quantidade) || 1));
    let encontrouFuturo = false;
    for (const lote of candidatos) {
      if (estaFuturo(lote, agora)) {
        encontrouFuturo = true;
        continue;
      }
      if (!estaAberto(lote, agora) || lote.vagas_disponiveis < quantidadeInteira) continue;
      if (valorEsperado !== undefined && Math.abs(Number(lote.valor) - valorEsperado) > 0.005) {
        throw new Error("O preço do lote mudou. Atualize a página para continuar com a condição vigente.");
      }
      const atualizado = await tx.execute(sql`
        UPDATE pacote_lotes_comerciais
           SET vagas_disponiveis = vagas_disponiveis - ${quantidadeInteira}, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ${lote.id} AND ativo = true AND vagas_disponiveis >= ${quantidadeInteira}
         RETURNING id, pacote_id, periodo_id, forma_contratacao, nome, descricao, ordem, vagas_totais, vagas_disponiveis,
                   valor, data_inicio, data_fim, saldo_migrado_em, ativo, criado_em, atualizado_em`);
      if (atualizado.rows?.length) return mapear(atualizado.rows[0]);
    }
    if (encontrouFuturo) throw new Error("O próximo lote ainda não iniciou. Aguarde a abertura da pré-venda.");
    throw new Error("Os lotes comerciais deste pacote, período e forma de contratação estão esgotados.");
  }

  static async renovarNaTransacao(tx: any, loteId: string, quantidade: number): Promise<LoteComercial> {
    const quantidadeInteira = Math.max(1, Math.floor(Number(quantidade) || 1));
    const atualizado = await tx.execute(sql`
      UPDATE pacote_lotes_comerciais
         SET vagas_disponiveis = vagas_disponiveis - ${quantidadeInteira}, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ${loteId} AND ativo = true AND vagas_disponiveis >= ${quantidadeInteira}
       RETURNING id, pacote_id, periodo_id, forma_contratacao, nome, descricao, ordem, vagas_totais, vagas_disponiveis,
                 valor, data_inicio, data_fim, saldo_migrado_em, ativo, criado_em, atualizado_em`);
    if (!atualizado.rows?.length) throw new Error("O lote comercial desta reserva não possui mais vagas disponíveis.");
    return mapear(atualizado.rows[0]);
  }

  static async liberarNaTransacao(tx: any, loteId: string, quantidade: number) {
    const quantidadeInteira = Math.max(1, Math.floor(Number(quantidade) || 1));
    await tx.execute(sql`
      UPDATE pacote_lotes_comerciais
         SET vagas_disponiveis = LEAST(vagas_totais, vagas_disponiveis + ${quantidadeInteira}), atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ${loteId}`);
  }
}

export function statusComercialPublico(status: StatusComercial) {
  return {
    disponibilidade: status.status,
    lote_comercial_id: status.lote?.id || null,
    lote_comercial_nome: status.lote?.nome || status.proximos[0]?.nome || null,
    lote_comercial_valor: status.lote?.valor || null,
    lote_comercial_data_fim: status.lote?.data_fim?.toISOString() || null,
    vagas_disponiveis: status.lote?.vagas_disponiveis ?? null,
    lote_comercial_configurado: status.configurado,
  };
}
