# Convergence 4: the review's findings, by root cause

Status: **everything here is proposed.** Written under the owner's delegation; nothing is decided until he says so. It answers `round-3/review.md` (H1-H7, M1-M11, L1-L10) as one design. The review is advice: where I disagree it says so. `D57`.. are new. No keyword is public API unless marked **public**. Written before any round 4 code ran: reasons are reasoning until `round-4/RESULTS.md` says otherwise.

**This round evolves round 3.** `round-4/` starts as a copy, so round 3's results still reproduce at their commit. I expect to redo nothing from scratch. Step, fence and `Phase` are not implicated by any finding: the review's probes broke none of them, and every High sits in code around them. If that turns out false I stop widening and say so at the top of RESULTS.

## Read this in the morning

| #                 | Decision                                                                                                                                                                                                                                                                                                                                                                    | Why it might be wrong                                                                                                                               | Cost to flip                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **D57**           | **One gate.** No value from outside (a user closure's result, a server's answer, a stored record) reaches core structure except through `gate.ts`. Failure has one effect per place: refuses the turn, repairs a list, quarantines a record, or an issue with a default. **Fatal means core's own bug, nothing else, and a search action now feeds odd values to prove it** | A stricter gate refuses more turns. "Fatal means core's own bug" is a claim a search can only support, not prove                                    | Small: one file; the rule is the expensive part to lose                     |
| **D58**           | **What a position means.** A position is a unique tick. An answer is an interval: it started, then it arrived. It is known to be newer than what we hold only if it started after what we hold arrived. Otherwise it overlaps, and if it differs the record is **in doubt**                                                                                                 | One more read per overlap, same as D47                                                                                                              | Small: one comparison                                                       |
| **D59**           | **A write's success applies during doubt; a read's answer does not.** The mark stays until a read that started after the doubt answers. Replaces D47's "base kept" and its mark clearing. HIGH-04's and CART-02's middle states change                                                                                                                                      | A replayed response shows an old value, marked, until the repair answers. I prefer a marked wrong value to an unmarked one and to the flicker       | Small: one branch                                                           |
| **D60**           | **A frame has order, not a start, so it applies and moves `changedAt`; it is never doubted.** T7's refetch and the feed's own order are what correct it. A domain may later name a server version                                                                                                                                                                           | A feed that does not echo writes and sends a pre-write frame late stays wrong until its next frame or a refetch. Stated limit. **Owner's question** | Small to add a `version`: about 15 lines in entities                        |
| **D49 (changed)** | **`stalled` leaves the public row; Inspection only.** Evidence and `waits()` keep it. I agree with the review                                                                                                                                                                                                                                                               | A person with a spinner has no explanation unless the app reads Inspection. If a view needs it: `pending` with a reason, later                      | Trivial: one field                                                          |
| **D3**            | **Keep, with the visible stall (A).** Nothing in the review or my reading argues for B or C on correctness. Convergence-3's prior-art line corrected: Query's `scope` does not hold for a person, and D3 has no precedent for an unbounded hold (L10). **Price: a person who has not pressed stalls another actor's writes. That is a product cost to say out loud**        | The stall itself                                                                                                                                    | Large: contested, the third clause, S1's cycles come back                   |
| **D61**           | **A quarantined actor record is the whole actor, not a subtree.** A release that removes one trait restarts that actor; its lanes are adopted (rule 46)                                                                                                                                                                                                                     | A deploy removing one trait loses every other trait's memory for that actor. Finer needs a rule for a partial tree                                  | Medium: a subtree rule, and what a host's memory says about a child it lost |
| **D62**           | **The bookmark lives on the incarnation, `Inc.partition`, not in a module's slice.** Atomic with memory, frozen with the slice, gone with the life, for free. Proposed before the spike; the spike tests it                                                                                                                                                                 | Core stores an opaque module value on the tree                                                                                                      | Small before streams, large after                                           |
| **D63**           | **Modules hear lifecycle, members and "your delivery turned" through `input`, level-triggered after each step that changed an actor. No new hook expected.** The review expected 3-4                                                                                                                                                                                        | One door is untyped: a module narrows its own union. If the spike shows timing the door cannot give, a hook comes back                              | Small                                                                       |
| **D64**           | **Thaw checks `resetOn` first.** A frozen trait whose reset value changed ends on return and a fresh one starts, in that same turn, no frame of the old subject                                                                                                                                                                                                             | None seen; `panels.machine.ts` says this in words                                                                                                   | Trivial                                                                     |
| **D24**           | **Not decided here; my lean is no cut.** It removes what Upload, Comments and Autosave are. On merit, not on a 56-line margin. The row's stop is the owner's                                                                                                                                                                                                                |                                                                                                                                                     | Owner's word                                                                |
| **10,000**        | **The stop stands.** Named cut for round 5, chosen ahead: see Budget                                                                                                                                                                                                                                                                                                        |                                                                                                                                                     | Owner's word                                                                |
| **Pay**           | **Unchanged, pinned.** `pay.fixed.ts` finally applies what convergence-3 promised; RESULTS says what is left. Memory redesign is the owner's                                                                                                                                                                                                                                |                                                                                                                                                     | Apply the list                                                              |

