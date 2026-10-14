import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

test('client module registers the panel and uses the existing scoped command RPC', async () => {
  let module, body, registration, tabType;
  const disposers = [], calls = [];
  const fakeReact = { createElement() {} };
  const window = { __ModuleLoader__: { load(value) { assert.equal(value.id, 'dsh-codex-bridge'); module = value.factory(name => { assert.equal(name, 'react'); return fakeReact; }); } } };
  vm.runInNewContext(await fs.readFile(new URL('../src/client.js', import.meta.url), 'utf8'), { window });
  const ctx = {
    effect(factory) { disposers.push(factory()); },
    sidebarRightTabs: { register(value) { tabType = value; return () => {}; } },
    slots: { inject(name, factory) { assert.equal(name, 'sidebar.right.pane.tab'); return factory(); }, register(value, component) { registration = value; body = component; return () => {}; } },
    remote: { commands: { async execute(...args) { calls.push(args); return { ok: true, value: { result: { kind: 'success', text: 'ok' } } }; } } }
  };
  module.apply(ctx);
  assert.equal(tabType.kind, 'codex-bridge'); assert.equal(typeof body, 'function');
  assert.equal(registration.key, tabType.id);
  assert.equal(calls.length, 0, 'registration must never start inference');
  const props = registration.inject('selected-session'), signal = new AbortController().signal;
  assert.equal((await props.execute(props.sessionId, 'review', signal)).text, 'ok');
  assert.equal(calls[0][0], 'selected-session'); assert.equal(calls[0][1], '/codex review'); assert.equal(calls[0][3], signal);
  ctx.remote.commands.execute = async () => ({ ok: false, error: new Error('offline') });
  await assert.rejects(props.execute('selected-session', 'review', signal), /offline/);
});
