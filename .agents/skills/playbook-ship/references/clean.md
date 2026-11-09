# Clean up worktrees and branches

A stale-looking checkout may still hold active work or a worker's only copy of its state.

1. Read actual Git worktree and branch inventories, uncommitted and untracked state, merge
   ancestry, and current PR status. Measure disk usage when requested. Derive paths from the
   inventory, not from guesses.
2. Identify active, pinned, shared, and delegated checkouts through supported state or bounded
   evidence. If activity cannot be established, leave that candidate unresolved rather than
   calling it safe.
3. Classify each candidate as active, dirty or unpushed, merged, abandoned, or uncertain. Show what
   would be lost and get the user's decision at every loss boundary. Preserve unrelated work.
4. Use the harness's managed archive or remove mechanism when available. For ordinary Git
   worktrees, preserve authorized recovery state and use the standard worktree lifecycle. Do not
   force-remove a checkout because normal removal refused it.
5. Delete only authorized branches. Afterward, verify retained commits or recovery artifacts and
   the surviving worktree inventory. Report removal separately from reclaimed space. Reconcile
   actual state before a retry; never broaden deletion to force success. When
   removal fails or recovery evidence is missing, stop and report to the user.
6. Simulators and caches are separate named targets, only when requested, under the same usage and
   ownership checks.

Return removed resources, measured space when relevant, preserved work, and held candidates with
reasons.
