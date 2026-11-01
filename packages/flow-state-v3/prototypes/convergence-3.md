# Convergence 3: round 3's decisions, every finding at once

Status: **everything here is proposed.** Written under the owner's delegation; nothing is decided until he says so. It gathers `round-2/RESULTS.md` and `round-2/review.md` (H1-H6, M1-M12, L1-L9) and answers them by root cause rather than one by one. Revision read: `d9584ee9`. `D1`..`D44` are the earlier convergences'; `D45`.. are new. The review's findings are advice: where I disagree it says so. No keyword below is public API unless marked **public**. Nothing here has run yet: reasons are reasoning until `round-3/RESULTS.md` says otherwise.

## Read this in the morning

| # | Decision | Why it might be wrong | Cost to flip |
| --- | --- | --- | --- |
| **One decision** | **D3, D40, D41's replacement (D47), rule 32 and D15, together.** See the section below. Proposed: keep D3 | D3's price is that a person who has not pressed can stall another actor's writes for an hour. It is now visible, and still a stall | Flipping D3: large, it brings back contested, the third clause, and S1's cycles |
| D46 | **A module defect fails closed.** D27's "disable and carry on" is replaced: a disabled store holds what joined it and declines what would join it, until reload | Availability: one store bug stops every write of every machine using it, for the session. The review and I judge correctness first | Small: one branch in `blocks` and one in `start` |
| D46 | **A user closure outside a turn never disables and never kills.** It is an issue with its origin and a default per hook | The default for a throwing `confirms` (end the prediction, force a repair) is my call | Small: one line per hook |
| D48 | **A never-sent cancel or replace waits for its ack.** The row stays `pending` until storage answers; on a hung disk that is forever | With a hung disk the "stop" never takes effect on screen. The alternative is a tombstone, which needs that same disk | Small: one phase field, two cells |
| D49 | **`stalled` on the row. Public.** Past a bound, a row says it is stalled, on storage or on another's record. No ending, no event | It is a new public field, and a machine still cannot react except through a view or a guard. D30 stays: silence never says "not charged" | Small: one field |
| D50 | **D31 revised: a refused turn of an ending is redelivered once, after other mail.** PAY-11's expectation changes, logged | A second `InvalidTurn` for one fact; a machine sees a success one mail item later than its siblings. The review asked only for unknowns; I apply it to every ending because a lost success is a charge with no order | Trivial: one flag |
| D47 | **Answer positions: an answer older than what we hold, and different, is not applied and forces a repair.** Replaces D41's cut and closes M3 | A read racing a write costs one more read. The design's word "contested" and its loader/holder refetch collapse into this one repair | Small: the one comparison |
| D55 | **A success that clears a given-up mark forces one repair** | One more read per such success. It narrows LIKE-06's silence, it does not close it | Trivial |
| D15 | **Ships now, unbound holds only**, as convergence-1 wrote it. Bound holds never yield | Re-opens late landing for this case ([S1, D15]). Rule text says the hold is the default; this is the one quiet-looking release | Small: one timer kind |
| D51 | **Seam rewritten.** 14 hooks stay 12 built plus 2 on paper, with 4 new capabilities. Streams' table fits on paper | Paper only: `reconcile`, `turned`, `deliver`, `retract`, `tell` have no user until round 4 and are **not built** | Small now |
| D52 | **Fragments are one tree of incarnations**, with the root as an incarnation like any other. Compiled format gains `fragments` and `placements` | Hand-written compiled data can pass on a format nothing can produce; round 6 answers it. Memory views cost a recursive merge per closure | Large later; it is the turn's shape |
| D54 | **10,000 stands; D38's 12,450 is flagged, not relied on.** My projection is at the end of this file and in RESULTS | Owner set 10,000. D38's move to 12,450 was not his decision | Owner's word |
| D36 stays | **Converted Pay is unchanged**, bugs pinned, per-key oracle and narrow pins. Pay's memory design is his call | Suite still pins real money bugs | Apply the list |

