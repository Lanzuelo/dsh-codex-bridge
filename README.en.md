# DSH Codex Bridge

[Русский](README.md) · [Compatibility report](COMPATIBILITY_REPORT.md) · [Publishing](PUBLISHING.md)

Use Codex as an architect and reviewer while DeepSeek handles implementation,
inside DeepSeek Harness. Includes a sidebar and the `/codex` command.

**Preview 0.1.0.** Targets the **official Windows Desktop 0.2.0-rc.2** only.
Codex CLI **0.162.0-alpha.17.2** was tested with ChatGPT sign-in. No OpenAI API key
is required. Subscription quotas still apply.

## Install

Publication is being prepared. Until a repository/tag is actually published, use
the local `dsh-codex-bridge-0.1.0.tgz` through Harness's Plugins manager.
After publication, the intended Git source will be:

```text
github:Lanzuelo/dsh-codex-bridge#v0.1.0
```

**The npm name `dsh-codex-bridge` is already owned by an unrelated project.**
Do not install that registry package expecting this implementation. A separate
registry name or an owned npm scope must be chosen before npm publication.

The live Desktop installation remains to be tested. The core has passed 13 tests,
an actual Harness CommandRuntime smoke test, a browser panel fixture and one
real `gpt-5.6-sol` inference request. Other Harness versions are unverified.

## Workflow

```text
/codex models
/codex model all <supported-model-id>
/codex plan Build a Telegram bot with PostgreSQL
/codex scaffold <plan-id> 1
/codex show <proposal-id>
/codex apply <proposal-id> <confirmation-code>
/codex handoff <proposal-id> Implement user registration
```

`plan` does not write files. `scaffold` proposes the selected architecture's files.
Only `apply` writes the exact approved proposal, after recording a checkpoint.
Later user edits are protected. To restore:

```text
/codex restore <proposal-id> <confirmation-code>
```

Review staged, unstaged, deleted and untracked changes, or select files explicitly:

```text
/codex review
/codex review src/auth.ts | src/auth.test.ts
/codex handoff <review-id> Address high-priority findings
```

DeepSeek receives findings first. An explicit escalation can request a Codex fix
proposal using `/codex fix <review-id> <specific instruction>`. Applying fixes
still requires a separate confirmation.

Models can be shared or assigned to `architect`, `review`, and `fix`. `default`
uses Codex's isolated-launch default. Model discovery is explicit; IDs are not
hard-coded. An unavailable model produces a warning and remains selected until
the user chooses another one. Quota failures persist the job without retries or
API fallback. `/codex retry <id>` explicitly retries using a fresh snapshot.

## Boundaries

- Manual review only. Idle transitions do not prove successful task completion.
- All Codex jobs use read-only mode in a scratch directory, not the project cwd.
- The CLI receives a bounded snapshot, not the full chat history. Shell features
  and web search are disabled; the user config is not loaded.
- Filename filtering excludes common credential paths. It is not a general
  detector for secrets embedded in ordinary source files.
- File writes reject traversal, junctions/symlinks, Windows path aliases, stale
  snapshots, conflicting paths and `AGENTS.md` changes. No binary edits or deletes.
- No dependency installation or project build/test execution. Suggested commands
  can be run later through the user's normal workflow.
- State/checkpoints contain source code and are stored locally in
  `~/.dsh-codex-bridge`. Use one active Harness Host with each state directory.
- `handoff` explicitly starts DeepSeek work. Other messages and plugins are outside
  this plugin's control.

Detailed commands, configuration and limitations are in the Russian README.
Interface copy is currently Russian. Contributions and translations are welcome.

## Development

Node 24+ and Git are sufficient for core tests; no npm install is needed:

```text
node scripts/check.mjs
node --test test/*.test.mjs
npm pack --ignore-scripts
```

Host integration tests require the actual checked Harness runtime. The inference
smoke test consumes subscription quota and is never run by CI.

MIT licensed. This is an independent integration, not an official OpenAI or
DeepSeek product.
