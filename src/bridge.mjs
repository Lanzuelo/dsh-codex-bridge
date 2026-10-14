import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { Store } from './store.mjs';
import { CodexRunner, modelId } from './codex.mjs';
import { discoverModels } from './catalog.mjs';
import { collectContext } from './context.mjs';
import { prepareChanges, changeDigest, applyChanges, restoreChanges } from './changes.mjs';
import { BridgeError } from './errors.mjs';
import { locateCodex } from './locate.mjs';
import { removeTemporary } from './paths.mjs';

export const HELP = `DSH Codex Bridge
/codex status — состояние и задания этого чата
/codex models — получить каталог Codex (app-server, без генерации)
/codex model <all|architect|review|fix> <ID|default> — выбрать модель
/codex deepseek <задача> — передать задачу DeepSeek без запуска Codex
/codex plan <задача> — предложить архитектуру без записи
/codex review — самостоятельно проверить Git-изменения или весь проект без Git
/codex review focus <текст> — добавить необязательный фокус проверки
/codex review files <путь>|<путь> [--focus <текст>] — проверить выбранные файлы
/codex fix <id ревью> [уточнение] — предложить исправление всех замечаний
/codex show <id> — полный результат и точные предлагаемые файлы
/codex apply <id> <код подтверждения> — записать конкретное предложение
/codex restore <id> <код подтверждения> — восстановить контрольную точку
/codex handoff <id> [следующая задача] — передать результат DeepSeek
/codex retry <id> — явно повторить запрос текущей моделью роли
/codex cancel — остановить текущий процесс Codex
Авто-ревью выключено. Установки зависимостей и запуска команд проекта нет.`;

function splitFirst(text) { const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(text.trim()); return match ? [match[1], match[2] || ''] : ['', '']; }
function roleOf(kind) { return kind === 'review' ? 'review' : kind === 'fix' ? 'fix' : 'architect'; }
function reviewInput(text) {
  if (!text.trim()) return { selected: [], focus: '' };
  const [mode, value] = splitFirst(text);
  if (mode === 'focus' && value.trim()) return { selected: [], focus: value.trim() };
  if (mode === 'files' && value.trim()) {
    const marker = ' --focus ';
    const at = value.indexOf(marker);
    const paths = (at < 0 ? value : value.slice(0, at)).split('|').map(file => file.trim()).filter(Boolean);
    if (!paths.length) throw new BridgeError('usage', 'После review files укажите хотя бы один путь.');
    return { selected: paths, focus: at < 0 ? '' : value.slice(at + marker.length).trim() };
  }
  throw new BridgeError('usage', 'Использование: /codex review, /codex review focus <текст> или /codex review files <пути через |> [--focus <текст>].');
}
function usefulResult(job) {
  if (!job.result) return false;
  if (job.result.status === 'complete') return true;
  if (job.kind === 'review') return Boolean(job.result.findings?.length);
  if (job.kind === 'plan') return Boolean(job.result.options?.length);
  return false;
}
function defaultHandoff(job) {
  if (job.kind === 'review') return 'Исправь все найденные замечания, добавь необходимые тесты, затем запусти тесты и сборку.';
  if (job.kind === 'plan') return 'Реализуй рекомендуемый вариант архитектуры из плана, создай необходимые файлы, затем запусти тесты и сборку.';
  return 'Продолжи работу по переданному результату, затем выполни подходящие проверки.';
}
function presentation(job) {
  const result = job.result;
  const lines = [`Задание ${job.id}: ${job.kind}, ${job.state}.`, result.summary];
  if (job.context.omitted.length || job.context.treeTruncated) lines.push('Проверка ограничена: часть файлов не вошла в снимок. См. полный отчёт.');
  result.options.forEach((option, i) => lines.push(`\nВариант ${i + 1}: ${option.name}\n${option.rationale}\n${option.tree}`));
  for (const finding of result.findings) lines.push(`\n[${finding.severity}] ${finding.file}:${finding.line}-${finding.end_line} (confidence ${finding.confidence})\n${finding.evidence}\n${finding.explanation}\nИсправление: ${finding.proposed_fix}`);
  if (job.changes?.length) lines.push(`\nПредлагаемые файлы:\n${job.changes.map(file => `${file.before === null ? '+' : '~'} ${file.path}`).join('\n')}\nПросмотр: /codex show ${job.id}\nПодтвердить именно эти изменения: /codex apply ${job.id} ${job.digest}`);
  if (job.kind === 'plan' && result.options.length) lines.push(`\nПередать рекомендуемый вариант DeepSeek: /codex handoff ${job.id}`);
  lines.push(`\nПередача DeepSeek: /codex handoff ${job.id}`);
  return lines.join('\n');
}

