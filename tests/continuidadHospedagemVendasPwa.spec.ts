import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

async function fonte(caminho: string) {
  return readFile(new URL(caminho, import.meta.url), "utf8");
}

describe("continuidade de hospedagem, vendas e PWA", () => {
  it("adiciona o local de hospedagem sem remover dados existentes", async () => {
    const [migration, servico, tela] = await Promise.all([
      fonte("../drizzle/0015_local_hospedagem.sql"),
      fonte("../server/services/hospedagemService.ts"),
      fonte("../apps/web/src/pages/admin/HospedagemQuartos.tsx"),
    ]);

    expect(migration).toContain("ADD COLUMN IF NOT EXISTS local_hospedagem");
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)|TRUNCATE/i);
    expect(servico).toContain("local_hospedagem");
    expect(tela).toContain("Local da hospedagem");
    expect(tela).toContain("Incluir mais quartos");
    expect(tela).not.toContain("Incluir mais configuração");
  });

  it("separa vendas gerais de vendas internas e mantém ações de pós-venda", async () => {
    const [menu, app, vendas, admin, pacotes] = await Promise.all([
      fonte("../apps/web/src/layouts/AdminLayout.tsx"),
      fonte("../apps/web/src/App.tsx"),
      fonte("../apps/web/src/pages/admin/Vendas.tsx"),
      fonte("../server/routes/admin.ts"),
      fonte("../server/routes/pacotes.ts"),
    ]);

    expect(menu).toContain("name: 'Vendas'");
    expect(menu).toContain("name: 'Vendas internas'");
    expect(app).toContain('path="vendas/interna"');
    expect(vendas).toContain("Controle de vendas");
    expect(vendas).toContain("Receita em vendas");
    expect(vendas).toContain("solicitarPosVenda");
    expect(admin).toContain("receita_centavos");
    expect(admin).toContain('codigo_origem: lead?.codigo_origem || (vendedorId ? `interno-${vendedorId}` : "venda-interna")');
    expect(pacotes).toContain('codigo_origem: "site"');
  });

  it("usa navegação de aplicativo quando o PWA está instalado e não mostra CTA de instalação", async () => {
    const [entrada, layout, botao, paginaAplicativo] = await Promise.all([
      fonte("../apps/web/src/main.tsx"),
      fonte("../apps/web/src/layouts/MainLayout.tsx"),
      fonte("../apps/web/src/components/PwaInstallButton.tsx"),
      fonte("../apps/web/src/pages/publico/Aplicativo.tsx"),
    ]);

    expect(entrada).toContain("pwa-standalone");
    expect(layout).toContain("AppBottomNav");
    expect(layout).toContain("{modoApp ? (");
    expect(layout).toContain("{!modoApp && (");
    expect(botao).toContain("if (instalado) return null");
    expect(paginaAplicativo).toContain("if (instalado)");
    expect(paginaAplicativo).toContain("Aplicativo ativo");
  });
});
