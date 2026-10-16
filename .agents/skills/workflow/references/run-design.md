# Design a bounded run

Assigned workflow designer: define phases and handoffs.

Use when a large or cross-cutting run has no suitable procedure or settled phase outline.

## 1. Frame the run

State the done predicate, scope, work units, effort, blockers, budget, and material tradeoffs.
Choose checks and review depth from consequences and uncertainty. Apply
[design-for-verification](../../design-for-verification/SKILL.md) to observable targets.

## 2. Design the phases

- Divide work into independently verifiable units; resolve the riskiest unknowns first.
- Establish observation tools and a pre-change baseline. Reuse project checks; use
  [build-the-lever](../../build-the-lever/SKILL.md) for missing reusable tooling.
- Use [to-task](../../to-task/SKILL.md) for assigned work decomposition.
- After Task scope is drafted, propose [to-spec](../../to-spec/SKILL.md) for consequential module
  behavior contracts and [arena](../../arena/SKILL.md) for competing designs worth comparing.
- Name each phase's inputs, write scope, executable steps, expected results, evidence, and checker.
- Return a durable phase outline for the assigned record owner when continuation needs it.
  Write Task prose only when assigned. Specify parallel assignments and write boundaries.

## 3. Assign execution and checks

Propose [execute-task](../../execute-task/SKILL.md) for functional slices and
[hillclimb](../../hillclimb/SKILL.md) for sustained tuning.
For empirical unknowns, specify the smallest discriminating experiment and its keep/reject check.
Require acceptance gates for each work unit before consumers proceed and
[review](../../review/SKILL.md) for consequential results. Specify final checking against the
original predicate on the assembled artifact.
Return the phase design to the coordinator; do not dispatch workers or execute composite procedures.

## 4. Propose records and hand back

Propose record owners for material decisions and evidence in Plans, Specs, and Tasks.
Link substantial supporting material in workflow/reference/ within your assigned write scope. Apply
[keep-intent-aligned](../../keep-intent-aligned/SKILL.md) to changed commitments and
[encode-lessons-in-structure](../../encode-lessons-in-structure/SKILL.md) to recurring corrections.
Return phases, rationale for rigor, evidence locations, and open decisions.
