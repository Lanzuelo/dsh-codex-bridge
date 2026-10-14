import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for (const directory of ['src', 'scripts', 'test']) {
  for (const file of await fs.readdir(directory).catch(() => [])) {
    if (!/\.[cm]?js$/.test(file)) continue;
    const result = spawnSync(process.execPath, ['--check', `${directory}/${file}`], { stdio: 'inherit', windowsHide: true });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log('Syntax OK');
