import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const ler = (caminho: string) => fs.readFileSync(caminho, 'utf8');

describe('lotes comerciais por pacote e período', () => {
  it('tem migration forward-only com preço, vagas, janela e saldo migrado', () => {
    const migration = ler('drizzle/0029_lotes_comerciais_por_pacote.sql');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS pacote_lotes_comerciais');
    expect(migration).toContain('periodo_id TEXT REFERENCES pacote_periodos(id)');
    expect(migration).toContain('forma_contratacao VARCHAR(32)');
    expect(migration).toContain('vagas_disponiveis INTEGER NOT NULL');
    expect(migration).toContain('saldo_migrado_em TIMESTAMP');
    expect(migration).toContain('ALTER TABLE reservas');
  });

  it('seleciona o primeiro lote aberto e migra saldo encerrado uma única vez', () => {
    const service = ler('server/services/loteComercialService.ts');
    expect(service).toContain('migrarSaldoEncerradoNaTransacao');
    expect(service).toContain('saldo_migrado_em IS NULL');
    expect(service).toContain('Nenhuma condição comercial está disponível no momento');
    expect(service).not.toContain('Próximo lote');
    expect(service).toContain('O preço do lote mudou');
    expect(service).toContain('vagas_disponiveis - ${quantidadeInteira}');
  });

  it('permite configurar o encerramento por vagas, data ou primeira condição', () => {
    const migration = ler('drizzle/0034_criterio_encerramento_lotes.sql');
    const service = ler('server/services/loteComercialService.ts');
    const routes = ler('server/routes/pacotes.ts');
    const admin = ler('apps/web/src/pages/admin/Eventos.tsx');
    expect(migration).toContain("criterio_encerramento VARCHAR(20)");
    expect(service).toContain('criterio_encerramento');
    expect(service).toContain('lote.criterio_encerramento === "vagas"');
    expect(routes).toContain('criterioEncerramento');
    expect(admin).toContain('Somente quando acabar as vagas');
  });

  it('a reserva congela lote comercial e o inventário devolve suas vagas', () => {
    const pacote = ler('server/services/pacoteService.ts');
    const inventory = ler('server/services/inventoryService.ts');
    expect(pacote).toContain('LoteComercialService.reservarNaTransacao');
    expect(pacote).toContain('lote_comercial_id: loteComercial?.id || null');
    expect(inventory).toContain('LoteComercialService.liberarNaTransacao');
  });

  it('o catálogo e o contrato propagam a condição comercial escolhida', () => {
    const catalogo = ler('server/routes/pacotes.ts');
    const publico = ler('server/routes/publico.ts');
    const contrato = ler('server/services/contratoService.ts');
    const template = ler('packages/contract-engine/contratoModeloPadrao.ts');
    expect(catalogo).toContain('lotes_comerciais');
    expect(catalogo).toContain('lote_comercial_id');
    expect(publico).toContain('statusComercialPublico');
    expect(contrato).toContain('lote_comercial: loteComercial');
    expect(template).toContain('Condição comercial');
  });

  it('a administração configura os lotes depois dos pacotes e períodos', () => {
    const admin = ler('apps/web/src/pages/admin/Eventos.tsx');
    const vendas = ler('apps/web/src/pages/admin/Vendas.tsx');
    const checkout = ler('apps/web/src/pages/cliente/ConfiguradorPacote.tsx');
    expect(admin).toContain('Lotes comerciais');
    expect(admin).toContain('/lotes-comerciais');
    expect(vendas).toContain('loteComercialId');
    expect(checkout).toContain('lote_comercial_id: loteComercialId');
  });
});
