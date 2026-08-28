import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.error('INTEGRATION_BLOCKED: DATABASE_URL não configurada; não simular validação de PostgreSQL.');
  process.exit(2);
}
const resultado = spawnSync('npm', ['run', 'db:verify-contract-fields'], { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(resultado.status ?? 1);
