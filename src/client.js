/* Harness 0.2.0-rc.2 browser module format; React and RPC come from the host. */
window.__ModuleLoader__.load({
  id: 'dsh-codex-architect',
  factory: require => {
    const React = require('react');
    const h = React.createElement;
    const ID = 'dsh-codex-architect';
    const css = {
      root: { height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10, padding: 14, overflow: 'auto', color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-base)', fontSize: 13 },
      row: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
      field: { width: '100%', minWidth: 0, boxSizing: 'border-box', padding: 8, color: 'inherit', background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, font: 'inherit' },
      button: { padding: '7px 10px', cursor: 'pointer', color: 'inherit', background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, font: 'inherit' },
      output: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: '12px/1.5 monospace', margin: 0, minHeight: 100 },
      hint: { margin: 0, opacity: 0.7, fontSize: 12 },
      card: { padding: 10, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)' },
      title: { margin: '0 0 6px', fontSize: 13 },
      badge: { display: 'inline-block', padding: '2px 6px', borderRadius: 10, background: 'var(--dsw-alias-bg-layer-2)', fontSize: 11 }
    };
    function Body({ sessionId, execute, useTabInfo }) {
      const { tab } = useTabInfo();
      const [idea, setIdea] = React.useState('');
      const [focus, setFocus] = React.useState('');
      const [files, setFiles] = React.useState('');
      const [command, setCommand] = React.useState('');
      const [mode, setMode] = React.useState('bridge');
      const [role, setRole] = React.useState('all');
      const [model, setModel] = React.useState('default');
      const [models, setModels] = React.useState([]);
      const [catalogStatus, setCatalogStatus] = React.useState('');
      const [savedModels, setSavedModels] = React.useState({});
      const [jobs, setJobs] = React.useState([]);
      const [quotaPaused, setQuotaPaused] = React.useState(false);
      const [reviewedProposal, setReviewedProposal] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [output, setOutput] = React.useState('Опишите идею для Codex или проверьте текущий проект.');
      const [error, setError] = React.useState(false);
      const mounted = React.useRef(true);
      React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
      function valueForRole(values, selectedRole) {
        if (selectedRole !== 'all') return values[selectedRole] || 'default';
        const unique = new Set(['architect', 'review', 'fix'].map(key => values[key] || 'default'));
        return unique.size === 1 ? [...unique][0] : '';
      }
      async function refresh() {
        const result = await execute(sessionId, 'dashboard', tab.signal);
        if (!mounted.current || result.kind !== 'success') return;
        const data = JSON.parse(result.text);
        setSavedModels(data.models); setModel(current => current || valueForRole(data.models, role));
        setJobs(data.jobs); setQuotaPaused(data.quotaPaused);
      }
      React.useEffect(() => { refresh().catch(() => {}); }, [sessionId, execute, tab.signal]);
      async function run(input, catalog = false) {
        if (busy && input !== 'cancel') return;
        if (input !== 'cancel') setBusy(true);
        if (catalog) setCatalogStatus('Загрузка моделей…');
        try {
          const result = await execute(sessionId, input, tab.signal);
          if (!mounted.current) return;
          if (catalog && result.kind === 'success') {
            const data = JSON.parse(result.text);
            setModels(data.models);
            setCatalogStatus(`Загружено моделей: ${data.models.length}. Откройте список ниже.`);
            setOutput('Выберите модель из списка или введите поддерживаемый ID. Доступ проверяется успешным запросом.');
          } else {
            setOutput(result.text || 'Готово.');
            if (catalog) setCatalogStatus(result.text || 'Не удалось загрузить модели.');
          }
          if (input.startsWith('model ') && result.kind === 'success') {
            await refresh();
          }
          setError(result.kind === 'error');
          return result;
        } catch (failure) {
          if (mounted.current) {
            const message = failure.message || 'Не удалось выполнить команду.';
            setOutput(message); setError(true);
            if (catalog) setCatalogStatus(message);
          }
          return null;
        } finally {
          if (mounted.current && input !== 'cancel') setBusy(false);
          if (!catalog) await refresh().catch(() => {});
        }
      }
      const button = (text, action, disabled = busy) => h('button', { type: 'button', style: css.button, disabled, onClick: action }, text);
      const manualModel = model !== 'default' && !models.some(item => item.id === model);
      const reviewCommand = () => files.trim() ? `review files ${files.trim()}${focus.trim() ? ` --focus ${focus.trim()}` : ''}` : focus.trim() ? `review focus ${focus.trim()}` : 'review';
      const stage = (() => {
        const job = jobs.at(-1);
        if (busy) return 'Codex работает';
        if (!job) return 'Идея';
        if (job.kind === 'plan' && job.options?.length) return 'План готов';
        if (job.kind === 'review' && job.findings?.length) return 'Найдены замечания';
        if (job.kind === 'review' && !job.findings?.length) return 'Проверка завершена';
        if (job.kind === 'fix' && job.changes?.length) return 'Исправление подготовлено';
        if (job.state?.startsWith('paused') || job.state === 'failed') return 'Требуется внимание';
        return 'Готово к следующему шагу';
      })();
      function jobCard(job) {
        const actions = [];
        if (job.kind === 'plan' && job.options?.length) job.options.forEach((option, index) => {
          if (mode !== 'codex') actions.push(button(`Вариант ${index + 1} → DeepSeek`, () => run(`handoff ${job.id} Реализуй вариант ${index + 1}: ${option.name}. Создай проект и выполни проверки.`)));
          if (mode === 'codex') actions.push(button(`Вариант ${index + 1} → Codex`, () => run(`scaffold ${job.id} ${index + 1}`)));
        });
        if (job.kind === 'review' && job.findings?.length) {
          if (mode !== 'codex') actions.push(button('Исправить в DeepSeek', () => run(`handoff ${job.id}`)));
          if (mode !== 'deepseek') actions.push(button('Подготовить в Codex', () => run(`fix ${job.id}`)));
        }
        if (job.changes?.length) {
          actions.push(button('Показать предложение', async () => { const result = await run(`show ${job.id}`); if (result?.kind === 'success') setReviewedProposal(job.id); }));
          actions.push(button('Применить просмотренное', () => run(`apply ${job.id} ${job.digest}`), busy || reviewedProposal !== job.id));
        }
        if (job.state === 'applied' && job.digest) actions.push(button('Восстановить', () => run(`restore ${job.id} ${job.digest}`)));
        if (['failed', 'interrupted', 'cancelled', 'paused-model', 'paused-quota'].includes(job.state)) actions.push(button('Повторить', () => run(`retry ${job.id}`)));
        return h('article', { key: job.id, style: css.card },
          h('div', { style: css.row }, h('strong', null, job.kind), h('span', { style: css.badge }, job.state), job.limited ? h('span', { style: css.badge }, 'ограниченный отчёт') : null),
          h('p', { style: css.hint }, job.summary || `Задание ${job.id}`),
          job.findings?.length ? h('p', { style: css.hint }, `Замечаний: ${job.findings.length}`) : null,
          actions.length ? h('div', { style: { ...css.row, marginTop: 8 } }, ...actions) : null,
          h('details', null, h('summary', null, 'Технические детали'), h('code', null, `${job.id} · модель ${job.model || 'default'}${job.digest ? ` · ${job.digest}` : ''}`)));
      }
      return h('section', { style: css.root, 'aria-label': 'Codex Bridge' },
        h('div', { style: css.row }, h('strong', null, 'Codex Bridge'), h('span', { style: css.badge }, stage), quotaPaused ? h('span', { style: css.badge }, 'лимит Codex') : null),
        h('p', { style: css.hint }, 'Codex проектирует и проверяет. DeepSeek реализует и исправляет. Codex запускается только вашим действием.'),
        h('label', null, 'Режим работы'),
        h('select', { style: css.field, value: mode, 'aria-label': 'Режим работы', onChange: e => setMode(e.target.value) },
          h('option', { value: 'deepseek' }, 'DeepSeek'), h('option', { value: 'codex' }, 'Codex'), h('option', { value: 'bridge' }, 'Codex → DeepSeek')),
        h('article', { style: css.card },
          h('h3', { style: css.title }, 'Новый проект'),
          h('textarea', { style: { ...css.field, minHeight: 80 }, value: idea, onChange: e => setIdea(e.target.value), 'aria-label': 'Идея проекта', placeholder: 'Опишите идею. Стек и архитектуру предложит Codex.' }),
          h('div', { style: { ...css.row, marginTop: 8 } }, button(mode === 'deepseek' ? 'Передать DeepSeek' : 'Построить план', () => run(mode === 'deepseek' ? `deepseek ${idea}` : `plan ${idea}`), busy || !idea.trim()))),
        h('article', { style: css.card },
          h('h3', { style: css.title }, 'Проверка проекта'),
          h('input', { style: css.field, value: focus, 'aria-label': 'Фокус ревью', onChange: e => setFocus(e.target.value), placeholder: 'Необязательно: на что обратить особое внимание' }),
          h('input', { style: { ...css.field, marginTop: 6 }, value: files, 'aria-label': 'Файлы ревью', onChange: e => setFiles(e.target.value), placeholder: 'Необязательно: src/a.ts|src/b.ts' }),
          h('div', { style: { ...css.row, marginTop: 8 } }, button('Проверить проект', () => run(reviewCommand())), button('Остановить', () => run('cancel'), !busy))),
        h('h3', { style: css.title }, 'Задания'),
        ...(jobs.length ? [...jobs].reverse().slice(0, 8).map(jobCard) : [h('p', { key: 'empty', style: css.hint }, 'Заданий в этом чате пока нет.')]),
        h('details', null, h('summary', null, 'Модели Codex'),
        h('div', { style: css.row },
          h('select', { style: { ...css.field, width: 'auto' }, value: role, 'aria-label': 'Роль модели', onChange: e => { setRole(e.target.value); setModel(valueForRole(savedModels, e.target.value)); } },
            ...[['all', 'Одна для всех'], ['architect', 'Архитектор'], ['review', 'Ревью'], ['fix', 'Исправление']].map(([value, label]) => h('option', { key: value, value }, label))),
          button('Загрузить модели', () => run('models json', true))),
        h('p', { style: css.hint, role: 'status', 'aria-live': 'polite' }, catalogStatus || 'Нажмите «Загрузить модели», чтобы получить доступный список Codex.'),
        h('div', { style: { ...css.row, flexWrap: 'nowrap' } },
        h('select', { style: { ...css.field, flex: 1, width: 'auto' }, value: manualModel ? 'manual' : model, 'aria-label': 'Выбор модели', onChange: e => setModel(e.target.value === 'manual' ? '' : e.target.value) },
          h('option', { value: 'default' }, `По умолчанию${models.find(item => item.default) ? ' · ' + models.find(item => item.default).name : ' Codex'}`),
          ...models.map(item => h('option', { key: item.id, value: item.id }, `${item.name} · ${item.id}`)), h('option', { value: 'manual' }, 'Другой ID…')),
          button('Сохранить', () => run(`model ${role} ${model}`), busy || !model.trim())),
        manualModel ? h('input', { style: { ...css.field, marginTop: 6 }, value: model, 'aria-label': 'ID модели вручную', onChange: e => setModel(e.target.value), placeholder: 'Поддерживаемый ID модели' }) : null),
        h('details', null, h('summary', null, 'Команда вручную'),
        h('form', { onSubmit: e => { e.preventDefault(); if (command.trim()) run(command.replace(/^\/codex\s+/, '')); }, style: css.row },
          h('input', { style: { ...css.field, flex: 1 }, value: command, 'aria-label': 'Команда продолжения', onChange: e => setCommand(e.target.value), placeholder: 'Например: show <id>' }),
          h('button', { type: 'submit', style: css.button, disabled: busy || !command.trim() }, 'Выполнить'))),
        h('div', { role: 'status', 'aria-live': 'polite', style: css.hint }, busy ? 'Codex работает…' : error ? 'Требуется внимание' : 'Готово'),
        h('pre', { style: css.output, tabIndex: 0 }, output));
    }
    function apply(ctx) {
      ctx.effect(() => ctx.sidebarRightTabs.register({ id: ID, kind: 'codex-bridge', title: () => 'Codex', guide: [{ id: 'codex', order: 50, title: () => 'Codex Bridge', description: () => 'Архитектура и проверка проекта' }] }), 'codex-bridge: tab');
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab', key: ID,
        inject: sessionId => ({
          sessionId,
          execute: async (id, input, signal) => {
            const result = await ctx.remote.commands.execute(id, `/codex ${input}`, [], signal);
            if (!result.ok) throw result.error;
            if (!result.value) throw new Error('Команда Codex не загружена на Host.');
            return result.value.result;
          }
        })
      }, Body)), 'codex-bridge: body');
    }
    return { apply, inject: ['slots', 'sidebarRightTabs', 'remote.commands'] };
  }
});
