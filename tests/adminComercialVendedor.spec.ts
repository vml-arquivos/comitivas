import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function fonte(caminho: string) {
  return readFile(new URL(caminho, import.meta.url), 'utf8');
}

describe('operação comercial por perfil', () => {
  it('protege exclusão total de clientes e limita a confirmação explícita', async () => {
    const rota = await fonte('../server/routes/admin.ts');
    const clientes = await fonte('../apps/web/src/pages/admin/Clientes.tsx');
    expect(rota).toContain('router.post("/usuarios/clientes/excluir-lote", requireRole("admin")');
    expect(rota).toContain('EXCLUIR_TODOS_CLIENTES');
    expect(rota).toContain('ClienteExclusaoService.excluirDefinitivamente');
    expect(clientes).toContain("Apagar todos");
    expect(clientes).toContain("EXCLUIR_TODOS_CLIENTES");
  });

  it('permite alteração de cargo sem permitir promoção a DEV por admin', async () => {
    const rota = await fonte('../server/routes/admin.ts');
    const equipe = await fonte('../apps/web/src/pages/admin/EquipeAcessos.tsx');
    expect(rota).toContain('["cliente", "vendedor", "admin"].includes(String(tipo))');
    expect(equipe).toContain('>Cargo</label>');
    expect(equipe).toContain('value="admin"');
  });

  it('mantém painel e carteira próprios do vendedor e remove contratos/cupons do seu escopo', async () => {
    const rota = await fonte('../server/routes/admin.ts');
    const app = await fonte('../apps/web/src/App.tsx');
    const vendas = await fonte('../apps/web/src/pages/admin/Vendas.tsx');
    const painel = await fonte('../apps/web/src/pages/admin/PainelVendedor.tsx');
    expect(rota).toContain('router.get("/painel-vendedor", requireRole("admin", "dev", "vendedor")');
    expect(rota).toContain('eq(reservas.vendedor_id, req.usuario.id)');
    expect(rota).toContain('Vendedores não podem aplicar cupons ou descontos');
    expect(app).toContain('path="painel-vendedor"');
    expect(app).toContain("roles={['admin', 'dev']}");
    expect(vendas).toContain("user?.tipo !== 'vendedor'");
    expect(painel).toContain('/admin/painel-vendedor');
  });
});
