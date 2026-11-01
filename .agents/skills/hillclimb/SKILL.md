---
name: hillclimb
description: >-
  Build and validate a benchmark harness, then iteratively improve performance toward an agreed
  target using selected diagnostic tools. Use for sustained tuning, rather than a one-off fix.
metadata:
  kind: procedure
---

# Hillclimb

Drive attempts toward one agreed metric using [the experiment method](references/experiment.md).
For a bounded harness, measurement, or ledger assignment, apply only its experiment guidance.
Return the assigned result without starting the tuning loop or dispatching other roles.

Require an owning Task and bounded run contract before harness construction or measurements.
Report a missing Task before starting the run; do not invent one.

1. Assign the experiment author to reproduce the workload and propose the metric, target,
   invariants, sampling rule, baseline, and stop condition from existing commitments.
   Return reserved choices to the user. Authorized baseline measurement may inform the target;
   settle the target before tuning and sampling rules before comparing optimization candidates.
2. Assign harness construction and sensitivity proof to the author/executor. The measurement checker
   vets actual completed work, outputs, conditions, and noise through benchmark-checklist (Use the
   `benchmark-checklist` skill). Freeze only a checked harness.
3. The experiment author chooses a measured hypothesis, using optimize-software (Use the
   `optimize-software` skill) for missing candidate guidance. Give an
   executor one bounded attempt on an isolated base. Do not stack unmeasured changes.
4. The checker runs frozen comparisons and regressions and returns keep, reject, or inconclusive
   with revision/conditions/evidence and configured lint receipts. Advance the
   baseline only on a valid keep.
   The executor preserves rejected patches/evidence, restores only its attempt, and commits kept
   changes only within the grant. Changed conditions require a new checked baseline.
5. Record every attempt in the owning Task using the experiment method's ledger.
   Record failures and inconclusive attempts too; evidence must survive scratch-sample deletion. The
   run continues ready work until the predicate, limit, or unresolved gate.
   Repair product/test failures through the executor and harness failures through its author;
   recheck
   affected evidence before another keep.

Reuse compatible experiment/executor/record duties explicitly. Assign required checking
independently.
Return contract changes through keep-intent-aligned (Use the `keep-intent-aligned` skill). Repeated
failed premises go to the investigator using attack-the-premise
(Use the `attack-the-premise` skill). Return original/final metric, attempt counts,
current verdict, revisions, ledger, and remaining gap.
