---
page T118-schedule-issues
description A schedule's issue always matches its timer, a refused start stays visible and is retried after a reload.
---
# Schedule issues: what an app author notices (slice T118; 2026-11-22)

**Bottom line:** a schedule's issue now always matches its timer. A start that was refused stays visible and is
retried after a reload. An issue disappears when its key leaves or its state exits, never because some other check
ran. A bad schedule no longer swallows an answer the server already gave.

## New

```ts
// existing: definition, machine, schedules, armOn, restartOn, disarmOn   user-defined: idle, idleMs, TimedOut
export const AuthSession = definition({
  // ...
  schedules: { idle: { restartOn: Schema.Number } },
})

// in the machine body
SIGNED_IN: {
  on: { TimedOut: S.SIGNED_OUT, SignOut: S.SIGNED_OUT },
  schedules: {
    idle: {
      schedule: ({ memory }) => memory.idleMs,          // from the org's policy, loaded at runtime
      send: E.TimedOut,
      armOn: [Flow.entry],
      restartOn: ({ memory }) => countOf(memory.report), // each new activity starts the wait again
      disarmOn: [E.VideoStarted],
    },
  },
},
```

What you see when the policy is bad, say `idleMs` past the host's timer limit (2^31 - 1 ms):

- The sign-in still happens: `me` answers, the session enters `SIGNED_IN`, and `idle` is marked Refused with its
  issue in `snapshot.issues`. Before, the whole turn was refused and the session sat in `LOADING` forever.
- When a valid policy arrives, `idle` starts and its issue goes away.
- Reload the tab while it is refused: the refusal is saved, shows again, and is retried on restore.

## Changed

- **One issue per schedule, in a fixed order.** If more than one check fails, the issue shown is the first in this
  order: the firing, `restartOn`, the start, then the pause reasons. Before, the latest failure won.
- **Issues follow the timer.** A key that leaves, or a state that exits, takes its issues with it. A throw in one
  check no longer replaces or clears another check's issue.
- **A refused start does not refuse the turn** when its source can't send it again: an operation's outcome, an
  `onContext` reaction, or a send from another actor. The turn commits and the timer is Refused. An event a user
  sends is still refused whole, since the sender can resend.
- **A saved record shows its issues before it wakes.** Its snapshot shows the issues its saved timers imply, the
  same ones the wake will show.
- **One schedule placed in a state and again in a state below it is refused when the machine is built.** Placements
  in sibling states are still allowed.
- **`Duration` follows Effect.** A `Duration` with a NaN part builds as 0 ms, exactly as Effect reads it. A plain
  number delay that is NaN or Infinity is still refused by the range check, like any delay out of range.
- **Saved records move to format 6.** Each timer's last good `restartOn` value and a refused start are saved, so a
  reload no longer loses a restart. Format-5 records restore and are saved again as 6.

## Known gaps, each owned

- A turn in the home fixture's lounge publishes twice when it goes from OFFLINE to OFFLINE (Turn I9). It predates
  this slice and is pinned as a failing test. Owner: T97, which decides whether the runtime or the run rule is wrong.
- A send from another actor into a refused start has no Story of its own; only the `onContext` case does. Owner: T119.
- Three stress reload-sweep shards time out at 164 s, and this slice made one about a third slower. Owner: T141.
- `now` still reaches the keys, pause reasons and `restartOn` callbacks, and no test pins it (Schedules R10).

## Review the diff

This slice was one Task, so the per-Task view is the whole slice.

- The whole slice:
  `hunk diff 717a3ca2 7aa901f7 -- packages/flow-state-v3`
- Requirements (the 8,003-row sequence test, the Hub fixture, then the feature in sign-in and transfers):
  `hunk diff 717a3ca2 bad06723 -- packages/flow-state-v3`
- Build:
  `hunk diff 1aa8eb89 a9791f65 -- packages/flow-state-v3`
- First fix round (Q1 B, the resting snapshot, the `dueOf` lookup):
  `hunk diff 44e02c9b 2532e3e9 -- packages/flow-state-v3`
- Last round (NaN follows Effect, unrepeatable turns, the wake's selection):
  `hunk show 7aa901f7`
