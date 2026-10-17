# Bug fix

Own this slice as `agent:workflow-coordinator`; Workflow owns the human conversation. Use the
`coordination-policy` skill for actual worker dispatch, bounded
methods, independent gates, repair routing, and stop/checkpoint handback.

Reproduce the failure, prove its cause, repair the bounded path, then check the original symptom.

1. `agent:source-investigator`: Recover the consumer's failing action and expected final state. Find
   the matching Task and relevant contracts. Reuse a valid supplied reproduction instead of
   restarting it.
2. `agent:diagnostician`: Use the `diagnose` skill on the real surface in owned or
   authorized test state. Separate failure mechanisms with discriminating observations. A plausible
   story is not a cause. If a fix already exists, compare it with the failing baseline before
   writing another.
3. `agent:implementer`: Plan the smallest repair justified by the evidence. Apply fix-root-causes
   (Use the `fix-root-causes` skill). Return consequential contract gaps to the
   coordinator for to-spec (Use the `to-spec` skill). An enforcement defect needs no new
   guarantee.
4. `agent:workflow-coordinator`: Draft or reuse the owning Task before resolving contract gaps.
   Give `agent:task-designer` to-task (Use the `to-task` skill) if missing. Resolve
   consequential
   gaps with to-spec (Use the `to-spec` skill); `agent:spec-author` receives author
   guidance (Use the `to-spec` skill). Refine the Task against settled
   contracts, then require readiness before code repair.
   Give the `agent:implementer` the cause, original repro, settled
   contract, write paths, and pass predicate. Use the `execute-task` skill; give
   the worker its method (Use the `implement-task` skill). A specialist returns
   additional
   assignment needs to the `agent:workflow-coordinator`.
5. `agent:runtime-operator`: Run the original repro at the final revision. It must fail before and
   pass after for the stated reason. Exercise affected public behavior and necessary recovery; do
   not substitute an easier path.
6. `agent:acceptance-checker`: Apply Task acceptance checking (Use the `check-task` skill). Return
   failures to their owner and missing independent review to the coordinator
   for review (Use the `review` skill). Recheck changed evidence. The
   `agent:record-writer`
   records findings throughout; marks done only after required gates pass. Return defects to step 4,
   contract
   gaps to step 3, and missing reproduction evidence to step 2. Recheck repaired snapshots before
   completion; preserve the original symptom and acceptance.
7. `agent:delivery-operator`: For granted PR publication, receive applicable
   [Opening a PR](opening-a-pr.md) steps from this owner. Otherwise return the verified patch.
   Commit only within the run's authority.

**Reply:** failure, demonstrated cause, repair, before/after evidence, revision, and unresolved
limits.
