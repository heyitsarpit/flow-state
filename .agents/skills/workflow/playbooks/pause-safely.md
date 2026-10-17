# Pause safely

Own this slice as `agent:workflow-coordinator`; Workflow owns the human conversation. Use the
`coordination-policy` skill for actual worker dispatch, bounded
methods, independent gates, repair routing, and stop/checkpoint handback.

A user stepping away while asking you to continue is not a pause.

1. `agent:workflow-coordinator`: Stop new dispatch and propagate hold/stop to owned workers and
   wakeups. Have each owner finish or back out of its current atomic step safely. Isolate any writer
   that cannot be
   stopped before releasing its scope.
2. `agent:resource-operator`: Follow resource preservation (Use the `orchestrate` skill).
   Preserve source, patches, captures, and receipts without disturbing unrelated work. Commit only
   when already authorized; a pause does not grant publication or merge permission.
3. `agent:record-writer`: Follow record checkpoint (Use the `orchestrate` skill). Record
   intent, grant, actual revision, dirty paths, completed checks and
   limits, running resources, pending gate, exact next action, and remaining budget in existing
   owning records or resume material.
4. `agent:workflow-coordinator`: Reconcile late results before marking them usable. Account for
   every attempt as terminal or explicitly handed off. A checkpoint records a stop, not completion.
5. `agent:workflow-coordinator`: Return the checkpoint. On continuation, use [Session
   pickup](session-pickup.md) to reconcile live state before resuming the incomplete gate.

**Reply:** stop boundary, preserved paths/revision, worker/wakeup state, pending gate, first resume
action.
