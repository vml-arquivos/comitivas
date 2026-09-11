import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

async function fonte(caminho: string) {
  return readFile(new URL(caminho, import.meta.url), "utf8");
}

describe("ligações dos fluxos críticos", () => {
  it("mantém as telas administrativas ligadas às rotas protegidas", async () => {
    const app = await fonte("../apps/web/src/App.tsx");

    expect(app).toContain('path="minha-conta"');
    expect(app).toContain('path="onibus"');
    expect(app).toContain('path="contratos"');
    expect(app).toContain("roles={['admin', 'dev', 'vendedor']}");
  });

  it("mantém compra, contrato, operação e conta montados no backend", async () => {
    const [servidor, pacotes, contratos, pagamentos, operacao, autenticacao] = await Promise.all([
      fonte("../server/index.ts"),
      fonte("../server/routes/pacotes.ts"),
      fonte("../server/routes/contratos.ts"),
      fonte("../server/routes/pagamentos.ts"),
      fonte("../server/routes/operacao.ts"),
      fonte("../server/routes/auth.ts"),
    ]);

    expect(servidor).toContain('app.use("/api/pacotes", pacotesRoutes)');
    expect(servidor).toContain('app.use("/api/contratos", authMiddleware, contratosRoutes)');
    expect(servidor).toContain('app.use("/api/operacao", authMiddleware, requireRole("admin"), operacaoRoutes)');
    expect(pacotes).toContain('router.post("/reservas/:reserva_id/simular-pagamento"');
    expect(contratos).toContain('router.post("/preparar/:reserva_id"');
    expect(operacao).toContain('router.post("/saidas/:saidaId/onibus"');
    expect(operacao).toContain('router.delete("/saidas/:saidaId"');
    expect(operacao).toContain('router.delete("/onibus/:onibusId"');
    expect(autenticacao).toContain('router.post("/alterar-login", authMiddleware');
    expect(autenticacao).toContain('router.post("/alterar-senha", authMiddleware');
    expect(autenticacao).toContain('router.get("/oauth/:provider/iniciar"');
    expect(autenticacao).toContain('router.get("/oauth/:provider/callback"');
    expect(contratos).toContain("Confirme seu e-mail antes da validação contratual");
    expect(pagamentos).toContain("Cobrança bloqueada: confirme o e-mail do cliente");
  });

  it("leva visitante ao login e nunca repete o cadastro durante a compra", async () => {
    const configurador = await fonte("../apps/web/src/pages/cliente/ConfiguradorPacote.tsx");
    expect(configurador).toContain('navigate(`/login?redirect=');
    expect(configurador).not.toContain('navigate(`/cadastro?redirect=');
    expect(configurador).toContain("isLoading: authLoading");
  });
});
