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
  despite the locality and naming costs found in [spikes/schedule-triggers/RESULTS.md](spikes/schedule-triggers/RESULTS.md)?
- Or is a timer-only trait better expressed some other way, so authors rarely write this?

**Resolved (2026-10-29).** A schedule trigger is a handler: an event listed in an active schedule's `armOn` or
`disarmOn` is handled there, with no move, when the node has no written handler (machine-design.md 2.5 step 2, P7).
`Countdown` drops its no-op. `Flow.entry` alone did not cover it, because `Lockout`'s nested timer must not start
on entry.

## 2. The name `raise` (flagged 2026-10-29)

`raise` comes from SCXML, where it means "an event inside this machine, handled in this turn" and
says nothing about direction. Next to `notify` (clearly up, child to host), it reads as if it also
goes up, yet every `raise` in v4 goes **down**: host to its trait, fragment to its nested trait,
`abandoned` to a root trait.

The user wants a word that means downward. Considered and not liked: `tell`, `send`, `feed`,
`forward`, `pass`, `cue`, `drive`, `dispatch`, `emit`, `signal`, `trigger`, `passDown`, `sendDown`,
`cascade`, `delegate`, `trickle`, `handDown`. Keep `raise` until a better word is found.

**Status (2026-10-29): `raise` stays for now.** Not blocking; reopen only if a better word turns up.


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
  interrupt from outside its compound; how `whenAbandoned` treats a paused page that is then left.
- **B. History that restores data.** Returning through `.history` also resumes the traits it
  restores. Smaller change; keeps the meaning on the target and keeps the shallow/deep questions.
- **C. The dialog as a trait.** An `open` flag on a `Confirm` trait placed on WIZARD; page guards
  refuse while open. Works in v4 today, but "inside the dialog" becomes a guard convention instead
  of structure.
- **D. Remember the page in memory.** `Declined: [{ guard: [lastWas(PROFILE)], target: … }, …]`.
  No new concept; verbose per page, and the same data problem as history.

**Closed (2026-10-30): `.history` stays as it is.** It restores control only, as designed; data survives by placing
traits at the node whose lifetime matches it (the signup drafts at the root) or with `.resumable()`. Cases with a call
in flight across the interruption use the documented recipe: handle the late ending at the ancestor it routes to.
Interrupts and a computed `default` were considered and not taken; deep history stays deferred. The rename to
`lastChild` (one token for the target and the read) was suggested and not taken.

## 4. Server calls, the in-machine half (flagged 2026-10-29)

**Merged into [machine-design.md](machine-design.md) on 2026-10-30** (section 2.7), from
[merged/server-calls/proposal.md](merged/server-calls/proposal.md), which superseded `in-machine-calls-proposal.md`
(removed). The notes below are the record of what was flagged.
`unknown` was kept as the name. What it leaves open is in its section 8.

The network discussion is split: decisions outside the machine (operations, adapters, errors, the
cache and domains) are discussed first; these in-machine ones wait here.

- **Outcome keys at the call.** Proposed: `success`, `failure` (definite only, with a built-in
  `NotSent` tag), and a "maybe" outcome carrying `{ attempt, reason }`. `interrupt` and `defect` stop
  being keys. Open: rename the "maybe" outcome from `unknown` to `uncertain`, because "unknown"
  reads as "unknown reason", which is a different thing (a definite failure can have an unknown
  reason).
- **`Flow.uncertain`** stays as the marker on events the "maybe" outcome may target.
- **Where `timeout` and `retry` live.** v4 puts them on the commit call in the machine. They
  describe the server (how slow it is, which errors are transient), so they may belong on the
  operation, with per-call overrides. Also: `retrying` as a progress report, and a retry delay
  taken from the error (`Retry-After`).
- **Fencing, `abandoned` and late turns.** `abandoned` runs twice (pending, then settled); late
  turns may not pre-empt live work. Review whether both runs are needed and how they read.
- **The saga recipe, `O.x.retry(attempt)`, `O.x.cancel`, `.pending`, the mapper's
  `{ input, attempt }`.**

## 5. Bulk starts ("like all selected") (deferred by the operations merge, 2026-10-30)

One write per item is the only form; a bulk contract over the set is the pattern today (operations merge B14; audit-multiplicity F13).

## 6. Throttled independent writes (deferred by the operations merge, 2026-10-30)

