import { Router, Request, Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { db } from "../db/index.js";
import { leads_origem, usuarios, passwordResetTokens, verificacoesEmail, convitesAcesso, auditoriaAdmin } from "../db/schema.js";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { AuthService } from "../services/authService.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { EmailProvider } from "../services/notificationProvider.js";

const router = Router();
const AUTH_COOKIE = "auth_token";

function definirCookieAuth(res: Response, token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`);
}

function limparCookieAuth(res: Response) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

interface CadastroRequest {
  nome: string;
  email: string;
  cpf?: string;
  rg?: string;
  telefone?: string;
  data_nascimento?: string;
  estado_civil?: string;
  profissao?: string;
  endereco?: string;
  nacionalidade?: string;
  lead_id?: string;
  lead_intent_token?: string;
  senha: string;
}

interface LoginRequest {
  email: string;
  senha: string;
}

function somenteDigitos(valor: unknown): string {
  return String(valor ?? "").replace(/\D/g, "");
}

function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcularDigito = (tamanho: number) => {
    let soma = 0;
    for (let indice = 0; indice < tamanho; indice += 1) {
      soma += Number(cpf[indice]) * (tamanho + 1 - indice);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return calcularDigito(9) === Number(cpf[9])
    && calcularDigito(10) === Number(cpf[10]);
}

function erroDeUnicidade(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505");
}

function hashCodigo(codigo: string): string {
  return createHash("sha256").update(codigo, "utf8").digest("hex");
}

function gerarCodigoEmail(): string {
  return String(100000 + (randomBytes(4).readUInt32BE(0) % 900000));
}

router.post("/cadastro", async (req: Request<{}, {}, CadastroRequest>, res: Response) => {
  try {
    const { nome, email, cpf, rg, telefone, data_nascimento, estado_civil, profissao, endereco, nacionalidade, lead_id, lead_intent_token, senha } = req.body;
    const emailNormalizado = String(email || "").trim().toLowerCase();
    const nomeNormalizado = String(nome || "").trim();
    const cpfNormalizado = somenteDigitos(cpf);
    const telefoneNormalizado = somenteDigitos(telefone);

    // Validações
    if (!nomeNormalizado || !emailNormalizado || !cpfNormalizado || !senha) {
      return res.status(400).json({ erro: "Nome, email, CPF e senha são obrigatórios" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
      return res.status(400).json({ erro: "Informe um e-mail válido" });
    }
    if (!cpfValido(cpfNormalizado)) {
      return res.status(400).json({ erro: "Informe um CPF válido" });
    }
    if (telefoneNormalizado && (telefoneNormalizado.length < 10 || telefoneNormalizado.length > 13)) {
      return res.status(400).json({ erro: "Informe um telefone com DDD válido" });
    }
    if (senha.length < 8) {
      return res.status(400).json({ erro: "Senha deve ter no mínimo 8 caracteres" });
    }
    const dataNascimento = data_nascimento ? new Date(data_nascimento) : null;
    if (dataNascimento && Number.isNaN(dataNascimento.getTime())) {
      return res.status(400).json({ erro: "Data de nascimento inválida" });
    }

    // Verificar se usuário já existe
    const usuarioExistente = await db
      .select({ email: usuarios.email, cpf: usuarios.cpf })
      .from(usuarios)
      .where(or(
        eq(usuarios.email, emailNormalizado),
        sql`regexp_replace(COALESCE(${usuarios.cpf}, ''), '\\D', '', 'g') = ${cpfNormalizado}`,
      ))
      .limit(1);

    if (usuarioExistente[0]) {
      const mesmoEmail = usuarioExistente[0].email.toLowerCase() === emailNormalizado;
      return res.status(409).json({ erro: mesmoEmail ? "E-mail já cadastrado" : "CPF já cadastrado" });
    }

    // Hash da senha
    const senhaHash = await AuthService.hashPassword(senha);

    const leadTokenValido = Boolean(lead_id && AuthService.verifyLeadIntentToken(String(lead_intent_token || ""), lead_id));

    // Usuário e lead são gravados na mesma transação. Se qualquer operação
    // falhar, não fica uma conta sem card correspondente no CRM.
    const novoUsuario = await db.transaction(async (tx) => {
      const criado = await tx
        .insert(usuarios)
        .values({
          nome: nomeNormalizado,
          email: emailNormalizado,
          cpf: cpfNormalizado,
          rg: String(rg || "").trim() || null,
          telefone: telefoneNormalizado || null,
          data_nascimento: dataNascimento,
          estado_civil: String(estado_civil || "").trim() || null,
          profissao: String(profissao || "").trim() || null,
          endereco: String(endereco || "").trim() || null,
          nacionalidade: String(nacionalidade || "").trim() || "Brasileira",
          senha_hash: senhaHash,
          tipo: "cliente",
          email_confirmado: false,
          cadastro_status: "pendente",
        })
        .returning({ id: usuarios.id, email: usuarios.email, nome: usuarios.nome, tipo: usuarios.tipo, session_version: usuarios.session_version });

      if (!criado[0]) throw new Error("Erro ao criar usuário");

      let leadVinculado: Array<{ id: string }> = [];
      if (leadTokenValido) {
        leadVinculado = await tx.update(leads_origem).set({
          usuario_id: criado[0].id,
          nome: nomeNormalizado,
          email: emailNormalizado,
          whatsapp: telefoneNormalizado || undefined,
          status: "cadastrado",
          atualizado_em: new Date(),
        }).where(and(eq(leads_origem.id, lead_id!), isNull(leads_origem.usuario_id)))
          .returning({ id: leads_origem.id });
      }

      // O navegador pode perder o lead_id. Nesse caso, reaproveita a captação
      // não vinculada mais recente pelo mesmo e-mail ou WhatsApp. Se um lead_id
      // foi informado sem token válido, não fazemos associação por aproximação.
      if (leadVinculado.length === 0 && (!lead_id || leadTokenValido)) {
        const mesmoContato = telefoneNormalizado
          ? or(eq(leads_origem.email, emailNormalizado), eq(leads_origem.whatsapp, telefoneNormalizado))
          : eq(leads_origem.email, emailNormalizado);
        const leadExistente = await tx.select({ id: leads_origem.id })
          .from(leads_origem)
          .where(and(isNull(leads_origem.usuario_id), mesmoContato))
          .orderBy(desc(leads_origem.criado_em))
          .limit(1);

        if (leadExistente[0]) {
          leadVinculado = await tx.update(leads_origem).set({
            usuario_id: criado[0].id,
            nome: nomeNormalizado,
            email: emailNormalizado,
            whatsapp: telefoneNormalizado || undefined,
            status: "cadastrado",
            atualizado_em: new Date(),
          }).where(and(eq(leads_origem.id, leadExistente[0].id), isNull(leads_origem.usuario_id)))
            .returning({ id: leads_origem.id });
        }
      }

      if (leadVinculado.length === 0) {
        await tx.insert(leads_origem).values({
          id: createId(),
          codigo_origem: `cadastro-direto-${criado[0].id}`.slice(0, 100),
          usuario_id: criado[0].id,
          nome: nomeNormalizado,
          email: emailNormalizado,
          whatsapp: telefoneNormalizado || null,
          origem: "cadastro_direto",
          status: "cadastrado",
          consentimento_whatsapp: false,
          dados_contexto: { origem: "formulario_cadastro" },
          atualizado_em: new Date(),
        });
      }

      return criado;
    });

    const codigo = gerarCodigoEmail();
    const agora = new Date();
    await db.update(verificacoesEmail).set({ usado_em: agora }).where(and(eq(verificacoesEmail.usuario_id, novoUsuario[0].id), isNull(verificacoesEmail.usado_em)));
    await db.insert(verificacoesEmail).values({ id: createId(), usuario_id: novoUsuario[0].id, codigo_hash: hashCodigo(codigo), expira_em: new Date(agora.getTime() + 30 * 60 * 1000), enviado_em: agora });
    const envio = await new EmailProvider().sendEmailVerification(novoUsuario[0].email, novoUsuario[0].nome, codigo).catch((error: any) => ({ sent: false, reason: error?.message || "falha no provedor" }));
    if (!envio.sent) {
      await db.update(verificacoesEmail).set({ usado_em: new Date() }).where(and(eq(verificacoesEmail.usuario_id, novoUsuario[0].id), isNull(verificacoesEmail.usado_em)));
      console.error(`[AUTH] Confirmação de e-mail não enviada: ${envio.reason || "provedor não confirmou o envio"}`);
    }
    res.status(201).json({ usuario: novoUsuario[0], email_confirmacao_necessaria: true, envio_email: envio.sent ? "enviado" : "pendente" });
  } catch (error) {
    console.error("[AUTH] Erro no cadastro:", error);
    if (erroDeUnicidade(error)) {
      return res.status(409).json({ erro: "E-mail ou CPF já cadastrado" });
    }
    res.status(500).json({ erro: "Erro interno do servidor" });
  }
});

router.post("/confirmar-email", async (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const codigo = String(req.body?.codigo || "").trim();
    if (!email || !/^\d{6}$/.test(codigo)) return res.status(400).json({ erro: "Informe o e-mail e o código de 6 dígitos" });
    const usuario = (await db.select({ id: usuarios.id, email: usuarios.email, nome: usuarios.nome, tipo: usuarios.tipo, session_version: usuarios.session_version, email_confirmado: usuarios.email_confirmado }).from(usuarios).where(eq(usuarios.email, email)).limit(1))[0];
    if (!usuario || usuario.email_confirmado) return res.status(400).json({ erro: "Código inválido ou conta já confirmada" });
    const agora = new Date();
    const confirmado = await db.transaction(async (tx) => {
      const desafio = await tx.update(verificacoesEmail).set({ usado_em: agora }).where(and(eq(verificacoesEmail.usuario_id, usuario.id), eq(verificacoesEmail.codigo_hash, hashCodigo(codigo)), isNull(verificacoesEmail.usado_em), sql`${verificacoesEmail.expira_em} > CURRENT_TIMESTAMP`)).returning({ id: verificacoesEmail.id });
      if (!desafio[0]) return false;
      await tx.update(usuarios).set({ email_confirmado: true, email_confirmado_em: agora, atualizado_em: agora }).where(eq(usuarios.id, usuario.id));
      return true;
    });
    if (!confirmado) return res.status(400).json({ erro: "Código inválido, expirado ou já utilizado" });
    const token = AuthService.generateToken({ id: usuario.id, email: usuario.email, tipo: usuario.tipo || "cliente", session_version: Number(usuario.session_version || 1) });
    definirCookieAuth(res, token);
    return res.json({ mensagem: "E-mail confirmado com sucesso", usuario: { id: usuario.id, email: usuario.email, nome: usuario.nome, tipo: usuario.tipo } });
  } catch (error) {
    console.error("[AUTH] Erro na confirmação de e-mail:", error);
    return res.status(400).json({ erro: "Não foi possível confirmar o e-mail" });
  }
});

router.post("/reenviar-confirmacao", async (req: Request, res: Response) => {
  const respostaNeutra = { mensagem: "Se a conta estiver pendente, um novo código será enviado." };
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const usuario = (await db.select({ id: usuarios.id, email: usuarios.email, nome: usuarios.nome, email_confirmado: usuarios.email_confirmado }).from(usuarios).where(eq(usuarios.email, email)).limit(1))[0];
    if (!usuario || usuario.email_confirmado) return res.json(respostaNeutra);

    // Evita disparos repetidos para o mesmo endereço sem bloquear login/cadastro.
    // A resposta continua neutra para não revelar o estado da conta.
    const envioRecente = (await db.select({ id: verificacoesEmail.id })
      .from(verificacoesEmail)
      .where(and(
        eq(verificacoesEmail.usuario_id, usuario.id),
        isNull(verificacoesEmail.usado_em),
        sql`${verificacoesEmail.criado_em} > CURRENT_TIMESTAMP - INTERVAL '60 seconds'`,
      ))
      .limit(1))[0];
    if (envioRecente) return res.json(respostaNeutra);

    const codigo = gerarCodigoEmail();
    const agora = new Date();
    await db.update(verificacoesEmail).set({ usado_em: agora }).where(and(eq(verificacoesEmail.usuario_id, usuario.id), isNull(verificacoesEmail.usado_em)));
    await db.insert(verificacoesEmail).values({ id: createId(), usuario_id: usuario.id, codigo_hash: hashCodigo(codigo), expira_em: new Date(agora.getTime() + 30 * 60 * 1000), enviado_em: agora });
    const envio = await new EmailProvider().sendEmailVerification(usuario.email, usuario.nome, codigo).catch((error: any) => ({ sent: false, reason: error?.message || "falha no provedor" }));
    if (!envio?.sent) {
      await db.update(verificacoesEmail).set({ usado_em: new Date() }).where(and(eq(verificacoesEmail.usuario_id, usuario.id), isNull(verificacoesEmail.usado_em)));
      console.error(`[AUTH] Reenvio de confirmação não enviado: ${envio?.reason || "provedor não confirmou o envio"}`);
    }
    return res.json(respostaNeutra);
  } catch (error) {
    console.error("[AUTH] Erro no reenvio de confirmação:", error);
    return res.json(respostaNeutra);
  }
});

router.get("/perfil", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });

    const resultado = await db.select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      cpf: usuarios.cpf,
      rg: usuarios.rg,
      telefone: usuarios.telefone,
      data_nascimento: usuarios.data_nascimento,
      estado_civil: usuarios.estado_civil,
      profissao: usuarios.profissao,
      endereco: usuarios.endereco,
      nacionalidade: usuarios.nacionalidade,
      tipo: usuarios.tipo,
    }).from(usuarios).where(eq(usuarios.id, req.usuario.id)).limit(1);

    if (!resultado[0]) return res.status(404).json({ erro: "Usuário não encontrado" });
    res.json({ usuario: resultado[0] });
  } catch (error) {
    console.error("[AUTH] Erro ao consultar perfil:", error);
    res.status(500).json({ erro: "Erro ao consultar dados cadastrais" });
  }
});

router.put("/perfil", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });

    const campos = req.body || {};
    const dataNascimento = campos.data_nascimento ? new Date(campos.data_nascimento) : null;
    if (dataNascimento && Number.isNaN(dataNascimento.getTime())) {
      return res.status(400).json({ erro: "Data de nascimento inválida" });
    }
    const cpfNormalizado = campos.cpf !== undefined ? somenteDigitos(campos.cpf) : undefined;
    const telefoneNormalizado = campos.telefone !== undefined ? somenteDigitos(campos.telefone) : undefined;
    if (cpfNormalizado !== undefined && !cpfValido(cpfNormalizado)) {
      return res.status(400).json({ erro: "Informe um CPF válido" });
    }
    if (telefoneNormalizado && (telefoneNormalizado.length < 10 || telefoneNormalizado.length > 13)) {
      return res.status(400).json({ erro: "Informe um telefone com DDD válido" });
    }

    const atualizado = await db.transaction(async (tx) => {
      const usuarioAtualizado = await tx.update(usuarios).set({
        nome: campos.nome ? String(campos.nome).trim() : undefined,
        cpf: cpfNormalizado !== undefined ? cpfNormalizado : undefined,
        rg: campos.rg !== undefined ? (String(campos.rg).trim() || null) : undefined,
        telefone: telefoneNormalizado !== undefined ? (telefoneNormalizado || null) : undefined,
        data_nascimento: campos.data_nascimento !== undefined ? dataNascimento : undefined,
        estado_civil: campos.estado_civil !== undefined ? (String(campos.estado_civil).trim() || null) : undefined,
        profissao: campos.profissao !== undefined ? (String(campos.profissao).trim() || null) : undefined,
        endereco: campos.endereco !== undefined ? (String(campos.endereco).trim() || null) : undefined,
        nacionalidade: campos.nacionalidade !== undefined ? (String(campos.nacionalidade).trim() || "Brasileira") : undefined,
        atualizado_em: new Date(),
      }).where(eq(usuarios.id, req.usuario!.id)).returning({
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        cpf: usuarios.cpf,
        rg: usuarios.rg,
        telefone: usuarios.telefone,
        data_nascimento: usuarios.data_nascimento,
        estado_civil: usuarios.estado_civil,
        profissao: usuarios.profissao,
        endereco: usuarios.endereco,
        nacionalidade: usuarios.nacionalidade,
        tipo: usuarios.tipo,
      });

      if (usuarioAtualizado[0]) {
        await tx.update(leads_origem).set({
          nome: usuarioAtualizado[0].nome,
          email: usuarioAtualizado[0].email,
          whatsapp: usuarioAtualizado[0].telefone,
          atualizado_em: new Date(),
        }).where(eq(leads_origem.usuario_id, req.usuario!.id));
      }

      return usuarioAtualizado;
    });

    if (!atualizado[0]) return res.status(404).json({ erro: "Usuário não encontrado" });
    res.json({ mensagem: "Dados atualizados com sucesso", usuario: atualizado[0] });
  } catch (error) {
    console.error("[AUTH] Erro ao atualizar perfil:", error);
    if (erroDeUnicidade(error)) {
      return res.status(409).json({ erro: "CPF já cadastrado em outra conta" });
    }
    res.status(500).json({ erro: "Erro ao atualizar dados cadastrais" });
  }
});

router.post("/esqueci-senha", async (req: Request, res: Response) => {
  const respostaNeutra = { mensagem: "Se o e-mail estiver cadastrado, você receberá instruções para redefinir a senha." };
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.json(respostaNeutra);
    const usuario = (await db.select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email }).from(usuarios).where(eq(usuarios.email, email)).limit(1))[0];
    if (!usuario || !usuario.email) return res.json(respostaNeutra);

    // Cooldown por conta: evita bombardeio de e-mail sem compartilhar o mesmo
    // contador de login/cadastro. Solicitações dentro de 60 s não reenviam.
    const tokenRecente = (await db.select({ id: passwordResetTokens.id })
      .from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.usuario_id, usuario.id),
        isNull(passwordResetTokens.usado_em),
        sql`${passwordResetTokens.criado_em} > CURRENT_TIMESTAMP - INTERVAL '60 seconds'`,
      ))
      .limit(1))[0];
    if (tokenRecente) return res.json(respostaNeutra);

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const agora = new Date();
    await db.update(passwordResetTokens).set({ expira_em: agora }).where(and(eq(passwordResetTokens.usuario_id, usuario.id), isNull(passwordResetTokens.usado_em)));
    await db.insert(passwordResetTokens).values({ usuario_id: usuario.id, token_hash: tokenHash, expira_em: new Date(agora.getTime() + 30 * 60 * 1000) });
    const baseUrl = process.env.WEB_URL?.trim() || "http://localhost:5173";
    const envio = await new EmailProvider().sendPasswordReset(usuario.email, usuario.nome, `${baseUrl}/redefinir-senha?token=${token}`);
    if (!envio.sent) {
      // Não deixa um token inválido em cooldown quando o provedor de e-mail falha.
      await db.update(passwordResetTokens).set({ usado_em: new Date(), expira_em: new Date() }).where(eq(passwordResetTokens.token_hash, tokenHash));
      console.error(`[AUTH] Recuperação de senha não enviada: ${envio.reason || "provedor de e-mail não confirmou o envio"}`);
    }
    return res.json(respostaNeutra);
  } catch (error) {
    console.error("[AUTH] Erro na solicitação de recuperação:", error);
    return res.json(respostaNeutra);
  }
});

router.post("/redefinir-senha", async (req: Request, res: Response) => {
  try {
    const token = String(req.body?.token || "").trim();
    const senha = String(req.body?.senha || "");
    if (!/^[a-f0-9]{64}$/.test(token) || senha.length < 8) return res.status(400).json({ erro: "Token inválido ou senha com menos de 8 caracteres" });
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const agora = new Date();
    const resultado = await db.transaction(async (tx) => {
      const atualizado = await tx.update(passwordResetTokens).set({ usado_em: agora }).where(and(eq(passwordResetTokens.token_hash, tokenHash), isNull(passwordResetTokens.usado_em), sql`${passwordResetTokens.expira_em} > CURRENT_TIMESTAMP`)).returning({ usuario_id: passwordResetTokens.usuario_id });
      if (!atualizado[0]) return null;
      const senhaHash = await AuthService.hashPassword(senha);
      await tx.update(usuarios).set({ senha_hash: senhaHash, session_version: sql`COALESCE(session_version, 1) + 1`, atualizado_em: agora }).where(eq(usuarios.id, atualizado[0].usuario_id));
      return atualizado[0];
    });
    if (!resultado) return res.status(400).json({ erro: "Token inválido, expirado ou já utilizado" });
    return res.json({ mensagem: "Senha redefinida com sucesso" });
  } catch (error) {
    console.error("[AUTH] Erro ao redefinir senha:", error);
    return res.status(400).json({ erro: "Não foi possível redefinir a senha" });
  }
});


router.get("/convite/:token", async (req: Request, res: Response) => {
  try {
    const tokenHash = hashCodigo(String(req.params.token || ""));
    const convite = (await db.select({ id: convitesAcesso.id, papel: convitesAcesso.papel, email_destino: convitesAcesso.email_destino, expira_em: convitesAcesso.expira_em, usado_em: convitesAcesso.usado_em, revogado_em: convitesAcesso.revogado_em }).from(convitesAcesso).where(eq(convitesAcesso.token_hash, tokenHash)).limit(1))[0];
    if (!convite || convite.usado_em || convite.revogado_em || convite.expira_em.getTime() <= Date.now()) return res.status(404).json({ erro: "Convite inválido, expirado ou já utilizado" });
    return res.json({ convite: { papel: convite.papel, email_destino: convite.email_destino, expira_em: convite.expira_em } });
  } catch (error) {
    console.error("[AUTH] Erro ao consultar convite:", error);
    return res.status(400).json({ erro: "Não foi possível validar o convite" });
  }
});

router.post("/convite/:token", async (req: Request, res: Response) => {
  try {
    const tokenHash = hashCodigo(String(req.params.token || ""));
    const nome = String(req.body?.nome || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const cpf = somenteDigitos(req.body?.cpf);
    const telefone = somenteDigitos(req.body?.telefone);
    const senha = String(req.body?.senha || "");
    if (!nome || !email || !cpf || senha.length < 8) return res.status(400).json({ erro: "Nome, e-mail, CPF e senha de pelo menos 8 caracteres são obrigatórios" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !cpfValido(cpf)) return res.status(400).json({ erro: "E-mail ou CPF inválido" });
    const agora = new Date();
    const resultado = await db.transaction(async (tx) => {
      // Serializa tentativas sobre o mesmo convite para preservar uso único até
      // sob requisições concorrentes. O token bruto nunca entra no lock nem no banco.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${tokenHash}))`);
      const convite = (await tx.select().from(convitesAcesso).where(and(eq(convitesAcesso.token_hash, tokenHash), isNull(convitesAcesso.usado_em), isNull(convitesAcesso.revogado_em), sql`${convitesAcesso.expira_em} > CURRENT_TIMESTAMP`)).limit(1))[0];
      if (!convite || !["admin", "vendedor"].includes(convite.papel)) return null;
      if (convite.email_destino && convite.email_destino.toLowerCase() !== email) throw new Error("Este convite foi emitido para outro e-mail");
      const existente = (await tx.select({ id: usuarios.id }).from(usuarios).where(or(eq(usuarios.email, email), sql`regexp_replace(COALESCE(${usuarios.cpf}, ''), '\\D', '', 'g') = ${cpf}`)).limit(1))[0];
      if (existente) throw new Error("E-mail ou CPF já cadastrado");
      const senhaHash = await AuthService.hashPassword(senha);
      const usuario = (await tx.insert(usuarios).values({
        id: createId(), nome, email, cpf, telefone: telefone || null, senha_hash: senhaHash, tipo: convite.papel as "admin" | "vendedor",
        rg: String(req.body?.rg || "").trim() || null, data_nascimento: req.body?.data_nascimento ? new Date(req.body.data_nascimento) : null,
        estado_civil: String(req.body?.estado_civil || "").trim() || null, profissao: String(req.body?.profissao || "").trim() || null,
        endereco: String(req.body?.endereco || "").trim() || null, nacionalidade: String(req.body?.nacionalidade || "").trim() || "Brasileira",
        email_confirmado: true, email_confirmado_em: agora, cadastro_status: "aprovado", aprovado_em: agora, aprovado_por: convite.criado_por, ativo: true, criado_em: agora, atualizado_em: agora,
      }).returning({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, tipo: usuarios.tipo, session_version: usuarios.session_version }))[0];
      if (!usuario) throw new Error("Não foi possível criar a conta");
      await tx.update(convitesAcesso).set({ usado_em: agora, usado_por: usuario.id }).where(eq(convitesAcesso.id, convite.id));
      await tx.insert(auditoriaAdmin).values({ id: createId(), ator_id: usuario.id, ator_tipo: String(usuario.tipo || convite.papel), acao: "convite_aceito", entidade: "usuario", entidade_id: usuario.id, depois: { papel: usuario.tipo, convite_id: convite.id }, ip: req.ip || null, user_agent: req.get("user-agent") || null, criado_em: agora });
      return usuario;
    });
    if (!resultado) return res.status(400).json({ erro: "Convite inválido, expirado ou já utilizado" });
    const token = AuthService.generateToken({ id: resultado.id, email: resultado.email, tipo: (resultado.tipo || "vendedor") as any, session_version: Number(resultado.session_version || 1) });
    definirCookieAuth(res, token);
    return res.status(201).json({ usuario: { id: resultado.id, nome: resultado.nome, email: resultado.email, tipo: resultado.tipo }, mensagem: "Conta criada pelo convite" });
  } catch (error: any) {
    console.error("[AUTH] Erro ao aceitar convite:", error);
    return res.status(400).json({ erro: error.message || "Não foi possível concluir o cadastro pelo convite" });
  }
});

