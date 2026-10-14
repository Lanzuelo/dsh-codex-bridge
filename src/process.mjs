import { spawn } from 'node:child_process';
import { BridgeError } from './errors.mjs';

export function runProcess(executable, args, { cwd, env = process.env, input, signal, timeout = 600_000, maxBytes = 4_000_000 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new BridgeError('cancelled', 'Операция отменена.'));
    const child = spawn(executable, args, { cwd, env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', size = 0, failure;
    function stop(error) {
      if (failure) return;
      failure = error;
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill());
        killer.on('exit', code => { if (code !== 0) child.kill(); });
      } else child.kill('SIGKILL');
    }
    const onAbort = () => stop(new BridgeError('cancelled', 'Операция отменена.'));
    const timer = setTimeout(() => stop(new BridgeError('timeout', 'Превышено время ожидания Codex. Автоматического повтора нет.')), timeout);
    signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    const collect = (channel, chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > maxBytes) return stop(new BridgeError('output-limit', 'Слишком большой вывод процесса.'));
      if (channel === 'stdout') stdout += chunk; else stderr += chunk;
    };
    child.stdout.on('data', chunk => collect('stdout', chunk));
    child.stderr.on('data', chunk => collect('stderr', chunk));
    child.stdin.on('error', () => {});
    child.on('error', error => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); reject(error); });
    child.on('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
      if (failure) reject(failure); else resolve({ code, stdout, stderr });
    });
    child.stdin.end(input);
    if (signal?.aborted) onAbort();
  });
}