## D3, D40, D47, rule 32 and D15: one decision

They are not five findings. **D3 is the root** ("a write keeps its place from its first commit until it is resolved or released; a retry never rejoins"); the other four are what D3 implies.

| Item | What follows from D3 | Status |
| --- | --- | --- |
| Rule 31's "contested by position against a newer write" | No newer write passes an unresolved one in one Runtime, so that case cannot happen | gone |
| H4: a replayed response over a newer **read** | D41 looked only at writes. A read can deliver newer data, so position still matters | **D41 was wrong. D47 replaces it** |
| Rule 32's third clause, "a mark whose Attempt is unresolved stays" | Reached only if a later write can succeed past an unresolved one; D3 forbids that. The review's mutant ran to depth 7 with the same state count | Keep the word (`m.given`): it documents the rule and costs nothing. Untested by nature |
| D40: at 30 s a repair ends, the hold keeps its entry | A live hold outranks the bound, or D3 is false | Keep |
| Rule 30's "holds the queue until the repair settles" becomes "until resolved or released" | This is what makes the wait **unbounded**. The design's stated limit was narrower: only a queued `W` at the head | The price |
| The price: **one Held Attempt whose owner is a person who has not pressed stalls every other actor's writes to that record** | [ran, review M2] an hour, no issue. Only `waits()` named it | D49 makes it visible at 30 s: `RecordHeld { holder, waiter }` evidence once, row `stalled`. **Not removed** |
| An unbound hold (its actor gone) can stall a record across reloads | D15 yields it after 5 min with a waiter; parked `unknown { Abandoned }`. Local identity: D21 releases at dispose | Ships this round |

**The choice for the owner.** A: keep D3 with the visible stall (proposed). The stall is the honest price of "last intent wins", and Query's `scope` blocks the same way (`codebases/tanstack-query/packages/query-core/src/mutationCache.ts:161-173`). B: rule 30 as written, the queue releases after the repair settles; then rule 32's third clause and contested come back and S1's inversions with them ([ran, S1] 5,640 inversion states with any hold release). C: D3 with a bound on bound holds too; that is a silent late landing with a person's hold, which OD5 refused. **I found no finding that argues for B or C on correctness.**

## Root causes

The review lists six Highs and twelve Mediums. They have five causes.

| Cause | Findings | Answer |
| --- | --- | --- |
| **A. "Never sent" was spelled from what storage last heard** | H1, half of M1 | D45, D48 |
| **B. A throw had no owner, so its blast radius was accidental** | H2, H3, H6, M8, M5, L2, L5, L6 | D46, D50 |
| **C. An answer was treated as now, when it describes a moment ago** | H4, M3, LIKE-06, shortcut "repair has no position" | D47, D55 |
| **D. A wait with no sink is invisible** | M2, M4, M9, D15 | D49, D15 |
| **E. The seam was shaped by one module; the suite by one builder** | M6, M7, H5, M10, M11, M12, L1, L3, L4, L8, L9 | D51, D53, D54, D56 |

## A. History is one bit (D45), and the ack window has a fence (D48)

`sends` is what storage last heard. A restored Attempt can read `sends: 0` with the request out, and every "by history" cell then says never sent. But `Held` is entered only by an unknown, and `retry` only leaves `Held`, so **"was this ever possibly sent" is exactly `mayHaveApplied`**, once restore sets it and `invoke` sets it before the request exists. So `sends` goes: not a second flag beside it.

```ts
// BEFORE (round 2)
default: return h.sends === 0 ? "Waiting" : "Resend"              // `sends` is a capture of a capture
// AFTER
default: return h.sent ? "Resend" : "Waiting"                     // NEW: Attempt.sent replaces sends and mayHaveApplied's history role
// rule 18's "no earlier send ended unknown" reads `unknownOnce`, set only by an unknown ending or a restore as unknown
// `sent` is set in the invoked cell, before the command exists, and by the restore row. It is never cleared.
```

