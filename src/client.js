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
      hint: { margin: 0, opacity: 0.7, fontSize: 12 }
    };
    function Body({ sessionId, execute, useTabInfo }) {
      const { tab } = useTabInfo();
      const [task, setTask] = React.useState('');
      const [command, setCommand] = React.useState('');
      const [role, setRole] = React.useState('all');
      const [model, setModel] = React.useState('default');
      const [models, setModels] = React.useState([]);
      const [savedModels, setSavedModels] = React.useState({});
      const [busy, setBusy] = React.useState(false);
      const [output, setOutput] = React.useState('Спроектируйте проект или запустите ревью. Запись файлов потребует отдельной команды подтверждения.');
      const [error, setError] = React.useState(false);
      const mounted = React.useRef(true);
      React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
      function valueForRole(values, selectedRole) {
        if (selectedRole !== 'all') return values[selectedRole] || 'default';
        const unique = new Set(['architect', 'review', 'fix'].map(key => values[key] || 'default'));
        return unique.size === 1 ? [...unique][0] : '';
      }
      React.useEffect(() => {
        execute(sessionId, 'settings', tab.signal).then(result => {
          if (mounted.current && result.kind === 'success') {
            const values = JSON.parse(result.text).models;
            setSavedModels(values); setModel(valueForRole(values, 'all'));
          }
        }).catch(() => {});
      }, [sessionId, execute, tab.signal]);
      async function run(input, catalog = false) {
        if (busy && input !== 'cancel') return;
        if (input !== 'cancel') setBusy(true);
        try {
          const result = await execute(sessionId, input, tab.signal);
          if (!mounted.current) return;
          if (catalog && result.kind === 'success') {
            const data = JSON.parse(result.text);
            setModels(data.models);
            setOutput('Выберите модель из списка или введите поддерживаемый ID. Доступ проверяется успешным запросом.');
          } else setOutput(result.text || 'Готово.');
          if (input.startsWith('model ') && result.kind === 'success') {
            const settings = await execute(sessionId, 'settings', tab.signal);
            if (mounted.current && settings.kind === 'success') setSavedModels(JSON.parse(settings.text).models);
          }
          setError(result.kind === 'error');
        } catch (failure) {
          if (mounted.current) { setOutput(failure.message || 'Не удалось выполнить команду.'); setError(true); }
        } finally { if (mounted.current && input !== 'cancel') setBusy(false); }
      }
      const button = (text, action, disabled = busy) => h('button', { type: 'button', style: css.button, disabled, onClick: action }, text);
      return h('section', { style: css.root, 'aria-label': 'Codex Bridge' },
        h('strong', null, 'Codex · архитектор и ревьюер'),
        h('p', { style: css.hint }, 'Подписка ChatGPT. Ревью без записи. Автоматическая смена модели выключена.'),
        h('textarea', { style: { ...css.field, minHeight: 90 }, value: task, onChange: e => setTask(e.target.value), 'aria-label': 'Задача для Codex', placeholder: 'Описание проекта для проектирования. Для ревью можно указать пути через |; пусто — изменения Git.' }),
        h('div', { style: css.row },
          button('Спроектировать', () => run(`plan ${task}`), busy || !task.trim()),
          button('Проверить Codex', () => run(`review ${task}`)),
          button('Состояние', () => run('status')),
          button('Остановить', () => run('cancel'), !busy)),
        h('label', null, 'Модель Codex'),
        h('div', { style: css.row },
          h('select', { style: { ...css.field, width: 'auto' }, value: role, 'aria-label': 'Роль модели', onChange: e => { setRole(e.target.value); setModel(valueForRole(savedModels, e.target.value)); } },
            ...[['all', 'Одна для всех'], ['architect', 'Архитектор'], ['review', 'Ревью'], ['fix', 'Исправление']].map(([value, label]) => h('option', { key: value, value }, label))),
          button('Загрузить модели', () => run('models json', true))),
        h('select', { style: css.field, value: models.some(item => item.id === model) || model === 'default' ? model : 'manual', 'aria-label': 'Выбор модели', onChange: e => setModel(e.target.value === 'manual' ? '' : e.target.value) },
          h('option', { value: 'default' }, `По умолчанию${models.find(item => item.default) ? ' · ' + models.find(item => item.default).name : ' Codex'}`),
          ...models.map(item => h('option', { key: item.id, value: item.id }, item.name)), h('option', { value: 'manual' }, 'Указать поддерживаемый ID вручную')),
        h('div', { style: css.row },
          h('input', { style: { ...css.field, flex: 1 }, value: model, 'aria-label': 'ID модели вручную', onChange: e => setModel(e.target.value), placeholder: 'Поддерживаемый ID' }),
          button('Сохранить', () => run(`model ${role} ${model}`), busy || !model.trim())),
        h('p', { style: css.hint }, 'Продолжение по ID из отчёта: scaffold <id> <вариант>, show <id>, apply <id> <код>, handoff <id> <задача>, retry <id>.'),
        h('form', { onSubmit: e => { e.preventDefault(); if (command.trim()) run(command.replace(/^\/codex\s+/, '')); }, style: css.row },
          h('input', { style: { ...css.field, flex: 1 }, value: command, 'aria-label': 'Команда продолжения', onChange: e => setCommand(e.target.value), placeholder: 'Например: show <id>' }),
          h('button', { type: 'submit', style: css.button, disabled: busy || !command.trim() }, 'Выполнить')),
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
