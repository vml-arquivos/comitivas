import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import { usuarios } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { AuthService } from "../services/authService.js";

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
  senha: string;
}

interface LoginRequest {
  email: string;
  senha: string;
}

router.post("/cadastro", async (req: Request<{}, {}, CadastroRequest>, res: Response) => {
  try {
    const { nome, email, cpf, rg, telefone, data_nascimento, estado_civil, profissao, endereco, nacionalidade, senha } = req.body;

    // Validações
    if (!nome || !email || !senha) {
      return res.status(400).json({ erro: "Nome, email e senha são obrigatórios" });
    }

    if (senha.length < 8) {
      return res.status(400).json({ erro: "Senha deve ter no mínimo 8 caracteres" });
    }

    // Verificar se usuário já existe
    const usuarioExistente = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.email, email))
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
        nome,
        email,
        cpf: cpf || null,
        rg: rg || null,
        telefone: telefone || null,
        data_nascimento: data_nascimento ? new Date(data_nascimento) : null,
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

router.post("/login", async (req: Request<{}, {}, LoginRequest>, res: Response) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ erro: "Email e senha são obrigatórios" });
    }

    // Buscar usuário
    const usuarioResult = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.email, email))
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
