# Orchestrate

Own this slice as `agent:workflow-coordinator`; Workflow owns the human conversation.
Apply [coordination-policy](../../coordination-policy/SKILL.md) to actual worker dispatch, bounded
methods, independent gates, repair routing, and stop/checkpoint handback.

Use when work outlives one bounded owner. One-session work can use [Autonomous
run](autonomous-run.md).

1. `agent:workflow-coordinator`: Frame the counted outcome, units, tracks if needed, effort, budget,
   delivery ceiling, and reserved human gates. Read current commitments and actual project state.
   Use [Multi-phase plan](multi-phase-plan.md) when the executable decomposition is missing.
2. `agent:workflow-coordinator`: Derive active roles from the program; use setup's model
   preferences.
   Keep assignments explicit. Use [graph design](../../setup-workflow/references/agent-graph.md)
   when complexity warrants it. Add a track coordinator only when its coordination load needs one.
3. `agent:workflow-coordinator`: Run [orchestrate](../../orchestrate/SKILL.md) for isolation,
   standalone briefs, dispatch, liveness, replacements, and integration. It owns those mechanics;
   this playbook owns program flow. Keep the same owner for this method. Give workers bounded
   phase methods and actual upstream findings, not this composite method or just a
   dependency label.
4. `agent:workflow-coordinator`: Run one representative unit through build, checking, review, and
   its delivery boundary. If the pilot exposes a broken brief, verification recipe, or unit scope,
   assign its owner to correct it and its checker to rerun affected gates before scaling.
   For cheap equivalent units, use the first normally
   checked unit as the pilot.
5. `agent:workflow-coordinator`: Refill ready work as prerequisites complete within the global
   limit. Treat completions as queue events; wait for the `agent:integrator`'s atomic shared writes
   before processing new arrivals. Missing results remain gaps.
6. `agent:integrator`: Assemble verified units continuously within authority; control shared writes.
   `agent:acceptance-checker` rechecks assembled behavior. Keep a dependency frontier green rather
   than spending work above it.
7. `agent:workflow-coordinator`: Resolve failures from evidence: shrink failed scope, fix
   capability, or replace isolated stalled writers. Reconcile late artifacts against the current
   base. Stop repeated failed assumptions.
8. `agent:record-writer`: Keep Tasks and receipts resumable. `agent:workflow-coordinator` uses
   [Autonomous run](autonomous-run.md) for supported waits; one `agent:workflow-coordinator` and one
   wake mechanism own the program. The `agent:workflow-coordinator` continues unaffected work around
   human gates.
9. `agent:workflow-coordinator`: Close only after every attempt is complete, failed, cancelled, or
   explicitly handed off, and the real assembled outcome satisfies its predicate. Stop owned
   workers/wakeups; retain the audit trail.

**Reply:** predicate/counts, integrated units, frontier/revisions, verdicts, abandoned work,
reserved gates.