Added: `Attempt.sent`, `Attempt.unknownOnce`, `Attempt.sentAt`. Dropped: `Attempt.sends`, `mayHaveApplied` (split: "may have gone" and "ended unknown" were one field doing two jobs; `commit` of a re-send needs the first, rule 18 the second).

**D48.** Round 2's D30 closed the bound's door into "told not sent, actually acked". Cancel and `latest`'s replace use the same window. A `never sent` Attempt whose ack is out may be **on disk as acknowledged**, so a `NotSent` now can restore as `unknown { Restored }` after the fact (M1: server goes backwards with no `Released`).

```ts
| { t: "durable"; on: "ack" | "capture"; ticket: string; then?: "cancel" | "replace" }  // NEW: then. What to do once storage answers
```

Cancel or replace in that window records `then` and waits. On `ok` the never-sent cell runs. On refusal `NotSent { StorageRefused }` as ever. Rejected: a tombstone (needs the disk that is silent), and an immediate `NotSent` (the bug). **Stated limit**, not closed: an acknowledged never-sent Attempt told `NotSent { Cancelled }` whose record's delete is lost in a crash restores as `unknown { Restored }`. Rule 17 already says so.

## B. One rule for a throw (D46), and an ending's refused turn (D50)

| Who threw | Where | What it means | Blast radius |
| --- | --- | --- | --- |
| User closure | In a turn (guard, patch, select, prediction, field function, key, input) | `InvalidTurn`, origin named (D11) | The turn. An ending's cell stays |
| User closure | Outside a turn (a store mapper at settlement, a read mapper) | Issue `UserClosure`, origin named. Its effect is the hook's stated default | Nothing else. **Never disables, never kills** |
| A value core must encode (key, input, persisted memory) | In a turn | Encoded inside the turn's attempt, so `InvalidTurn` | The turn |
| A stored record | Restore | **Per record**: quarantined, issue `RecordQuarantined { key, why }`, the rest boots. Unknown machine or operation: same, as `orphaned` (P19) would | That record |
| A module's own code | A hook | Issue `ModuleDefect`; its effects roll back; module disabled. **Fails closed:** what joined it stays unsent, what would join declines `NotSent { ModuleDisabled }`. Machines not using it continue | The module's users, until reload |
| Core's own code | The step | Fatal. Fibers interrupted, inputs dropped with evidence | The Runtime, until reload |

Defaults for outside a turn: `confirms` throws: the prediction ends, the record is repaired (no field is believed). A read mapper throws: the answer is dropped, a repair runs only if an entry is waiting. Streams' value mapper: `end(Defect)` (T1's existing cell).

Why not fail open: D27's table called the disabled store's lost ordering "availability", and by the priority order it is correctness. H3's trace is a write on the wire past an unresolved one. Why user-outside-a-turn is apart from defect: an API returning an unexpected shape is ordinary, and should not stop a store.

A record that killed the last boot: restore is now per record, so a **decode** failure cannot. A core bug on a decoded value still can, each boot, and the Runtime has no way to name the record. Stated. A marker in storage is possible, and I do not think it is worth it before there is a real fatal to look at.

**D50.** D31's reason, "a refusal is deterministic, so redelivery would loop", does not hold for a closure that throws once (M5), and a bound stops any loop. So a refused turn of an ending is redelivered once, after other mail, with no second cell. The second refusal is final, and its issue says so (`input.redelivered: true`). Rule 8 says deliveries are never lost; this is what that sentence can cheaply mean. Applied to every ending, not just unknown: M5 is a hold losing its owner, and the same throw on a success is a charged card with no order.

## C. An answer has a position (D47)

```ts
// One comparison for every answer that carries record fields: a read, a repair, a write's success.
const stale = r.changedAt > answer.pos && differs(r.base, fields)   // NEW: Rec.changedAt, ReadLane.pos, Attempt.sentAt
// stale: the base is untouched, the answer's fields are dropped, one repair runs. Otherwise it applies and changedAt moves.
```

