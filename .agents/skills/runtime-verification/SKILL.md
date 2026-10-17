---
name: runtime-verification
description: >-
  Verify behavior through real UI, CLI, service, or library interfaces.
  Use for runtime acceptance checks, setup gaps, or stale-recipe audits; return scoped evidence.
metadata:
  kind: procedure
---

# Verify runtime behavior

Drive the real interface and assert the required result. Report only what the run proves.
Reuse project checks. Do not create Plans, Specs, Tasks, or skills merely to run a check. Use the
`design-for-verification` skill for targets and evidence. Use the `testing-policy` skill for the
boundary exercised.

## Run the loop

1. **Declare coverage.** Read the request, Task acceptance, relevant Plan Verification targets, and
   Spec Invariants
   and Requirements. Derive checks from these, not the convenient existing test suite.
   Read project run docs, setup commands, checks, and recipes. Record the actual input file paths.
   List entry points, actions, expected results, and prerequisites.
   Limit ordinary checks to affected behavior; declare broader audit coverage explicitly.
   For audits, also read the feature index and relevant source; identify missing or stale recipes.
   Whole-index audits cover every indexed feature; targeted audits name the uncovered remainder.
2. **Establish readiness.** Name owned scratch directories for test state and captured evidence.
   Run documented setup commands against owned test resources.
   Verify identity, build, environment, authentication, migrations, and seeds required by each path.
   - Do not drive a path until initialization and journey prerequisites are verified.
   - For fresh-setup claims, initialize empty owned storage and exercise the journey.
   - List setup supplied only by stand-ins; leave target setup unverified until exercised there.
   Leave the user's live session untouched. Mark paths with missing prerequisites blocked.
3. **Drive and assert.** Execute each scoped path using exact commands or stable handles.
   Compare observed results and side effects with expectations. Reread state to prove persistence.
   Save actions and resulting state in the named evidence directory. Record what dry-run modes omit.
   Compare covered behavior with target scope before claiming pass; keep partial coverage explicit.
   Mark passed only after assertions succeed. Do not replace blocked paths with easier journeys.
4. **Classify and rerun.** Use the table below. Preserve intended expectations.
   Limit recipe and driver edits to the declared files and repair scope.
   When a defect escapes checks, strengthen those checks within the assigned repair scope.
   Refresh changed recipe links through to-plan (Use the `to-plan` skill) within scope;
   report others.
   After a failed drive, recheck instance identity and prerequisites.
   Rerun every changed recipe and helper at the final revision; a recipe edit alone proves nothing.
5. **Clean up and report.** Retain useful evidence in `workflow/reference/` or the existing evidence
   location.
   Remove only owned processes, temporary state, and scaffolding, including after failures.
   Confirm evidence survives. Report pass, fail, blocked, or unexercised for each path.
   Include exact observed values or errors, revision, run conditions, and evidence file links.
   Record results in an existing Task within write scope; otherwise return the evidence directly.

| Discrepancy                                 | Action                                        |
|---------------------------------------------|-----------------------------------------------|
| Established intent changed; recipe is stale | Update the recipe and rerun                   |
| Real interface works; driver fails          | Repair the driver within scope and rerun      |
| Product violates its contract               | Report failure and repair evidence            |
| Prerequisite is missing                     | Report blocked with the unmet prerequisite    |

Route contract ambiguity through keep-intent-aligned (Use the `keep-intent-aligned` skill). Use the
`build-the-lever` skill for missing reusable tools.
Product repairs require authorization.
