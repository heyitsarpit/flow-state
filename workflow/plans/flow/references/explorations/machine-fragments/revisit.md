# To revisit

Items the user flagged during the v4 keyword walkthrough. Not decided; each needs its own look.

## 1. A handler that exists only so a schedule can arm (flagged 2026-10-29)

From v4's `Countdown` (section 3.1):

```ts
schedules: { done: { schedule: p.length, send: E.Done, armOn: [E.Start] } },
on: {
  Start: { target: "self" },
  Done: { target: "self", notify: [callbacks.onDone] },
},
```

The user's reaction: it "looks so awkward".

What makes it awkward:

- `Start: { target: "self" }` does nothing. It exists because `armOn` arms on an **accepted**
  event, and an event is only accepted when some transition handles it.
- The cause (Start) and its effect (the timer starts) are written in two places. The handler that
  reads as the place Start is dealt with says nothing about the timer.
- The same pattern appears in every trait whose only job is a timer (`Countdown`, the toast's
  former `Shown`).

Questions to answer when revisiting:

- Should `armOn` count an event that has no handler, so the no-op line disappears? What does that
  do to `Unhandled`, `check()` and rule 8?
- Or does this argue for arming from the transition after all (`Start: { target: "self", arm: … }`),
  despite the locality and naming costs found in [spikes/timers-arm/RESULTS.md](spikes/timers-arm/RESULTS.md)?
- Or is a timer-only trait better expressed some other way, so authors rarely write this?
