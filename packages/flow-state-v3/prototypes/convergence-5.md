# Convergence 5: round 4's review, by root cause

Status: **everything here is proposed.** Written under the owner's delegation, before any round 5 code ran; reasons are reasoning until `round-5/RESULTS.md` says otherwise. It answers `round-4/review.md` (H1-H9, M1-M14, L1-L10) as one design. The review is advice: where I disagree it says so. `D65`.. are new. No keyword is public API unless marked **public**.

**This round evolves round 4.** `round-5/` starts as a copy. Two parts are redesigned from their requirements, because patching them would give case-by-case rules: **the gate's enforcement** (D65) and **the entity confirm path** (D66, D67). The lane table, step, fence, `Phase`, D3's queue and the driver's pump are not implicated: no review finding touches them, and I change only what H5, H6 and M1 name around them. `sessions.ts` was labelled a spike and is grown from T1, not patched row by row.

**Correction from the owner.** There is no 10,000-line stop and there never was. Convergence-2's D38 and convergence-4's "Budget" and named cut are wrong on this and are void. Up to 20,000 is fine, though not ideal. Nothing is cut for size. `when` stays (9 real uses). `allow`, `cancel` as a family and keyed schedules are not cut; they are simply not built yet. The README never stated the stop, so it needs no correction there.

## Read this in the morning

