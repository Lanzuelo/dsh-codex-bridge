import { BridgeError } from './errors.mjs';
import { relativePath } from './paths.mjs';

const object = properties => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const string = { type: 'string' };
const array = items => ({ type: 'array', items });
export const resultSchema = object({
  status: { type: 'string', enum: ['complete', 'incomplete'] },
  summary: string,
  handoff: string,
  options: array(object({ name: string, rationale: string, tree: string })),
  files: array(object({ path: string, content: string })),
  findings: array(object({
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
    file: string, line: { type: 'integer', minimum: 1 }, end_line: { type: 'integer', minimum: 1 },
    evidence: string, explanation: string, proposed_fix: string,
    confidence: { type: 'number', minimum: 0, maximum: 1 }
  }))
});

export function schemaFor(kind) {
  return kind === 'scaffold' ? object({ ...resultSchema.properties,
    documents: object({ architecture: string, deepseek_handoff: string })
  }) : resultSchema;
}

export function decodeResult(value, kind) {
  if (kind !== 'scaffold') return validateResult(value, kind);
  exact(value, [...resultSchema.required, 'documents']);
  exact(value.documents, ['architecture', 'deepseek_handoff']);
  if (Object.values(value.documents).some(content => typeof content !== 'string') || !Array.isArray(value.files)) fail();
  if (value.status === 'complete' && Object.values(value.documents).some(content => !content.trim())) throw new BridgeError('result', 'Codex вернул пустой обязательный документ scaffold; файлы не изменены.');
  const { documents, ...result } = value;
  return validateResult({ ...result, files: [...result.files,
    { path: 'docs/architecture.md', content: documents.architecture },
    { path: 'docs/deepseek-handoff.md', content: documents.deepseek_handoff }
  ] }, kind);
}

function fail() { throw new BridgeError('result', 'Codex вернул некорректный структурированный ответ; файлы не изменены.'); }
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail();
}
export function validateResult(value, kind) {
  exact(value, ['status', 'summary', 'handoff', 'options', 'files', 'findings']);
  if (!['complete', 'incomplete'].includes(value.status) || typeof value.summary !== 'string' || typeof value.handoff !== 'string' || value.handoff.length > 6000 || !Array.isArray(value.options) || !Array.isArray(value.files) || !Array.isArray(value.findings)) fail();
  if (value.options.length > 3 || value.files.length > 80 || value.findings.length > 60) fail();
  for (const option of value.options) {
    exact(option, ['name', 'rationale', 'tree']);
    if (Object.values(option).some(v => typeof v !== 'string')) fail();
  }
  const paths = new Set(); let bytes = 0;
  for (const file of value.files) {
    exact(file, ['path', 'content']); relativePath(file.path, { writing: true });
    if (typeof file.content !== 'string' || file.content.includes('\0') || paths.has(file.path.toLowerCase())) fail();
    // Block obvious accidental credential material, not ordinary placeholders.
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{24,}|ghp_[A-Za-z0-9]{30,})/.test(file.content)) throw new BridgeError('secret', 'В предложении обнаружен возможный секрет. Запись запрещена.');
    paths.add(file.path.toLowerCase()); bytes += Buffer.byteLength(file.content);
  }
  for (const file of paths) {
    if ([...paths].some(other => other.startsWith(file + '/'))) throw new BridgeError('path', 'Пути файлов в предложении конфликтуют с каталогами.');
  }
  if (bytes > 350_000) fail();
  for (const finding of value.findings) {
    exact(finding, ['severity', 'file', 'line', 'end_line', 'evidence', 'explanation', 'proposed_fix', 'confidence']);
    if (!['critical', 'high', 'medium', 'low'].includes(finding.severity) || !Number.isInteger(finding.line) || !Number.isInteger(finding.end_line) || finding.line < 1 || finding.end_line < finding.line || !Number.isFinite(finding.confidence) || finding.confidence < 0 || finding.confidence > 1) fail();
    if (['file', 'evidence', 'explanation', 'proposed_fix'].some(key => typeof finding[key] !== 'string')) fail();
    relativePath(finding.file);
  }
  if (['review', 'plan'].includes(kind) && value.files.length) fail();
  if (kind === 'plan' && value.status === 'complete' && !value.options.length) fail();
  if (kind === 'scaffold' && value.status === 'complete' && (!paths.has('docs/architecture.md') || !paths.has('docs/deepseek-handoff.md'))) {
    throw new BridgeError('result', 'В скелете отсутствуют docs/architecture.md или docs/deepseek-handoff.md.');
  }
  return value;
}
