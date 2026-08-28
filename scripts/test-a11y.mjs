import fs from 'node:fs';

const htmlPath = new URL('../apps/web/dist/index.html', import.meta.url);
if (!fs.existsSync(htmlPath)) {
  console.error('A11Y_BLOCKED: execute npm run build antes da validação de acessibilidade.');
  process.exit(2);
}
const html = fs.readFileSync(htmlPath, 'utf8');
const checks = [
  ['root React', /id="root"/i],
  ['viewport', /name="viewport"/i],
  ['charset', /charset="utf-8"/i],
];
const faltantes = checks.filter(([, pattern]) => !pattern.test(html)).map(([nome]) => nome);
if (faltantes.length) {
  console.error(`A11Y_FAILED: marcadores ausentes: ${faltantes.join(', ')}`);
  process.exit(1);
}
console.log('A11Y_STATIC_PASS: shell publicado contém viewport, charset e ponto de montagem; executar axe/manual no ambiente publicado para validação completa.');
