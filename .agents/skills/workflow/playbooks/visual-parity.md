# Visual parity

Own this slice as `agent:workflow-coordinator`; Workflow owns the human conversation. Use the
`coordination-policy` skill for actual worker dispatch, bounded
methods, independent gates, repair routing, and stop/checkpoint handback.

Fix the visual baseline, compare matching states, repair differences, then recheck the actual
surface.
A missing baseline blocks the parity claim.

1. `agent:verification-designer`: Read the agreed source appearance, components, and states. Fix
   viewport, fonts, theme, scale, seed data, animations, and capture conditions. Define masks and
   tolerance before migration. Pixel-exact parity uses zero differences outside agreed masks.
   `agent:workflow-coordinator`: Before harness changes or migration, assign `agent:task-designer`
   to-task (Use the `to-task` skill) for a ready owning Task. Assessment alone needs no
   new Task.
2. `agent:experiment-author`: Establish a working capture/diff harness on the baseline. Reuse the
   project's harness or build the smallest missing lever. Do not edit baselines, masks, or tolerance
   merely to make a patch pass.
3. `agent:workflow-coordinator`: For a migration, assign shared primitives first. Give
   `agent:implementer` isolated write scopes or worktrees, with exact states and capture gates. Use
   execute-task (Use the `execute-task` skill); give the implementer its method (Use the
   `implement-task` skill). Keep behavioral changes outside the
   visual migration. For assessment alone, capture the existing target without assigning
   repairs.
4. `agent:runtime-operator`: Drive each state through runtime verification (Use the
   `runtime-verification` skill). Compare matched captures by image diff,
   inspect deltas, and return failures to the coordinator for authorized repair. A screenshot does
   not
   prove pixel equivalence.
5. `agent:integrator`: Assemble shared changes. `agent:acceptance-checker` checks assembled screens.
   Intentional appearance changes need their stated acceptance and a reviewed baseline update;
   unresolved conditions remain blocked. Route product failures to the implementer and capture
   defects to the experiment author only within repair authority. Assessment-only work returns
   findings. Recheck affected states on the assembled revision; preserve
   masks, tolerance, and the agreed baseline throughout repairs.
6. `agent:record-writer`: Preserve captures and diffs in the established evidence location.
   Record failed and blocked states too; mark the Task done only after its required final gates.
   `agent:resource-operator` cleans up after evidence is retained.
   `agent:workflow-coordinator`: Assign required review from the
   contract and assignment. Give `agent:delivery-operator` applicable
   [Opening a PR](opening-a-pr.md) steps only within the delivery grant.

**Reply:** states/components, measured differences, baseline and capture conditions, remaining gaps.