## Do H3, H4, H5 share one rule? Yes (D57)

H3 is round 2's H2 under a new name, and round 2's H2 was round 1's H5. Three rounds patched call sites. The root cause is a sentence nobody wrote: **core treated a value from outside as if it had already been admitted**. Each call site then assumed a shape: an `.each` key has no `:`, a stored `leaf` exists in this release, a result encodes.

The rule, one sentence: **a value from outside may not name, shape or stop the core.**

- **Name:** core never reads meaning out of a string it built from a user's value. A key goes on the incarnation, a path is an array, a lane name is one way only. H5, and the subject's `String(JSON.parse(reset))` that makes every object reset value the same subject (found reading, not in the review).
- **Shape:** every value core structures on comes through a gate that says what it must be. H3, H4.
- **Stop:** the only things that may stop the Runtime are core's own bugs, and the only things that may disable a module are the module's own bugs. A server's odd answer may do neither (D46 said this; `same()` and `encodeLane` did not).

| Value                                                                             | Where it crosses            | Gate failure (one effect per place)                                                                                                                 | Was                                                                      |
| --------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Any encoded value in a turn: key, reset value, input, persisted memory, raise key | turn                        | `Refused`: `InvalidTurn` with origin                                                                                                                | Fatal outside `run` (H4)                                                 |
| `.each` field, an item, a `by` value                                              | turn                        | Repaired, evidence `listRepair`. Rule 9: never refused                                                                                              | Fatal (H4)                                                               |
| Schedule `ms` closure                                                             | turn                        | `Refused` if not a finite number                                                                                                                    | Silent NaN                                                               |
| `memory.initial` on `ensure`, persisted                                           | start                       | `Refused` path, `InvalidTurn`, no actor                                                                                                             | Fatal at flush                                                           |
| A value in a lane record: parked ending's value                                   | flush, core, outside a turn | Stored as `{ unencodable: true }`, issue `UnencodableValue`; the ending still arrives and is real; only its value is lost, and only across a reload | Fatal (H4)                                                               |
| A stored actor record                                                             | restore                     | `validInc` against the current `Compiled`: every leaf, frag, kid, activation, timer. Fails: quarantine, fresh on next `ensure`, lanes adopted       | Fatal, every boot (H3)                                                   |
| A stored lane record                                                              | restore                     | `validLane`. Fails: quarantine                                                                                                                      | Fatal, every boot (H3)                                                   |
| A mapper's result in a module                                                     | settlement, read            | Module's own check; a bad `Carried` is dropped with `UserClosure`. `same()` cannot throw                                                            | Module disabled for the session                                          |
| A key spliced into a part                                                         | everywhere                  | `Inc.name`, `Inc.key`; a part is an opaque id built once and never parsed; paths compared as arrays                                                 | `split(":")`, `join("/")` (H5)                                           |
| Object key order                                                                  | lane names, reset values    | `canon`: sorted keys. `{a,b}` and `{b,a}` from a guard and a contract are one lane                                                                  | Two lanes, so an `idle` guard could pass on a live write (found reading) |

