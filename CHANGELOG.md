# Changelog

## 0.1.2 — 2026-10-14

- Fix the bundle patch to insert the plugin row. Previous versions incorrectly
  used an override for a nonexistent row, so installing the package did not
  activate its Host or sidebar in a normal Desktop profile.
- Extend the actual Harness runtime smoke test to exercise bundle composition
  and reproduce the old missing-row warning before checking command dispatch.
- Direct CLI runs performed by DeepSeek are not plugin jobs and must not be
  treated as successful plugin initialization or imported automatically.

## 0.1.1 — 2026-10-14

- Rename the npm package to `dsh-codex-architect` because the previous unscoped
  registry name belongs to an unrelated project.
- Align the bundle module name and browser module registration with the new name.
- Preserve `/codex`, the existing state directory and GitHub repository.

## 0.1.0 — 2026-10-14

Initial preview for official DeepSeek Harness Desktop 0.2.0-rc.2 on Windows.

- Codex sidebar and `/codex` commands without automatic DeepSeek prompt expansion.
- Architecture proposals, selected scaffolding, read-only reviews and proposed fixes.
- Per-role or shared model selection, explicit `model/list` discovery, manual IDs.
- Exact proposal confirmation, durable file checkpoints and conflict-aware restore.
- Quota/model failure persistence, explicit retry, cancellation and compact handoff.

Validation: 13 local tests, real Harness CommandRuntime load/unload, browser panel
fixture, and one successful ChatGPT-authenticated `gpt-5.6-sol` review request.
Installation into a live Desktop profile is still an outstanding acceptance check.
Automatic review, dependency installation and project command execution are excluded
from this preview.
