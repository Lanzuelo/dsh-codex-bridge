import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BridgeError } from './errors.mjs';

export async function cachedModels(env = process.env) {
  const home = env.CODEX_HOME || path.join(env.USERPROFILE || env.HOME || os.homedir(), '.codex');
  let cache;
  try { cache = JSON.parse(await fs.readFile(path.join(home, 'models_cache.json'), 'utf8')); } catch { return null; }
  if (!Array.isArray(cache.models) || cache.models.length > 500) return null;
  const visible = cache.models.filter(item => item?.visibility !== 'hide');
  if (!visible.length || visible.some(item => typeof item.slug !== 'string' || typeof item.display_name !== 'string')) return null;
  const defaultPriority = Math.min(...visible.map(item => Number.isFinite(item.priority) ? item.priority : Number.MAX_SAFE_INTEGER));
  return visible.map(item => ({ id: item.slug, name: item.display_name, default: item.priority === defaultPriority }));
}

// Explicit discovery only; does not migrate execution from exec to app-server.
export async function discoverModels(executable = 'codex', { signal, timeout = 25_000, env = process.env, cwd } = {}) {
  const cached = await cachedModels(env);
  if (cached) return cached;
  return discoverModelsFromServer(executable, { signal, timeout, env, cwd });
}

function discoverModelsFromServer(executable, { signal, timeout, env, cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['app-server', '--stdio', '-c', 'forced_login_method="chatgpt"', '-c', 'model_provider="openai"'], { cwd, env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '', bytes = 0, result = [], nextId = 2, finished = false, settled = false, outcome, shutdownTimer;
    const send = value => child.stdin.write(JSON.stringify(value) + '\n');
    function finish(error) {
      if (finished) return; finished = true;
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      outcome = error;
      child.stdin.end(); child.kill();
      // Some Windows Codex builds close their stdio handles without emitting a
      // final child `close` event. Never leave the command RPC pending forever.
      shutdownTimer = setTimeout(settle, 2_000);
    }
    function settle() {
      if (settled) return; settled = true;
      clearTimeout(timer); clearTimeout(shutdownTimer);
      signal?.removeEventListener('abort', abort);
      if (outcome) reject(outcome); else resolve(result);
    }
    const abort = () => finish(new BridgeError('cancelled', 'Операция отменена.'));
    const timer = setTimeout(() => finish(new BridgeError('catalog', 'Каталог недоступен. Укажите поддерживаемый ID вручную; автоматической замены нет.')), timeout);
    child.on('error', () => finish(new BridgeError('catalog', 'Не удалось запустить Codex app-server.')));
    child.on('close', () => {
      if (!finished) { finish(new BridgeError('catalog', 'App-server завершился до получения каталога.')); return settle(); }
      settle();
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
