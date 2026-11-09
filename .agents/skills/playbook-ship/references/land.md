# Land pull requests

A green check or an armed queue is not a completed delivery.

1. Resolve the requested PRs, configured forge, repository rules, and dependency order from trunk.
   Return conflicts or missing topology to the user before landing.
2. Check independent behavioral and review evidence for each current base and head where required.
   Run `review` or `check-runtime` for missing coverage. A worker's self-proof or a green CI alone
   does not settle consequential acceptance.
3. Bind verdicts to actual patches, bases, dependencies, and runtime conditions. Recheck affected
   gates after drift; an unchanged patch does not prove behavior on a changed base. Return
   failures for repair and check the corrected snapshot before landing it.
4. Prepare only the lowest verified unmerged PR. Verify its current target and mergeability. Land
   it through the adapter, or arm it only when merge-when-ready was requested. Do not arm or
   retarget descendants before their parent lands. A checker's verdict never bypasses an enforced
   approval.
5. Read back the merged state and the actual landed revision. After an ambiguous write, reconcile
   PR and queue state before repeating; wait on pending work within budget. Stop with an unknown
   result if it cannot be reconciled. Never fabricate a landing receipt.
6. After each confirmed merge, refresh trunk, remaining bases, heads, checks, and unresolved
   threads. Resolve the next frontier's drift and repeat for the requested contiguous run.
7. Stop at the requested boundary, a failed gate, an explicit stop, or the budget. Independent
   changes outside the dependency chain ship on their own.
