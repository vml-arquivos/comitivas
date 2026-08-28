import { Router, Request, Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { db } from "../db/index.js";
import { leads_origem, usuarios, passwordResetTokens } from "../db/schema.js";
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

router.post("/cadastro", async (req: Request<{}, {}, CadastroRequest>, res: Response) => {
  try {
    const { nome, email, cpf, rg, telefone, data_nascimento, estado_civil, profissao, endereco, nacionalidade, lead_id, senha } = req.body;
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
        })
        .returning({ id: usuarios.id, email: usuarios.email, nome: usuarios.nome, tipo: usuarios.tipo, session_version: usuarios.session_version });

      if (!criado[0]) throw new Error("Erro ao criar usuário");

      let leadVinculado: Array<{ id: string }> = [];
      if (lead_id) {
        leadVinculado = await tx.update(leads_origem).set({
          usuario_id: criado[0].id,
          nome: nomeNormalizado,
          email: emailNormalizado,
          whatsapp: telefoneNormalizado || undefined,
          status: "cadastrado",
          atualizado_em: new Date(),
        }).where(and(eq(leads_origem.id, lead_id), isNull(leads_origem.usuario_id)))
          .returning({ id: leads_origem.id });
      }

      // O navegador pode perder o lead_id. Nesse caso, reaproveita a captação
      // não vinculada mais recente pelo mesmo e-mail ou WhatsApp.
      if (leadVinculado.length === 0) {
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

    // Gerar token
    const token = AuthService.generateToken({
      id: novoUsuario[0].id,
      email: novoUsuario[0].email,
      tipo: novoUsuario[0].tipo || "cliente",
      session_version: Number(novoUsuario[0].session_version || 1),
    });

    definirCookieAuth(res, token);
    res.status(201).json({
      usuario: novoUsuario[0],
      token,
    });
  } catch (error) {
    console.error("[AUTH] Erro no cadastro:", error);
    if (erroDeUnicidade(error)) {
      return res.status(409).json({ erro: "E-mail ou CPF já cadastrado" });
    }
    res.status(500).json({ erro: "Erro interno do servidor" });
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
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const agora = new Date();
    await db.update(passwordResetTokens).set({ expira_em: agora }).where(and(eq(passwordResetTokens.usuario_id, usuario.id), isNull(passwordResetTokens.usado_em)));
    await db.insert(passwordResetTokens).values({ usuario_id: usuario.id, token_hash: tokenHash, expira_em: new Date(agora.getTime() + 30 * 60 * 1000) });
    const baseUrl = process.env.WEB_URL?.trim() || "http://localhost:5173";
    const envio = await new EmailProvider().sendPasswordReset(usuario.email, usuario.nome, `${baseUrl}/redefinir-senha?token=${token}`);
    if (!envio.sent) console.warn("[AUTH] Recuperação de senha não enviada: SMTP não configurado");
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
      token,
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
    res.json({ token: novoToken });
  } catch (error) {
    console.error("[AUTH] Erro ao renovar token:", error);
    res.status(500).json({ erro: "Erro interno do servidor" });
  }
});

export default router;
