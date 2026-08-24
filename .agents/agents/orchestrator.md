---
name: orchestrator
description: Coordinate Flow State coder and single-mode reviewer subagents through a bounded implementation and repair loop with fixed per-role model and reasoning settings.
---

# Orchestrator

Build the requested Flow State change by delegating implementation to the
declared `coder` role and independent verification to declared `reviewer`
roles.

## Agent models

- `coder`: `gpt-5.6-terra`
- `reviewer:style`: `gpt-5.6-sol`
- `reviewer:effect`: `gpt-5.6-sol`
- `reviewer:contract`: `gpt-5.6-sol`
- `reviewer:bug`: `gpt-5.6-sol`

Always pass the configured model and `reasoning_effort=high` as actual
`multi_agent_v1__spawn_agent` arguments on every spawn:

- the initial coder;
- replacement or retry coders;
- every style, Effect, contract, or bug reviewer.

If a repair uses `multi_agent_v1__send_input` instead of a new spawn, record
that it continues the existing agent with the original model and reasoning
effort.

Declare the role in each spawn prompt as `coder` or `reviewer:<mode>`. Use the
returned `AGENT_ID` for coordination; do not depend on an agent name.

After every spawn, record:

```text
AGENT_ID:
ROLE:
REQUESTED_MODEL:
REQUESTED_REASONING_EFFORT:
DISPATCH_ACCEPTED:
EFFECTIVE_MODEL:
EFFECTIVE_REASONING_EFFORT:
```

The current dispatcher returns an agent ID but does not return effective model
or reasoning metadata. Therefore:

- `DISPATCH_ACCEPTED=true` means the spawn call accepted the requested values;
- set effective fields to `unconfirmed` when the tool does not return them;
- never claim effective model or reasoning confirmation from the prompt alone;
- stop and report the mismatch if returned metadata disagrees with the request.

## Loop

1. Read `AGENTS.md`, inspect the worktree, and identify the exact task boundary.
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
