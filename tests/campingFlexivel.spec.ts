import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { resolverRecursosContratacao, normalizarFormasContratacao } from '../server/services/contratacaoRecursos.js';
import { validarLimitesPeriodoNaTransacao } from '../server/services/capacidadePeriodoService.js';
import { renderizarContratoModeloPadrao } from '../packages/contract-engine/contratoModeloPadrao.js';
const banco = vi.hoisted(() => ({ linhas: [] as any[], consultas: [] as any[] }));
vi.mock('../server/db/index.js', () => {
  const tx = { execute: vi.fn(async (consulta: any) => { banco.consultas.push(consulta); return { rows: banco.linhas }; }) };
  return { db: { ...tx, transaction: async (fn: any) => fn(tx) } };
});
import { LoteComercialService, combinarCapacidadeComercial } from '../server/services/loteComercialService.js';

describe('contratação flexível sem criar capacidade fictícia', () => {
  it.each([
    ['onibus_hospedagem', 'camping', true, false, true],
    ['hospedagem', 'camping', false, false, true],
    ['onibus', 'camping', true, false, false],
    ['onibus_hospedagem', 'quarto_ar_condicionado', true, true, false],
    ['hospedagem', 'quarto_ar_condicionado', false, true, false],
    ['onibus', 'quarto_ar_condicionado', true, false, false],
  ])('%s / %s reserva apenas os recursos escolhidos', (forma, modalidade, transporte, hospedagem, camping) => {
    const r = resolverRecursosContratacao(forma, modalidade);
    expect(r.transporte).toBe(transporte);
    expect(r.hospedagem).toBe(hospedagem);
    expect(Boolean(r.camping)).toBe(camping);
    expect(r.estrutura_quarto).toBe(hospedagem ? 'ar_condicionado' : null);
  });
  it('preserva a configuração legada sem habilitar serviços automaticamente', () => {
    expect(normalizarFormasContratacao(['onibus'], 'onibus', 'camping')).toEqual(['onibus']);
    expect(normalizarFormasContratacao(['hospedagem', 'onibus_hospedagem'], 'onibus', 'camping')).toEqual(['hospedagem', 'onibus_hospedagem']);
  });
  it.each([false, true])('o contrato registra camping e transporte %s sem quarto', transporte => {
    const html = renderizarContratoModeloPadrao({ reservaId: 'r', snapshot: {
      versao_contratual: '2026.3-camping', cliente: { nome: 'Cliente' }, evento: { nome: 'Barretos 2027' },
      pacote: { nome: 'Camping', forma_contratacao: transporte ? 'onibus_hospedagem' : 'hospedagem' },
      periodo: { check_in: '2027-08-19', check_out: '2027-08-22' },
      hospedagem: { modalidade: 'camping', local: 'Área da excursão' },
      transporte: { rodoviario_incluido: transporte, por_conta_propria: !transporte },
      financeiro: { total: '100', parcelas: 1 }, servicos_inclusos: ['Área de camping'],
    } as any });
    expect(html).toContain('ÁREA DE CAMPING DA EXCURSÃO');
    expect(html).toContain('sem reserva de quarto');
    expect(html).not.toContain('DOS DADOS DA HOSPEDAGEM');
    expect(html.includes('DO TRANSPORTE RODOVIÁRIO')).toBe(transporte);
    expect(html.includes('DO DESLOCAMENTO POR CONTA PRÓPRIA')).toBe(!transporte);
  });
  it('camping por conta própria não exige limite físico', async () => {
    const tx = { execute: vi.fn() };
    await validarLimitesPeriodoNaTransacao(tx, 'p', 100, { transporte: false, hospedagem: false });
    expect(tx.execute).not.toHaveBeenCalled();
  });
  it.each([[199, 1, true], [199, 2, false], [200, 1, false], [0, 200, true]])('teto 200: ocupação %s, grupo %s, permitido %s', async (ocupacao, grupo, permitido) => {
    const linhas = [[{ evento_periodo_id: 'central' }], [], [{ capacidade_transporte_planejada: 200, capacidade_hospedagem_planejada: 100 }], [{ total: ocupacao }]];
    const consultas: any[] = [];
    const tx = { execute: vi.fn(async (q: any) => { consultas.push(new PgDialect().sqlToQuery(q)); return { rows: linhas.shift() || [] }; }) };
    const resultado = validarLimitesPeriodoNaTransacao(tx, 'periodo-camping', grupo, { transporte: true, hospedagem: false });
    if (permitido) await expect(resultado).resolves.toBeUndefined();
    else await expect(resultado).rejects.toThrow('limite de transporte');
    expect(consultas[1].params).toContain('limite-periodo:central');
    expect(consultas[3].sql).toContain('assento_alocacoes');
    expect(consultas[3].sql).not.toContain('pacote_id =');
  });
  it('teto zero bloqueia e teto vazio permite usar capacidade física', async () => {
    for (const teto of [0, null]) {
      const linhas = [[{ evento_periodo_id: null }], [], [{ capacidade_transporte_planejada: teto }], [{ total: 0 }]];
      const tx = { execute: vi.fn(async () => ({ rows: linhas.shift() || [] })) };
      const resultado = validarLimitesPeriodoNaTransacao(tx, 'p', 1, { transporte: true, hospedagem: false });
      if (teto === 0) await expect(resultado).rejects.toThrow('limite de transporte');
      else await expect(resultado).resolves.toBeUndefined();
    }
  });
  it('reconciliação não soma novamente os assentos da própria reserva', async () => {
    const linhas = [[{ evento_periodo_id: 'central' }], [], [{ capacidade_transporte_planejada: 1 }], [{ total: 0 }]];
    const consultas: any[] = [];
    const tx = { execute: vi.fn(async (q: any) => { consultas.push(new PgDialect().sqlToQuery(q)); return { rows: linhas.shift() || [] }; }) };
    await validarLimitesPeriodoNaTransacao(tx, 'p', 1, { transporte: true, hospedagem: false }, 'reserva-atual');
    expect(consultas[3].params).toContain('reserva-atual');
    expect(consultas[3].sql).toContain('a.reserva_id <>');
  });
  it.each(['onibus', 'hospedagem', 'onibus_hospedagem'] as const)('seleciona o preço próprio de %s', async forma => {
    banco.linhas = ['onibus', 'hospedagem', 'onibus_hospedagem'].map((f, i) => ({ id: f, pacote_id: 'p', periodo_id: 'periodo', forma_contratacao: f, forma_especifica: true, nome: f, ativo: true, vagas_totais: 20, vagas_disponiveis: 20, valor: String((i + 1) * 100), data_inicio: '2027-01-01', criterio_encerramento: 'vagas' }));
    const status = await LoteComercialService.obterStatus('p', 'periodo', forma, new Date('2027-02-01'));
    expect(status.lote?.id).toBe(forma);
  });
  it('a vitrine limita camping às condições comerciais sem inventar quartos', () => {
    const fisica = { vagas_disponiveis: Number.MAX_SAFE_INTEGER, disponibilidade: 'disponivel' };
    const comercial = { status: 'disponivel', configurado: true, lote: { vagas_disponiveis: 100 }, proximos: [] } as any;
    expect(combinarCapacidadeComercial(fisica, comercial).vagas_disponiveis).toBe(100);
    expect(combinarCapacidadeComercial({ ...fisica, vagas_disponiveis: 0 }, comercial).disponibilidade).toBe('esgotado');
    expect(combinarCapacidadeComercial(fisica, { ...comercial, configurado: false, lote: null }).disponibilidade).toBe('configuracao_pendente');
  });
  it('preserva preço compartilhado dos lotes antigos', async () => {
    banco.linhas = [{ id: 'legado', pacote_id: 'p', forma_contratacao: 'onibus_hospedagem', nome: 'Legado', ativo: true, vagas_disponiveis: 10, valor: '500', data_inicio: '2027-01-01', criterio_encerramento: 'vagas' }];
    const status = await LoteComercialService.obterStatus('p', null, 'hospedagem', new Date('2027-02-01'));
    expect(status.lote?.id).toBe('legado');
  });
});
