import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { BridgeError } from './errors.mjs';

export const sha = value => createHash('sha256').update(value).digest('hex');
export const ignoredDirectory = name => /^(\.git|\.hg|\.svn|node_modules|\.venv|venv|dist|build|coverage|\.next|\.compat|\.aws|\.ssh|\.codex|\.agents|\.dsh-codex-bridge)$/i.test(name);
export function sensitive(file) {
  return file.split('/').some(part => /^(\.env(?!\.example$).*|\.npmrc|\.pypirc|auth\.json|credentials.*|secrets?.*|id_rsa.*|id_ed25519.*)$/i.test(part) || /\.(pem|key|p12|pfx|keystore)$/i.test(part));
}
export function relativePath(file, { writing = false } = {}) {
  if (typeof file !== 'string' || !file || file.length > 220 || /[\\:\x00-\x1f]/.test(file) || file.startsWith('/') || file.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /[<>"|?*]/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) {
    throw new BridgeError('path', `Недопустимый относительный путь: ${String(file)}`);
  }
  if (file.split('/').some(ignoredDirectory) || sensitive(file) || (writing && /(^|\/)AGENTS\.md$/i.test(file))) {
    throw new BridgeError('path', `Путь исключён из обработки: ${file}`);
  }
  return file;
}
export async function safeTarget(root, file, options) {
  relativePath(file, options);
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new BridgeError('workspace', 'Корень проекта изменился или является ссылкой.');
  let target = root;
  for (const part of file.split('/')) {
    target = path.join(target, part);
    try {
      const stat = await fs.lstat(target);
      if (stat.isSymbolicLink()) throw new BridgeError('symlink', `Ссылки и junction не поддерживаются: ${file}`);
      if (target !== path.join(root, file) && !stat.isDirectory()) throw new BridgeError('path', `Родитель не является каталогом: ${file}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}
export async function readText(root, file, maxBytes = 64_000) {
  const target = await safeTarget(root, file);
  const stat = await fs.stat(target);
  if (!stat.isFile() || stat.size > maxBytes) throw new BridgeError('file-limit', `Файл слишком большой или не текстовый: ${file}`);
  const bytes = await fs.readFile(target);
  if (bytes.includes(0)) throw new BridgeError('binary', `Двоичный файл исключён: ${file}`);
  return { path: file, content: bytes.toString('utf8'), sha256: sha(bytes) };
}
