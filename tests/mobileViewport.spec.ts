import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function fonte(caminho: string) {
  return readFile(new URL(caminho, import.meta.url), "utf8");
}

describe("viewport do aplicativo móvel", () => {
  it("mantém a raiz limitada à largura do aparelho", async () => {
    const css = await fonte("../apps/web/src/index.css");

    expect(css).toContain("html,\n  body,\n  #root");
    expect(css).toContain("max-width: 100%");
    expect(css).toContain("overflow-x: clip");
  });

  it("fixa escala somente quando o PWA está instalado no iPhone", async () => {
    const entrada = await fonte("../apps/web/src/main.tsx");

    expect(entrada).toContain("dispositivoIOS && modoInstalado");
    expect(entrada).toContain("maximum-scale=1, user-scalable=no");
    expect(entrada).toContain("ios-pwa-standalone");
  });

  it("mantém o conteúdo administrativo sem rolagem horizontal global", async () => {
    const layout = await fonte("../apps/web/src/layouts/AdminLayout.tsx");

    expect(layout).toContain("overflow-x-hidden overflow-y-auto");
    expect(layout).toContain("overflow-x-clip");
  });
});
