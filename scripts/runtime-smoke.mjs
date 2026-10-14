import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Context } from '@deepseek-ai/cordis';
import CommandRuntime from '@deepseek-ai/dsh-commands';
import { applyEntryPatches } from '@deepseek-ai/cordis-plugin-include';
import { load } from 'js-yaml';
import * as plugin from '../src/index.mjs';

// Exercise the real bundle-patch composition, not only direct module mounting.
// A plain {id,name} row is an override and silently skips a missing row.
const warnings = [];
const broken = applyEntryPatches([], [{ id: 'codex-bridge', name: 'dsh-codex-architect' }], message => warnings.push(message));
assert.equal(broken.length, 0);
assert.equal(warnings.length, 1);
const patch = load(await fs.readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'));
const entries = applyEntryPatches([], patch, message => { throw new Error(message); });
assert.equal(entries.length, 1);
assert.equal(entries[0].id, 'codex-bridge');
assert.equal(entries[0].name, 'dsh-codex-architect');

const ctx = new Context();
const commandsFiber = ctx.plugin(CommandRuntime);
await commandsFiber;
const pluginFiber = ctx.plugin(plugin, { stateDirectory: path.resolve('.compat/runtime-smoke-state') });
await pluginFiber;
try {
  const events = [];
  const agent = { status: 'idle', session: { id: 'smoke', header: { cwd: process.cwd() }, append(type, data) { events.push({ type, data }); return events.length - 1; } } };
  const commands = ctx.commands.list(agent);
  assert(commands.some(command => command.name === 'codex'));
  const value = await ctx.commands.execute(agent, '/codex help', [], new AbortController().signal);
  assert.equal(value.result.kind, 'success');
  assert.match(value.result.text, /DSH Codex Bridge/);
  const status = await ctx.commands.execute(agent, '/codex status', [], new AbortController().signal);
  assert.equal(status.result.kind, 'success');
  assert.equal(events.length, 4);
  assert(events.every(event => event.type === 'command/run' || event.type === 'command/done'));
  console.log('Harness 0.2.0-rc.2: actual bundle composition, Cordis + CommandRuntime registration, dispatch, lifecycle and unload OK. No model messages.');
} finally { await pluginFiber.dispose(); await commandsFiber.dispose(); }
