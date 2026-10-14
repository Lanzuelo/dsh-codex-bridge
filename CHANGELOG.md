# Changelog

## 0.2.1 — 2026-10-14

- Load the model selector from Codex's local model cache, avoiding the DSH
  sandbox failure caused by app-server writes to the Codex home directory.
- Show model-loading progress and errors beside the button, keep Save visible,
  and show the manual model ID field only when explicitly selected.
- Bound app-server shutdown so a missing Windows close event cannot leave the
  model command pending forever.

## 0.2.0 — 2026-10-14

- Make the Codex Bridge panel the primary workflow: project idea, role-specific
  models, automatic review, job cards, DeepSeek/Codex fix choice, proposal
  inspection, explicit apply, retry, cancel and restore.
- Let `/codex review` inspect the bounded safe project snapshot when Git is not
  available; add explicit `focus` and `files` modes.
- Let `/codex handoff <id>` and `/codex fix <review-id>` use safe default tasks,
  including actionable findings from `incomplete` reviews.
- Remove the mandatory DeepSeek handoff before a Codex fix and keep file writes
  behind exact proposal confirmation.
- Add direct DeepSeek delegation for the panel without starting Codex.
- Give scaffold documentation fixed root paths in its structured schema.
- Add a session dashboard endpoint for stages, jobs, findings and available
  actions without exposing full captured source snapshots.

## 0.1.3 — 2026-10-14

- Wait for the Codex model-catalog process to exit before removing its working
  directory, preventing a Windows `EBUSY` error after `/codex models`.
- Retry removal of short-lived Codex working directories while Windows releases
  process handles.

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
