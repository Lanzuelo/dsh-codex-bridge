# DSH Codex Architect

[Русский](README.md) · [Compatibility report](COMPATIBILITY_REPORT.md) · [Publishing](PUBLISHING.md)

Use Codex as an architect and reviewer while DeepSeek handles implementation,
inside DeepSeek Harness. Includes a sidebar and the `/codex` command.

**Preview 0.2.0.** npm package: **dsh-codex-architect**. Targets the **official Windows Desktop 0.2.0-rc.2** only.
Codex CLI **0.162.0-alpha.17.2** was tested with ChatGPT sign-in. No OpenAI API key
is required. Subscription quotas still apply.

Versions **0.1.0 and 0.1.1** had a bundle activation bug. Version **0.1.3** fixed a Windows `EBUSY` error after `/codex models`. Version **0.2.0** adds the primary visual workflow and shorter commands. Update and restart Harness.

## Install

In Harness's Plugins manager, enter **`dsh-codex-architect`**. npm latest is **0.2.0**. To pin it, enter `dsh-codex-architect@0.2.0`. The versioned GitHub source is:

```text
github:Lanzuelo/dsh-codex-bridge#v0.2.0
```

Alternatively, download the `.tgz` from [GitHub Releases](https://github.com/Lanzuelo/dsh-codex-bridge/releases)
and pass its absolute local path to the manager.

**The npm name `dsh-codex-bridge` is already owned by an unrelated project.**
Do not install that registry package expecting this implementation. A separate
registry name or an owned npm scope must be chosen before npm publication.

The live Desktop installation remains to be tested. The core has passed 20 tests,
an actual Harness CommandRuntime smoke test, an interactive browser panel fixture and one
real `gpt-5.6-sol` inference request. Other Harness versions are unverified.

## Visual workflow

The **Codex Bridge** tab is the primary interface. It provides DeepSeek, Codex,
and Codex → DeepSeek modes; project planning; automatic project review; optional
focus/files; job cards; a DeepSeek/Codex fix choice; proposal inspection; exact
apply confirmation; restore, retry, cancel and role-specific model selection.
Slash commands remain available for automation and diagnostics.

## Command workflow

```text
/codex models
/codex model all <supported-model-id>
/codex plan Build a Telegram bot with PostgreSQL
/codex handoff <plan-id>
```

`plan` does not write files. A handoff without extra text sends the recommended
architecture to DeepSeek for implementation. In Codex mode the panel can prepare
a selected option as a file proposal. Only `apply` writes an exact approved
proposal after recording a checkpoint. Later user edits are protected. To restore:

```text
/codex restore <proposal-id> <confirmation-code>
```

Review Git changes automatically. Without Git, the same command reviews the
bounded safe project snapshot and reports the missing baseline as a limitation:

```text
/codex review
/codex review focus Pay special attention to corrupted storage
/codex review files src/auth.ts|src/auth.test.ts --focus validation
/codex handoff <review-id>
/codex fix <review-id>
```

The user chooses DeepSeek or Codex immediately. Both commands have safe default
tasks and accept actionable findings from an `incomplete` review. Codex only
prepares a proposal; applying its files still requires separate confirmation.

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