`pos` is the world's own counter at the moment the request started. A re-send's `pos` is the Attempt's **first** send (E7's sentence), and a restored Attempt's is 0.

| Case | `changedAt > pos` | Differs | Result |
| --- | --- | --- | --- |
| H4: replayed response after another device's change was read | yes | yes | Base kept, repair forced, mark cleared by the success (the Attempt is resolved), and the repair sets truth |
| Common: `lost`, repair, re-send succeeds with the same value | yes | no | No extra read |
| M3: a read started before a confirmed write, answering after | yes | yes | Dropped, repair |
| A read started after the write landed | no | either | Applied |
| Repair answering after a write landed | yes | yes | `again`: repair restarts |

This **replaces D41** ("no newer write passes, so a response cannot lose"), and it is what remains of E7's contested: no position table per field, no visible `contested`, and "the record's loader and holders refetch" becomes the one repair. Streams' `filled` and `listen` values are answers too: same comparison, round 4.

**D55.** A later success clearing a `given` mark forces one repair, so a released write's late landing is usually seen soon. The limit stands: if it lands after that repair, the screen is wrong with no mark (OD20 F1), and marks across a reload are still lost (stated).

## D. A wait gets a bound or a sign (D49)

One mechanism. A wait past its bound raises evidence once and the row says `stalled`. It ends nothing: D30 and D3 stand.

| Wait | Bound | Evidence | Row |
| --- | --- | --- | --- |
| Ack, capture | `storageMs` 10 s | `StorageSilent` | `stalled: "storage"` |
| Queue behind another's entry | `recordStallMs` 30 s | `RecordHeld { holder, waiter, ref }` | `stalled: "record"` |
| A module holding after a defect | at once | `ModuleDefect` issue | `stalled: "module"` |

Claims (D29, M9) get teeth: `held` must name a live actor or an evidence-carrying unbound; `queue` must chain to something real; `repair` must name that ref's open read. `wire` on a `never` request stays allowed: L1 calls it unbounded by choice. `flow check`'s half, a state waiting on a persisted commit with no schedule, is unbuilt: M4 stays open on the design's side, and Pay's "Still confirming with your bank…" is still Pay's sentence.

**D15** ships: an unbound Held head with a waiter yields at 5 min: `Released`, mark kept, parked `unknown { Abandoned }`. **D21** ships: a local actor disposed holding releases at once and is never adopted.

## E. The seam (D51): streams on paper first

**Before changing anything I wrote T1, T4, T8, T9 on paper against the seam.** S5's answer is Form A: session state in the slice, connection handle in the driver half. That is what decides how little is needed.

