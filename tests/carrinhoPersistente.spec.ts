import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const ler = (arquivo: string) => readFile(new URL(`../${arquivo}`, import.meta.url), 'utf8');

describe('carrinho persistente', () => {
  it('não transforma expiração de hold em abandono automático', async () => {
    const inventory = await ler('server/services/inventoryService.ts');
    expect(inventory).toContain('checkout_estado: "carrinho_salvo"');
    expect(inventory).toContain('Expiração do hold');
    expect(inventory).not.toContain('checkout_estado: "expirado"');
  });

  it('reutiliza o carrinho e expõe retomada sem duplicar reserva', async () => {
    const service = await ler('server/services/pacoteService.ts');
    const route = await ler('server/routes/pacotes.ts');
    const checkout = await ler('apps/web/src/pages/cliente/Checkout.tsx');
    expect(service).toContain('static async retomarCarrinho');
    expect(service).toContain('ORDER BY criado_em DESC');
    expect(route).toContain('/reservas/:reserva_id/retomar');
    expect(checkout).toContain('carrinho_retomavel');
  });

  it('permite cancelamento imediato somente antes de contrato ou pagamento', async () => {
    const route = await ler('server/routes/cliente.ts');
    const account = await ler('apps/web/src/pages/cliente/MinhaConta.tsx');
    expect(route).toContain('Cancelamento do carrinho pelo cliente');
    expect(route).toContain('cancelamento_imediato_permitido: !contratoValidado && !pagamentoAvancado');
    expect(account).toContain('const imediato = reserva.cancelamento_imediato_permitido === true;');
    expect(account).not.toContain("void reconfigurar(reserva, 'reinicio')");
  });
});
