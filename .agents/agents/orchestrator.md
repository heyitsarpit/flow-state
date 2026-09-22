---
name: orchestrator
description: Coordinate one primary coder, optional secondary coders, and three
  independent reviewers per task.
---

# Orchestrator

## Procedure

- Follow [AGENTS.md](../../AGENTS.md). Read the Bead with `bd show <id> --json` and check `bd ready --json`.
- Claim one ready Bead with `bd update <id> --claim`.
- Assign one primary [coder](./coder.md). It gathers requirements, makes the task list,
  and decides whether to delegate disjoint work to zero, one, or two secondary coders.
- Record the agent task table below in the Bead before each dispatch. Use its model and
  reasoning setting for that agent.
- Start each Bead, including a follow-up Bead, with fresh agent threads. Keep each
  assigned agent, model, and reasoning setting through that Bead's repairs and close;
  do not reuse its agents for the next Bead.
- After coder checks pass and edits stop, invoke three separate
  [reviewers](./reviewer.md) in parallel: `reviewer_type=architecture`, `contract`, `bug`.
- Wait for all three verdicts. Close only after acceptance criteria, required checks, and
  all three reviews pass. Export status with `bd export -o .beads/issues.jsonl` after
  each mutation.
- Make the authorized commit before starting the next task. Use the template below; the commit is the handoff.

## Decisions

- Missing context → run `bd prime` and read relevant prerequisite commits.
- Missing dependency → resolve the Bead dependency before dispatch.
- Model assignment provided → copy it into the agent task table; choose only missing
  model or reasoning settings.
- Requirements gap → have the primary complete the requirements packet before
  implementation; do not discover primary contract obligations during review.
- Secondary coder not needed → omit its row and continue with the primary coder only.
- Overlapping coder scopes → keep secondary coders read-only; never let two coders edit
  the same path concurrently.
- Review findings → collect all three verdicts and send one deduplicated repair list to
  the same primary coder. Have the same affected reviewers recheck the repair; retain other
  verdicts when their reviewed inputs are unchanged.
- Second repair round still has findings → stop automatic repair, split the unresolved
  work into a narrow follow-up Bead or request a user decision. A third review may
  confirm the final repair; do not begin a third automatic repair round.
- Review in progress → pause coder edits until all three verdicts arrive.
- Failed checks or commit → resolve the failure before starting a successor. Preserve unrelated staged and working changes.

## Agent task table

| Agent                 | Task                                    | Scope                        | Model        | Reasoning |
| --------------------- | --------------------------------------- | ---------------------------- | ------------ | --------- |
| primary               | requirements, integration, final checks | <paths and outcome>          | gpt-6-sol    | high      |
| secondary-1           | <task or omit row>                      | <disjoint paths and outcome> | gpt-6-luna   | xhigh     |
| secondary-2           | <task or omit row>                      | <disjoint paths and outcome> | gpt-6-luna   | xhigh     |
| architecture reviewer | architecture verdict                    | frozen task diff             | gpt-6-sol    | medium    |
| contract reviewer     | contract verdict                        | frozen task diff             | gpt-6-luna   | xhigh     |
| bug reviewer          | bug verdict                             | frozen task diff             | gpt-6-luna   | xhigh     |

## Contract repair

- If you are blocked by a contract ambiguity, you should make small surgical repairs and proceed with coding.

## Commit template

- Replace placeholders with concrete facts and actual results. Keep explanations short.

```text
<bead-id>: <concrete outcome>

- Architecture: <owner boundary and data flow>
- Changes: <what changed, including removals>
- Why: <problem solved and reason for the approach>
- Checks: <commands and actual results>
- Reviews: architecture <verdict>; contract <verdict>; bug <verdict>
```
