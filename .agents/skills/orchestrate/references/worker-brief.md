# Worker brief

Start each specialist with fresh context (`fork_turns: none` in Codex).
Give enough context to work without the coordinator's chat history.
Before writes, require the worker to confirm its working directory matches the assigned checkout root.
If it differs, correct it before commands or writes. Use the assigned root for `--root` too.
Use a short paragraph for a small assignment; retain the same obligations.

- **Goal:** requested result and its relation to the project objective.
- **Scope:** assigned slice, absolute checkout root, write paths, environment, and integration base.
  Distinguish an isolated checkout from the setup project root. Name forbidden changes.
  Include build/output write scopes for checkers, even when source inspection is read-only.
  Carry applicable standing instructions and delivery authority into every spawn or resumed brief.
- **Context:** relevant Plan, Task, and Spec references; current source and upstream findings.
  Include established invocation/root, capabilities, selected conditions, and evidence validity.
  Link useful supporting project files in workflow/reference/ or their existing locations.
- **Assignment:** take the role/model/effort from setup's installed routing table.
  Supply scoped assignment, parent, and limits from the selected work. Record runtime IDs
  separately.
- **Work:** assigned phase and return boundary.
- **Guidance:** relevant principles, policies, and their source paths. Include applicable inlined
  instructions; names alone are insufficient.
- **Method:** exact assigned reference or skill section; read it before starting.
  Fill prompt-template placeholders with the assigned question, source angle, and actual inputs.
- **Acceptance:** observable criteria, verification commands or recipes, and required conditions.
  Operational assignments include the established invocation, recipe path, and relevant arguments.
  Implementation assignments include the installed
  [lint reference](../../setup-workflow/references/lint.md) and final lint/formatting receipts.
- **Budget:** time or attempt limit, stopping condition, and what to return if blocked.
- **Report:** result, changed paths and revision, actual checks and conditions, findings, and gaps.

Bounded specialists read their method and supplied guidance. Do not start unassigned later phases.
Assign substantive checking, integration, and record writes explicitly; the coordinator routes them.

Include material human constraints explicitly. A remote worker needs accessible copies or inline
context; local-only paths are insufficient. Relay changed contracts before dependent work resumes.
Read-only assignments forbid code and artifact edits. Use exact commit SHAs or captured working
snapshots for revision identity. Measurement assignments name both revisions, workload, sample
count,
what one sample measures, run order, and environment.
Require those conditions in the worker's result; do not infer them from the number.

## Example: implementation handoff

Illustrative assignment; replace these paths, revisions, commands, and limits with established
facts.

```text
Assignment: agent:implementer, gpt-6-luna/xhigh, parent workflow coordinator.
Goal: Make repeated cancellation safe under the accepted request contract.
Context: /repo/workflow/cancel.task, /repo/workflow/request.spec, and supplied impact findings.
Base: supplied commit SHA and dirty-path inventory. Root: /repo.
Phase: Feature implementation. Stop after the patch and self-checks; acceptance follows separately.
Method: /suite/execute-task/references/implementer.md. Read it before editing.
Guidance: /suite/testing-policy/SKILL.md; preserve the Spec's terminal-state invariant.
Scope: /repo/src/request.ts and /repo/test/request.test.ts. Preserve unrelated changes.
Checks: npm test -- request.test.ts, established by setup; recipe: /repo/docs/testing.md.
Acceptance: cancel twice without repeated side effects; completed requests remain unchanged.
Budget: 30 minutes. Return blockers or contract gaps to the coordinator.
Return: patch, base/snapshot identity, actual checks, conditions, and unresolved gaps.
```

The acceptance checker receives its own method and packet.