```ts
// BEFORE (round 3)                                         // AFTER
JSON.stringify(run(p.resetOn, view)); // gate.enc(run(p.resetOn, view), origin)       NEW: gate.ts
String(p.each.by ? it[p.each.by] : it); // gate.listKey(it, by)  -> string | undefined  NEW
part.split(":")[1]; // inc.key                                      existing field, now the only source
nameOf(part); // inc.name                                     NEW field
```

**The check that makes it hold:** a search action on a fixture that has every crossing, feeding odd values (`null`, `5`, `[null]`, `[{}]`, a `BigInt`, a cycle, a key with `:` and `/`, a removed node on disk), with one oracle: no `Fatal`, no `ModuleDefect`. So a new call site fails a search rather than waiting for a review. That is the review's H4 proposal, and it is the only part of this that can catch round 5's call site.

**Stated limits.** A `Date` or `Map` encodes without a throw and comes back changed: real code has Schema there (rule says memory is schema'd) and this runtime is fed validated data. A core bug on a value the validators passed is still Fatal, on every boot. D57 narrows that; it does not close it.

**D61.** Whole record. "A partition failing its own shape discards the scope" (Persistence O5) is the design's own unit.

## What a position means (D58, D59, D60)

The review is right twice. H1: the comparison ties, because `pos()` reads a counter that moves only by accident. H2: a success refused its belief and cleared the mark. And the design line "`filled` and `listen` values are answers too: same comparison" is wrong: a frame has no start.

**Start from what the client can know.** Without a server version it knows two times for an answer: when it asked and when it heard. The server's moment lies between. So an answer is an interval, and two overlapping intervals have no known order. This is real-time order; I am not inventing a clock.

| Evidence                | Has a start?    | Overlaps what we hold? | Differs? | Result                                                                                                |
| ----------------------- | --------------- | ---------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| Read                    | yes             | no                     | either   | Apply. Clears a doubt that began before it started                                                    |
| Read                    | yes             | yes                    | no       | Apply                                                                                                 |
| Read                    | yes             | yes                    | yes      | **Not applied.** The last confirmed value stays. Doubt, repair                                        |
| Write's success         | yes, first send | no                     | either   | Apply                                                                                                 |
| Write's success         | yes             | yes                    | no       | Apply                                                                                                 |
| Write's success         | yes             | yes                    | yes      | **Applied.** Doubt, repair. This is H2's fix: the common retry path no longer hides a confirmed write |
| `confirms` threw        |                 |                        |          | No fields. Doubt, repair                                                                              |
| Repair                  | yes             | yes                    | yes      | Asks again (existing)                                                                                 |
| Repair fails or overdue |                 |                        |          | Doubt stays. No retry from here. A later read clears it                                               |
| Frame                   | **no**          | not askable            |          | **Applied, `changedAt` moves.** Never doubted. Does not clear a doubt                                 |

Why a read and a write differ: a read that overlaps a confirmed write most likely saw the moment before it, and a write this client just had confirmed is the best evidence it holds. A success overlapping a read: its one failure case is a replay (HIGH-04) beside another device's change. So that case shows the old value, marked, until the repair. The rule is **no silent wrongness**, not "never wrong".

```ts
// BEFORE (round 3)
const position = (tx) => tx.w.nextId;                         // reads, does not move: ties (H1)
r.changedAt > pos && differs                                  // stale: base kept, repair, mark cleared regardless (H2)
// AFTER
const position = (tx) => tick(tx);                            // CHANGED: unique, moves every read
const overlapped = r.changedAt > start && differs(r.base, f); // same comparison, now sound
readRecord(...).uncertain = r.marks.length > 0 || r.doubt !== undefined;   // NEW: Rec.doubt, the tick it began. Public field unchanged
```

**Why not `>=`, as the review tried:** it passes the trace, and leaves "position" meaning "whatever `nextId` was". A unique tick states the rule and needs no second case for `repair.pos`.

**Frames (D60).** Three options, for the owner:

| Option                                              | What happens                                                                                                                                                                        | Against                                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| A. A frame's start is its connection's registration | Every differing frame after any write doubts and repairs                                                                                                                            | Defeats a feed, unbounded reads                                                                                        |
| **B. Frames have order, not a start (proposed)**    | Applied, moves `changedAt`. An in-flight read that started before it is doubted, which is right. A doubt stays until a read answers. T7's `readStart` refetch closes reconnect gaps | The stated limit above                                                                                                 |
| C. `version` on a domain                            | One field, compared where present, for all three kinds; D58 is the fallback                                                                                                         | A real addition. It is what Zero's LMID and TanStack DB's txid are. **It belongs with the sync-engine seam**, not here |

**D55 stays.** **D39 stays**, and is safe now. `Rec.changedAt` means arrival of the last applied evidence; nothing else reads it. **L4 joins this:** a read merges fields, as a write does (list and detail meet); a repair replaces, because it is the record.

## H6, and the fragment batch: real shapes

**H6.** The walk records who exits. `applyLeaving` skips that incarnation, for `notify` and `release` alike; its descendants are abandoned, as rule 6 reads. An exit filling that is itself an exit (Resolve's `Discarded: exits.Abandoned`) records both.

| Finding | Decision                                                                                                                                                                                                                   |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M2      | A freeze from above leaves an already frozen child alone. A thaw thaws a child only if its own placement's node is active                                                                                                  |
| M3      | `applyLists` also walks placements not active, for frozen copies only: a removed key ends; nothing is seeded                                                                                                               |
| M4      | Past the bound only `send` mail drops. Rechecks, thaws and adoptions run. They end by themselves or are already bounded by what exists                                                                                     |
| M5      | D50 extends to `fire`: one redelivery, then final                                                                                                                                                                          |
| M6      | One format: `unknown: Mapped \| { byReason }`. An unlisted reason stays `UnmappedEnding`, which leaves a Held lane with an owner told by issue. `Abandoned` and `ModuleDisabled` go on `flow check`'s list, for the design |
| M7      | Copies in the view follow the field's order; an active `.each` with no copies reads `[]`                                                                                                                                   |
| M1      | `then` is set only if the queue took the commit                                                                                                                                                                            |
| L1, L2  | Scenarios. Fixes already right                                                                                                                                                                                             |
| L3      | D64                                                                                                                                                                                                                        |
| L4      | Above                                                                                                                                                                                                                      |
| L5      | Restore: every parked ending, then per lane, as 2.7.13 writes                                                                                                                                                              |
| L6      | A firing no longer touches the record, so the disk keeps the timer until the turn commits                                                                                                                                  |
| L7      | Stated, not fixed: narrow, and mail stays unpersisted                                                                                                                                                                      |
| L8      | Dead code removed                                                                                                                                                                                                          |
| L9      | `onEnsure`'s rollback drops evidence too                                                                                                                                                                                   |
| L10     | D3 above                                                                                                                                                                                                                   |

## D49: `stalled`

Row loses it; `waits()` carries it. **Against the review, one thing:** I keep the world field and the claims, since D3's price must stay inspectable. MED-02 and MED-04 and DRV-03 change, logged.

## Suite (H7, M9, M10)

- `real.compiled.ts`: **copies, not flattenings.** AddressStep as written (nested FORM, `.history`, exit, `whenAbandoned`), Resolve's wizard shape (a nested subroutine whose exit fills an exit, `Kept: S.STEPS.history`), AttachmentUpload as written (`by: "ref"`, `item`, by-reason `unknown`, `resend` with `disarmOn`, `Lost`), Comments' pin and react paths, History as written under Panels (`resumable` + `resetOn`, lookup, write). Keys like `user:1`, `gid://shop/Product/1`, `a/b`.
- A scenario per the review's H7 survivor. `history-restores-control-only` stops being unable to fail.
- The fake's `load` is shuffled by seed, permanently: rule 44's order is tested by the sort.
- `mayHave`: only a non-`fail` answer decides.
- `SEARCH-ODD` (D57). `frag.search.ts` gets the status check its header claims, and two copies.
- Pins name the steps, where a narrower one holds at depth 8. Any I cannot narrow are listed.
- `pay.fixed.ts`: P5's half, P6, `Start` idle on `pay`, `void`, `place`, and a void lost to a reload re-sends. Its result goes in RESULTS.
- No second author. My mutants are builder-written, to find gaps only.

**Acceptance level, through the Harness, as before.** Expected results change only as a logged finding.

## Seam, before the spike (M8)

Each gap the review named, with what I expect. The spike tests the first five.

| Gap                                   | Expected answer                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Members in action order with rollback | `Member { module, verb }`: `applyMembers` calls the module's `input` in order. A refusal restores `tx.w`, so the module's effects go with it. **No hook**                                                                                                                                                                                                                                                                                          |
| Lifecycle outside a turn              | **Level-triggered, one call**: after any step, for each actor whose root changed or went, `input({ k: "actor", view })`. Start, dispose, restore, rebind, freeze, thaw, reset all look the same, because a session is a function of the tree, as `dispatch` is of the lanes (D4). This costs T9's "a `when` throw refuses the turn": not built here; the spike's `input` closure is D46's outside-a-turn case. **A plan disagreement if it holds** |
| Bookmark ownership                    | D62: `Inc.partition`. `cx.partition(actor, inc, f)`. No `save(s, { actor })`                                                                                                                                                                                                                                                                                                                                                                       |
| `deliver` has no incarnation          | `cx.deliver(actor, inc, event, tag)`: a mail item fenced by incarnation as `fire` is. `cx.retract(tag)` reaches `follow` too                                                                                                                                                                                                                                                                                                                       |
| D50 against T1                        | A value: `InvalidTurn` means `end(Defect)`, T1's cell, no redelivery. A `failure` delivery is an ending too: redelivered once. Both rules hold because they cover different items                                                                                                                                                                                                                                                                  |
| `tell` is not enough for `listen`     | Agreed. Reads need a registry first. **Round 5, with cache.** `listen` not in the spike                                                                                                                                                                                                                                                                                                                                                            |
| Module fail-closed                    | Fail closed; no value is lost because the bookmark has not moved, so a reload replays. At-least-once is what makes this cheap. Frames arriving at a disabled module drop with evidence                                                                                                                                                                                                                                                             |

Fragments still need no hook. The sync engine still needs (a), (b), (c) from the review: state in the slice or mirrored; one outbox yields; `blocks: false` loses D3's reasoning. D60's option C is a fourth. No spike this round.

## Budget

Stop **10,000**, not moved. Rows as round 3's, with the fair count the review gave (M11): I report `turn.ts` and `inc.ts` together and stop splitting them after the fact.

**Named cut for round 5, chosen ahead (proposed):** **`allow` concurrency, `activities`' `when`, and `cancel` as a separate family (`latest` with a key-less cancel covers OrderSummary's quote).** Estimated 200-350 lines against the review's overrun. If those are not enough: **keyed schedules become `.each` of a one-schedule trait**, another 150-250. The entity module is not a candidate. A sync engine, when it comes, replaces entities' queue; it does not add a fourth outbox.

**Bundle (M11):** 14 KB was a number with no reason. Proposal: drop it until there is a real need, and report only.

```decisions-changed
D47          changed   D58,D59  positions are unique ticks; a success applies; doubt stays until a later read
D49          changed   D49      stalled leaves the public row
D46          changed   D57      a value from outside goes through one gate
D50          changed   D50      also applies to a firing
```

## What this does not verify

Written before round 4's code. Nothing on a real server, browser or disk. D60 is paper unless `listen` runs, and it will not. D58 assumes a read served after a confirmed write reflects it: replicas break that, and only a version fixes it.
