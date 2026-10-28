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

## 2. The name `raise` (flagged 2026-10-29)

`raise` comes from SCXML, where it means "an event inside this machine, handled in this turn" and
says nothing about direction. Next to `notify` (clearly up, child to host), it reads as if it also
goes up, yet every `raise` in v4 goes **down**: host to its trait, fragment to its nested trait,
`abandoned` to a root trait.

The user wants a word that means downward. Considered and not liked: `tell`, `send`, `feed`,
`forward`, `pass`, `cue`, `drive`, `dispatch`, `emit`, `signal`, `trigger`, `passDown`, `sendDown`,
`cascade`, `delegate`, `trickle`, `handDown`. Keep `raise` until a better word is found.


## 3. `.history` versus interrupts (flagged 2026-10-29)

**The need.** An interruption should come back to where the user was: "Discard changes?" → No →
the same wizard page; re-authenticate → the same page; a help overlay → back.

**Why v4 has `.history`.** Targets are static so `flow check` can draw the graph, and "the page I
was on" is not static. `S.WIZARD.history` is the classic statechart token (Harel 1987) that the
runtime resolves to WIZARD's last active child.

**What is wrong with it (the user: "poorly designed", "not general enough"):**

1. It restores the place, not the data. Returning re-enters the page, so its traits are fresh unless
   `.resumable()`. The signup drafts had to move to the root to survive.
2. It is attached to the target compound (`WIZARD.history`), while the meaning belongs to the
   interruption ("this dialog returns to where it was opened").
3. It is shallow, and brings deep history, history defaults and clearing as further questions.

**Options:**

- **A. Interrupts: pause instead of leave (preferred so far).** A compound declares what may
  interrupt it; entering an interrupt pauses the compound's active subtree instead of exiting it,
  and `S.WIZARD.resume` continues exactly where it paused, data and schedules included.

  ```ts
  // definition
  { WIZARD: Flow.state(["ACCOUNT", "PROFILE", "INVITE", "REVIEW"], {
      interrupts: { CANCELLING: Confirm },
  }) },

  // machine
  WIZARD: {
    on: { Cancel: S.WIZARD.CANCELLING },
    interrupts: {
      CANCELLING: { exits: { Confirmed: S.CANCELLED, Declined: S.WIZARD.resume } },
    },
  },
  ```

  Static (resume targets are WIZARD's leaves), one active leaf holds (the paused page is frozen),
  and it removes the main reason pages need `.resumable()`. Open: server results and timers owned
  by the paused page (held until resume, or handled while paused?); nested interrupts; entering an
  interrupt from outside its compound; how `onLeave` treats a paused page that is then left.
- **B. History that restores data.** Returning through `.history` also resumes the traits it
  restores. Smaller change; keeps the meaning on the target and keeps the shallow/deep questions.
- **C. The dialog as a trait.** An `open` flag on a `Confirm` trait placed on WIZARD; page guards
  refuse while open. Works in v4 today, but "inside the dialog" becomes a guard convention instead
  of structure.
- **D. Remember the page in memory.** `Declined: [{ guard: [lastWas(PROFILE)], target: … }, …]`.
  No new concept; verbose per page, and the same data problem as history.
