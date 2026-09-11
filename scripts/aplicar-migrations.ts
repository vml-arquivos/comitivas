import "dotenv/config";
import { initializeDatabase, closeDatabase } from "../server/db/index.js";

const sucesso = await initializeDatabase();
await closeDatabase();

if (!sucesso) {
  process.exit(1);
}

console.log("[MIGRATION] Aplicação e validação concluídas");
