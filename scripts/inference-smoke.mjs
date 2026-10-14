import fs from 'node:fs/promises';
import path from 'node:path';
import { CodexRunner } from '../src/codex.mjs';
import { runProcess } from '../src/process.mjs';
import { sha } from '../src/paths.mjs';
const executable = process.argv[2] || 'codex';
const model = process.argv[3] || null;
const stateDirectory = path.resolve('.compat/inference-smoke');
await fs.mkdir(stateDirectory, { recursive: true });
const runner = new CodexRunner({ executable, stateDirectory, timeout: 120_000,
  processRunner: async (...args) => {
    const result = await runProcess(...args);
    if (result.code) console.error('Codex diagnostic:', result.code, result.stderr.slice(-3000));
    return result;
  }
});
const content = 'export const sum = (a, b) => a + b;\n';
const result = await runner.run({ kind: 'review', model, request: 'Короткая smoke-проверка: проверь единственную функцию в снимке. Не используй инструменты. Не выдумывай ошибки.', context: { tree: ['sum.js'], changed: ['sum.js'], files: [{ path: 'sum.js', content, sha256: sha(content) }], omitted: [], diff: '', git: { available: false } } });
await fs.writeFile(path.join(stateDirectory, 'verified-result.json'), JSON.stringify({ model, result }, null, 2));
console.log(JSON.stringify({ model, status: result.status, summary: result.summary, findings: result.findings.length }));
