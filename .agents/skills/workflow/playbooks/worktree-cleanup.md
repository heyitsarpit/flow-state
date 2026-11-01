# Worktree cleanup

Own this slice as `agent:workflow-coordinator`; Workflow owns the human conversation. Use the
`coordination-policy` skill for actual worker dispatch, bounded
methods, independent gates, repair routing, and stop/checkpoint handback.

A stale-looking checkout may still hold active work or a worker's unique state.

1. `agent:resource-operator`: Read actual Git worktree and branch inventories, dirty/untracked
   state, merge ancestry, and current PR status. Measure requested disk usage when relevant. Derive
   paths from inventory, not guesses.
2. `agent:resource-operator`: Identify active, pinned, shared, and delegated checkouts through
   supported state or bounded evidence. If activity cannot be established, leave that candidate
   unresolved rather than calling it safe.
3. `agent:resource-operator`: Classify each candidate as active, dirty/unpushed, merged, abandoned,
   or uncertain. Show what would be lost. Obtain a decision at any unresolved loss boundary;
   preserve unrelated work. Return unresolved loss decisions through Workflow before removal;
   the coordinator returns the authorized candidate list to the operator.
4. `agent:resource-operator`: Use the harness's managed archive/remove mechanism when available. For
   ordinary Git worktrees, preserve authorized recovery state and use the standard worktree
   lifecycle. Do not force-remove a checkout just because normal removal refused it.
5. `agent:resource-operator`: Delete authorized branches. `agent:acceptance-checker`: Verify
   retained commits/recovery artifacts and the surviving worktree inventory afterward. Report
   removal separately from reclaimed bytes. Return failed removal or missing recovery evidence to
   the coordinator; reconcile actual state before a retry. Never broaden deletion to force success.
6. `agent:resource-operator`: Simulators or caches are separate named targets when requested. Apply
   the same usage/ownership gates; do not sweep unrelated application state under checkout cleanup.

**Reply:** removed resources, measured space when relevant, preserved work, and held
candidates/reasons.
