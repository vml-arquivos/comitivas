/**
 * Logos das contratadas para uso nos PDFs de contratos.
 * Lidas em runtime via fs.readFileSync para não inflar o bundle do esbuild.
 * Os arquivos PNG ficam em server/assets/ e são copiados para dist/assets/ no Dockerfile.
 */
import fs from "fs";
import path from "path";

// Nota: não usamos import.meta.url aqui porque o esbuild empacota o
// servidor em CommonJS (server/index.ts -> dist/index.js), e nesse
// formato import.meta.url fica vazio, o que quebra fileURLToPath em
// runtime. Resolvemos os caminhos a partir do diretório de execução
// (process.cwd(), que no container é /app) cobrindo tanto o layout de
// dev (packages/contract-engine/assets, server/assets) quanto o layout
// de produção (dist + assets copiados pelo Dockerfile).
function loadLogoB64(filename: string): string {
  try {
    const candidates = [
      path.join(process.cwd(), "packages", "contract-engine", "assets", filename),
      path.join(process.cwd(), "packages", "brand", "assets", filename),
      path.join(process.cwd(), "server", "assets", filename),
      path.join(process.cwd(), "dist", "assets", filename),
      path.join(process.cwd(), "assets", filename),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p);
        return `data:image/png;base64,${buf.toString("base64")}`;
      }
    }
    console.warn(`[logo_constants] Logo não encontrada: ${filename}`);
    return "";
  } catch (e) {
    console.warn(`[logo_constants] Erro ao carregar logo ${filename}:`, e);
    return "";
  }
}

export const DESTRAVA_LOGO_B64: string = loadLogoB64("logo-destrava.png");
export const PERMUPAY_LOGO_B64: string = loadLogoB64("logo-permupay.png");
export const COMITIVA_LOGO_B64: string = loadLogoB64("logo.png");
export const COMITIVA_LOGO_PDF_B64: string = loadLogoB64("logo-pdf.png");