router.post("/login", async (req: Request<{}, {}, LoginRequest>, res: Response) => {
  try {
    const { email, senha } = req.body;
    const emailNormalizado = String(email || "").trim().toLowerCase();

    if (!emailNormalizado || !senha) {
      return res.status(400).json({ erro: "Email e senha são obrigatórios" });
    }

    // Buscar usuário
    const usuarioResult = await db
      .select({
        id: usuarios.id,
        email: usuarios.email,
        nome: usuarios.nome,
        tipo: usuarios.tipo,
        ativo: usuarios.ativo,
        senha_hash: usuarios.senha_hash,
        session_version: usuarios.session_version,
        email_confirmado: usuarios.email_confirmado,
      })
      .from(usuarios)
      .where(eq(usuarios.email, emailNormalizado))
      .limit(1);

    if (usuarioResult.length === 0) {
      return res.status(401).json({ erro: "Credenciais inválidas" });
    }

    const usuario = usuarioResult[0];

    // Verificar senha
    const senhaValida = await AuthService.verifyPassword(senha, usuario.senha_hash);
    if (!senhaValida) {
      return res.status(401).json({ erro: "Credenciais inválidas" });
    }

    // Verificar se ativo
    if (!usuario.ativo) {
      return res.status(403).json({ erro: "Usuário desativado" });
    }
    if (!usuario.email_confirmado) {
      return res.status(403).json({ erro: "Confirme seu e-mail antes de entrar", email_confirmacao_necessaria: true });
    }

    // Gerar token
    const token = AuthService.generateToken({
      id: usuario.id,
      email: usuario.email,
      tipo: usuario.tipo || "cliente",
      session_version: Number(usuario.session_version || 1),
    });

    definirCookieAuth(res, token);
    res.json({
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nome: usuario.nome,
        tipo: usuario.tipo,
      },
    });
  } catch (error) {
    console.error("[AUTH] Erro no login:", error);
    res.status(500).json({ erro: "Erro interno do servidor" });
  }
});

router.post("/logout", (_req: Request, res: Response) => {
  limparCookieAuth(res);
  return res.json({ ok: true });
});

router.post("/refresh", (req: Request, res: Response) => {
  try {
    const bearer = AuthService.extractTokenFromHeader(req.headers.authorization);
    const cookie = req.headers.cookie || "";
    const cookiePart = cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${AUTH_COOKIE}=`));
    const token = bearer || (cookiePart ? decodeURIComponent(cookiePart.slice(`${AUTH_COOKIE}=`.length)) : null);

    if (!token) {
      return res.status(401).json({ erro: "Token não fornecido" });
    }

    const payload = AuthService.verifyToken(token);
    if (!payload) {
      return res.status(401).json({ erro: "Token inválido" });
    }

    const novoToken = AuthService.generateToken({
      id: payload.id,
      email: payload.email,
      tipo: payload.tipo,
      session_version: Number(payload.session_version || 1),
    });

    definirCookieAuth(res, novoToken);
    res.json({ mensagem: "Sessão renovada" });
  } catch (error) {
    console.error("[AUTH] Erro ao renovar token:", error);
    res.status(500).json({ erro: "Erro interno do servidor" });
  }
});

export default router;
