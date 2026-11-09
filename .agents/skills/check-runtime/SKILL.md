---
name: check-runtime
description: >-
  Verify behavior by actually driving the real interface (UI, CLI, service, or library) and
  asserting the result, then report exactly what the run proved. Use for runtime acceptance
  checks, setup gaps, or audits of stale run recipes.
metadata:
  kind: procedure
  applies:
    - principle-design-for-verification
    - policy-testing
    - policy-records
    - principle-make-work-rerunnable
    - principle-claim-only-what-you-checked
---

# Check Runtime

Use this to verify behavior through the real UI, CLI, service, or library interface: you run the
interface a user actually touches, assert the result, and report only what the run proved. A
*recipe* is the documented way to run a check; a *driver* is the script or harness that runs it.
Reuse the project's existing checks and recipes where you can. Do not create Plans, Specs, Tasks, or
skills just to run a check.

## Steps

1. **Decide what you will cover.** Read the request, the Task's acceptance, the relevant Plan
   Verification targets, and the Spec's Requirements and Invariants, and derive your checks from
   those, not from whatever tests happen to exist. Read the project's run docs, setup commands, and
   recipes, and record the actual paths of what you will use: the Task, Plan, and Spec you checked
   against, and the fixtures and configuration you feed in. List the entry points, the actions, the
   expected results, and the prerequisites. Keep ordinary checks to the affected behavior and
   declare any broader audit explicitly. For an audit, also read the project's feature index (its
   list of features and their run recipes) and the relevant source to find missing or stale recipes;
   a whole-index audit covers every indexed feature, and a targeted one names what it leaves out.

2. **Make sure each path can really run.** Name scratch directories you own for test state and
   captured evidence. Run the documented setup against test resources you own, and confirm what each
   path needs: the right instance, build, environment, authentication, migrations, and seed data. Do
   not drive a path until its setup is verified. To check a fresh-setup claim, start from empty
   storage you own and run the whole journey. Name any setup a stand-in performed instead of the
   real target. The stand-in can support evidence about the parts you actually exercised, but setup
   on the real target stays unverified until you run it there. Do not use or disturb the user's own
   logged-in sessions, and mark paths with missing prerequisites as blocked.

3. **Drive and assert.** Run each path with exact commands or stable handles, and compare what you
   observe, including side effects, with what you expected. Read state back to prove it persisted.
   Save the actions and the resulting state in your evidence directory, and note anything a dry-run
   mode skips. Mark a path passed only after its assertions succeed. Before claiming a pass, compare
   what you covered with the target scope, and keep any partial coverage explicit. Never swap a
   blocked path for an easier journey.

4. **Classify what went wrong, then rerun.**

   | What you found | What to do |
   |---|---|
   | The agreed behavior changed and the recipe is stale | Update the recipe and rerun |
   | The real interface works but your driver fails | Fix the driver within scope and rerun |
   | The product breaks its contract | Report the failure with evidence for repair |
   | A prerequisite is missing | Report blocked, naming what is missing |

   Never loosen an expectation to match what you observed; only an agreed change to the intended
   behavior justifies new expectations. When a recipe is a verification target with a coverage
   record, keeping that record current is skill:policy-verification's maintenance rule. Edit only
   the recipes and drivers in your declared scope.
   When a defect slipped past existing checks, strengthen those checks within your repair scope.
   Update changed recipe links in a Plan through `to-plan` when that is in scope, and report the
   rest. After a failed run, recheck which instance you hit and its prerequisites: a failure is
   often the wrong instance, not the product. Rerun every changed recipe and helper on the final
   revision; editing a recipe proves nothing on its own. When a reusable driver or tool is missing
   and building it is within your scope, build it so the check can be rerun.

5. **Clean up and report.** Keep useful evidence in `workflow/reference/` or the project's existing
   evidence location, and remove only the processes, temporary state, and scaffolding you created,
   including after failures. Confirm the evidence survived the cleanup.

## Watch out for

- **Repairing the product.** That needs its own authorization; report failures with evidence.
- **Ambiguous contracts.** Route them through `policy-records` instead of picking an answer.

## What to return

For each path: passed, failed, blocked, or not exercised, with the exact observed values or
errors, the revision, the run conditions, and links to the evidence. Record results in the Task
when it is within your write scope; otherwise return the evidence directly.
