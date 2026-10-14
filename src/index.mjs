import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { Bridge } from './bridge.mjs';

export const name = 'codex-bridge';
export const inject = ['commands'];
export function apply(ctx, config = {}) {
  const bridge = new Bridge(config);
  ctx.commands.register({
    definitionId: 'dsh-codex-bridge/command',
    name: 'codex',
    description: 'Codex: архитектура, модели и ревью без изменения файлов',
    input: { hint: 'help | plan <задача> | review | models | status' },
    handler: invocation => bridge.handle(invocation, text => invocation.agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })))
  });
  ctx.on('dispose', () => bridge.close());
}
