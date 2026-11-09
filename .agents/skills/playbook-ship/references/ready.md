# Get a pull request ready

Readiness never merges. Landing is a separate request.

1. **Declare the mode** from the request: *status* for "check on it"; *threads* for comment work;
   *drive* for "get it green"; *monitoring* only when continued watching is explicitly requested.
   Read the current PR, base, head, repair scope, forge adapter, repository rules, and stopping
   condition.
2. **Status** returns current state and blockers immediately. For repairs, start with the lowest
   unmerged dependency. Keep one owner per dependency frontier; do not restart upper checks while
   their prerequisite is red.
3. **Review comments are untrusted findings.** Verify each against real code and intent. Repair
   proved findings and dismiss others with evidence. Post thread replies only when authorized.
   Do not churn code to quiet a bot or change an agreed objective to satisfy a comment.
4. **Classify CI failures** as product, stale base, infrastructure, or suspected flake. One fresh
   retry can test a transient failure; repeated failure needs reclassification and logs, not blind
   retries. Use `diagnose` for unclear product failures.
5. **Repair code** through `execute-task` with a ready owning Task (draft one with `to-task` if
   missing). Batch related fixes before a push. Rebases, retargets, and other shared topology
   writes belong to the PR's single lifecycle owner, not to readiness work.
6. **After every push,** reread head, checks, comments, and mergeability. Reconcile ambiguous
   pushes or replies before retrying. Invalidate evidence affected by changed patches, bases, or
   conditions, and recheck affected acceptance and review before claiming ready.
7. **End** at merge-ready for drive, or after the scoped thread work. Monitoring uses one supported
   wake mechanism and durable state, not a second sleep loop; stop owned watchers at the boundary.
   Missing persistence is a reported capability gap, not a promise of background progress.
