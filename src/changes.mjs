import fs from 'node:fs/promises';
import path from 'node:path';
import { safeTarget, sha } from './paths.mjs';
import { BridgeError } from './errors.mjs';

async function currentBytes(root, file) {
  const target = await safeTarget(root, file, { writing: true });
  try {
    const stat = await fs.stat(target);
    if (!stat.isFile() || stat.size > 500_000) throw new BridgeError('file-limit', `Нельзя заменить этот файл: ${file}`);
    return await fs.readFile(target);
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function prepareChanges(job) {
  const records = [];
  const paths = job.result.files.map(file => file.path.toLowerCase());
  if (new Set(paths).size !== paths.length || paths.some(file => paths.some(other => other.startsWith(file + '/')))) throw new BridgeError('path', 'Пути предложения конфликтуют.');
  for (const file of job.result.files) {
    const before = await currentBytes(job.root, file.path);
    const captured = job.context.files.find(record => record.path === file.path);
    if (before && (!captured || captured.sha256 !== sha(before))) throw new BridgeError('stale', `Файл изменён после снимка или не был прочитан: ${file.path}. Создайте новое предложение.`);
    if (!before && captured) throw new BridgeError('stale', `Файл удалён после снимка: ${file.path}.`);
    records.push({ path: file.path, before: before?.toString('base64') ?? null, beforeSha: before ? sha(before) : null, after: file.content, afterSha: sha(file.content) });
  }
  return records;
}
export const changeDigest = records => sha(JSON.stringify(records)).slice(0, 16);

async function verifyRecords(root, records, side) {
  for (const record of records) {
    const bytes = await currentBytes(root, record.path), actual = bytes === null ? null : sha(bytes);
    if (actual !== record[side]) throw new BridgeError('stale', `Содержимое изменилось: ${record.path}. Операция отменена до записи.`);
  }
}

export async function applyChanges(job, store) {
  if (!job.changes?.length || job.state !== 'ready' || job.result.status !== 'complete') throw new BridgeError('state', 'Нет готового предложения для применения.');
  await verifyRecords(job.root, job.changes, 'beforeSha');
  const checkpoint = { jobId: job.id, root: job.root, sessionId: job.sessionId, digest: job.digest, state: 'prepared', changes: job.changes, completed: [], createdDirectories: [] };
  // Durable intent before any project write. Recovery is explicit, never automatic.
  await store.write(`checkpoint-${job.id}`, checkpoint);
  try {
    for (const record of job.changes) {
      const target = await safeTarget(job.root, record.path, { writing: true });
      // Recheck just before replacing each file as well as the complete preflight.
      await verifyRecords(job.root, [record], 'beforeSha');
      const parent = path.dirname(target);
      const missing = [];
      for (let dir = parent; dir !== job.root; dir = path.dirname(dir)) {
        try { await fs.lstat(dir); break; } catch (error) { if (error.code !== 'ENOENT') throw error; missing.push(dir); }
      }
      for (const dir of missing.reverse()) {
        checkpoint.createdDirectories.push(dir); await store.write(`checkpoint-${job.id}`, checkpoint);
        await fs.mkdir(dir);
      }
      // Record pending before the atomic rename so recovery covers a process crash.
      checkpoint.pending = record.path; await store.write(`checkpoint-${job.id}`, checkpoint);
      const temp = path.join(parent, `.codex-bridge-${job.id}.tmp`);
      await fs.writeFile(temp, record.after, { flag: 'wx', mode: 0o600 });
      try {
        await safeTarget(job.root, record.path, { writing: true });
        await verifyRecords(job.root, [record], 'beforeSha');
        await fs.rename(temp, target);
      } finally { await fs.unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
      checkpoint.completed.push(record.path); delete checkpoint.pending;
      await store.write(`checkpoint-${job.id}`, checkpoint);
    }
    checkpoint.state = 'applied'; await store.write(`checkpoint-${job.id}`, checkpoint);
  } catch (error) {
    checkpoint.state = 'needs-recovery'; await store.write(`checkpoint-${job.id}`, checkpoint);
    throw new BridgeError('recovery', `Применение остановлено. Контрольная точка сохранена; /codex restore ${job.id} ${job.digest}. Причина: ${error.message}`);
  }
  job.state = 'applied'; await store.write(`job-${job.id}`, job);
}

export async function restoreChanges(job, store) {
  const checkpoint = await store.read(`checkpoint-${job.id}`);
  if (!checkpoint || checkpoint.root !== job.root || checkpoint.digest !== job.digest || checkpoint.sessionId !== job.sessionId || checkpoint.state === 'restored') throw new BridgeError('checkpoint', 'Подходящей контрольной точки нет.');
  const restore = [];
  // Preflight every target before reverting anything; don't clobber later user edits.
  const touched = new Set([...checkpoint.completed, checkpoint.pending].filter(Boolean));
  for (const record of checkpoint.changes.filter(record => touched.has(record.path))) {
    const bytes = await currentBytes(job.root, record.path), actual = bytes === null ? null : sha(bytes);
    if (actual === record.beforeSha) continue;
    if (actual !== record.afterSha) throw new BridgeError('stale', `После применения изменён ${record.path}. Автоматический откат запрещён; оригинал сохранён в checkpoint.`);
    restore.push(record);
  }
  for (const record of restore.reverse()) {
    await verifyRecords(job.root, [record], 'afterSha');
    const target = await safeTarget(job.root, record.path, { writing: true });
    if (record.before === null) await fs.unlink(target);
    else {
      const temp = `${target}.codex-bridge-restore-${job.id}.tmp`;
      await fs.writeFile(temp, Buffer.from(record.before, 'base64'), { flag: 'wx' });
      try { await fs.rename(temp, target); } finally { await fs.unlink(temp).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
    }
  }
  for (const directory of [...checkpoint.createdDirectories].reverse()) {
    // rmdir only removes an empty directory created by this transaction.
    if (directory.startsWith(job.root + path.sep)) await fs.rmdir(directory).catch(error => { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error; });
  }
  checkpoint.state = 'restored'; await store.write(`checkpoint-${job.id}`, checkpoint);
  job.state = 'restored'; await store.write(`job-${job.id}`, job);
}
