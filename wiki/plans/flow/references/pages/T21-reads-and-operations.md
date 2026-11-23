---
page T21-reads-and-operations
description Reads share one entry per resource and key, commits change them with read.set and read.update, and calls end exactly once.
---
# Reads and operations: what an app author notices (slice T21; 2026-11-23)

**Bottom line:** a resource's data is one shared entry per resource and key for the whole Runtime, placed by states
and released within the disposal bound. A commit changes read data only through `read.set` and `read.update`, as
an optimistic look or as its success `writes`. Every call ends exactly once, the same live as after a reload.

## What you notice

```ts
// existing: resource, transaction, outcomes, commit, activities   user-defined: history, send, Thread
// NEW: read.set, read.update, O.x.subscribe(select, { placeholder }), resource({ persist: true, output })
const history = resource({ id: "Chat/history", input: { thread: Schema.NonEmptyString }, key: ["thread"],
  services: [HistoryApi], lookup: (input) => HistoryApi.use((api) => api.history(input)) });

send: send.outcomes(
  { success: E.Sent.from((v, { input }) => ({ clientId: input.clientId, id: v.id })), unknown: E.SendUnsure },
  { writes: ({ value, input }) => [history.update({ thread: value.thread }, (current) => ({
      messages: [...current.messages, { id: value.id, author: value.author, text: input.text }] }))] },
),
O.send.commit(select, { optimistic: ({ memory, event }) => [
  history.update({ thread: memory.thread }, (current) => ({ messages: [...current.messages, echo(event)] }))] }),
```

- Two machines reading one resource and key share one entry and one request. A reader closing no longer
  interrupts a read another reader still holds.
- A state places a read with `activities: [O.x.subscribe(select, { placeholder })]`. A read row on the snapshot
  carries `data` and `predicted`, so a view shows a live optimistic look; `value` still fires only for confirmed
  data.
- `read.set(key, value)` replaces the data; `read.update(key, f)` derives it, and `f` must return the new data.
  A `writes` list with any bad target applies nothing and reports `InvalidUpdate`; the commit still succeeds.
- `O.x.setData` is gone. An optimistic value is removed when its commit fails, is cancelled or is displaced, and
  it holds its entry while live.
- `resource({ persist: true, output })` saves its entry; a reload installs it as stale. `persist` without
  `output` is refused at construction.
- Ending mappers receive `(value, { input, key })` with no annotation. A transaction may declare `idempotency`
  and report `progress`. Boot refuses an operation whose service the Runtime Layer lacks, by name.
- A call still running past the disposal bound shows `ReleaseOverdue` (`CleanupOverdue` is gone).

## Calls made for you (each tagged on its Task, reversible)

- A read's request runs in the Runtime's work, not the asking actor's; a failed read cleanup goes through
  releases (the superseded Actors R23 quarantine lost the second reader's ending).
- "Overdue" is read from the Release alarm having fired, since the issue view has no clock.
- Installing a saved entry over one already in memory is adoption, owned by @task.V3.T48.
- Freeze and thaw of entries and placements are @task.V3.T109's; the Q15 construction warning is @task.V3.T22's.
- Your calls this slice: @plan.Pending D41 (`read.set` and `read.update`, `setData` cut), the relaxed
  `durability` and `laneBound` stress limits (@task.V3.T117 keeps the speed work), and the `SharedTransaction`
  warning added to @task.V3.T22.

## Review the diff

- The whole slice: `hunk diff 47556c2f 847ca910 -- packages/flow-state-v3`
- Requirements (the reds, the review's fix round, the newly owned features):
  `hunk diff 47556c2f 0e0e5c03 -- packages/flow-state-v3`
- Build of T121 and T122: `hunk diff 0e0e5c03 4dc210eb -- packages/flow-state-v3`
- T122's fix round (shared reads, the entry table, writes): `hunk diff 7cda482f 456e1264 -- packages/flow-state-v3`
- Build of T123 and T124, with D41: `hunk diff 099b088d 1c4bf6b5 -- packages/flow-state-v3`
- T123 and T124's fix round: `hunk diff 1c4bf6b5 847ca910 -- packages/flow-state-v3`
- Each Task: T121 `hunk diff 0e0e5c03 ed8973bc`; T122 `hunk diff ed8973bc 4dc210eb` and `hunk diff 7cda482f 456e1264`
  and `hunk diff 7867b2a4 726a2c7e -- packages/flow-state-v3/src/contract.ts packages/flow-state-v3/src/core/entry-writes.ts`;
  T123 `hunk diff 099b088d 7867b2a4` and `hunk diff 726a2c7e fe24f876`; T124 `hunk diff fe24f876 33efcd7a`.
