import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BridgeError } from './errors.mjs';

export class Store {
  constructor(directory) { this.directory = path.resolve(directory); }
  async init() { await fs.mkdir(this.directory, { recursive: true }); }
  async read(key, fallback) {
    try { return JSON.parse(await fs.readFile(path.join(this.directory, `${this.key(key)}.json`), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
  }
  key(key) { if (!/^[a-zA-Z0-9_-]+$/.test(key)) throw new BridgeError('id', 'Недопустимый идентификатор.'); return key; }
  async write(key, value) {
    await this.init();
    const target = path.join(this.directory, `${this.key(key)}.json`);
    const temp = `${target}.${randomUUID()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
    await fs.rename(temp, target);
  }
  async jobs() {
    await this.init();
    const names = await fs.readdir(this.directory);
    return Promise.all(names.filter(name => /^job-.*\.json$/.test(name)).map(name => this.read(name.slice(0, -5))));
  }
}
