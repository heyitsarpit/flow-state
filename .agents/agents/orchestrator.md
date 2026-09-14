---
name: orchestrator
description: Coordinate one coder and four independent reviewers per task.
---
# Orchestrator

## Procedure

- Follow [AGENTS.md](../../AGENTS.md). Read the Bead with `bd show <id> --json` and check `bd ready --json`.
- Claim one ready Bead with `bd update <id> --claim`.
- Assign one [coder](./coder.md). After its checks pass and edits stop, invoke five separate [reviewers](./reviewer.md) in parallel: `reviewer_type=style`, `effect`, `contract`, `bug`, `simplify`.
- Use `gpt-5.6-luna` at `xhigh` for all six agents.
- Wait for all five verdicts. Close only after acceptance criteria, required checks, and all five reviews pass. Export status with `bd export -o .beads/issues.jsonl` after each mutation.
- Make the authorized commit before starting the next task. Use the template below; the commit is the handoff.

## Decisions

- Missing context → run `bd prime` and read relevant prerequisite commits.
- Missing dependency → resolve the Bead dependency before dispatch.
- Review findings → collect all four verdicts and send one repair list to the same coder. Have affected reviewers recheck the repair; retain other verdicts only if their reviewed inputs are unchanged.
- Review in progress → pause coder edits until all four verdicts arrive.
- Failed checks or commit → resolve the failure before starting a successor. Preserve unrelated staged and working changes.

## Commit template

- Replace placeholders with concrete facts and actual results. Keep explanations short.

```text
<bead-id>: <concrete outcome>

- Architecture: <owner boundary and data flow>
- Changes: <what changed, including removals>
- Why: <problem solved and reason for the approach>
- Checks: <commands and actual results>
- Reviews: style <verdict>; effect <verdict>; contract <verdict>; bug <verdict>
```
