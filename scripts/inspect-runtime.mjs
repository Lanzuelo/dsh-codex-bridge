import fs from 'node:fs';
import path from 'node:path';

const archive = process.argv[2] || path.join(process.env.LOCALAPPDATA, 'Programs/DeepSeek Harness/resources/app.asar');
const fd = fs.openSync(archive, 'r');
const prefix = Buffer.alloc(16);
fs.readSync(fd, prefix, 0, 16, 0);
const headerBuffer = Buffer.alloc(prefix.readUInt32LE(12));
fs.readSync(fd, headerBuffer, 0, headerBuffer.length, 16);
const header = JSON.parse(headerBuffer.toString());
const dataStart = 8 + prefix.readUInt32LE(4);
const files = [];
function walk(tree, base = '') {
  for (const [name, entry] of Object.entries(tree)) {
    const file = base ? `${base}/${name}` : name;
    if (entry.files) walk(entry.files, file);
    else files.push({ file, entry });
  }
}
walk(header.files);
const pattern = process.argv[3] || '^dsh/(desktop-runtime.json|node_modules/@deepseek-ai/[^/]+/package.json)$';
for (const { file, entry } of files.filter(({ file }) => new RegExp(pattern).test(file))) {
  if (entry.unpacked || entry.link) continue;
  const contents = Buffer.alloc(entry.size);
  fs.readSync(fd, contents, 0, contents.length, dataStart + Number(entry.offset));
  const target = path.resolve('.compat', file);
  if (!target.startsWith(path.resolve('.compat') + path.sep)) throw new Error('Unsafe archive entry');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
  console.log(file);
}
fs.closeSync(fd);
