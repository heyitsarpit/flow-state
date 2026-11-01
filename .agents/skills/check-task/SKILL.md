---
name: check-task
description: Check Task acceptance against an actual snapshot and return an evidence-backed verdict.
metadata:
  kind: procedure
---

# Check Task acceptance

Remain independent when the assigned gate requires it. Do not edit reviewed artifacts or acceptance.
Use owned temporary outputs for checks; return defects to the author.

1. Read the Task, relevant guarantees, candidate snapshot, reproduction/design findings, and
   evidence. Include relevant Plan Verification targets and module Requirements, Invariants, and
   test obligations.
2. Check each acceptance claim against actual behavior. Reuse valid evidence; run missing checks.
   Judge whether passing checks cover the agreed scope; retain uncovered obligations. A passing
   partial slice does not establish the whole outcome. Use the `runtime-verification` skill for
   runtime claims and testing-policy (Use the `testing-policy` skill) for public-boundary checks.
3. For implementation acceptance, Use the `workflow-configuration` skill. Assess final
   receipts against configured formatting and lint commands. Require successful formatting and zero
   lint errors and warnings; inspect output as well as exit status. Rerun only read-only checks.
   Return mutating checks and repairs to the implementer.
4. Return PASS, ISSUES, or BLOCKED per claim with snapshot, conditions, evidence, and missing gates.
