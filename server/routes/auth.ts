import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import { leads_origem, usuarios } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { AuthService } from "../services/authService.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = Router();

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

router.post("/cadastro", async (req: Request<{}, {}, CadastroRequest>, res: Response) => {
  try {
    const { nome, email, cpf, rg, telefone, data_nascimento, estado_civil, profissao, endereco, nacionalidade, lead_id, senha } = req.body;
    const emailNormalizado = String(email || "").trim().toLowerCase();
    const nomeNormalizado = String(nome || "").trim();

    // Validações
    if (!nomeNormalizado || !emailNormalizado || !senha) {
      return res.status(400).json({ erro: "Nome, email e senha são obrigatórios" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
      return res.status(400).json({ erro: "Informe um e-mail válido" });
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
      .select()
      .from(usuarios)
      .where(eq(usuarios.email, emailNormalizado))
      .limit(1);

    if (usuarioExistente.length > 0) {
      return res.status(409).json({ erro: "Email já cadastrado" });
    }

    // Hash da senha
    const senhaHash = await AuthService.hashPassword(senha);

    // Criar usuário
    const novoUsuario = await db
      .insert(usuarios)
      .values({
        nome: nomeNormalizado,
        email: emailNormalizado,
        cpf: cpf || null,
        rg: rg || null,
        telefone: telefone || null,
        data_nascimento: dataNascimento,
        estado_civil: estado_civil || null,
        profissao: profissao || null,
        endereco: endereco || null,
        nacionalidade: nacionalidade || "Brasileira",
        senha_hash: senhaHash,
        tipo: "cliente",
      })
      .returning({ id: usuarios.id, email: usuarios.email, nome: usuarios.nome, tipo: usuarios.tipo });

    if (!novoUsuario[0]) {
      return res.status(500).json({ erro: "Erro ao criar usuário" });
    }

    if (lead_id) {
      // Cliente veio de um link de rastreio (vendedor/campanha): atualiza o
      // lead já existente em vez de criar um duplicado.
      await db.update(leads_origem).set({
        usuario_id: novoUsuario[0].id,
        nome: nomeNormalizado,
        email: emailNormalizado,
        whatsapp: telefone ? String(telefone).replace(/\D/g, "") : undefined,
        status: "cadastrado",
        atualizado_em: new Date(),
      }).where(eq(leads_origem.id, lead_id));
    } else {
      // Cadastro direto pelo site, sem passar por um link de rastreio: cria
      // o lead agora, senão o cliente nunca aparece no CRM/Kanban nem é
      // contado em nenhum relatório, já que ambos são construídos em cima de
      // leads_origem (e o dashboard, em cima de reservas — que ainda não
      // existe nesse momento do funil).
      await db.insert(leads_origem).values({
        codigo_origem: `cadastro-${novoUsuario[0].id}`,
        usuario_id: novoUsuario[0].id,
        nome: nomeNormalizado,
        email: emailNormalizado,
        whatsapp: telefone ? String(telefone).replace(/\D/g, "") : undefined,
        origem: "cadastro_direto",
        status: "cadastrado",
        atualizado_em: new Date(),
      });
    }

    // Gerar token
    const token = AuthService.generateToken({
      id: novoUsuario[0].id,
      email: novoUsuario[0].email,
      tipo: novoUsuario[0].tipo,
    });

    res.status(201).json({
      usuario: novoUsuario[0],
      token,
    });
  } catch (error) {
    console.error("[AUTH] Erro no cadastro:", error);
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

    const atualizado = await db.update(usuarios).set({
      nome: campos.nome ? String(campos.nome).trim() : undefined,
      cpf: campos.cpf !== undefined ? (String(campos.cpf).trim() || null) : undefined,
      rg: campos.rg !== undefined ? (String(campos.rg).trim() || null) : undefined,
      telefone: campos.telefone !== undefined ? (String(campos.telefone).trim() || null) : undefined,
      data_nascimento: campos.data_nascimento !== undefined ? dataNascimento : undefined,
      estado_civil: campos.estado_civil !== undefined ? (String(campos.estado_civil).trim() || null) : undefined,
      profissao: campos.profissao !== undefined ? (String(campos.profissao).trim() || null) : undefined,
      endereco: campos.endereco !== undefined ? (String(campos.endereco).trim() || null) : undefined,
      nacionalidade: campos.nacionalidade !== undefined ? (String(campos.nacionalidade).trim() || "Brasileira") : undefined,
      atualizado_em: new Date(),
    }).where(eq(usuarios.id, req.usuario.id)).returning({
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

    if (!atualizado[0]) return res.status(404).json({ erro: "Usuário não encontrado" });
    res.json({ mensagem: "Dados atualizados com sucesso", usuario: atualizado[0] });
  } catch (error) {
    console.error("[AUTH] Erro ao atualizar perfil:", error);
    res.status(500).json({ erro: "Erro ao atualizar dados cadastrais" });
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
      .select()
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
      tipo: usuario.tipo,
    });

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

router.post("/refresh", (req: Request, res: Response) => {
  try {
    const token = AuthService.extractTokenFromHeader(req.headers.authorization);

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
    });

    res.json({ token: novoToken });
  } catch (error) {
    console.error("[AUTH] Erro ao renovar token:", error);
    res.status(500).json({ erro: "Erro interno do servidor" });
  }
});

export default router;