export class Bridge {
  constructor(config = {}, dependencies = {}) {
    this.config = { maxAttempts: 3, ...config };
    this.store = dependencies.store || new Store(config.stateDirectory || path.join(os.homedir(), '.dsh-codex-bridge'));
    this.runner = dependencies.runner || new CodexRunner({ executable: config.codexPath || 'codex', stateDirectory: this.store.directory, timeout: config.timeoutMs });
    this.catalog = dependencies.catalog || discoverModels;
    this.context = dependencies.context || collectContext;
    this.active = null; this.busy = false;
    this.initialization = null;
  }
  async init() {
    if (!this.initialization) this.initialization = (async () => {
      await this.store.init();
      this.runner.executable = await locateCodex(this.config.codexPath);
      for (const job of await this.store.jobs()) if (job.state === 'running') {
        job.state = 'interrupted'; await this.store.write(`job-${job.id}`, job);
      }
    })();
    return this.initialization;
  }
  async close() { const active = this.active; active?.controller.abort(); await active?.done; }
  async handle(invocation, sendHandoff) {
    const [command, rest] = splitFirst(invocation.rawInput);
    if (command === 'cancel') {
      if (this.active && this.active.sessionId === invocation.agent.session.id) { this.active.controller.abort(); return { kind: 'success', text: 'Отмена Codex запрошена.' }; }
      return { kind: 'success', text: 'В этом чате нет активного запроса Codex.' };
    }
    if (!command || command === 'help') return { kind: 'success', text: HELP };
    if (this.busy && command !== 'status') return { kind: 'error', text: 'Операция плагина уже выполняется. Дождитесь завершения или /codex cancel.' };
    if (command !== 'status') this.busy = true;
    try {
      await this.init();
      const sessionId = invocation.agent.session.id;
      if (command === 'status') {
        const settings = await this.store.read('settings', { models: {} });
        const jobs = (await this.store.jobs()).filter(job => job.sessionId === sessionId).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
        return { kind: 'success', text: `Модели: ${JSON.stringify(settings.models)} (пусто = default Codex).\n${settings.quotaPaused ? 'Лимит Codex: пауза. Повтор только /codex retry; передача DeepSeek только явной командой handoff.\n' : ''}${jobs.slice(-12).map(job => `${job.id}: ${job.kind}, ${job.state}, попыток ${job.attempts}`).join('\n') || 'Заданий нет.'}` };
      }
      if (command === 'settings') {
        const settings = await this.store.read('settings', { models: {} });
        return { kind: 'success', text: JSON.stringify({ models: settings.models }) };
      }
      if (command === 'dashboard') {
        const settings = await this.store.read('settings', { models: {} });
        const jobs = (await this.store.jobs()).filter(job => job.sessionId === sessionId).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).slice(-20).map(job => ({
          id: job.id, kind: job.kind, state: job.state, model: job.model, createdAt: job.createdAt,
          status: job.result?.status, summary: job.result?.summary, options: job.result?.options || [],
          findings: job.result?.findings || [], changes: job.changes?.map(change => ({ path: change.path, created: change.before === null })) || [],
          digest: job.digest || null, error: job.error || null, handoffCount: job.handoffCount || 0,
          limited: Boolean(job.context?.omitted?.length || job.context?.treeTruncated || job.result?.status === 'incomplete')
        }));
        return { kind: 'success', text: JSON.stringify({ models: settings.models || {}, quotaPaused: Boolean(settings.quotaPaused), busy: Boolean(this.active), jobs }) };
      }
      if (command === 'model') {
        const [role, id] = splitFirst(rest);
        if (!['all', 'architect', 'review', 'fix'].includes(role) || !id) throw new BridgeError('usage', 'Использование: /codex model <all|architect|review|fix> <ID|default>');
        const model = modelId(id), settings = await this.store.read('settings', { models: {} });
        for (const key of role === 'all' ? ['architect', 'review', 'fix'] : [role]) settings.models[key] = model;
        await this.store.write('settings', settings);
        return { kind: 'success', text: `Модель ${role}: ${model || 'default Codex'}. Доступ подтвердится успешным запросом; автоматической замены нет.` };
      }
      if (command === 'models') {
        await this.runner.auth(invocation.signal);
        const scratch = await fs.mkdtemp(path.join(this.store.directory, 'catalog-'));
        try {
          const models = await this.catalog(this.runner.executable, { signal: invocation.signal, env: this.runner.environment?.(), cwd: scratch });
          return { kind: 'success', text: rest === 'json' ? JSON.stringify({ models }) : `Каталог Codex (доступ окончательно проверяется запросом):\n${models.map(model => `${model.default ? '* ' : ''}${model.id} — ${model.name}`).join('\n')}\nВыбор: /codex model all <ID>. Модель по умолчанию: /codex model all default.` };
        } finally { await removeTemporary(scratch); }
      }
      if (command === 'deepseek') {
        if (!rest.trim()) throw new BridgeError('usage', 'Укажите задачу: /codex deepseek <задача>.');
        if (invocation.agent.status !== 'idle') throw new BridgeError('busy', 'Дождитесь завершения DeepSeek или остановите его перед новой задачей.');
        if (!sendHandoff) throw new BridgeError('handoff', 'Передача в модель недоступна в этом адаптере.');
        await sendHandoff(`Задача пользователя: ${rest.trim()}\n\nВыполни её самостоятельно в текущем проекте, запусти подходящие проверки и сообщи результат. Не запускай Codex без явной команды пользователя.`);
        return { kind: 'success', text: 'Задача передана DeepSeek без запуска Codex.' };
      }
      const root = invocation.agent.session.header.cwd;
      if (!root) throw new BridgeError('workspace', 'Чат не привязан к каталогу проекта. Откройте проект в Harness.');
      if (invocation.agent.status !== 'idle') throw new BridgeError('busy', 'Дождитесь завершения DeepSeek или остановите его перед операцией Codex.');
      if (['plan', 'review'].includes(command)) {
        if (command === 'plan' && !rest) throw new BridgeError('usage', 'Укажите задачу: /codex plan <описание проекта>');
        const settings = await this.store.read('settings', { models: {} });
        if (settings.quotaPaused) throw new BridgeError('quota', 'Codex на паузе после лимита. Повтор сохранённого задания: /codex retry <id>.');
        const review = command === 'review' ? reviewInput(rest) : { selected: [], focus: '' };
        const selected = review.selected;
        const snapshot = await this.context(root, { review: command === 'review', selected, signal: invocation.signal });
        if (command === 'review' && !snapshot.hasChanges) return { kind: 'success', text: 'Новых изменений для ревью нет. Codex не запускался.' };
        const reviewRequest = `Самостоятельно проверь ${snapshot.context.git.available ? 'изменения и существенные связанные модули' : 'весь предоставленный снимок проекта; Git baseline отсутствует'}. Ищи реальные ошибки, регрессии и проблемы безопасности; не требуй подсказок пользователя.${review.focus ? ` Дополнительный фокус пользователя: ${review.focus}` : ''}`;
        return await this.execute({ kind: command, request: command === 'plan' ? rest : reviewRequest, ...snapshot, sessionId }, invocation.signal);
      }
      const [id, remaining] = splitFirst(rest);
      const job = await this.ownedJob(id, sessionId, root);
      if (command === 'show') return { kind: 'success', text: JSON.stringify(job, null, 2) };
      if (['apply', 'restore'].includes(command)) {
        if (!job.digest || remaining !== job.digest) throw new BridgeError('approval', `Для точного подтверждения: /codex ${command} ${job.id} ${job.digest || '<код предложения>'}`);
        if (command === 'apply') await applyChanges(job, this.store); else await restoreChanges(job, this.store);
        return { kind: 'success', text: command === 'apply' ? `Предложение ${id} применено. Контрольная точка сохранена. Зависимости, сборка и тесты не запускались. Откат: /codex restore ${id} ${job.digest}` : `Контрольная точка ${id} восстановлена.` };
      }
      if (command === 'handoff') {
        if (!job.result) throw new BridgeError('handoff', 'У задания ещё нет результата для передачи.');
        if (!usefulResult(job)) throw new BridgeError('handoff', 'Отчёт не содержит данных для следующего действия.');
        if (job.state === 'restored') throw new BridgeError('handoff', 'Предложение было отменено восстановлением контрольной точки. Создайте новый отчёт.');
        if (job.changes?.length && job.state !== 'applied') throw new BridgeError('handoff', 'Предлагаемые файлы ещё не применены. Сначала подтвердите предложение.');
        if (!sendHandoff) throw new BridgeError('handoff', 'Передача в модель недоступна в этом адаптере.');
        const task = remaining || defaultHandoff(job);
        const limits = job.result.status === 'incomplete' ? `\n\nОграничение исходного отчёта: ${job.result.summary}` : '';
        await sendHandoff(`${job.result.handoff}${limits}\n\nСледующая задача пользователя: ${task}\nСоблюдай принятый стек. Работай самостоятельно; не запускай Codex и не меняй архитектуру без явной команды пользователя.`);
        job.handoffCount = (job.handoffCount || 0) + 1; await this.store.write(`job-${job.id}`, job);
        return { kind: 'success', text: 'Краткая сводка и указанная задача переданы DeepSeek по вашей команде.' };
      }
      if (['scaffold', 'fix'].includes(command)) {
        const settings = await this.store.read('settings', { models: {} });
        if (settings.quotaPaused) throw new BridgeError('quota', 'Codex на паузе после лимита. Дождитесь сброса лимита и явно повторите сохранённое задание.');
        if (!job.result) throw new BridgeError('state', 'У исходного задания ещё нет результата.');
        let request;
        if (command === 'scaffold') {
          const option = Number(remaining);
          if (job.kind !== 'plan' || !Number.isInteger(option) || !job.result.options[option - 1]) throw new BridgeError('usage', 'Укажите id плана и номер существующего варианта.');
          request = `Пользователь выбрал вариант ${option}: ${JSON.stringify(job.result.options[option - 1])}. Подготовь предложение скелета; никаких записей и запусков.`;
        } else {
          if (job.kind !== 'review') throw new BridgeError('usage', 'Команда fix принимает ID задания review.');
          if (!job.result.findings.length) throw new BridgeError('state', 'В отчёте нет замечаний, которые Codex мог бы исправить.');
          request = remaining || 'Исправь все найденные замечания. Добавь или обнови необходимые тесты. Верни только полное содержимое изменяемых файлов; ничего не записывай и не запускай.';
        }
        const selected = command === 'fix' ? [...new Set(job.result.findings.map(f => f.file))] : [];
        const snapshot = await this.context(root, { selected, signal: invocation.signal });
        return await this.execute({ kind: command, request, ...snapshot, sessionId, prior: job.result }, invocation.signal);
      }
      if (command === 'retry') {
        if (!['paused-quota', 'paused-model', 'failed', 'interrupted', 'cancelled'].includes(job.state)) throw new BridgeError('state', 'Это задание не ожидает повторного запуска.');
        if (job.attempts >= this.config.maxAttempts) throw new BridgeError('attempts', 'Достигнут лимит попыток задания. Создайте новое задание после проверки причины.');
        const settings = await this.store.read('settings', { models: {} }); settings.quotaPaused = false; await this.store.write('settings', settings);
        // Refresh code snapshot on explicit retry; never replay stale code silently.
        const snapshot = await this.context(root, { review: job.kind === 'review', selected: job.context.selected, signal: invocation.signal });
        return await this.execute({ ...job, ...snapshot }, invocation.signal);
      }
      throw new BridgeError('usage', HELP);
    } catch (error) {
      return { kind: 'error', text: error instanceof BridgeError ? error.message : `Ошибка плагина (${error.code || error.name}). Проверьте /codex status; если выполнялась запись, сверьте контрольную точку перед повтором.` };
    } finally { if (command !== 'status') this.busy = false; }
  }
  async ownedJob(id, sessionId, root) {
    if (!/^[a-f0-9]{12}$/.test(id)) throw new BridgeError('usage', HELP);
    const job = await this.store.read(`job-${id}`);
    if (!job || job.sessionId !== sessionId || job.root !== await fs.realpath(root)) throw new BridgeError('id', 'Задание не найдено в этом чате и проекте.');
    return job;
  }
  async execute(input, signal) {
    const settings = await this.store.read('settings', { models: {} });
    const job = { ...input, id: input.id || randomUUID().replaceAll('-', '').slice(0, 12), attempts: (input.attempts || 0) + 1, model: settings.models[roleOf(input.kind)] || null, state: 'running', createdAt: input.createdAt || new Date().toISOString() };
    delete job.result; delete job.changes; delete job.digest;
    await this.store.write(`job-${job.id}`, job);
    const controller = new AbortController();
    let finished;
    const done = new Promise(resolve => { finished = resolve; });
    this.active = { controller, sessionId: job.sessionId, done };
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    try {
      job.result = await this.runner.run(job, combined);
      job.state = job.result.status === 'complete' ? 'ready' : 'incomplete';
      if (job.result.files.length) { job.changes = await prepareChanges(job); job.digest = changeDigest(job.changes); }
      await this.store.write(`job-${job.id}`, job);
      return { kind: 'success', text: presentation(job) };
    } catch (error) {
      job.state = error.code === 'quota' ? 'paused-quota' : error.code === 'model' ? 'paused-model' : error.code === 'cancelled' ? 'cancelled' : 'failed';
      job.error = error.code || 'execution';
      await this.store.write(`job-${job.id}`, job);
      if (error.code === 'quota') { settings.quotaPaused = true; await this.store.write('settings', settings); }
      return { kind: 'error', text: `${error instanceof BridgeError ? error.message : 'Запрос не завершён; диагностический код: ' + job.error}.\nЗадание ${job.id}: ${job.state}. Повтор только по команде /codex retry ${job.id}.` };
    } finally { this.active = null; finished(); }
  }
}
