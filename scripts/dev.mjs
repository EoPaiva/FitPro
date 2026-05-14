import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const children = [];

function quoteForCmd(value) {
  const text = String(value);
  if (/^[a-zA-Z0-9_./:\\=-]+$/.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

function spawnSafe(command, args = []) {
  if (isWin) {
    const line = [command, ...args].map(quoteForCmd).join(' ');
    return spawn('cmd.exe', ['/d', '/s', '/c', line], {
      stdio: 'inherit',
      windowsHide: false
    });
  }

  return spawn(command, args, {
    stdio: 'inherit',
    shell: false
  });
}

function start(name, command, args) {
  const child = spawnSafe(command, args);
  children.push(child);

  child.on('error', error => {
    console.error(`\n[FitPro] Falha ao iniciar ${name}:`, error.message);
    shutdown(1);
  });

  child.on('exit', code => {
    if (code && code !== 0) {
      console.error(`\n[FitPro] ${name} encerrou com código ${code}.`);
      shutdown(code);
    }
  });

  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      try {
        if (isWin) child.kill();
        else child.kill('SIGTERM');
      } catch {}
    }
  }
  process.exit(code);
}

console.log('[FitPro] Iniciando API em http://localhost:3333');
start('API', 'node', ['--watch', 'server/index.mjs']);

console.log('[FitPro] Iniciando frontend em http://localhost:5173');
start('Frontend', 'npm', ['run', 'client']);

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
