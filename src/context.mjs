import fs from 'node:fs/promises';
import path from 'node:path';
import { runProcess } from './process.mjs';
import { ignoredDirectory, sensitive, readText, relativePath } from './paths.mjs';
import { BridgeError } from './errors.mjs';

const metadata = /(^|\/)(README[^/]*|AGENTS\.md|package\.json|tsconfig[^/]*\.json|pyproject\.toml|requirements\.txt|Cargo\.toml|go\.mod|pom\.xml|architecture\.md|deepseek-handoff\.md)$/i;
export async function collectContext(directory, { review = false, selected = [], signal, maxFiles = 60, maxBytes = 180_000 } = {}) {
  const root = await fs.realpath(directory);
  if (!path.isAbsolute(directory) || root === path.parse(root).root) throw new BridgeError('workspace', 'Выберите каталог проекта, а не корень диска.');
  const tree = []; let visited = 0;
  async function walk(dir, prefix = '') {
    for (const item of (await fs.readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      if (++visited > 12_000) throw new BridgeError('context-limit', 'В проекте слишком много файлов. Уточните рабочий каталог.');
      const file = prefix ? `${prefix}/${item.name}` : item.name;
      if (ignoredDirectory(item.name) || sensitive(file) || item.isSymbolicLink()) continue;
      if (item.isDirectory()) { if (file.split('/').length < 10) await walk(path.join(dir, item.name), file); }
      else if (item.isFile()) tree.push(file);
    }
  }
  await walk(root);
  selected.forEach(file => relativePath(file));
  const git = (args) => runProcess('git', ['--no-optional-locks', '--literal-pathspecs', '-c', 'core.quotepath=false', '-c', 'core.fsmonitor=false', ...args], { cwd: root, signal, timeout: 15_000, maxBytes: 300_000 });
  const gitState = await git(['rev-parse', '--show-toplevel']);
  const isGit = gitState.code === 0;
  // A nested project must not accidentally review the parent repository.
  if (isGit && await fs.realpath(gitState.stdout.trim()) !== root) throw new BridgeError('workspace', 'Рабочий каталог должен совпадать с корнем Git-репозитория.');
  let changed = [], diff = '', baseline = null;
  if (isGit) {
    const head = await git(['rev-parse', '--verify', 'HEAD']);
    baseline = head.code === 0 ? head.stdout.trim() : null;
    const tracked = await git(baseline ? ['diff', '--name-only', '-z', 'HEAD', '--'] : ['ls-files', '-z']);
    const untracked = await git(['ls-files', '--others', '--exclude-standard', '-z']);
    if (tracked.code || untracked.code) throw new BridgeError('git', 'Не удалось прочитать изменения Git.');
    changed = [...new Set((tracked.stdout + untracked.stdout).split('\0').filter(Boolean))];
    // Build diff only over allowed paths, without external diff/textconv commands.
    const allowed = (selected.length ? selected : changed).filter(file => { try { relativePath(file); return true; } catch { return false; } });
    if (baseline && allowed.length) {
      const result = await git(['diff', '--no-ext-diff', '--no-textconv', '--unified=3', 'HEAD', '--', ...allowed]);
      if (result.code) throw new BridgeError('git', 'Не удалось прочитать diff.');
      diff = result.stdout;
    }
  }
  const scope = selected.length ? selected : review ? changed : tree.filter(file => metadata.test(file));
  if (review && !isGit && !selected.length) throw new BridgeError('git', 'Без Git укажите файлы явно: /codex review src/file.js');
  if (selected.some(file => !tree.includes(file) && !changed.includes(file))) throw new BridgeError('path', 'Выбранный файл не найден в проекте.');
  const candidates = [...new Set([...scope, ...tree.filter(file => metadata.test(file))])];
  const files = [], omitted = []; let size = Buffer.byteLength(diff);
  if (size > maxBytes) throw new BridgeError('context-limit', 'Diff слишком велик. Выберите небольшой набор файлов.');
  let related = 0;
  for (const file of candidates) {
    if (!tree.includes(file)) { omitted.push({ path: file, reason: 'deleted-or-excluded' }); continue; }
    try {
      const record = await readText(root, file);
      if (files.length >= maxFiles || size + Buffer.byteLength(record.content) > maxBytes) { omitted.push({ path: file, reason: 'budget' }); continue; }
      size += Buffer.byteLength(record.content); files.push(record);
      // A small local-import closure brings immediate dependencies into review.
      if (review && related < 12 && /\.[cm]?[jt]sx?$/.test(file)) {
        for (const match of record.content.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"](\.[^'"]+)['"]/g)) {
          const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
          const resolved = [base, ...['.js', '.ts', '.jsx', '.tsx', '/index.js', '/index.ts'].map(ext => base + ext)].find(candidate => tree.includes(candidate));
          if (resolved && !candidates.includes(resolved) && related < 12) { candidates.push(resolved); related++; }
        }
      }
    } catch (error) { if (!(error instanceof BridgeError)) throw error; omitted.push({ path: file, reason: error.code }); }
  }
  if (selected.length && omitted.some(item => selected.includes(item.path))) throw new BridgeError('context-limit', 'Один из выбранных файлов исключён или превышает лимит.');
  return { root, context: { tree: tree.slice(0, 2000), treeTruncated: tree.length > 2000, git: { available: isGit, head: baseline }, changed, selected, diff, files, omitted }, hasChanges: scope.length > 0 };
}