Under unkeyed `serialize`, one unknown holds every later write; `allow` neither throttles nor holds. Today: a memory queue in the machine (design 2.7.13's limits; operations merge B56).

## 7. Per-key fan-out of write members (deferred by the operations merge, 2026-10-30)

`commit`, `retry` and `cancel` have no per-key form over a dynamic set in one turn: archive selected threads, flush held notes on reconnect, retry all unsure, cancel all uploads (design 2.7.13's limits; operations merge B72).

## 8. Per-item stops and "drop the queue" on `serialize` (deferred by the operations merge, 2026-10-30)

No member stops one queued commit or drops the queue; key-less members stand only in the head's own ending (OD19, Q35). A keyed design is the pattern today.

## 9. Offline as a reason to wait before invocation (deferred by the operations merge, 2026-10-30)

Treat offline as one more wait in `InFlight` (waiting to be invoked), which is never-sent and so safe, as TanStack Query pauses mutations (operations record 10.3). No syntax.

## 10. Resuming never-sent work across a reload (deferred by the operations merge, 2026-10-30)

TanStack Query's model; today queued commits end `NotSent { Restored }`. Adopting it would amend C2 and Operations O3 (operations record 10.3).

## 11. Branded keys (deferred by the operations merge, 2026-10-30)

Any record carrying the key's fields type-checks against `get`; branded keys would close it (operations record 3.4). Not proposed.

## 12. An age bound on adopted holds (deferred by the operations merge, 2026-10-30)

A hold adopted after the server's idempotency window re-sends what is a new write there; a bound would be public API (design 2.7.13's limits).

## 13. A `fromRpc` adapter (deferred by the operations merge, 2026-10-30)

An opt-in `resource.fromRpc` / `transaction.fromRpc` taking an existing `Rpc` for its schemas, when a real app needs it (OD13).

## 14. A catch-all for per-tag `unknown` (deferred by the operations merge, 2026-10-30)

If listing Flow's unknown reasons in every per-tag record proves too verbose, a catch-all entry would be public API (operations merge X22).

## 15. Wiring the author writes that the system should handle (flagged by the owner, 2026-10-30)

Flow controls the whole stack (contracts, operations, machine, store, persistence, Stories), so integration work an
author repeats in every app should be in the "it just works" category instead of user code. Audit every feature for
wiring the author must write by hand that the system could do internally, and decide which to absorb. The streams
example that raised it: each fact-feed handler stores the message and moves the resume position, and the position
rule is written twice (the contract's `position` and the machine's `cursor: event.message.cursor`); a helper such as
`Feed.track` was considered and deferred because it fits only "a list plus a cursor" in memory.

The audit should, for each case: show the wiring as it is written today; say whether it is the same in every app
(absorb) or a real app decision (keep); and propose the internal behaviour, with no new public word where possible.
Candidates already seen: resume position and dedupe on fact feeds; catch-up paging; reconnect backoff kept across a
reload (the chat `reopenInMs` field); retry-budget handlers (`retryable` then `retry`, else `cancel`) repeated on every
write; releasing a held write in every toast-only `unknown` handler; mirroring lane state into memory for views;
key selectors in user events; seeding a feed's first position from a history read. Also: a ready-made payload schema for `missed` events (for example `Feed.Missed`, `{ why, restartAt? }`), since every app declares the same shape. Scope: machine-design.md as merged,
streams (proposal-v2.md) and operations-in-fragments.

## 16. Outbound live state on a session (cursors) (deferred by streams S5, 2026-10-30)

A first-class outbound slot (`O.doc.publish(s, value)` from views) with its own rules for turns, Stories and
`check()`. Today a write is the documented workaround (streams proposal-v2 4.8).

## 17. One shared session per Runtime (deferred by streams S5, 2026-10-30)

For `listen` entries and connection-limited sources (SSE's six per origin); M6-D6's open part. A stated limit today.

## 18. A manual `reconnect` member on a stream (parked, 2026-10-30)

Re-open a placement's session from its `input` without leaving the state (merge-6-streams/proposal.md 11.1).
proposal-v2 does not preclude it.

## 19. `fromRpc` streams and download resume with `Range` (deferred by streams S5, 2026-10-30)

An Rpc-backed stream adapter (with OD13's `fromRpc`), and resuming a download by byte range.

## 20. A from-scratch experiment: what we would build knowing everything now (owner, 2026-10-31; after merge 3)

Run after the Stories proposal (merge 3) is done, so every requirement is in. Give fresh Opus designers the full set
of requirements, known failure cases and constraints gathered across all proposals (machine-design.md, the merged
records, the briefs, every review and model finding), but not the design itself, and ask them to sketch a library
from scratch. Not a full proposal; two outputs:

1. **New shapes.** Ideas that do not appear in the current design at all and may be worth borrowing.
2. **The main point: overbuilt, underbuilt or built wrong.** Places where one unifying feature would have fixed
   several problems at once, compared with what we ended up with (several rules, modes or words each covering one
   case). For each: the problems it would unify, what it would replace in machine-design.md, and what it would cost
   to adopt now.

Judge the findings against the current design afterwards; nothing is adopted without the owner.
