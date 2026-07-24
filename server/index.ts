import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { initializeDatabase, closeDatabase } from "./db/index.js";
import { authMiddleware, requireRole } from "./middleware/authMiddleware.js";
import { followupScheduler } from "./services/followupScheduler.js";
import { AuthService } from "./services/authService.js";
import authRoutes from "./routes/auth.js";
import publicoRoutes from "./routes/publico.js";
import eventosRoutes from "./routes/eventos.js";
import lotesRoutes from "./routes/lotes.js";
import pacotesRoutes from "./routes/pacotes.js";
import contratosRoutes from "./routes/contratos.js";
import pagamentosRoutes from "./routes/pagamentos.js";
import emailsRoutes from "./routes/emails.js";
import cupomsRoutes from "./routes/cupons.js";
import jornadadRoutes from "./routes/jornada.js";
import adminRoutes from "./routes/admin.js";

dotenv.config();
AuthService.validarConfiguracaoSegura();

const app = express();
const PORT = process.env.PORT || 3000;
const limiteAutenticacao = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 20 : 1_000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { erro: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente." },
});

// Middleware
app.disable("x-powered-by");
app.use(helmet({
  // O frontend inclui JSON-LD e estilos processados pelo Vite; uma política CSP
  // estrita deve ser configurada no proxy de produção após inventariar esses ativos.
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cors({
  origin: process.env.WEB_URL || "http://localhost:5173",
  credentials: true,
}));

// Servir o frontend (SPA) já buildado pelo Vite — o mesmo container
// atende tanto a API (/api/*) quanto o site em comitivas.permupay.com.br
const webDistPath = path.join(process.cwd(), "apps", "web", "dist");
app.use(express.static(webDistPath));

// Rotas públicas
app.use("/api/auth", limiteAutenticacao, authRoutes);
app.use("/api/publico", publicoRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Rotas de eventos (público para listar, admin para criar/editar)
app.use("/api/eventos", eventosRoutes);

// Rotas de lotes (público para listar, admin para criar/editar)
app.use("/api/lotes", lotesRoutes);

// Rotas de pacotes (público para listar, autenticado para reservar)
app.use("/api/pacotes", pacotesRoutes);

// Rotas de contratos (autenticado)
app.use("/api/contratos", authMiddleware, contratosRoutes);

// Rotas de pagamentos (autenticado)
app.use("/api/pagamentos", pagamentosRoutes);

// Rotas de e-mails (autenticado)
app.use("/api/emails", emailsRoutes);

// Rotas de cupons (admin)
app.use("/api/cupons", authMiddleware, requireRole("admin"), cupomsRoutes);

// Rotas de jornada CRM (autenticado)
app.use("/api/jornada", jornadadRoutes);

// Rotas administrativas (admin)
app.use("/api/admin", authMiddleware, requireRole("admin"), adminRoutes);

// Fallback de SPA: qualquer rota GET que não seja /api/* devolve o index.html,
// deixando o React Router decidir a tela (ex.: /eventos, /login, /minhas-reservas)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(webDistPath, "index.html"), (err) => {
    if (err) next(err);
  });
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

    // Iniciar scheduler de follow-up automatico
    const followupInterval = parseInt(process.env.FOLLOWUP_CHECK_INTERVAL_MINUTOS || '5', 10);
    followupScheduler.start(followupInterval);

    app.listen(PORT, () => {
      console.log(`[SERVER] Comitiva rodando em http://localhost:${PORT}`);
      console.log(`[SERVER] Follow-up scheduler ativo (intervalo: ${followupInterval} minutos)`);
    });
  } catch (error) {
    console.error("Erro ao iniciar servidor:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[SERVER] Encerrando...");
  followupScheduler.stop();
  await closeDatabase();
  process.exit(0);
});

start();
