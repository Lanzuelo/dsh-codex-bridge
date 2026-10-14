import { spawn } from 'node:child_process';
import { BridgeError } from './errors.mjs';

// Explicit discovery only; does not migrate execution from exec to app-server.
export function discoverModels(executable = 'codex', { signal, timeout = 25_000, env = process.env, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['app-server', '--stdio', '-c', 'forced_login_method="chatgpt"', '-c', 'model_provider="openai"'], { cwd, env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '', bytes = 0, result = [], nextId = 2, finished = false, outcome;
    const send = value => child.stdin.write(JSON.stringify(value) + '\n');
    function finish(error) {
      if (finished) return; finished = true;
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      outcome = error;
      child.stdin.end(); child.kill();
    }
    const abort = () => finish(new BridgeError('cancelled', 'Операция отменена.'));
    const timer = setTimeout(() => finish(new BridgeError('catalog', 'Каталог недоступен. Укажите поддерживаемый ID вручную; автоматической замены нет.')), timeout);
    child.on('error', () => finish(new BridgeError('catalog', 'Не удалось запустить Codex app-server.')));
    child.on('close', () => {
      if (!finished) return finish(new BridgeError('catalog', 'App-server завершился до получения каталога.'));
      if (outcome) reject(outcome); else resolve(result);
    });
    child.stdin.on('error', () => {}); child.stderr.resume(); child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      bytes += Buffer.byteLength(chunk); buffer += chunk;
      if (bytes > 1_000_000) return finish(new BridgeError('catalog', 'Превышен размер каталога.'));
      while (buffer.includes('\n')) {
        const end = buffer.indexOf('\n'), line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let message; try { message = JSON.parse(line); } catch { continue; }
        // Refuse any server-initiated request; discovery has no reason to approve work.
        if (message.method && message.id !== undefined) { send({ id: message.id, error: { code: -32601, message: 'Discovery only' } }); continue; }
        if (message.error) return finish(new BridgeError('catalog', 'Метод model/list не поддержан или каталог недоступен.'));
        if (message.id === 1) {
          send({ method: 'initialized', params: {} });
          send({ id: nextId, method: 'model/list', params: { limit: 100, includeHidden: false } });
        } else if (message.id === nextId && message.result) {
          const page = message.result;
          if (!Array.isArray(page.data) || result.length + page.data.length > 500) return finish(new BridgeError('catalog', 'Некорректный каталог моделей.'));
          for (const model of page.data) {
            if (typeof model.model !== 'string' || typeof model.displayName !== 'string') return finish(new BridgeError('catalog', 'Некорректная запись модели.'));
            result.push({ id: model.model, name: model.displayName, default: model.isDefault === true });
          }
          if (page.nextCursor) send({ id: ++nextId, method: 'model/list', params: { limit: 100, includeHidden: false, cursor: page.nextCursor } });
          else finish();
        }
      }
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) return abort();
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'dsh_codex_bridge', title: 'DSH Codex Bridge', version: '0.1.0' } } });
  });
}
