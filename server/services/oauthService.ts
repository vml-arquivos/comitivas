import { createHash, randomBytes } from "node:crypto";

export type OAuthProviderName = "google" | "microsoft";

interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  redirectUri: string;
  scope: string;
}

export interface OAuthIdentity {
  email: string;
  name: string;
  subject: string;
}

function base64Url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function tenantMicrosoft(): string {
  const tenant = String(process.env.MICROSOFT_OAUTH_TENANT_ID || "common").trim();
  return /^[a-zA-Z0-9.-]+$/.test(tenant) ? tenant : "common";
}

function callbackConfigurado(provider: OAuthProviderName, callbackPadrao: string): string {
  const variavel = provider === "google" ? process.env.GOOGLE_OAUTH_REDIRECT_URI : process.env.MICROSOFT_OAUTH_REDIRECT_URI;
  return String(variavel || callbackPadrao).trim();
}

function configuracao(provider: OAuthProviderName, callbackPadrao: string): OAuthProviderConfig | null {
  if (provider === "google") {
    const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
    const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
      redirectUri: callbackConfigurado(provider, callbackPadrao),
      scope: "openid email profile",
    };
  }

  const clientId = String(process.env.MICROSOFT_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.MICROSOFT_OAUTH_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) return null;
  const tenant = tenantMicrosoft();
  return {
    clientId,
    clientSecret,
    authorizationUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    userInfoUrl: "https://graph.microsoft.com/oidc/userinfo",
    redirectUri: callbackConfigurado(provider, callbackPadrao),
    scope: "openid email profile",
  };
}

export class OAuthService {
  static disponibilidade() {
    return {
      google: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()),
      microsoft: Boolean(process.env.MICROSOFT_OAUTH_CLIENT_ID?.trim() && process.env.MICROSOFT_OAUTH_CLIENT_SECRET?.trim()),
    };
  }

  static criarPkce(): { verifier: string; challenge: string } {
    const verifier = base64Url(randomBytes(48));
    const challenge = base64Url(createHash("sha256").update(verifier).digest());
    return { verifier, challenge };
  }

  static criarUrlAutorizacao(provider: OAuthProviderName, callbackPadrao: string, state: string, challenge: string): string {
    const config = configuracao(provider, callbackPadrao);
    if (!config) throw new Error("Provedor de acesso não configurado");
    const url = new URL(config.authorizationUrl);
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: config.scope,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return url.toString();
  }

  static async trocarCodigo(provider: OAuthProviderName, callbackPadrao: string, code: string, verifier: string): Promise<OAuthIdentity> {
    const config = configuracao(provider, callbackPadrao);
    if (!config) throw new Error("Provedor de acesso não configurado");

    const tokenResponse = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const tokenBody = await tokenResponse.json().catch(() => ({})) as { access_token?: string };
    if (!tokenResponse.ok || !tokenBody.access_token) throw new Error("Não foi possível validar o acesso no provedor");

    const profileResponse = await fetch(config.userInfoUrl, {
      headers: { authorization: `Bearer ${tokenBody.access_token}`, accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const profile = await profileResponse.json().catch(() => ({})) as Record<string, unknown>;
    if (!profileResponse.ok) throw new Error("Não foi possível consultar a conta no provedor");
    const email = String(profile.email || profile.preferred_username || "").trim().toLowerCase();
    const subject = String(profile.sub || "").trim();
    const name = String(profile.name || email.split("@")[0] || "Cliente").trim();
    if (!email || !subject || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("A conta escolhida não forneceu um e-mail válido");
    }
    if (provider === "google" && profile.email_verified !== true) {
      throw new Error("O Google não confirmou esse endereço de e-mail");
    }
    return { email, name: name.slice(0, 255), subject };
  }
}
