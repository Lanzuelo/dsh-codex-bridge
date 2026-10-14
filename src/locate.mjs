import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/** Resolve only known installation locations. An explicit administrator/user setting wins. */
export async function locateCodex(configured) {
  if (configured) return configured;
  if (process.platform !== 'win32') return 'codex';
  const base = path.join(os.homedir(), 'AppData/Local/OpenAI/Codex/bin');
  const folders = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
  const candidates = [];
  for (const entry of folders) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !/^[a-f0-9]+$/i.test(entry.name)) continue;
    const target = path.join(base, entry.name, 'codex.exe');
    try { const stat = await fs.stat(target); if (stat.isFile()) candidates.push({ target, time: stat.mtimeMs }); } catch { /* A concurrent app update may remove an old version. */ }
  }
  candidates.sort((a, b) => b.time - a.time);
  return candidates[0]?.target || 'codex';
}
