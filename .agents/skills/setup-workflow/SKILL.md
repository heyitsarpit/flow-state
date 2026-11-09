---
name: setup-workflow
description: >-
  Configure this project's installed Workflow skill library: record the workflow CLI, lint, and
  formatter commands, confirm model preferences, and write the ambient principles block into
  AGENTS.md or CLAUDE.md. Other packages read the project's tool and model settings from here. Use
  for initial setup or configuration changes.
metadata:
  kind: procedure
  applies: [policy-authority]
---

# Setup Workflow

Configure the installed skill library for this project. Reuse defaults and keep setup a short
conversation. Setup records facts; it does not start work.

## Records

| Record | Holds | Who reads it |
|---|---|---|
| [tools.md](references/tools.md) | Workflow CLI invocation, lint and formatter commands | `execute-task`, `check-task`, any package running checks |
| [agents.md](references/agents.md) | Model and effort preferences per role | Anyone delegating under skill:policy-delegation |
| [ambient.md](references/ambient.md) | The block written into AGENTS.md or CLAUDE.md | Setup only |

**Reading settings (any package):** read the record you need, return only relevant entries, and
distinguish recorded settings from unconfigured ones. Report a missing setting and recommend setup;
never start setup or install tooling during a lookup.

**Writing settings:** only this setup procedure changes these records, in the project's installed
copy. Preserve names, invocation policies, and unrelated settings.

## 1. Start with intent

Reuse the request and conversation. If the project's purpose is unclear, ask:
"What are you building here, and do you have a preferred stack?"
Wait for the answer before searching for tools or writing files. Infer technical scope from the
outcome the user describes.

## 2. Read existing setup

Identify the project root, harness, and installed skill library. Read project instructions, package
scripts, and existing model and lint settings. Stay within the repository unless the user supplies
an external path. Record the absolute root; confirm the working directory before any writes.
Do not audit every installed package or search neighboring projects for missing tools.

## 3. Check both harnesses see the library

Look for the `workflow` router's `SKILL.md` under both `.agents/skills/` (Codex) and
`.claude/skills/` (Claude Code) in the project. A harness without it loads none of the library,
and nothing warns anyone. If one is missing, say which, and offer the install command for that
agent: `npx skills@1.7.2 add <library source> --skill '*' --agent claude-code` (or `codex`), where
the source is the path or URL the library was installed from (see its README). Install only with
the user's approval.

## 4. Record project tools

Recommend lint and formatter commands from project scripts or the chosen stack; let the user
confirm. Read each command's configuration to find which files it checks or changes. In `tools.md`,
record each command, its working directory, file scope, and whether it writes files or only checks.
Leave missing tools unconfigured. Install only requested tooling. Setup does not start application
implementation.

Record in `tools.md` the source revision of the installed skill library (the repository and commit
it was installed from), so skill:to-epic can pin an Epic's library revision; never record the
project's own revision there.

Find the workflow CLI through PATH or project instructions. If found, run `--help` and record its
invocation in `tools.md`. If the project already has workflow records, run `workflow check` on them,
using the recorded invocation. If it reports a stale or missing Spec index, run `workflow index` and
check again; return any other diagnostics as they are. Report missing tools; do not expand setup
into an unrelated investigation. If the project still has `workflow/roadmaps/<name>/roadmap.md`
from an older version of this library, report it and offer the one-off
[roadmap migration](references/migrate-roadmap.md); migrate only with the user's approval.

Write the skills roots into `workflow/config.json`, so `skill:NAME` links in the project's records
resolve: an ordered list of the folders that hold the installed library, the project-local installs
first, such as `{"skills": {"roots": [".agents/skills", ".claude/skills"]}}`. Keep any other
fields in the file. Confirm the list with the user, then run `workflow check`.

## 5. Confirm model preferences

Show the current entries in `agents.md`. The default is to inherit the current model. Offer
different models or reasoning effort when the user wants a change, and show only changed entries.
Check each distinct model and effort choice once against the options the session advertises; ask
about unavailable ones instead of searching the filesystem. Keep the current session's own model.

## 6. Write the ambient block

Show the user the block in `ambient.md`. With their approval, add it to the project's AGENTS.md
(Codex) and CLAUDE.md (Claude Code), creating the file only if the user agrees. Replace an
existing block between its markers instead of adding a second one. Preserve everything else in the
file.

## 7. Return and stop

Return changed settings, configuration locations, available commands, and missing prerequisites.
Name one next action, usually running `workflow`, then stop. Setup does not select a
task or launch workers.
