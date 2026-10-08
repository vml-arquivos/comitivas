import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
const estado = vi.hoisted(() => ({ linhas: [] as any[], consultas: [] as any[], filas: [] as any[][] }));
vi.mock('../server/db/index.js', () => {
  const tx = { execute: async (q: any) => { estado.consultas.push(q); return { rows: estado.filas.length ? estado.filas.shift() : estado.linhas }; } };
  return { db: { ...tx, transaction: async (fn: any) => fn(tx) } };
});
import { LoteComercialService, combinarCapacidadeComercial } from '../server/services/loteComercialService.js';
const lote = (vagas: number | null, id = 'primeiro-lote') => ({ id, pacote_id: 'pacote', periodo_id: null, forma_especifica: true, forma_contratacao: 'onibus_hospedagem', nome: 'Primeiro lote', valor: '500', ativo: true, data_inicio: '2025-01-01', criterio_encerramento: 'vagas', vagas_totais: vagas, vagas_disponiveis: vagas });
const data = new Date('2027-02-01');

describe('lote comum aos períodos e limite comercial opcional', () => {
  it.each(['primeiro-fim', 'segundo-fim'])('o mesmo lote atende %s', async periodo => {
    estado.consultas = []; estado.filas = [[], [lote(100)]];
    const status = await LoteComercialService.obterStatus('pacote', periodo, 'onibus_hospedagem', data);
    expect(status.lote?.id).toBe('primeiro-lote');
    expect(status.lote?.valor).toBe('500');
    const consultas = estado.consultas.map(q => new PgDialect().sqlToQuery(q));
    expect(consultas[0].params).toContain(periodo);
    expect(consultas[1].sql).toContain('periodo_id IS NULL');
  });
  it('preserva lote específico existente quando configurado', async () => {
    estado.filas = [[{ ...lote(100, 'especifico'), periodo_id: 'primeiro-fim' }]];
    const status = await LoteComercialService.obterStatus('pacote', 'primeiro-fim', 'onibus_hospedagem', data);
    expect(status.lote?.id).toBe('especifico');
  });
  it('limite vazio não é interpretado como zero ou esgotado', async () => {
    estado.filas = []; estado.linhas = [lote(null)];
    const status = await LoteComercialService.obterStatus('pacote', null, 'onibus_hospedagem', data);
    expect(status.status).toBe('disponivel');
    expect(status.lote?.vagas_totais).toBeNull();
    expect(status.lote?.vagas_disponiveis).toBeNull();
    expect(combinarCapacidadeComercial({ vagas_disponiveis: 44, disponibilidade: 'disponivel' }, status).vagas_disponiveis).toBe(44);
    expect(combinarCapacidadeComercial({ vagas_disponiveis: 0, disponibilidade: 'esgotado' }, status).disponibilidade).toBe('esgotado');
  });
  it('a reserva ilimitada mantém null e aceita grupos sem inventar cota', async () => {
    const consultas: any[] = []; const fila = [[lote(null)], [lote(null)]];
    const tx = { execute: async (q: any) => { consultas.push(new PgDialect().sqlToQuery(q)); return { rows: fila.shift() || [] }; } };
    const resultado = await LoteComercialService.reservarNaTransacao(tx, 'pacote', null, 'onibus_hospedagem', 20, 500);
    expect(resultado?.vagas_disponiveis).toBeNull();
    expect(consultas[1].sql).toContain('vagas_disponiveis IS NULL OR');
    expect(consultas[1].params).toContain(20);
  });
  it('renovação e cancelamento aceitam o mesmo lote sem limite', async () => {
    const consultas: any[] = [];
    const tx = { execute: async (q: any) => { consultas.push(new PgDialect().sqlToQuery(q)); return { rows: [lote(null)] }; } };
    expect((await LoteComercialService.renovarNaTransacao(tx, 'primeiro-lote', 2)).vagas_disponiveis).toBeNull();
    await LoteComercialService.liberarNaTransacao(tx, 'primeiro-lote', 2);
    expect(consultas[0].sql).toContain('vagas_disponiveis IS NULL OR');
    expect(consultas[1].sql).toContain('LEAST(vagas_totais');
  });
  it('lote limitado continua impedindo um grupo maior que o saldo', async () => {
    const tx = { execute: async () => ({ rows: [lote(1)] }) };
    await expect(LoteComercialService.reservarNaTransacao(tx, 'pacote', null, 'onibus_hospedagem', 2, 500)).rejects.toThrow('esgotados');
  });
  it('lote ilimitado ainda exige início da venda e preço vigente', async () => {
    estado.filas = []; estado.linhas = [{ ...lote(null), data_inicio: '2027-03-01' }];
    expect((await LoteComercialService.obterStatus('pacote', null, 'onibus_hospedagem', data)).status).toBe('aguardando');
    const tx = { execute: async () => ({ rows: [lote(null)] }) };
    await expect(LoteComercialService.reservarNaTransacao(tx, 'pacote', null, 'onibus_hospedagem', 1, 999)).rejects.toThrow('preço do lote mudou');
  });
});
