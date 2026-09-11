import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const argumentos = process.argv.slice(2);
const somenteWeb = argumentos.some((arg) => arg === '--host' || arg.startsWith('--host='));

function iniciar(comando, args) {
  return spawn(comando, args, {
    stdio: 'inherit',
    env: process.env,
  });
}

if (somenteWeb) {
  const web = iniciar(npm, ['--prefix', 'apps/web', 'run', 'dev', '--', ...argumentos]);
  web.on('exit', (codigo, sinal) => {
    if (sinal) process.kill(process.pid, sinal);
    process.exit(codigo ?? 0);
  });
} else {
  const filhos = [
    iniciar(npm, ['run', 'dev:server']),
    iniciar(npm, ['--prefix', 'apps/web', 'run', 'dev']),
  ];

  let encerrando = false;
  const encerrar = (sinal = 'SIGTERM') => {
    if (encerrando) return;
    encerrando = true;
    for (const filho of filhos) {
      if (!filho.killed) filho.kill(sinal);
    }
  };

  process.on('SIGINT', () => encerrar('SIGINT'));
  process.on('SIGTERM', () => encerrar('SIGTERM'));

  for (const filho of filhos) {
    filho.on('exit', (codigo) => {
      if (!encerrando && codigo && codigo !== 0) {
        encerrar();
        process.exitCode = codigo;
      }
    });
  }
}
