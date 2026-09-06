import path from 'node:path';
import { fileURLToPath } from 'node:url';

const diretorioAtual = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: {
      config: path.join(diretorioAtual, 'tailwind.config.js'),
    },
    autoprefixer: {},
  },
}
