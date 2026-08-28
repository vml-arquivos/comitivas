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
import { PaymentGatewayAdapter } from "./services/paymentGatewayAdapter.js";
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
PaymentGatewayAdapter.validarConfiguracaoSegura({ strict: false });

const app = express();
const PORT = process.env.PORT || 3000;
const trustedProxyIps = new Set((process.env.TRUSTED_PROXY_IPS || "127.0.0.1,::1").split(",").map((value) => value.trim()).filter(Boolean));
app.set("trust proxy", (ip: string) => trustedProxyIps.has(ip));
const limiteOtp = rateLimit({ windowMs: 15 * 60 * 1000, max: process.env.NODE_ENV === "production" ? 10 : 1_000, standardHeaders: "draft-7", legacyHeaders: false, message: { erro: "Muitas tentativas de validação. Aguarde alguns minutos." } });
const limiteWebhook = rateLimit({ windowMs: 60 * 1000, max: process.env.NODE_ENV === "production" ? 120 : 1_000, standardHeaders: "draft-7", legacyHeaders: false, message: { erro: "Muitos eventos recebidos. Tente novamente." } });
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
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.cora.com.br", "https://matls-clients.api.cora.com.br"],
      frameSrc: ["https://www.youtube-nocookie.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: "1mb", verify: (req, _res, buffer) => { (req as any).rawBody = Buffer.from(buffer); } }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
const configuredWebOrigins = (process.env.WEB_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedWebOrigins = new Set([
  ...(process.env.NODE_ENV === "production" ? ["https://excursaodascomitivas.com.br"] : ["http://localhost:5173"]),
  ...configuredWebOrigins,
]);
app.use(cors({
  origin: (origin, callback) => {
    // Requests without an Origin (healthcheck, curl and server-to-server) remain valid.
    if (!origin || allowedWebOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origem web não autorizada"));
  },
  credentials: true,
}));

// Servir o frontend (SPA) já buildado pelo Vite — o mesmo container
// atende tanto a API (/api/*) quanto o site oficial da Comitivas no mesmo host.
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
app.use("/api/contratos/otp", limiteOtp);
app.use("/api/contratos", authMiddleware, contratosRoutes);

// Rotas de pagamentos (autenticado)
app.use("/api/pagamentos/webhook/cora", limiteWebhook);
app.use("/api/pagamentos", pagamentosRoutes);

// Rotas de e-mails (autenticado)
app.use("/api/emails", emailsRoutes);

// Rotas de cupons (admin)
app.use("/api/cupons", authMiddleware, requireRole("admin"), cupomsRoutes);

// Rotas de jornada CRM (autenticado)
app.use("/api/jornada", jornadadRoutes);

// O router administrativo aplica autenticação e escopo por rota: vendedor
// acessa apenas o dashboard da própria carteira; demais endpoints são admin.
app.use("/api/admin", adminRoutes);

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
