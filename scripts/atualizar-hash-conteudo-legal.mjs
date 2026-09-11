import { createHash } from 'node:crypto';
import fs from 'node:fs';

const caminho = new URL('../packages/legal-content/regras-2026.1.json', import.meta.url);
const conteudo = JSON.parse(fs.readFileSync(caminho, 'utf8'));
conteudo.sha256 = createHash('sha256').update(conteudo.conteudo, 'utf8').digest('hex');
fs.writeFileSync(caminho, `${JSON.stringify(conteudo, null, 2)}\n`);
console.log(conteudo.sha256);