| Streams row | Against round 2's seam | Against the new seam |
| --- | --- | --- |
| Placement starts, leaves; T9 | No hook sees an actor | `reconcile(s, actor: ActorView, cx)` in P7, on after memory, after lanes. A `when` throw refuses the turn. Sessions diff here |
| `connect`, `abandon`, close | `cx.command`, `fork` returns nothing | `cx.command`; driver half: `io.fork(key, ...)`, `io.stop(key)` |
| Frames | `io.input` | same, with a conn generation in the slice (T1's "discard this connection's frames") |
| `idleTime`, backoff, 5 s release | `cx.arm`, `timer` | `cx.arm`; firing arrives as `input({ timer })` |
| Queue a value, one in mail (rule 69, T4) | Nothing puts mail | `cx.deliver(actor, event, tag)`: a mail item current from the active leaf. `tag` comes back in `turned` |
| Turn ends (T4's `inFlight = none`), bookmark cell | No hook | `turned(s, { tag, outcome }, cx)`. **`admitSoft` is not needed:** rule 71 says no guard reads the bookmark, so applying it after the turn in the same step is unobservable, and `outcome: "invalid"` skips it (F3.1) and ends `Defect` |
| Release discards the mail item (rule 70) | None | `cx.retract(tag)`: rule 69 means at most one |
| `fills`, `filled`, wipe | Nothing reads memory | `ActorView.memory` in `reconcile` |
| Bookmark persists with the slice | `capture` per Attempt | `save(s, { actor })` beside `save(s, { attempt })` |
| `listen` (T7) feeds the store | No path between modules | `cx.tell("entities", payload)`: applied after this hook, same step, through that module's `input` |
| T8 progress | Thought to be a module | Core: a row field, one input kind `progress`. No module |
| Row `connection`, `catchingUp` | Casts | `read(s, ref)` |
| Disposal, `ReleaseOverdue` | No hook; `wires()` counts lanes | `dispose(s, cx)`; `waits(s)` names what it holds |
| A value mapper's throw | Disables | `cx.user(..., fallback)` → `end(Defect)` per D46 |
| T2 rows, repair pages, T3 settle | Code inside the module | unchanged |

```ts
// seam.ts. Each hook marked. `existing` means round 2 had it under that name.
type Module<S> = {
  id; rank; init(): S                                    // existing
  prepare?(s, w, cx): unknown                            // existing
  start?(s, w, prepared, cx): { s; ok }                  // existing
  ended?(s, { attempt, how, sentAt }, cx): S             // RENAMED + MERGED: settled, withdraw, released are one hook, `how` says which
  blocks?(s, attempt): false | Claim                     // existing
  input?(s, payload, cx): S                              // MERGED: its driver half, its timers, a read's answer, another module's `tell`
  save?(s, scope): unknown                               // RENAMED: capture. Scope is { attempt } now, { actor } in round 4
  restored?(s, rec, cx): S                               // existing
  read?(s, ref): unknown                                 // NEW, D42 promised it: no more casts in the adapter
  waits?(s): readonly ModuleWait[]                       // RENAMED: describe
  dispose?(s, cx): S                                     // NEW: stops its fibers
  exec?(cmd, io): void                                   // existing; io.fork takes a key, io.stop is NEW (M7)
  // reconcile?(s, actor, cx): S                         // PAPER: round 4. Not built: no user
  // turned?(s, { tag, outcome }, cx): S                 // PAPER: round 4. Not built
}
type Cx = { now; gen(); pos(); arm(); disarm(); command(); note(); issue(); visible(); machine(); user(slot, a, fallback); uses(actor): boolean }
                                                         // NEW: pos, fallback. PAPER: deliver, retract, tell, actor
```

| | Round 2 | Now built | With round 4's paper |
| --- | --- | --- | --- |
| Hooks | 14 (`commit` had one no-op user) | 12 | 14 |
| Cut | | `commit`, `withdraw`, `released`, `settled`, `timer`, `readAnswered`, `describe`, `capture` | |
| Added | | `ended`, `read`, `waits`, `dispose`, `save` | `reconcile`, `turned` |

Same number of hooks and it does what M6's table asks. **Fragments need no hook at all**: they are core, and a module sees them only as `ActorView` on paper. That is "one seam": a session follows a placement's activation by the same `reconcile` that an entity module does not need. Module fibers now have a key, a stop and an owner (M7): disposal interrupts them and reports survivors as `AbandonedFiber`.

A sync engine sits behind the same hooks: `prepare` and `start` take its optimistic write, `blocks` is false, `ended` is told, `read` reads its collection, `input` takes its change feed. Entities stay optional and out of the core's imports.

## Fragments in the turn (D52)

Convergence-1 section 10 is the plan; the review is right that `turn.ts` needs a rewrite, so that happens once, with the fixes.

```ts
// world.ts. NEW: Inc. The root of an actor is an incarnation with path [] and frag null, so there is one code path.
type Inc = {
  id: string; frag: string | null; leaf: string; memory: any
  activations: Record<string, string>; history: Record<string, string>   // NEW: history, S.X.history restores control only
  subject: readonly string[]; reset?: unknown; key?: string              // NEW: rule 51
  frozen?: { timers: FrozenTimer[]; parked: Mail[] }                     // NEW: .resumable(), rule 52
  kids: Record<string, Inc>                                              // NEW: "summary", "CHALLENGE", "uploads:r1"
}
type ActorRec = { key; machine; root: Inc }                              // CHANGED: leaf, memory, activations move into root
// compiled.ts, additions only; old fixtures run unchanged
type Compiled = { /* existing */ fragments?: Record<string, Fragment>; local?: boolean }
type Fragment = { id; nodes; root; default; memory; whenAbandoned?: { notify?: Notify[]; release?: string[] } }
type Node = { /* existing */ default?: string; placements?: Placement[]; subroutine?: Placement }
type Placement = { name; fragment; input?; resetOn?; each?: { of; by?; max }; resumable?; guards?; callbacks?; exits? }
type Alternative = { /* existing */ raises?: Raise[]; notify?: Notify[]; exit?: Notify; history?: true }
type Op = { /* existing */ fragment?: string }                           // declared by this fragment. Rule 51: unique per actor
```

The turn is 2.5's steps as written: select the source, resets on before-walk, walk raises, notifies and exits depth first, final lists, leaving with `whenAbandoned` fused, after memory, selects, cells in action order, releases after every member, re-check resets, commit. **One state changer, disjoint keys.** Everything a turn does is on a working copy, so a refusal is one assignment. Deliveries: parked and adopted endings are head-of-mail follow-ups (rule 54), bound by D35.

Scope in: `trait`, `subroutine`, nested `default`, `.history`, `.each` with repair, `resetOn` with pending resets, `.resumable()` with frozen timers and interrupted lookups, subject path, member from another path, parking, adoption, rebind, actor dispose, releasing rows, D15, D21. Scope out, stated: `cancel` and `allow` concurrency (round 5, so OrderSummary's `cancel` is flattened to `latest`), keyed schedules, `check()`, `flow check`, `activities`, `SharedContract` (compile-time), key-equality migration (D20 cut it).

D24 stands. If `inc.ts` plus the growth of `turn.ts` passes the stop below, 9.6's cut lands: fragments lose operations.

## Pay and the money oracle (D53, M10)

Converted Pay stays unchanged (D36). P1-P6 stay pinned. My reading of M10 matches the review's: Pay's one `intentId` and one `authorized` bit first, oracle second, the fix list third. So the oracle changes, Pay does not:

- The fake's ledger is **per key and per authorization**. A `pay` capturable adds an authorization under its key; a `void` voids what exists on that intent then; a `place` consumes the latest. `placed-and-voided` means *that authorization* was both.
- `order-no-receipt` means no receipt for that order was **ever** shown (frames), so `Start` after PAID stops counting.
- `two-keys-one-intent` stays pinned to P6, and the review is right that it is a question about the server: Stripe would refuse it. It stays because the fake charges what it is told.
- S6 no longer reads the ending it judges: "no new id for an intent while the fake says an earlier id may be at the server, unless released" (H5).
- **Pins are class + state + a script fragment.** A prefix hid new bugs. Each is matched per occurrence, not per witness.

Proposed Pay fixes remain convergence-2's list, plus: P5's half (`CARD` handling a restored hold) was never applied, P6's not at all. `pay.fixed.ts` applies them; its result goes in RESULTS. The memory redesign, a set of authorizations by intent, is **the owner's**.

## Suite (D56, H5, M9, M12, L3, L4, L8, L9)

- `SEARCH-CROSS` joins: S1 and Issues persisted, 2 actors, 3 commits, `reload`, `ack`, `refuse`, `landNoAck`, `advance`, repair ok/fail/never, late landing. Oracles do not read the ending they judge: once unknown never definite; never `Superseded`; server backwards only if released; no ack no request; rule 32 at quiescence.
- A scenario per surviving mutant (11) and per High. Fragment scenarios cite the rule, the Checkout or desk story they come from.
- Report says **"one mutant covers it"** instead of "proven": D33's count was misleading.
- `SCENARIOS.md` rows corrected with the log (L3). Each hash line in the log carries its own reason (L4).
- Fake fixes: an awaited write waits behind a hung one for its key (L8). `stateHash` adds the keys the fake says may be at the server, and saved records (L9).
- Second author writes mutants from rule text and code, without the scenarios. **That is the reported number.**

## Other findings

| Id | Decision | Reason |
| --- | --- | --- |
| H6 | D46 | |
| M9 | D49's claims | |
| M11 | D54 | |
| M12 | Weak citations fixed where a scenario was added; the rest listed `near:` | |
| L1 | S4 not rerun this round: no browser question here. Watchdog print is S4's script, so it waits for the next S4 | Say so |
| L2 | Past the notify bound only `send` and `ensure` drop | A lost completion is D6's class |
| L5 | Gone: a refused capture calls no store hook, and that is written once | |
| L6 | A refused turn restores everything but `disabled`, which only grows | |
| L7 | `RenameUnsure` gets its design's cancel in a new variant fixture only if a scenario needs it. Stated | Old fixture kept: its hash carries old scenarios |

## New decisions

| # | Decision |
| --- | --- |
| D45 | `Attempt.sent` and `unknownOnce` replace `sends` and `mayHaveApplied` |
| D46 | One rule for a throw, by who threw. Replaces D27's disable half and D10. Restore is per record |
| D47 | Answers have positions. Replaces D41 |
| D48 | A never-sent cancel or replace waits for its ack |
| D49 | One stall mechanism; `stalled` on the row (**public**); stronger claims. Finishes D29, D30 |
| D50 | A refused turn of an ending is redelivered once. Revises D31 |
| D51 | The seam, above. `ended`, `read`, `waits`, `dispose`, `save`; on paper `reconcile`, `turned`, `deliver`, `retract`, `tell` |
| D52 | Fragments: one tree of incarnations; the turn as 2.5 writes it |
| D53 | Per-key money ledger, oracle independent of endings, narrow pins |
| D54 | The stop is 10,000. Round 3's budgets below |
| D55 | A success that clears a given mark forces one repair |
| D56 | Suite: `SEARCH-CROSS`, "covered by one mutant", per-hash reasons |

## Budgets (D54)

Lines of TypeScript, comments in, `vp fmt`. A stop is a cut. **D38's 12,450 is not used here**: convergence-1's 10,000 stands until the owner says otherwise.

| Part | Round 2 | Round 3 target | Round 3 stop | Round 2 review's whole-system projection |
| --- | --- | --- | --- | --- |
| Step, turn, world, seam, hooks | 1,086 | 1,500 | 1,800 | 1,900-2,400 |
| Incarnations, parking, adoption (`inc.ts`) | 0 | 700 | **1,000** (D24's trigger, with `turn.ts`'s growth over 400) | 1,300-1,700 |
| Lane | 419 | 520 | 650 | 650-850 |
| Reads, timers | 114 | 200 | 280 | 600-900 |
| Write-ahead | 242 | 320 | 420 | 500-700 |
| Publication, waits | 78 | 110 | 160 | 500-700 |
| Driver | 247 | 280 | 360 | 600-1,000 |
| Entities | 314 | 420 | 550 | 1,000-1,600 |
| **Core + driver + entities** | **2,500** | **4,050** | **5,220** | 8,850-12,350 with streams and context |

## What must be true at the end of round 3

Green, or a recorded red: carried scenarios (expectation changes logged), `FRAG-*`, the review's Highs and survivors, `SEARCH-PAY` with narrow pins, `SEARCH-LIKE`, `SEARCH-CROSS`. Second author's mutant kill rate reported. Lines against the stop, and a projection against 10,000.

```decisions-changed
D27          changed   D46    fail closed; user closures apart; restore per record
D10          changed   D46
D31          changed   D50    redelivered once
D41          changed   D47    answers have positions
```

## What this does not verify

Written before any round 3 code ran. The seam's paper rows are reasoning: `reconcile`, `turned`, `deliver`, `retract` and `tell` have no code and no user. S5's Form A was a spike, not this runtime. Nothing here has met a browser or a real server; D47's comparison assumes a repair reads truth. D49's bounds are guesses.
