import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initializeDatabase, closeDatabase } from "./db/index.js";
import { authMiddleware, requireRole } from "./middleware/authMiddleware.js";
import authRoutes from "./routes/auth.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: process.env.WEB_URL || "http://localhost:5173",
  credentials: true,
}));

// Rotas públicas
app.use("/api/auth", authRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Middleware de autenticação para rotas protegidas
app.use("/api/protected", authMiddleware);

// Rota protegida de exemplo
app.get("/api/protected/me", (req, res) => {
  res.json({ usuario: req.usuario });
});

// Rota admin de exemplo
app.get("/api/admin/dashboard", authMiddleware, requireRole("admin"), (req, res) => {
  res.json({ mensagem: "Bem-vindo ao dashboard admin", usuario: req.usuario });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[ERROR]", err);
  res.status(500).json({ erro: "Erro interno do servidor" });
});

// Inicializar servidor
async function start() {
  try {
    const dbConnected = await initializeDatabase();
    if (!dbConnected) {
      console.error("Falha ao conectar ao banco de dados");
      process.exit(1);
    }

    app.listen(PORT, () => {
      console.log(`[SERVER] Comitiva rodando em http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Erro ao iniciar servidor:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[SERVER] Encerrando...");
  await closeDatabase();
  process.exit(0);
});

start();