| #                  | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Why it might be wrong                                                                                                                                                                                                    | Cost to flip                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| **D65**            | **The core reads only sealed `Compiled` data.** One function, at Runtime creation: every table has no prototype, and every `Slot`'s result is checked by what kind of slot it is. D57's sentence stays; its list of call sites goes. A new call site cannot forget, because it receives an already gated closure                                                                                                                                                                                                         | A check runs per closure call: a cost nobody has measured on a phone. A stricter gate refuses turns that used to limp on (`patch: () => undefined`)                                                                       | Small: one file                                                         |
| **D66**            | **One judge for all evidence.** Read, success, frame, repair go through `judge(record, evidence)`, one table. `confirm`, `onAnswered`, `onRepair`'s three private comparisons go. **A success moves the record whatever it carried**                                                                                                                                                                                                                                                                                     | A table can hide a case in a default. It replaces round 2-4 code with a fresh 60 lines that have one round's testing                                                                                                     | Medium                                                                  |
| **D67 (owner's)**  | **The version decides where both sides have one; positions are the fallback.** Replaces D60. Older drops, equal merges, newer applies, with no doubt and no repair. A success that carried no version, or an entity with none, leaves the write `unechoed`: until a read started after it or a matching frame, a differing frame is doubted, not applied. **Answers design 2.8.6 and H8. This is the owner's call**                                                                                                     | Per-record versions are not one server order: a list row and a detail row of one version can differ in what they carry. A server whose version does not move on a write breaks it silently. See "Against"                | Small: about 30 lines; the fixture shape is the larger part             |
| **D68**            | **Two doors, not one.** `told(s, fact)`: a closed typed union of what the core says. `input(s, own)`: only what the module's own driver half and own timers send. H4 cannot recur: nothing a module does not own reaches `input`. 13 hooks, each one meaning. The review would keep one typed door; two is one line more and a closed union per door                                                                                                                                                                      | One more hook on a seam that a sync engine must fill. A closed union grows with `listen`                                                                                                                                 | Small                                                                   |
| **D69**            | **`cx.placed(actor)` replaces `cx.actor`.** `wanted`'s walk moves to the core: "the active activities of this actor". A module sees `{ inc, activation, op, node }`, plus `cx.slice(actor, inc)` for memory and partition. No `Inc`, no `up`, no `viewOf`, no `fragOf` in a module. About 25 lines move. A sync engine needs no tree                                                                                                                                                                                       | Core gains a read that only sessions uses so far                                                                                                                                                                         | Small                                                                   |
| **D70**            | **A releasing session leaves the session table.** Level-triggered lifecycle holds because identity is only ever about live sessions; the wait for a predecessor is a separate fact per (actor, op, key), as rule 70 writes. H7's "second trigger" is not needed: a thaw starts a new session, which queues on the predecessor, and a close starts it                                                                                                                                                                    | Two tables. The review's fix (re-run `wanted` on close) is also a line or two                                                                                                                                            | Small                                                                   |
| **D71**            | **A session pulls.** Each value's pull waits for a go-ahead (a credit the driver holds), given when the machine has turned. That is T4's "at turn pace", and it is what makes a pulled source wait and `idle` armed only while a pull is outstanding. Pushed sources fill a bounded queue that fails `Overflow` (T6)                                                                                                                                                                                                       | A credit per value is a round trip through `step` per value. S5 measured about 1 us for the state part                                                                                                                  | Medium; the shape of `exec` depends on it                               |
| **D72**            | **Boot forgets a stored ending only once it has been delivered.** M1, and H6 falls out: the restored record stays on disk while anything of it is in mail. **W behind a parked hold ends like any other W**                                                                                                                                                                                                                                                                                                               | A crash during recovery repeats endings. At-least-once is already the rule for restore (P19)                                                                                                                             | Small                                                                   |
| **D73**            | **Disposal of a persisted identity survives a reload.** The record says `retired`; boot does not wake it, so no socket opens for an actor nobody ensured. Answers M13. I read design 2.7.13's retain expiry and "awaiting reload" as this one, and `disposeActor` (which removes the record) as not built                                                                                                                                                                                                                   | A scenario that reloads and expects a disposed actor's restored ending to run a turn: it parks until `ensure`, which rule 53 already allows                                                                              | Trivial                                                                 |
| **M10**            | **`pay.fixed.ts` gets the review's guard.** Runtime not implicated; no memory redesign. Product cost: a shopper with a stranded hold cannot start again. **Pay as written stays pinned. Pay's memory is the owner's**                                                                                                                                                                                                                                                                                                      | The guard moves a bug to a product decision                                                                                                                                                                              | Trivial                                                                 |
| **T9 (owner's)**   | **A `when` throw does not refuse the turn.** Level-triggered cannot; I keep the review's reading: the session stays as it was, with one issue. Input is read once (rule 68), so a later throw in `input` cannot release a live session (M4). **Restated, not decided**                                                                                                                                                                                                                                                   | T9 as written is the plan. If the refusal matters: about 15 lines in the turn                                                                                                                                            | Small                                                                   |
| **D24 (owner's)**  | **Not decided.** Lean: no cut. There is no budget argument any more, only merit                                                                                                                                                                                                                                                                                                                                                                                                                                          |                                                                                                                                                                                                                          | Owner's word                                                            |
| **Pay (owner's)**  | **Memory unchanged, pinned.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |                                                                                                                                                                                                                          | Owner's word                                                            |

## Why the gate's enforcement is redone (H1, H2, D65)

The class has appeared four times. Round 4 named the root cause and then listed call sites again, and the review broke the list in one sitting: a follow-up closure with a missing return, `predicts` returning nothing, a server `_tag: "constructor"`, a stored `op: "toString"`. There are two separate holes and neither is about any one call site.

1. **A plain object is a table with extra keys.** `n.on[ev.tag]`, `kids[p]`, `ops[x]`, `outcomes.failure[e.tag]`, `machines[m]`: each returns `Object.prototype.constructor` for an unlucky string.
2. **A closure's result is believed where it is used.** Twelve kinds of slot; the gate covered five.

Enumerated at each site, this is a rule every new line must remember. Enforced at the boundary, it is one function. The requirement is "a value from outside may not name, shape or stop the core"; `Compiled` is the only way closures reach the core, and its loader is what a real compile step is.

```ts
// BEFORE (round 4): each site remembers
const follows = parts.flatMap((p) => p.alt.followUps.map((f) => run(f, view))); // undefined reaches `item.event.tag`: Fatal
const alts = n.on[ev.tag];                                                        // "constructor" is truthy: Fatal

// AFTER: createRuntime({ machines }) seals once. NEW: seal(compiled)
const sealed = seal(compiled);                  // NEW: tables made null-prototype, each slot wrapped by its kind
const alts = n.on[ev.tag];                      // existing line, now undefined for "constructor"
run(f, view);                                   // existing line: a follow-up of no shape throws inside the wrapper, so Refused
```

| Slot kind                                       | Must be                   | Fails                                       |
| ----------------------------------------------- | ------------------------- | ------------------------------------------- |
| `patch`, `notify.from`, `raise.from`, `mapped.from`, `memory.initial` | a plain object | `Refused`, as any closure's throw           |
| `guard`, port guard                             | `true`, or a denial       | `Refused`                                   |
| `followUp`                                      | `{ tag: string }`         | `Refused`                                   |
| `raise.key`                                     | string, or finite number  | `Refused` (`stringKey`, existing)           |
| `schedule`                                      | finite, >= 0, <= 2^31 - 1 | `Refused` (L10)                             |
| keys, inputs, values, `resetOn`                 | encodes                   | `Refused`, at the site (`admit`, existing)  |

A checker failing outside a turn is a closure's throw there too: `cx.user`'s issue with a default. So one effect per place stays true.

**World tables** cannot be null-prototype, since copy-on-write spreads make plain objects. Exactly the ones keyed by an outside name read through one helper, `own(table, name)`: `actors`, `retired`, `kids`, and in entities `records`, `repairs`, `entries`. A key built with a separator (`laneKey`, timer names) cannot be a prototype name.

**Stored records (H2).** `validInc` checks `frozen.parked` and frozen timers (`d57-frozen-timers-unchecked`). Junk in there quarantines the record, as today. **A frozen ending of a removed operation does not:** a deploy that removes an operation is what D57 exists for, so it is dropped with `Orphaned` evidence at restore, which is rule 46's `orphaned` in its thin form, and the actor keeps its memory. `validLane` checks `id` against `laneKey`. A module's `ext` is the module's to check, and `restored` is told what it saved as `unknown`.

**Entry.** `send`'s `Ev` is checked where it enters mail. `ensure` of an unknown machine is `InvalidTurn`. L3: `canon` refuses what it cannot tell apart: a function, `Map`, `Set`; `NaN` and `Infinity` no longer equal `null`.

**The check.** SEARCH-ODD stays, and gets a second fixture with one closure of every kind, each returning what a search action set: `undefined`, `5`, `[null]`, `{ tag: 5 }`, names like `constructor`. So it is widened by machine, not by value, as the review says. **A prototype name is fed at every door: event tag, `to`, server tag, actor, stored names.**

**D61 stays:** a quarantined actor is the whole actor.

## Why the confirm path is redone (H3, H8, M8, D66, D67)

Three rounds tuned one code path by adding branches: D47, then D58 and D59, and H3 is the same bug on the branch nobody looked at, 20 lines from the fix. Each comparison is private to its caller: `confirm` has `overlaps` and a "predicted and not carried" branch, `onAnswered` has `overlaps` and `settled`, `onRepair` has its own. `Rec` holds only the fallback: review H8 is right that entities declare `version: "revision"` and the prototype never built it.

Requirements, gathered at once:

| Id                 | Requirement                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 2.8.6              | "With versions, the version decides". Without, a later position wins and a differing older one is contested                       |
| 2.8.6 success row  | Confirmed fields replace; omitted ones stay `unconfirmed`                                                                          |
| Real desk          | `remove`, `archive`, `markRead`: `write(x).predicts(...)`, no `.one`: a success with no row                                         |
| Real desk          | `Ticket.delete(key, { version })`: a tombstone with a version                                                                      |
| feed.domain.ts     | "Versions decide duplicates and reorders... a replay of a change the client already holds changes nothing"                         |
| D58                | A read and an answer are intervals; no silent wrongness                                                                            |
| D59, H2            | A confirmed success is the best evidence held, and applies; doubt marks the rest                                                  |
| H3, row 2          | A re-send's success with nothing carried and no live prediction knows it landed and not what: doubt                                |
| H8                 | A frame from before a write's success must not silently overwrite it; a feed must not doubt forever                                 |
| Rule 32, E3        | Marks are the Attempt's, and a read never clears one. Doubt is separate                                                            |
| Sync engine seam   | txid, LMID and cookies are versions: an engine should fit beside this, not under it                                                |

**What real engines do.** None of them compares client clocks when it has a server order.

- **Replicache, Zero** (`codebases/mono/packages/replicache/src/sync/pull.ts:221-287`, `cookies.ts`, `zero-client/src/client/zero-poke-handler.ts:301-375`): a server-issued cookie orders snapshots. A response against another base is not applied, and a lower cookie is an error. A write is confirmed by `lastMutationIDChanges` in the same snapshot that carries its effect, so "confirmed" and "visible in the base" cannot disagree: pending mutations past the LMID are replayed on top.
- **TanStack DB** (`codebases/db/packages/db/src/collection/state.ts:1159`, `electric-db-collection/src/electric.ts:991-1020`): "a persisting transaction holds sync transactions until it settles", and `awaitTxId` ties a write to the stream's order. A write's response is not evidence at all: the stream is.
- **TanStack Query** (`tanstack-query/packages/query-core/src/query.ts`, its `cancelQueries` convention): no order, so it cancels and refetches. D58's interval is the honest version of that.

So there are two honest cases: a server order you can compare, or no order and a re-read. Flow's desk has per-record `revision`, weaker than a cookie, because two records have no joint order and a write with no row returns none. So the version decides between evidence that carries one, and D58 stays for evidence that cannot be placed. The third shape, the engine's, stays where convergence-4 put it: an engine that owns its store brings its own judge. `judge` is a function of the entities module; the seam does not know it.

**The rule, one sentence: evidence is placed by version if it and the record have one and no write stands unplaced; otherwise by when it started; and what cannot be placed either way never overwrites silently.**

```ts
type Rec = {
  base?: Fields;
  version?: Ver;       // NEW: from the entity's declared field, or a tombstone's
  changedAt: number;   // existing (D58)
  unechoed?: number;   // NEW: the tick of a confirmed write that this record's version or start cannot place
  doubt?: number;      // existing
  unconfirmed: string[]; marks: Mark[]; queue: string[];   // existing
};
type Evidence = { kind: "read" | "success" | "frame" | "repair"; start?: number; carried: Carried; version?: Ver }; // NEW: frame has no start
```

| Evidence's version against the record's | No `unechoed`                                          | `unechoed` set, or either has no version                                                                    |
| --------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| older                                   | **Drop**, `Stale`. Whatever the kind; no doubt, no repair | Same, if both have one: an older version never shows a later write                                           |
| equal                                   | **Merge**, confirms `unconfirmed`                       | Merge, but `unconfirmed` fields stay ours                                                                   |
| newer                                   | **Apply**                                              | By position, below                                                                                          |
| none                                    | By position, below                                     | By position, below                                                                                          |

| By position                                                 | Overlap? (`changedAt > start`; for a frame, `unechoed` set) | Differs? | Result                                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| read, frame                                                 | no                                                          | either   | Apply                                                                      |
| read, frame                                                 | yes                                                         | no       | Apply. A frame that matches is the echo: `unechoed` goes                    |
| read, frame                                                 | yes                                                         | yes      | **Not applied. Doubt, repair**                                             |
| success                                                     | no, or does not differ                                      |          | Apply                                                                      |
| success                                                     | yes                                                         | yes      | **Applied. Doubt, repair** (D59)                                           |
| repair                                                      | no, or does not differ                                      |          | Replace; `unechoed` and `unconfirmed` go                                   |
| repair                                                      | yes                                                         | yes      | Asks again (existing)                                                      |

**After any success, in one place, whatever it carried (H3):**

| What the success leaves                                     | Result                                                                                  |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| A version carried                                           | Placed. No `unechoed`                                                                   |
| Fields carried, no version                                  | `changedAt` moves, `unechoed` = now                                                     |
| Nothing carried, a live field prediction                    | Predicted fields move to `base`, `unconfirmed`. `changedAt` moves, `unechoed` = now     |
| Nothing carried, a live `remove` prediction                 | **Removed.** `changedAt` moves, `unechoed` = now. Never comes back by itself            |
| Nothing carried, no live prediction (re-send, restore)      | **Doubt, repair**: it landed and we cannot say what it did                              |

`unechoed` clears when a read or repair that started after it answers, or a frame matches. `doubt` clears as today: a read or repair that started after it, whatever it says.

**Trace, the real `remove` (H3's third):**

```ts
// the real shape, from attachments.domain.ts
remove: write(removeAttachment).predicts(({ input }) => Attachment.delete({ ref: input.ref })), // existing: no .one

// compiled, here                 // existing: predicts      NEW: nothing carried, so the table's row
writes: { remove: { predicts: slot("domain.remove.predicts", (i) => [{ ref: ref(i.ref), remove: true }]) } }, // no confirms
// Delete; server 204 -> { ref removed, changedAt moved, unechoed set }. A list that started before answers the old row:
// overlap, differs -> not applied, doubt, one repair. Round 4: the record came back, unmarked.
```

**Where `version` comes from.** The real line is `entity({ version: "revision" })`. Compiled: `DomainSpec.version?: (ref) => fieldName | undefined`, per ref, so no module parses an entity name out of a ref. A value that is neither a finite number nor a string is no version, with an issue. A tombstone's is `Carried.version`.

**M8.** Accepted, stated. A failed repair does not retry on a timer: an offline client would poll. A differing frame or a later read asks again. A doubt on a record with no feed and no later read stays marked until a reload, and no write waits on it. If the owner wants a retry: about 15 lines, one timer.

**Against D67.** (a) A list row with partial fields can advance a version past fields it does not carry: they stay as held, older than the version says. A server that lists partial rows should say so (`unconfirmed` is the same limit). (b) A server that does not bump the version on a write: an equal version merges over `unconfirmed` fields, silently. A `flow check`-time fake can catch it, a Runtime cannot. (c) A delete carrying no version, then a re-create at a version below the tombstone cannot happen on a monotonic row; a re-created id with a reset counter would be dropped as stale, marked by nothing. Stated. (d) Two records still have no joint order: `.alsoChanges` on another record, not built, is where that bites.

**D60's limit, answered.** Convergence-4's strawman ("every differing frame doubts") is what the review said: only a differing frame, only while a write's echo is outstanding. Cost: one repair per write per record at worst. A feed that echoes writes costs nothing.

**The pile of what stays flat.** `.alsoChanges`, `.one`'s `PredictionNotRetained` and `basedOn`'s rebase are not built this round: the first two are small, and `basedOn` needs `Attempt.input` to change at rebase, which a re-send must not do. Listed, not decided.

## The rest, as one list

| Finding        | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H4             | D68                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| H5             | The retired branch walks the tree (rule 54). Frozen incarnations adopt at their thaw                                                                                                                                                                                                                                                                                                                                                                        |
| H6, M1         | D72. `continue` goes: both restore paths run W's loop. **A new oracle, in every scenario and search: every minted Attempt ends, or is live, or never reached the disk.** The harness says the last, at the kill                                                                                                                                                                                                                                             |
| H7, M3-M7, L2, L4, L5, L7 | D70, D69, and T1 as written: a delivery carries its activation (rule 70), `release` retracts everything of the session, `input` read once (rule 68), `end` queues `failure` behind what is queued (T9), a Reset's `at` lives on its notice (no `lastReset`), a member's `filled` is the field (T3), `lose` drops what moves. No sentinel: `cx.user` is told how to fail by a flag |
| H9             | Below                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| M2             | `runRecheck` runs `applyLists`                                                                                                                                                                                                                                                                                                                                                                                                                              |
| M9             | Void: there is no stop. Size is reported                                                                                                                                                                                                                                                                                                                                                                                                                    |
| M10            | `pay.fixed.ts`: the guard, and a retried void                                                                                                                                                                                                                                                                                                                                                                                                               |
| M11            | Pins narrowed where a narrower one holds. `moneyAudit` stops reading the machine's belief: a hold is accounted only by what the fake says was voided or placed, or a live lane                                                                                                                                                                                                                                                                              |
| M12            | D68, D69. **Judged: `input` carried `actors`, `turned`, `member`, frames, closes, timers, `answered`, seven meanings under one word.** That is H4's cause. `told` holds the core's; `input` holds the module's own                                                                                                                                                                                                                                         |
| M13            | D73                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| M14            | `desk.compiled.ts`: writes copied from the real domains, `revision`, predicts-only, tombstones, a feed by tag failure, `Healthy` with `bothLive`, `when`. `.slice(-ACTIVITY_KEPT)` too                                                                                                                                                                                                                                                                       |
| L1             | Numbers in RESULTS are copied from the output file, and the output file is committed                                                                                                                                                                                                                                                                                                                                                                       |
| L3             | Above                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| L6             | Fired timers go on the record's write until the turn commits: a world field `firing` the record encodes. Stated if it does not fit                                                                                                                                                                                                                                                                                                                          |
| L8, L10        | Above                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| L9             | Stated. Positions restart each boot; safe while the slice is not persisted. Versions do not have this problem, a small point for D67                                                                                                                                                                                                                                                                                                                         |

**Against the review, once.** "Do not start the rest of streams until 1-5 are done; D60 must be settled before `listen`": agreed, except that D60 is flagged, not settled. I build `listen` on D67 and it can flip in about 30 lines.

## Suite (H9, method step 2)

- **Real shapes.** `desk.compiled.ts` as above. Issues' `remove` keeps its `confirms` in the old fixture; the desk fixture is the real one, and scenarios for H3 run on it. No old fixture's expectation moves except by a logged line.
- **Spike tests that can fail.** T1-T4 cases get: a burst of frames with no settle between them, and a read of the highest number of a session's deliveries ever in mail (`values-in-order-one-in-mail` could not fail); the fake's close takes time by default (`one-connection-at-a-time`); a reconnect after a wipe; a value without a position; silence after a value; a later backoff after `healthy`; a first-open proof. **Each of the review's 9 spike mutants gets a case, and I run those nine.**
- **Oracles.** Every mint ends or is live, across a reload. `checkEndings` could not see W behind a parked hold, because no evidence named it.
- **Search.** New: `SEARCH-SESSION` (reload crossed with sessions, slow close, overdue, frames), and `SEARCH-FRAGSTORE` (a trait with a write and the entity store, persisted, retired rebind, reload, version, frames): these are what have been crossed least. SEARCH-ODD's second fixture.
- **Survivors named by the review** get a case each: `r54-facts-before-reset`, `r54-restored-also-when-parked`, `r51-commit-other-path` under `serialize`, `d26-capture-plain-write`, `r15-fill-may-leave`, `d57-frozen-timers-unchecked`.
- Red first, committed. Acceptance level, through the Harness. Expected results change only as a logged finding.

## Seam, after this

| | Round 4 | Round 5 |
| --- | --- | --- |
| Hooks | 12, `input` with 7 meanings | 13: `told` (closed union), `input` (own only) |
| `Cx` | `actor` hands out `Inc` | `placed`, `slice`, `tell`; `actor` gone |
| Core knows | `observes`, a mail kind, a member kind, `Inc.partition` | same, plus `seal` and one tree helper |
| `DriverIo` | `fork`, `stop`, `input`, `machine` | plus `credit`: a wait a command can open (D71) |

**Sync engine, unchanged from round 4 and honest:** (a) one cut: it must mirror into the slice or S11 stops meaning anything; (b) two outboxes: one yields; (c) `blocks: false` drops D3. (d) from round 4 is answered by D67's shape: a version compared for all kinds of evidence, in the module. `Inc.partition` remains its cursor, unproved. `cx.tell` is what a push arrives through, which any module may send.

## Streams, on paper before step 4

Only if steps 1-3 hold. Order: a thin pulled source; then `catchUp` and Repairing; `Flapping`; `ReleaseOverdue`; Overflow; `listen`; `latest`; SEARCH-SESSION throughout. T1 goes in as data where it can be: procedures named as the design names them. `latest`'s `reconcile` runs on `told actors`, because that is already after each turn; a stale slot is retracted by tag, and the review's "needs a new mail check" I expect not to hold. `listen`'s registry (T7) sits in entities: answers with `readStart`, a gap starts a re-read of those answered earlier. No cache, so thin: it reruns the read's commit directly. Stated.

```decisions-changed
D57          changed   D65      the sentence stands; a sealed Compiled enforces it, not a list of sites
D58          changed   D66,D67  positions are the fallback where no version places the evidence
D59          kept      D66      a success applies; now also with nothing carried
D60          changed   D67      a frame is placed by version; on no version, doubted while a write is unechoed
D63          changed   D68      lifecycle is told, not input
D38          changed   none     no line stop; void by the owner
D62          kept      D62      the bookmark on the incarnation: the review's best thing in the spike
```

## What this does not verify

Written before round 5's code. Nothing on a real server, browser, disk or phone. Versions on a real server are a reading of the fixtures' `revision`, and a fake that bumps by one. `seal`'s per-call cost is not measured. D67's limits above are reasoning.
