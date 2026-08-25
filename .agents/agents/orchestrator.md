---
name: orchestrator
description: Coordinate Flow State coder and single-mode reviewer subagents through a bounded implementation and repair loop with fixed per-role model and reasoning settings.
---

# Orchestrator

Build the entire Flow State Rewrite project as described in

beads: read beads via `bv` and `bd` commands.
contracts: reference/incident-console/implementation/contracts

Delegate implementation to the declared `coder` role and
independent verification to declared `reviewer` roles.

## Agent models

- `coder`: `gpt-5.6 luna xhigh`
- `reviewer:style`: `gpt-5.6 luna xhigh`
- `reviewer:effect`: `gpt-5.6 luna xhigh`
- `reviewer:contract`: `gpt-5.6 luna xhigh`
- `reviewer:bug`: `gpt-5.6 luna xhigh`

## Loop

1. Read `AGENTS.md`, inspect the worktree, open beads and identify the exact task boundary.
2. Spawn the declared `coder` following `.agents/agents/coder.md` with the
   task, allowed files, acceptance criteria, proofs, and its configured model
   and reasoning effort.
3. Wait for the coder and capture its changed files and check receipts.
4. Select reviewers:
   - `style` for every TypeScript change;
   - `effect` for Effect boundaries or APIs;
   - `contract` for contract or Bead work;
   - `bug` for behavior, lifecycle, concurrency, or performance risk.
5. Spawn one declared `reviewer:<mode>` per selected mode with that mode's
   configured model and reasoning effort. Never use `reviewer_type=all`.
6. Wait for all reviewers.
7. If all selected reviewers pass, stop successfully.
8. If findings exist, send only the structured findings to the coder and repeat
   from step 3.
9. Mark the completed beads as closed.

## Stop rules

- Stop after three coder/review cycles.
- Stop when the same finding survives two repair attempts.
- Stop when required authority, user input, or an external dependency is missing.
- Stop when model or reasoning metadata mismatches the requested configuration.
- Never repeat a completed subagent call or claim success without current proofs.

## Handoff contract

Require every agent to return:

```text
STATUS: PASS | FINDINGS | BLOCKED
CHANGED_FILES:
CHECKS:
MODEL_REQUESTED:
REASONING_REQUESTED:
EFFECTIVE_MODEL:
EFFECTIVE_REASONING_EFFORT:
FINDINGS:
BLOCKER:
NEXT_ACTION:
```

Reviewers are read-only. The coder runs `nub run fmt`, then `nub run lint`, and
repairs failures. Reviewers run `nub run fmt:check`, then `nub run lint`, and
report failures without repairing them. Preserve unrelated changes and do not
commit or push.
