import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = path.resolve(process.cwd());
const ler = (arquivo: string) => fs.readFileSync(path.join(raiz, arquivo), 'utf8');

describe('jornada simplificada de contratação', () => {
  it('prioriza pacote e período antes da escolha final de serviços', () => {
    const tela = ler('apps/web/src/pages/cliente/ConfiguradorPacote.tsx');
    expect(tela.indexOf('1 · Pacote')).toBeLessThan(tela.indexOf('2 · Período'));
    expect(tela.indexOf('2 · Período')).toBeLessThan(tela.indexOf('3 · Pessoas'));
    expect(tela.indexOf('3 · Pessoas')).toBeLessThan(tela.indexOf('4 · Serviços'));
    expect(tela).not.toContain('1. O que você quer contratar?');
    expect(tela).toContain('Entrar e continuar');
    expect(tela).toContain('Como você quer viajar?');
  });

  it('não inventa preço de serviços e usa a simulação autoritativa do backend', () => {
    const tela = ler('apps/web/src/pages/cliente/ConfiguradorPacote.tsx');
    expect(tela).toContain("api.post('/pacotes/calcular'");
    expect(tela).toContain('cotacoesForma');
    expect(tela).toContain('cotacaoEscolhida.lote_comercial_id');
    expect(tela).toContain('Cupons promocionais válidos podem ser aplicados no checkout.');
  });

  it('usa hierarquia de preço parcelado na vitrine sem esconder o total', () => {
    const home = ler('apps/web/src/pages/publico/Home.tsx');
    expect(home).toContain('parcelamentoOferta');
    expect(home).toContain('x de');
    expect(home).toContain('Total {formatarMoeda(parcelamento.total)} por pessoa');
  });
});
