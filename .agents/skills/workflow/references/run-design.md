# Design a bounded run

Assigned workflow designer: define phases and handoffs.

Use when a large or cross-cutting run has no suitable procedure or settled phase outline.

## 1. Frame the run

State the done predicate, scope, work units, effort, blockers, budget, and material tradeoffs.
Choose checks and review depth from consequences and uncertainty. Apply design-for-verification
(Use the `design-for-verification` skill) to observable targets.

## 2. Design the phases

- Divide work into independently verifiable units; resolve the riskiest unknowns first.
- Establish observation tools and a pre-change baseline. Reuse project checks; use build-the-lever
  (Use the `build-the-lever` skill) for missing reusable tooling.
- Use the `to-task` skill for assigned work decomposition.
- After Task scope is drafted, propose to-spec (Use the `to-spec` skill) for
  consequential module
  behavior contracts and arena (Use the `arena` skill) for competing designs worth
  comparing.
- Name each phase's inputs, write scope, executable steps, expected results, evidence, and checker.
- Return a durable phase outline for the assigned record owner when continuation needs it.
  Write Task prose only when assigned. Specify parallel assignments and write boundaries.

## 3. Assign execution and checks

Propose execute-task (Use the `execute-task` skill) for functional slices and hillclimb
(Use the `hillclimb` skill) for sustained tuning.
For empirical unknowns, specify the smallest discriminating experiment and its keep/reject check.
Require acceptance gates for each work unit before consumers proceed and review (Use the `review`
skill) for consequential results. Specify final checking against the
original predicate on the assembled artifact.
Return the phase design to the coordinator; do not dispatch workers or execute composite procedures.

## 4. Propose records and hand back

Propose record owners for material decisions and evidence in Plans, Specs, and Tasks.
Link substantial supporting material in workflow/reference/ within your assigned write scope. Apply
keep-intent-aligned (Use the `keep-intent-aligned` skill) to changed commitments and
encode-lessons-in-structure (Use the `encode-lessons-in-structure` skill) to recurring
corrections.
Return phases, rationale for rigor, evidence locations, and open decisions.
