---
name: ponytail-debt
description: >
  Harvest every `ponytail:` comment in the codebase into a debt ledger, so the
  deliberate shortcuts and deferrals ponytail leaves behind get tracked instead
  of rotting into "later means never". Use when the user says "ponytail debt",
  "/ponytail-debt", "what did ponytail defer", "list the shortcuts", "ponytail
  ledger", or "what did we mark to do later". One-shot report, changes nothing.
license: MIT
---

Every deliberate ponytail shortcut is marked with a `ponytail:` comment naming
its ceiling and upgrade path. This collects them into one ledger so a deferral
can't quietly become permanent.

## Scan

Search the repo for comment markers, skipping `node_modules`, `.git`, build
output, and the vendored Ponytail skill examples:

`rg -n --glob '!node_modules/**' --glob '!.git/**' --glob '!dist/**' --glob '!.agents/skills/ponytail*/**' '(#|//) ?ponytail:' .`

Each hit is one ledger row. The comment prefix keeps prose that merely mentions
the convention out of the ledger.

## Output

One row per marker, grouped by file:

`<file>:<line>, <what was simplified>. ceiling: <the limit named>. upgrade: <the trigger to revisit>.`

The convention is `ponytail: <ceiling>, <upgrade path>`, so pull the ceiling
and the trigger straight from the comment. Want an owner per row too? add
`git blame -L<line>,<line>`.

Flag the rot risk: any `ponytail:` comment that names no upgrade path or
trigger gets a `no-trigger` tag, those are the ones that silently rot.

End with `<N> markers, <M> with no trigger.` Nothing found: `No ponytail: debt. Clean ledger.`

## Boundaries

Reads and reports only, changes nothing. Flow State uses Beads for persistent
work: when the user explicitly asks to persist a finding, create or update the
smallest applicable Bead with `bd`; never write a Markdown debt ledger. Use
`bd remember` only for durable project knowledge, not actionable work.
One-shot. "stop ponytail-debt" or "normal mode" to revert.

Adapted for Flow State from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail), MIT licensed. Copyright and permission notice: `../ponytail/LICENSE`.
