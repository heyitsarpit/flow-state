# Shipping

Own this slice as `agent:workflow-coordinator`; Workflow owns the human conversation. Use the
`coordination-policy` skill for actual worker dispatch, bounded
methods, independent gates, repair routing, and stop/checkpoint handback.

Check the current landing frontier, merge within the grant, then verify the landed revision.
A green check or armed queue is not a completed delivery.

1. `agent:delivery-operator`: Resolve the requested PRs, configured forge, repository rules, and
   dependency order from trunk. Return conflicts or missing topology to the coordinator for their
   declared owner before landing.
2. `agent:acceptance-checker`: Inspect independent behavioral/review evidence for each current
   base/head where required. Return missing review or runtime coverage to the coordinator; it uses
   review (Use the `review` skill) and assigns the required methods. A worker's
   self-proof or CI
   green alone does not settle consequential acceptance.
3. `agent:acceptance-checker`: Bind verdicts to actual patches, bases, dependencies, and runtime
   conditions. Recheck affected gates after drift. An unchanged patch does not prove behavior on a
   changed dependency/base. Return failures to the coordinator for author repair or missing proof;
   check the corrected snapshot before releasing that landing frontier.
4. `agent:delivery-operator`: Prepare only the lowest verified unmerged PR. Verify its current
   target and mergeability. Land that PR through the adapter, or arm it only when merge-when-ready
   belongs to the grant. Do not arm or retarget descendants before their parent lands.
5. `agent:delivery-operator`: Read back merged state and the actual landed revision. After an
   ambiguous write, reconcile PR/queue state before repeating; wait on pending work within budget.
   Stop with an unknown result if it cannot be reconciled. Never fabricate a landing receipt.
6. `agent:delivery-operator`: Refresh trunk, remaining bases, heads, checks, and unresolved threads
   after each confirmed merge. Resolve the next frontier's drift and repeat for the authorized
   contiguous run.
7. `agent:workflow-coordinator`: Stop at the ceiling, failed gate, explicit stop, or budget. Return
   evidence and the next gap. Independent changes remain outside the dependency chain and ship on
   their own.

**Reply:** landed revisions, current verdicts, queue/merge state, remaining frontier, and blocked
claims.
