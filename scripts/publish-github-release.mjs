// Maintainer-only release helper. Uses Git's existing credential helper for
// github.com; credentials stay in memory and are never written or logged.
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const manifest = JSON.parse(await fs.readFile('package.json', 'utf8'));
const owner = 'Lanzuelo', repository = 'dsh-codex-bridge', tag = `v${manifest.version}`;
const archiveName = `${manifest.name}-${manifest.version}.tgz`;
const directory = path.resolve('artifacts');
const archive = await fs.readFile(path.join(directory, archiveName));
const checksum = createHash('sha256').update(archive).digest('hex');
const expected = (await fs.readFile(path.join(directory, 'SHA256SUMS.txt'), 'utf8')).trim();
if (expected !== `${checksum}  ${archiveName}`) throw new Error('Checksum mismatch; no publication performed.');
const body = `Initial preview for official DeepSeek Harness Desktop 0.2.0-rc.2 on Windows.

## Install in Harness
Paste the npm package name in Plugins → Add package:
\`\`\`text
${manifest.name}
\`\`\`
Exact version: ${manifest.name}@${manifest.version}.
Alternative Git source: github:${owner}/${repository}#${tag}.
Or download the attached .tgz and use its absolute local path.

Includes a Codex sidebar, per-role model selection, read-only architecture/review requests, exact file approval, checkpoints and explicit DeepSeek handoff. Uses Codex CLI ChatGPT sign-in; no OpenAI API key or automatic paid fallback.

Validation: 13 local tests, real Harness CommandRuntime load/unload, browser panel fixture, one successful gpt-5.6-sol request, and GitHub Actions on Windows/Linux. Full installation inside a live Desktop profile is not yet verified. Automatic reviews and dependency installation are excluded.

IMPORTANT: the old npm name dsh-codex-bridge belongs to an unrelated project. Use ${manifest.name}. Disable/remove an old Bridge installation before switching sources: both register /codex. Existing local state is preserved.

SHA-256 (${archiveName}):
\`\`\`text
${checksum}
\`\`\`

MIT license. Independent integration; not an official OpenAI or DeepSeek product.`;

// execFile's promisified form does not accept stdin, so write through its child.
const credentials = await new Promise((resolve, reject) => {
  const child = execFile('git', ['credential', 'fill'], { env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }, windowsHide: true, timeout: 20_000 }, (error, stdout) => error ? reject(new Error('GitHub credential helper unavailable.')) : resolve(stdout));
  child.stdin.end('protocol=https\nhost=github.com\n\n');
});
const password = credentials.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9);
if (!password) throw new Error('No GitHub credential available.');
const headers = { Authorization: `Bearer ${password}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'dsh-codex-bridge-release' };
async function request(url, options = {}, allowMissing = false) {
  if (!['api.github.com', 'uploads.github.com'].includes(new URL(url).hostname)) throw new Error('Unexpected API host.');
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(45_000), redirect: 'error' });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub API request failed (${response.status}).`);
  return response.json();
}
const actor = await request('https://api.github.com/user');
if (actor.login.toLowerCase() !== owner.toLowerCase()) throw new Error('Git credential belongs to another account; no publication performed.');
const api = `https://api.github.com/repos/${owner}/${repository}`;
await request(`${api}/git/ref/tags/${tag}`);
let release = await request(`${api}/releases/tags/${tag}`, {}, true);
if (!release) release = await request(`${api}/releases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_name: tag, name: `${tag} — Codex architect and reviewer (preview)`, body, prerelease: true, draft: false, make_latest: 'false' }) });
if (release.draft || !release.prerelease) throw new Error('Existing release is not a published preview.');
for (const name of [archiveName, 'SHA256SUMS.txt']) {
  const bytes = name === archiveName ? archive : await fs.readFile(path.join(directory, name));
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const existing = release.assets.find(asset => asset.name === name);
  if (existing) {
    if (existing.digest !== digest) throw new Error(`Existing release asset differs: ${name}; it was not overwritten.`);
    continue;
  }
  const upload = release.upload_url.replace(/\{.*$/, '') + `?name=${encodeURIComponent(name)}`;
  const asset = await request(upload, { method: 'POST', headers: { 'Content-Type': name.endsWith('.tgz') ? 'application/gzip' : 'text/plain', 'Content-Length': String(bytes.length) }, body: bytes });
  if (asset.digest && asset.digest !== digest) throw new Error(`Uploaded asset checksum mismatch: ${name}`);
}
release = await request(`${api}/releases/tags/${tag}`);
if (![archiveName, 'SHA256SUMS.txt'].every(name => release.assets.some(asset => asset.name === name && asset.state === 'uploaded'))) throw new Error('Release is missing an uploaded asset.');
console.log(JSON.stringify({ url: release.html_url, prerelease: release.prerelease, assets: release.assets.map(asset => ({ name: asset.name, bytes: asset.size, digest: asset.digest })) }, null, 2));
