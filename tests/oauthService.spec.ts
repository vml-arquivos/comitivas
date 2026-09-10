import { afterEach, describe, expect, it } from "vitest";
import { OAuthService } from "../server/services/oauthService.js";

const envOriginal = { ...process.env };

afterEach(() => {
  for (const chave of Object.keys(process.env)) {
    if (!(chave in envOriginal)) delete process.env[chave];
  }
  Object.assign(process.env, envOriginal);
});

describe("OAuthService", () => {
  it("só anuncia provedores que tenham ID e segredo", () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    process.env.MICROSOFT_OAUTH_CLIENT_ID = "microsoft-id";
    process.env.MICROSOFT_OAUTH_CLIENT_SECRET = "microsoft-secret";

    expect(OAuthService.disponibilidade()).toEqual({ google: false, microsoft: true });
  });

  it("gera PKCE S256 e URL de autorização sem expor o segredo", () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-secret";
    const pkce = OAuthService.criarPkce();
    const url = new URL(OAuthService.criarUrlAutorizacao("google", "https://app.test/api/auth/oauth/google/callback", "estado", pkce.challenge));

    expect(pkce.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pkce.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("estado");
    expect(url.toString()).not.toContain("google-secret");
  });
});
