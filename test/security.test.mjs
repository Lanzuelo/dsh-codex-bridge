import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { safeTarget, relativePath, sha } from '../src/paths.mjs';
import { applyChanges, prepareChanges, restoreChanges, changeDigest } from '../src/changes.mjs';
import { Store } from '../src/store.mjs';
import { validateResult } from '../src/result.mjs';
import { collectContext } from '../src/context.mjs';
import { runProcess } from '../src/process.mjs';

async function fixture(t) {
  await fs.mkdir('.compat/tests', { recursive: true });
  const temporary = await fs.mkdtemp(path.resolve('.compat/tests/bridge-test-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'проект с пробелами'), state = path.join(temporary, 'state');
  await fs.mkdir(root); const store = new Store(state); await store.init();
  return { root, store, temporary };
}
const result = files => ({ status: 'complete', summary: 'ok', handoff: 'next', options: [], files, findings: [] });
async function proposal(root, files, originals = []) {
  const job = { id: '123456789abc', sessionId: 'test', root, result: result(files), context: { files: originals }, state: 'ready' };
  job.changes = await prepareChanges(job); job.digest = changeDigest(job.changes); return job;
}

test('rejects traversal, Windows aliases, alternate streams, secrets and instruction overwrite', () => {
  for (const file of ['../outside', 'C:/outside', 'a\\b', 'a//b', 'NUL.txt', 'x/CON', 'a.', 'a ', 'a:secret', '.git/config', '.env', '.env.local', '.aws/credentials', 'AGENTS.md', 'docs/agents.md', 'a|b']) {
    assert.throws(() => relativePath(file, { writing: true }), undefined, file);
  }
  assert.equal(relativePath('.env.example', { writing: true }), '.env.example');
});
test('rejects a junction escaping the workspace', async t => {
  const { root, temporary } = await fixture(t), outside = path.join(temporary, 'outside');
  await fs.mkdir(outside); await fs.symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(safeTarget(root, 'linked/data.txt'), /Ссылки/);
});
test('checkpoint restores bytes, refuses changed user files, supports Unicode paths', async t => {
  const { root, store } = await fixture(t), original = Buffer.from('original\r\n');
  await fs.writeFile(path.join(root, 'old.txt'), original);
  const job = await proposal(root, [{ path: 'old.txt', content: 'new\n' }, { path: 'новая папка/new.txt', content: 'создан' }], [{ path: 'old.txt', sha256: sha(original) }]);
  await applyChanges(job, store);
  assert.equal(await fs.readFile(path.join(root, 'old.txt'), 'utf8'), 'new\n');
  await fs.writeFile(path.join(root, 'old.txt'), 'user change');
  await assert.rejects(restoreChanges(job, store), /изменён/);
  assert.equal(await fs.readFile(path.join(root, 'новая папка/new.txt'), 'utf8'), 'создан');
  await fs.writeFile(path.join(root, 'old.txt'), 'new\n');
  await restoreChanges(job, store);
  assert.deepEqual(await fs.readFile(path.join(root, 'old.txt')), original);
  await assert.rejects(fs.stat(path.join(root, 'новая папка')), { code: 'ENOENT' });
});
test('stale proposal performs no partial writes and cannot overwrite unread files', async t => {
  const { root, store } = await fixture(t);
  const job = await proposal(root, [{ path: 'first.txt', content: 'first' }, { path: 'second.txt', content: 'second' }]);
  await fs.writeFile(path.join(root, 'second.txt'), 'user file');
  await assert.rejects(applyChanges(job, store), /изменилось/);
  await assert.rejects(fs.stat(path.join(root, 'first.txt')), { code: 'ENOENT' });
  await assert.rejects(proposal(root, [{ path: 'second.txt', content: 'replace' }]), /не был прочитан/);
});
test('strict results reject malformed findings, duplicate paths and review writes', () => {
  assert.throws(() => validateResult(result([{ path: 'x', content: 'x' }]), 'review'));
  assert.throws(() => validateResult(result([{ path: 'X', content: 'x' }, { path: 'x', content: 'x' }]), 'fix'));
  assert.throws(() => validateResult(result([{ path: 'src', content: 'x' }, { path: 'src/a.js', content: 'x' }]), 'fix'));
  assert.throws(() => validateResult({ ...result([]), findings: [{ severity: 'high', file: 'x', line: 0, end_line: 1, evidence: 'x', explanation: 'x', proposed_fix: 'x', confidence: 1 }] }, 'review'));
});
test('selected review excludes unrelated diffs and includes a local dependency', async t => {
  const { root } = await fixture(t);
  const git = async args => { const value = await runProcess('git', args, { cwd: root }); assert.equal(value.code, 0, value.stderr); };
  await git(['init']); await git(['config', 'user.email', 'test@example.invalid']); await git(['config', 'user.name', 'Test']);
  await fs.writeFile(path.join(root, 'a.js'), "import {x} from './dependency.js';\nexport const value=x;\n");
  await fs.writeFile(path.join(root, 'dependency.js'), 'export const x=1;\n');
  await fs.writeFile(path.join(root, 'unrelated.js'), 'export const unrelated=1;\n');
  await git(['add', '.']); await git(['commit', '-m', 'baseline']);
  await fs.appendFile(path.join(root, 'a.js'), '// reviewed\n');
  await fs.appendFile(path.join(root, 'unrelated.js'), '// should not be in diff\n');
  const snapshot = await collectContext(root, { review: true, selected: ['a.js'] });
  assert.match(snapshot.context.diff, /reviewed/); assert.doesNotMatch(snapshot.context.diff, /should not be in diff/);
  assert(snapshot.context.files.some(file => file.path === 'dependency.js'));
  assert(!snapshot.context.files.some(file => file.path === 'unrelated.js'));
});
test('Git snapshot captures staged, unstaged, deleted and untracked files without .env', async t => {
  const { root } = await fixture(t);
  const git = async args => { const value = await runProcess('git', args, { cwd: root }); assert.equal(value.code, 0, value.stderr); return value.stdout; };
  await git(['init']); await git(['config', 'user.email', 'test@example.invalid']); await git(['config', 'user.name', 'Test']);
  await fs.writeFile(path.join(root, 'a.txt'), 'before'); await fs.writeFile(path.join(root, 'deleted.txt'), 'gone');
  await git(['add', '.']); await git(['commit', '-m', 'baseline']);
  await fs.writeFile(path.join(root, 'a.txt'), 'staged'); await git(['add', 'a.txt']);
  await fs.writeFile(path.join(root, 'a.txt'), 'unstaged'); await fs.unlink(path.join(root, 'deleted.txt'));
  await fs.writeFile(path.join(root, 'new.txt'), 'new'); await fs.writeFile(path.join(root, '.env'), 'SECRET=do-not-send');
  const snapshot = await collectContext(root, { review: true });
  assert.match(snapshot.context.diff, /unstaged/);
  assert(snapshot.context.changed.includes('deleted.txt'));
  assert(snapshot.context.files.some(file => file.path === 'new.txt'));
  assert(!JSON.stringify(snapshot.context).includes('do-not-send'));
});
test('process cancellation terminates active child', async () => {
  const controller = new AbortController();
  const running = runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { signal: controller.signal });
  setTimeout(() => controller.abort(), 100);
  await assert.rejects(running, error => error.code === 'cancelled');
});
