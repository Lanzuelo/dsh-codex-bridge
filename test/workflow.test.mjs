import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Bridge } from '../src/bridge.mjs';
import { BridgeError } from '../src/errors.mjs';
import { buildExecArgs } from '../src/codex.mjs';
const output = extra => ({ status: 'complete', summary: 'summary', handoff: 'short handoff', files: [], options: [], findings: [], ...extra });
async function setup(t, run) {
  await fs.mkdir('.compat/tests', { recursive: true });
  const temp = await fs.mkdtemp(path.resolve('.compat/tests/bridge-flow-')); t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'project'); await fs.mkdir(root);
  const runner = { run, auth: async () => {} };
  const context = async () => ({ root, context: { files: [], selected: [], omitted: [], tree: [], changed: [] }, hasChanges: true });
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
  assert.equal((await invoke(`handoff ${scaffold.id} implement`)).kind, 'success');
  assert.match(invoke.sent, /short handoff/);
  assert.equal((await invoke(`show ${scaffold.id}`, 'other-session')).kind, 'error');
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
