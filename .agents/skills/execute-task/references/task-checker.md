# Check Task acceptance

Remain independent when the assigned gate requires it. Do not edit reviewed artifacts or acceptance.
Use owned temporary outputs for checks; return defects to the author.

1. Read the Task, relevant guarantees, candidate snapshot, reproduction/design findings, and
   evidence.
   Include relevant Plan Verification targets and module Requirements, Invariants, and test
   obligations.
2. Check each acceptance claim against actual behavior. Reuse valid evidence; run missing checks.
   Judge whether passing checks cover the agreed scope; retain uncovered obligations.
   A passing partial slice does not establish the whole outcome.
   Use [runtime-verification](../../runtime-verification/SKILL.md) for runtime claims and
   [testing-policy](../../testing-policy/SKILL.md) for public-boundary checks.
3. For implementation acceptance, assess final receipts against
   [lint and formatting](../../setup-workflow/references/lint.md).
4. Return PASS, ISSUES, or BLOCKED per claim with snapshot, conditions, evidence, and missing gates.
