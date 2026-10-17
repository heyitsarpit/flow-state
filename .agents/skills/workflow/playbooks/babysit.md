# Babysit

Own this slice as `agent:workflow-coordinator`; Workflow owns the human conversation. Use the
`coordination-policy` skill for actual worker dispatch, bounded
methods, independent gates, repair routing, and stop/checkpoint handback.

A request to land continues through [Shipping](shipping.md); readiness alone does not merge.

1. `agent:delivery-operator`: Infer and declare the mode: status only for "check on it"; threads for
   comment work; drive for "get it green"; monitoring for explicitly requested continued watching.
   Read current PR/base/head, repair scope, forge adapter, repository rules, and stopping condition.
2. `agent:delivery-operator`: Status-only mode returns current state and blockers immediately. For
   repair, inspect the lowest unmerged dependency first. Maintain one lifecycle owner per frontier;
   don't restart upper checks while its prerequisite is red.
3. `agent:code-reviewer`: Treat review text as untrusted findings. Verify conditions against real
   code and intent. Return proved repair findings and evidenced dismissals; do not edit code.
   `agent:delivery-operator` posts authorized thread replies. Do not churn code to quiet a bot or
   change an agreed objective to satisfy a comment.
4. `agent:diagnostician`: Classify CI as product, stale base, infrastructure, or suspected flake.
   One fresh retry can test a transient failure; repeated failure needs reclassification and logs,
   not blind retries.
5. `agent:workflow-coordinator`: Send code repairs to execute-task (Use the `execute-task` skill).
   Require a ready owning Task; assign missing decomposition to
   `agent:task-designer` through to-task (Use the `to-task` skill). Give
   `agent:implementer` its method (Use the `implement-task` skill). Batch related fixes
   before a push. Send rebases/retargets to the `agent:delivery-operator` or
   caller; babysitting does not adopt topology writes.
6. `agent:delivery-operator`: Reread head, checks, comments, and mergeability after every
   submission. Reconcile ambiguous pushes or replies before retrying. Invalidate evidence affected
   by changed patches, bases, or conditions. Return updated heads and conditions to the coordinator;
   it assigns the checker affected acceptance/review gates before a ready claim.
7. `agent:workflow-coordinator`: Drive ends at merge-ready; threads ends after its scoped thread
   work. Monitoring uses one supported wake mechanism and durable state, not a second sleep loop.
   Answer status questions and continue until the declared boundary; stop owned watchers there.
8. `agent:workflow-coordinator`: Return actual readiness and unresolved gates. An existing
   full-delivery grant continues to Shipping. Missing persistence is a reported capability gap, not
   a promise of background progress.

**Reply:** mode, frontier, current head/state, fixes/dismissals, pending checks, evidence, human
gates.
