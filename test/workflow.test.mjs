import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Bridge } from '../src/bridge.mjs';
import { BridgeError } from '../src/errors.mjs';
import { buildExecArgs } from '../src/codex.mjs';
import { schemaFor, decodeResult } from '../src/result.mjs';
const output = extra => ({ status: 'complete', summary: 'summary', handoff: 'short handoff', files: [], options: [], findings: [], ...extra });
async function setup(t, run) {
  await fs.mkdir('.compat/tests', { recursive: true });
  const temp = await fs.mkdtemp(path.resolve('.compat/tests/bridge-flow-')); t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'project'); await fs.mkdir(root);
  const runner = { run, auth: async () => {} };
  const context = async (_root, options = {}) => ({ root, context: { files: [], selected: options.selected || [], omitted: [], tree: [], changed: [], git: { available: true, head: 'test' } }, hasChanges: true });
  const bridge = new Bridge({ stateDirectory: path.join(temp, 'state') }, { runner, context });
  const invoke = (rawInput, session = 'session') => bridge.handle({ rawInput, agent: { session: { id: session, header: { cwd: root } }, status: 'idle' } }, async text => { invoke.sent = text; });
  return { bridge, invoke, root };
}
test('plan -> selected scaffold -> explicit exact approval -> handoff', async t => {
  const { bridge, invoke, root } = await setup(t, async job => job.kind === 'plan' ? output({ options: [{ name: 'Node', rationale: 'reason', tree: 'src/' }] }) : output({ files: [{ path: 'docs/architecture.md', content: 'chosen architecture' }, { path: 'docs/deepseek-handoff.md', content: 'next task' }] }));
  assert.equal((await invoke('plan bot')).kind, 'success');
  const plan = (await bridge.store.jobs())[0]; assert.equal(plan.state, 'ready');
  await assert.rejects(fs.stat(path.join(root, 'docs')), { code: 'ENOENT' });
  assert.equal((await invoke(`scaffold ${plan.id} 1`)).kind, 'success');
  const scaffold = (await bridge.store.jobs()).find(job => job.kind === 'scaffold');
  assert.equal((await invoke(`apply ${scaffold.id} WRONG`)).kind, 'error');
  assert.equal((await invoke(`handoff ${scaffold.id} implement`)).kind, 'error');
  assert.equal((await invoke(`apply ${scaffold.id} ${scaffold.digest}`)).kind, 'success');
  assert.equal(await fs.readFile(path.join(root, 'docs/architecture.md'), 'utf8'), 'chosen architecture');
  assert.equal((await invoke(`handoff ${scaffold.id}`)).kind, 'success');
  assert.match(invoke.sent, /short handoff/);
  assert.equal((await invoke(`show ${scaffold.id}`, 'other-session')).kind, 'error');
});
test('incomplete review findings can go directly to DeepSeek or Codex without boilerplate', async t => {
  const finding = { severity: 'medium', file: 'src/a.js', line: 1, end_line: 1, evidence: 'bad()', explanation: 'broken', proposed_fix: 'fix it', confidence: 0.9 };
  const calls = [];
  const { bridge, invoke } = await setup(t, async job => {
    calls.push(job);
    return job.kind === 'review' ? output({ status: 'incomplete', summary: 'No Git baseline', findings: [finding] }) : output({ files: [{ path: 'src/a.js', content: 'export const ok = true;\n' }] });
  });
  assert.equal((await invoke('review')).kind, 'success');
  const review = (await bridge.store.jobs()).find(job => job.kind === 'review');
  assert.equal(review.state, 'incomplete');
  assert.equal((await invoke(`handoff ${review.id}`)).kind, 'success');
  assert.match(invoke.sent, /Исправь все найденные замечания/);
  assert.match(invoke.sent, /Ограничение исходного отчёта/);
  assert.equal((await invoke(`fix ${review.id}`)).kind, 'success');
  assert.equal(calls.at(-1).kind, 'fix');
  assert.match(calls.at(-1).request, /Исправь все найденные замечания/);
});
test('incomplete review without findings cannot create an empty handoff or fix', async t => {
  const { bridge, invoke } = await setup(t, async () => output({ status: 'incomplete', summary: 'Nothing reviewable', handoff: 'generic' }));
  await invoke('review');
  const review = (await bridge.store.jobs())[0];
  assert.equal((await invoke(`handoff ${review.id}`)).kind, 'error');
  assert.equal((await invoke(`fix ${review.id}`)).kind, 'error');
});
test('review syntax separates automatic scope, focus and explicit files', async t => {
  const snapshots = [];
  const { bridge, invoke } = await setup(t, async job => { snapshots.push(job); return output(); });
  assert.equal((await invoke('review focus localStorage failures')).kind, 'success');
  assert.match(snapshots.at(-1).request, /localStorage failures/);
  assert.equal((await invoke('review files src/a.js|src/b.js --focus validation')).kind, 'success');
  assert.deepEqual(snapshots.at(-1).context.selected, ['src/a.js', 'src/b.js']);
  assert.equal((await invoke('review arbitrary words')).kind, 'error');
});
test('DeepSeek mode delegates directly and never starts Codex', async t => {
  let runs = 0;
  const { invoke } = await setup(t, async () => { runs++; return output(); });
  const response = await invoke('deepseek Создай проект и запусти тесты');
  assert.equal(response.kind, 'success');
  assert.equal(runs, 0);
  assert.match(invoke.sent, /Создай проект и запусти тесты/);
  assert.match(invoke.sent, /Не запускай Codex/);
});
test('dashboard exposes actions and findings without captured source contents', async t => {
  const finding = { severity: 'high', file: 'src/a.js', line: 1, end_line: 1, evidence: 'bad()', explanation: 'broken', proposed_fix: 'fix it', confidence: 1 };
  const { invoke } = await setup(t, async () => output({ status: 'incomplete', summary: 'limited', findings: [finding] }));
  await invoke('review');
  const response = await invoke('dashboard');
  const dashboard = JSON.parse(response.text);
  assert.equal(dashboard.jobs.length, 1);
  assert.equal(dashboard.jobs[0].findings[0].file, 'src/a.js');
  assert.equal(dashboard.jobs[0].limited, true);
  assert(!Object.hasOwn(dashboard.jobs[0], 'context'));
});
test('scaffold schema gives fixed root paths to required documents', () => {
  const schema = schemaFor('scaffold');
  assert(schema.required.includes('documents'));
  const value = output({ files: [{ path: 'src/app.js', content: 'export {}' }], documents: { architecture: '# Architecture', deepseek_handoff: '# Handoff' } });
  const decoded = decodeResult(value, 'scaffold');
  assert.deepEqual(decoded.files.map(file => file.path), ['src/app.js', 'docs/architecture.md', 'docs/deepseek-handoff.md']);
  assert(!Object.hasOwn(decoded, 'documents'));
});
test('quota persists, blocks new jobs, retries only explicitly and preserves selected model', async t => {
  let calls = 0;
  const { bridge, invoke } = await setup(t, async () => { calls++; if (calls === 1) throw new BridgeError('quota', 'quota'); return output({ options: [{ name: 'a', rationale: 'r', tree: 't' }] }); });
  await invoke('model all supported-model');
  assert.equal((await invoke('plan first')).kind, 'error');
  const job = (await bridge.store.jobs())[0]; assert.equal(job.state, 'paused-quota');
  await invoke('plan second'); assert.equal(calls, 1);
  await invoke(`retry ${job.id}`); assert.equal(calls, 2);
  assert.equal((await bridge.store.read(`job-${job.id}`)).model, 'supported-model');
});
test('unavailable model warns, does not switch or retry without a user command', async t => {
  let calls = 0;
  const { bridge, invoke } = await setup(t, async () => { calls++; throw new BridgeError('model', 'Выберите другую модель'); });
  await invoke('model review unavailable');
  const response = await invoke('review'); assert.match(response.text, /Выберите другую/);
  assert.equal(calls, 1);
  const job = (await bridge.store.jobs())[0]; assert.equal(job.state, 'paused-model'); assert.equal(job.model, 'unavailable');
  assert.equal((await bridge.store.read('settings')).models.review, 'unavailable');
});
test('read-only CLI invocation has no API fallback, no shell interpolation and no project cwd', () => {
  const args = buildExecArgs({ model: 'valid/model', schema: 'schema path', output: 'output path' });
  assert(args.includes('read-only')); assert(args.includes('--ignore-user-config'));
  assert(args.includes('forced_login_method="chatgpt"')); assert(!args.includes('--dangerously-bypass-approvals-and-sandbox'));
  assert.throws(() => buildExecArgs({ model: 'x;evil', schema: 's', output: 'o' }));
});
