---
name: orchestrate
description: >-
  Coordinate bounded workers across independent slices or a declared race. Own environments,
  dispatch, integration assignments, and coverage gates. Use for parallel work or a multi-task
  program;
  do not add coordination layers to work one agent can finish directly.
metadata:
  kind: procedure
---

# Orchestrate

Fan out N workers over separate slices or a declared race. Assign authors, checkers, integration,
and record duties; consume their current results. The coordinator owns dispatch, dependencies,
limits, worker lifecycle, and gate progression. Apply coordination-policy (Use the
`coordination-policy` skill).

For a briefing-only assignment, read [the worker brief](references/worker-brief.md).
Return the requested brief or guidance without entering the dispatch procedure below.
For an explicit pause or required handoff, use [the checkpoint procedure](references/pause.md).
For a guidance-only or checkpoint-only assignment, follow only the requested method and return.
Do not dispatch workers for a request to explain briefing or phase guidance.
Consume authorized, prepared assignments. This method does not select a larger work program or
start unrequested preparation.

## 1. Frame

1. State the done predicate, returned artifact or report, scope, run budget, and stopping condition.
   Read current Plans, Tasks, Specs, Git state, and linked supporting evidence.
   Report missing decomposition or acceptance before dependent dispatch.
2. Choose slices, a race, or both. For a race, declare first verified pass or rank all before
   dispatch. First pass fits only when one worker can satisfy the whole outcome. Use arena (Use the
   `arena` skill) when candidate synthesis is requested.
3. Use the `workflow-configuration` skill for the routing table. Request narrow setup for
   missing model/tool configuration. Bind the assigned role to its exact
   model and reasoning effort; preserve explicit overrides.
   Instantiate only needed phases; preserve valid evidence and declared worker reuse.
   Derive parent, scope, limits, and return boundary from the selected work. Resolve budgets before
   dispatch;
   include nested teams in the same allowance. Recheck required independence.
4. Select ready slices with resolved prerequisites. Assign separate checkouts or disjoint write
   paths and name the integration base. Preserve dirty work. One owner controls shared runtimes and
   writes. Include checker build outputs in write scopes.
5. Give each worker the [standalone brief](references/worker-brief.md), including upstream findings.
   Give implementation workers the installed lint reference (Use the `workflow-configuration`
   skill). For a novel workflow, complete one representative slice and obtain its
   checker's passing verdict
   before expanding dispatch. Fix pilot findings and recheck before scaling.

## 2. Fan out

Dispatch ready workers concurrently within the chosen limit. Recompute readiness as prerequisites
finish. A failed prerequisite blocks its consumers. Add sub-coordinators only when needed to manage
the work. Continue independent work when another branch is blocked.

Use the `execute-task` skill for implementation and review (Use the `review` skill) for
independent implementation review. State specialist coverage limits. A small slice may use an
adequate executable check.

Keep bulk logs, captures, and large documents in accessible artifacts.
Assign bounded inspection when useful; require cited findings and evidence paths rather than raw
dumps.
Assign substantive evidence inspection to the checker. Its verdict must cover the real artifact.

Track each worker's slice, write scope, base, current attempt, status, and returned evidence.
Keep resumable state in the owning Tasks; link bulky receipts under workflow/reference/.
Probe liveness through supported read-only status or logs. Elapsed time alone does not prove a
stall.
Compare observed activity with the phase's expected progress before replacing a worker.
Cancel or isolate a stalled attempt before granting its write scope to a replacement.

Require PASS, ISSUES, or BLOCKED with evidence. Workers report every defect they can prove, changed
paths, revision, checks and conditions, and unresolved work. Record dropouts as coverage gaps.

## 3. Route checks and integration

Send every required output to its checker with acceptance, snapshot, and evidence conditions.
Check receipt presence and assignment identity. The checker verifies substantive claims, including
measurement conditions, and returns a current verdict. Request one corrected receipt for missing
evidence; a second miss remains a gap. Apply the declared race rule to checked results.

Assign the integrator the verified inputs, exact base, strategy, and shared write scope. It owns
assembly and conflicts; workers do not rebase shared branches. Assign checks on assembled behavior
and affected contracts. The coordinator releases consumers on current verdicts.

Drain completion events between integration steps; reconcile late results against the current base.
Route a late artifact to its checker before releasing it; preserve its scope/revision identity.
After restart, recover Tasks, branches, receipts, and actual worker state before dispatching.
Never assume a saved agent identifier still names a live worker.

Before retrying failed work, obtain the diagnosed cause and what the next attempt changes. Stay
within the run budget. Stop dispatch that would repeat a failed assumption.

## 4. Report

Account for every dispatched attempt as completed, failed, cancelled, or explicitly handed off.
At terminal boundaries, stop owned workers before returning; preserve only authorized handoffs.
Return a compact result table, evidenced issues, checks, integrated revision, gaps, and dropouts.
For a race, include the selection rule and why the chosen result satisfies it. Do not paste raw
dumps.

Use the `keep-intent-aligned` skill when findings change recorded intent or
leave material work unresolved. Record material execution findings and evidence in the owning
Task. After record edits, run `workflow format --write`, `workflow check`, and review the diff.
On continuation, check revisions and worker status before accepting delayed results.
Clean up only owned resources. Merge, deploy, publish, or start persistent monitoring only when
authorized.
