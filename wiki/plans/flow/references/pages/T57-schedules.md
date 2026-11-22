---
page T57-schedules
---
# Schedules: what an app author notices (T57, 2026-11-20)

**Bottom line:** schedules can pause for named reasons, run one timer per key, follow an Effect Schedule, and survive
reloads and definition edits; every same-turn combination of their inputs is decided in one place, so arm, disarm,
restart, pause and firing never disagree.

Superseded in part by the user's 2026-11-22 decision: a schedule's name, key, pause reasons and `restartOn` Schema
are declared on the definition, and `Flow.keyed` below is deleted (slice @task.V3.T89).

```ts
schedules: {
  check: {
    schedule: Schedule.spaced("5 minutes").pipe(Schedule.upTo({ times: 3 })), // existing: an Effect Schedule
    send: E.Checked.from(({ attempt }) => ({ attempt })),
    armOn: [Flow.entry],                                                      // event tokens or Flow.entry only
    restartOn: ({ memory }) => memory.target,
    disarmOn: [E.WindowOpened],
    paused: { Vacation: ({ context }) => context.mode === "VACATION" },     // NEW: named pause reasons
  },
  poll: Flow.keyed({                                                        // NEW: Flow.keyed (you accepted it)
    keys: ({ memory }) => memory.sensors.map((s) => ({ id: s.id })),        // one timer per key
    schedule: ({ key, memory }) => Schedule.spaced(POLL_EVERY[kindOf(memory.sensors, key.id)]), // key is typed
    send: E.Polled.from(({ key, firedAt }) => ({ id: key.id, at: firedAt })),
  }),
}
```

## Behaviour to know

- **Pauses:** any true reason holds the timer with its time `left`; the snapshot shows `pausedBy` beside `left`, never
  `dueAt`. Paused time never counts.
- **Disarm wins:** a disarm in the same turn as a restart, an arm or a key appearing leaves the schedule disarmed.
- **A computed negative delay** fires once on the next turn; a fixed negative delay is a construction error.
- **Restore:** a multi-step Schedule continues at its saved attempt (your D40); restore after a schedule, key or reason
  is added, removed or renamed is tested. The record is format 5 (6 after T118).
- **A throwing callback** (`keys`, `restartOn`, a reason) raises one issue and keeps its last value; it never fires a
  timer it should hold.
- **Types:** body types hold at any depth, and context is typed in guards, updates and pause reasons.

## Still open

- How schedule issues are stored is being redesigned in @task.V3.T118 (your accepted Fable proposal): two lost
  endings the last review found are pinned there as known-failing tests.
- `pausedBy` as a literal union in the snapshot and the unkeyed `key` type are @task.V3.T113's.
- The home-rooms stress sweep is over its time bound; @task.V3.T117 owns it.

## Status

Unread.
