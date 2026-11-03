# Review: entity store proposal

Reviewed: `round-9/entity-proposal.md` and `round-9/entity-model/`, against `machine-design.md` 2.8, rules 26–38 and 40, `round-9/durable.ts`, `seam.ts`, `entities.ts`, a copy of `codebases/db` at `15d2d2d`, and `codebases/mono`. All of this is advice. Marks: **[ran]** on an extended copy of the throwaway model or on TanStack DB's real source, **[read]**, **[reasoning]**. Nothing here ran on Flow's runtime, because none exists for this design.

Experiments: `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/r9e/` (`model/patch.mjs`, `model/run2.ts`, `model/traces2.ts`, `model/t8.ts`, `tdb/t2.ts`, `tdb/t3.ts`).

## Verdict

**Build it, after one revision round. Don't start over.** The central rule holds under every attack that keeps the rule's own premises. What breaks is at its edges, where those premises don't hold: a version that doesn't move, a version that goes backwards, a write with no durable lane, a field the answer never names, a query's absence read as a delete.

Redesign these parts:

1. The judge's `same` and `before` branches (H1, H2).
2. The set of Attempts that get `store/unsettled` (H3).
3. What a success does to `.alsoChanges` (H4).
4. `landsWithin` (H5). This one needs your decision, because it changes rule 32.
5. The engine seam's `gone` and its doubts (H6).

## What held

| Attack | Result |
| --- | --- |
| Baseline, proposal's model | 0 of 9 configurations fail. Its mutant counts reproduce, except that they depend on N: at 3,000 walks `sameKeepsLanded` fails nothing and `readClearsOpen` fails 4; at 200,000 they fail 3 and 6 (the proposal says 7, at its larger N). **A real search needs a high budget** [ran] |
| The oracle's escape: `return` when others changed the server and nothing is live. It skips **34% of walks** | Replaced by a per-field excuse: only fields changed by others and not re-read since are excused. **1,800,000 walks, 0 fails.** The skip hid nothing [ran] |
| Reload with a realistic table: cells rolled back to an older snapshot, conflict doubts lost, only open windows durable | **1,800,000 walks, 0 fails.** The "one direction" invariant holds on one record [ran] |
| Reorder, per-field, versioned and not | Holds: shuffle configurations pass [ran] |
| `from` taken at landing, the root of pacing risk | Killed, 8 of 9. So I7 is a real invariant and the oracle sees it. No trace found where pacing reaches the judge once `from` is taken at the true start [ran, reasoning] |
| Lane and `store/unsettled` in one batch | Feasible. `persist` batches are per actor scope and boot scans flat keys, so a `store/` prefix joins the same scope. The door is missing, not the atomicity (`durable.ts` `flush`, `world.ts:259`) [read] |
| Two actors, one record | Each Attempt's lane and unsettled share that actor's scope, and no pair needs to be atomic across scopes. Extra doubts never reduce safety [reasoning; the model has one store and no actors] |
| Origin wipe | The stated limit is honest. No change. An open tab keeps memory while the disk is gone, and the next reload forgets. Same limit [reasoning] |
| TanStack read path, overlay, rollback | Reproduced. I expected a `pending` stuck on a confirmation identical to the overlay. It does not stick: the settle fires a batch [ran, `t2.ts` A, B] |

## High: change before starting

### H1. A version tie never resolves, and repairs without end [ran]

```text
held   title x at updatedAt 100
server title y, same second (MySQL DATETIME), or a column `revision` does not cover
read, started after: y at 100  -> same, different: keep x, doubt
repair, started after: y at 100 -> same, different: keep x, a NEW doubt
... 50 repairs, 50 doubts, title still x [uncertain]
```

The model never hits it, because every server change bumps `rev`. With ties added, `rec-nofeed` fails: `no drain (repair loop?)`. It breaks I8, and section 5 case 4 says "a timestamp version with ties is handled". Case 4 uses exactly that version.

**Change:** a tie goes to the read that was asked after we knew. With this, `rec-nofeed` under ties passes, and the baseline stays 0 of 9 [ran]. The other tie failures left are the model's `told` excuse being fooled by a version that didn't move, with no one to tell us: ordinary staleness [read the traces].

```ts
if (c.exact) {
  const k = cmp(e.at, c.at)
  if (k === "same" && e.from >= c.landed) return "after"   // NEW: asked after we knew, and the version cannot tell them apart
  return k
}
```

### H2. `before` is silent, including when it contradicts what we asked [ran]

"before: keep; nothing" assumes a version is monotonic over the key's whole life. Two ordinary servers break that:

```text
T2  whole v5; tombstone v6; re-created, new row, revision restarts
    read started after: v1 -> before  ->  $present=false, no mark, for as long as revision <= 6

T3  whole v1; `.gone` 404 with no version (keepFloor: tombstone at floor 1)
    read started after: exists at v1 -> before  ->  $present=false, no mark
```

Both are wrong and unmarked at quiescence, which I3 forbids. T3 needs only a hard-delete table whose new rows start at revision 1, or a lagging replica's 404. L6 says "with a version the floor catches it"; here a versionless answer sets a floor that blocks the truth. Randomised: `resetOnBack` fails 4 of 9 by a repair loop, when the restarted version climbs to a tie with the held one; T2 is the silent form. The section 1 table says the tombstone's version is "if given", and section 3 never gives one to `.gone`.

**Change, two parts:**

1. `before` with `e.from >= c.landed` and a different value raises one doubt and does not take the value. That is the rule's own words: what it cannot order, it cannot decide. T2 and T3 become `[uncertain]` [ran, `t8.ts`], and the baseline stays 0 of 9 with 45 more repairs in 125,320 [ran]. Ask once per field: more would loop.
2. State in the docs and in `flow check`'s words that a version must be monotonic across a key's re-creations. An `uncertain` that cannot resolve itself is correct but needs a name in `flow trace`, such as `VersionWentBack`.

Same branch, smaller harm, **T4:** a 204 that doesn't bump the version (a no-op PATCH, a column outside `revision`). Reads started after, at the same version, agreeing with the claim, leave it `unconfirmed` for good. If the server ignored the write, it shows the claim, marked, for good. **Change:** `before`, equal, not exact, `from >= landed` clears the claim [ran, baseline 0 of 9].

### H3. "The only hole is Released" is false [ran for the shape, read for the rules]

Section 4 says a lane gone while its request may land is only Released. Three more paths:

| Path | Source | Why there is no durable record |
| --- | --- | --- |
| Bare write | rule 40, `machine-design.md:1522`: "a bare write's unknown is not retained ... the lane is free" | No hold, no lane |
| `allow` and non-predicting `cancel` | `machine-design.md:1528`: they "do not hold" | No hold, no lane after the ending |
| A non-persisted machine's write on a persisted entity | `durable.ts` `flush`: `if (!persisted) continue`. A second machine's `persist: true` read makes the entity `persisted` | Never a lane on disk, so no write-ahead at all |

```text
reload write write.lost read part reload read answer.now landLate
-> a shows 0, server 101, unmarked   (none-nofeed, rec-nofeed)
```

The model's `reload` marks every write on the wire, so it assumes a durable lane exists for all of them.

**Change:** (a) an unknown with no surviving lane writes `store/unsettled` too, whatever its concurrency or binding; (b) a write that touches a `persisted` entity from a non-persisted machine is a `flow check` error, because nothing can be written ahead of the send; (c) I6 says "every Attempt that may still land", not "lane gone". Add a search where `landLate` follows `reload` for each concurrency and each persistence, not each ending only (oracle (c) as written lists endings).

### H4. A success with no body leaves `.alsoChanges` unmarked: money [ran]

The cart example says `.alsoChanges` marks `subtotalCents` and `totalCents` "on an unknown". `Touch.fields` is "what an unknown marks". On a success that doesn't carry them, nothing marks them.

```text
Derived field t = a + b, carried only by a whole answer.
part write ~ok ~answer.start   (ack: none, 204)
-> t shows 0, server 101, unmarked    rec-nofeed, none-nofeed
```

`quantity` reads `unconfirmed`; the **total beneath it reads clean and is wrong**. With no version a partial ack does the same: `rest: unknown` has no effect there, because it only moves `seen`.

**Change:** every touched field a success did not carry reads `unconfirmed` (a claim with no value), on every ending that may have changed it. Add `alsoChanges` and a derived field to the model's alphabet.

Stated limit to write down: a feed that moves `CartLine` and sends nothing for `Cart` leaves `Cart.total` stale and unmarked, and `rest: unchanged` under a delta that omits a derived field does the same (`derived,feedOmitsDerived` fails 6 of 9) [ran]. Nothing in Flow knows a total depends on lines. Money reads a response or holds a lane. Say that next to the cart, not only "money is untouched".

### H5. `landsWithin`: the right mechanism, the wrong knob and the wrong mark

**The proposal is right that a later success can't clear a mark.** The model's trace against rule 32 is real [read, ran]. Its replacement has four problems:

1. **It breaks the rule it defends.** "What cannot be proven cannot decide", and at the deadline a guess decides. If the request lands after the window, the field is unmarked and wrong: `part write write.lost answer.now reload expire answer.start landAfterWindow` -> `b` shows 0, server 101 [ran]. The model's `expire` deletes the write, so it can't see this. A default means every author makes this claim without having said it.
2. **The cost lands on a person, in the wrong word.** Give up, save again, the save succeeds, the feed echoes it, a read agrees: `?` for ten minutes, on a request that almost never lands. A `?` that is usually false teaches authors to hide `uncertain`, which also hides the real ones.
3. **It collides with OD19.** Section 1 closes a window by time, with no exception for a Held Attempt. Rule 32 says "a mark whose Attempt is still unresolved stays (OD19)", and the unbound-lane clause keeps it until the Runtime ends. So at minute eleven `row.uncertain` is false and `O.like.get().uncertain` is true. Then `O.x.retry` re-sends with no prediction and no doubt, so the field is **unmarked with a request on the wire** [reasoning; the model can't reach it because `expire` removes the write]. Rule 31 needs "a re-send re-opens the window at its send".
4. **One word, three meanings.** `"10 minutes"` is a guess about a network, `"Infinity"` means there is no exit (a permanent `?`, a durable record for ever, no way to dismiss it), and `"0 seconds"` means "an engine owns this", which isn't about time. AGENTS.md also asks not to leak timers into user code.

**A smell, then, but a fixable one.** Options for you, as Q1 (all proposed):

| | Mark after give-up | Re-save, read agrees | If it lands at minute 20 |
| --- | --- | --- | --- |
| **A. As proposed** | `uncertain` for 10 minutes | still `?` | unmarked, wrong |
| **B. Two levels (recommended)** | `uncertain` until the old rule 32 events (a later success) or a read started after the give-up; then `unconfirmed`, no `?`, until the window ends and one read asks | quiet, still honestly marked | unmarked, wrong; the same limit, stated |
| **C. Keep rule 32, state the limit** | clears on a later success | clean | unmarked, wrong from the later success on |

```ts
// B. No new author word beyond the proposal's. `row.uncertain` is what a `?` reads
// give up, re-save ok, read agrees:  { data: { title: "B" }, uncertain: false, unconfirmed: true }   // existing marks
// window ends, one read:             { data: { title: "B" }, uncertain: false, unconfirmed: false }
```

B keeps I3 and the proposal's trace (the field stays marked), and it makes the number matter less, so ten minutes can stay a guess. It needs I5 reworded: "stays marked", not "stays `uncertain`". `unconfirmed` must not refresh during the window, or M2 gets worse. [reasoning; the oracle can't tell these marks apart]

Under any option:

- The clock applies to Released only; a Held Attempt keeps its mark (OD19 unchanged).
- A re-send re-opens the window.
- Remove `"0 seconds"`: `sourced` implies it.
- `"Infinity"` caps and names what it keeps.
- Rename to say it is a claim, for example `assumeGoneAfter`.

**What it changes in the plans, for your yes:** rule 32 text; E3's code comment; 2.8.6's table, the success row's "and the record's marks ... cleared" and the `Released` row; the record-queue facts paragraph. The proposal's "rule 32 is replaced" also needs rule 31's re-open and rule 30's `Released` cell. OD19's clause on unresolved Attempts should survive, and the proposal as written doesn't keep it.

### H6. The seam: a query's absence is not a delete. Seam work only [ran, read]

Section 5 case 4 says "an absence is not carried". Section 8's code does the opposite. Zero's `diffRows(last, next)` and a filtered subscription say `gone` when a row leaves the **query**:

```text
TanStack, real source, subscribeChanges with where project = p1:
  update t1 to project p2  ->  batch delete:t1      and  c.get("t1").project === "p2"  [ran, t3.ts]
Then, by the proposal's mapping:  Ticket.delete(t1)  ->  $present=false, everywhere, unmarked
Second session holding t1:  whole row, from = its own previous batch  ->  unknown  ->  doubt  ->  no repair exists on a sourced entity
Result: $present=false [uncertain], for good  [ran, T6]
```

`sourced`'s "exactly one writer" is checked per `listen` entry, while one entry placed with two inputs is two sessions [reasoning]. And "the commit times out, unknown, marked" has no exit: **T5b**, the doubt raised at timeout needs a batch with `from >= to`, a quiet stream never sends one, and a sourced entity has no repair, so `uncertain` stays. I11 ("zero doubts") contradicts section 8's own Bounds row [ran]. Also, the adapter doc's A9 says "engine rows stay outside" the store, and this reverses it without saying so [read].

**Change, before the seam and not before the core:**

- A sourced entity's `listen` must come from one whole-collection subscription (TanStack without `where`). Zero needs a per-query membership that isn't entity deletion, so **Zero's snippet should not ship as written**.
- On a sourced entity an unknown ending marks until the engine's next statement or the lane's end, with no doubt in the judge. `I11` holds only then.
- Decide A9 out loud.
- Refuse `retry` there (13.9).

**Temp ids on an engine** [ran, `t2.ts` C]: `delete:temp-1,insert:srv-42`. Flow gets a tombstone per create and a view pinned to the temp key goes gone, with no rekey. Acceptable if stated; prefer client-generated ids as TanStack's own docs do (`docs/guides/mutations.md`).

## Medium: change before or during the build

**M1. `rest` isn't a fact. Three facts are really two and a runtime check.** `store.ts` reads it once: `e.rest !== "unchanged"`. Mapping `none` to `unknown` gives **identical counts on 180,000 walks** [ran]. `none` is just "carries everything". `unchanged` versus `unknown` isn't declared, as the table says: it's "a session covers this record when it lands", computed at landing. Delete `rest` from the vocabulary and write `covered(record)`. Carries and position both stay: `noFieldScope`, `noUnknown` and `noFloor` each fail.

The "whole judge" also isn't whole. A claim hand-edits the version cell outside `judge` (`run.ts` `settleSuccess`), which contradicts I2 as written. The state is also more than three facts: `exact`, `claim`, `seen`, `staleBefore`, the doubts. That's fine, but say so, and move the claim's edit into one constructor.

**M2. `unconfirmed`'s refresh feeds itself. A per-collection version makes it constant** [ran, sim in `traces2.ts`]. Two live answers with disjoint picks, one record, one refetch to start:

```text
per-record version, write every RTT                       1000 requests in 1000 RTTs
per-collection version, this record NEVER written, 1/RTT  1000 requests in 1000 RTTs
```

Each answer moves `seen`, which marks the other answer's field behind, which refreshes it. It stops once the version moves slower than a round trip (a write every 10 RTTs: 2 requests). A version that moves with the whole collection makes `behind` noise. Section 13.3 flagged a smaller form. **Change:** a field's refresh coalesces and backs off per answer; add a spelling for an envelope version (`Said.version` has room, the public API has none, since `version` names a field); on a collection version, `behind` must be off. Put this in the model before the runtime: it doesn't exercise answers at all.

**M3. The oracle can't fail on too many marks, and marks do stick.** Marking everything passes it [reasoning; the check reads `marked === null` only]. On realistic reload, **1,264 of 1,800,000 walks end with an `uncertain` and nothing in flight** [ran], for example `hello write write.lost write answer.now write.ok retry.ok ~frame ~frame ~answer.start` -> doubt on `b`, asked, never closed. Cause: a repair that lands `before` closes nothing, and "asks once" means nobody asks again. Failed repairs and entities with no `.byKey` are the same state; `flow check` warns only for a predicted field. **Change:** add a liveness oracle (no write outstanding, no live request, and no doubt or claim left unless excused by name). Re-ask with backoff after a `before`. Warn on any entity that can raise a doubt and has no repair. Add a mark-everything mutant.

**M4. Equality isn't specified.** "same, equal" is `===` in the model. On a `Schema.Date`, an array or a struct, every overlapping read differs, which is a doubt and a read each time. `Schema.toEquivalence` exists in the installed Effect. **Change:** compile one per field and say so in section 7 [read, reasoning].

**M5. `Touch.fields` "recorded at construction" isn't available from a closure.** `.predicts(({ input }) => Ticket.patch(...))` is a closure that runs at start (`entities.ts:678`, D57). Running it with a proxy lies about anything input-dependent, and an unknown then marks too few. Rule 38 persists keys, so a restored lane can't recover the fields. **Change:** record the fields actually predicted with the Attempt's keys at start (extend rule 38; values still aren't persisted). Static fields are for `flow explain` only [read, reasoning].

**M6. The proposal contradicts itself on picks and patches.**

- Section 7 and oracle (l): "a `pick` that leaves out a key field: type error". Section 3: `.one(Ticket.pick("title", "revision"))` and `Ticket.get(s, key, Ticket.pick("title"))`, neither with keys. `TitleSaved` has no key, and nothing says where its key comes from. Oracle (l) would fail the headline example. Spell it: a write's key comes from its Touch.
- Section 6 item 4: "`patch` is `listen`-only". Section 3: `.predicts(... Ticket.patch(...))`. In one place it needs `revision` by type and in the other it doesn't. An agent copying one into the other gets a confusing type error at best. Give the delta or the prediction its own name.
- A pick without the version field drops the floor quietly. Warn. [read]

**M7. Five assumptions decide, in a design whose rule says they can't.** Each fails silently when false:

| Assumption | Where it is stated | [ran] when false |
| --- | --- | --- |
| `order: "arrival"` | 13.6 | `arrivalLie` fails 2 of 9: `a` shows 703, server 505 |
| A session is complete | 13.2 | `lossy` fails 6 of 9: `hello otherRemove read answer.start otherBack frame` -> `$present` false |
| `landsWithin` | 13.1, as a cost | H5 |
| Re-send dedupes | section 1, in passing | a window closed by a retry on a server with no idempotency [reasoning] |
| Read-your-writes, with no version | 13.7 | stated |

Each is defensible, and none is a reason to redesign. **Change:** one list in the proposal, and `flow explain` prints it per entity, so "what is this entity trusting?" has an answer. Refuse `order` on a versioned entity: the chat example declares it and it does nothing there.

**M8. A gap is one integer per entity, so it marks too much** [reasoning, read]. One session's flap marks every record of the entity, including those its feed doesn't cover, and refreshes every live answer. Today's `onGap` is scoped to the machine (`entities.ts:655`). The first hello on a page also marks everything just read: `helloNoGap` fails 6 of 9, so the mark is needed, but a read and a `listen` starting together fetch twice on **every load**, unless the read waits for the proof. **Change:** gap per covered scope, using the `covers` the proposal already adds; decide and state the first-load behaviour.

**M9. List membership is outside the rule.** I3 is about fields. A lost create with a server-issued id has no key, so no cell, no doubt and no `store/unsettled` row (its shape requires `key`). `create unknown, release, reload, list read, landLate` gives a list with no mark and a row missing [reasoning]. The same applies to a lost bulk delete in a list that isn't re-read. Rule 33's draft covers the screen only while the machine holds it. **Change:** state the limit in I3 and let `store/unsettled` name a contract's answers as well as keys, or say it can't. Client-generated ids also can't predict a create (E18 shows nothing); `$present` as a field now makes this one rule away, worth a later look.

**M10. Bulk** [reasoning]. `store/unsettled` has one `key`, and a 4,096-key release is one batch; give it `keys`. Rule 30 holds record queues until the forced repair settles, so 4,096 repairs at 8 in flight and 200 ms hold those queues for about 100 s, each row refusing a next write through overflow or a wait. Bound the wait, or release the queue when the row's own repair lands (per row, not per Attempt). The rest of the bulk story holds: one Attempt, one evidence batch, one publication.

## Low

- **"Awaited, as the lane was":** a lane's removal has no ticket (`durable.ts` `put`), so it isn't awaited. Atomicity is what matters and it's enough. Fix the sentence [read].
- **A module needs a door to write:** expiry's removal has no lane or Attempt batch; give it a `store` scope. `Module.save` can't do either [read].
- **Clock:** `from` and `landed` must be `cx.pos()`, not "the moment"; restored `landed` normalises to the boot floor. The reload run assumed that. `landsWithin` alone reads a wall clock [reasoning].
- **`noPresent`,** on the proposal's mutant list, survives 1,800,000 walks: the feed and `behind` cover it in this model. Don't count it until a case can kill it [ran].
- **`EntityConflict`:** comparing Schemas and Slots by reference will misfire under HMR. Compare ids, field names, key and version [reasoning].
- **`cp.entity().cells`** in Stories shows windows. Fine for a test; keep it out of views.

## Generality

| Case | Result |
| --- | --- |
| Collaborative text | Not this tool, and that's right. A field is a last-writer value, overlays replay whole values or functions, each keystroke is an awaited capture, a `serialize` lane overflows at 64. Belongs in a CRDT behind memory or an engine. Say so beside case 1's token-streaming note [reasoning] |
| Money totals from rows | H4. Silent when the ending doesn't carry them or a feed omits them [ran] |
| Version per collection | M2. Ordering works, `behind` doesn't [ran]. No public spelling for an envelope version [read] |
| Temp ids, then rekey | Plain path: refused by rule 33, coherent. Engine: tombstone plus insert, H6 [ran]. Lost create: M9 |
| Delete, then re-create | Monotonic revision: fine [ran, A4]. Restarted revision: H2 [ran]. After a partial resurrect the rest reads `missing`, which asks nothing, so a view stays empty with a repair available. Let `missing` under a live view ask once [reasoning] |
| Real TanStack DB | Read path sound. `gone` and doubts need H6 [ran] |
| Zero | Read only. The whole-rows shape fits, the query-diff mapping doesn't (H6). "Valid until next time listener is called" confirms the copy cost (`typed-view.ts`) [read] |

## Consistency

- **Effect:** `Order`, `Schema.toCodecJson`, `Context.Service` fit. Add `toEquivalence` (M4). I didn't re-run the key round trip.
- **`Compiled`:** the shape is sound and closures are Slots. Fix `Touch.fields`' source (M5). `DomainSpec` going away is the right direction.
- **Static analysis:** a `listen.as` is opaque, stated. A `flow check` for "doubt with no repair" is missing (M3).
- **Stories:** `landsWithin` must run on the virtual clock through `cx.arm` and survive reload by re-arming. A fake must be able to send ties, restarted versions and derived fields, or H1, H2 and H4 hide as H2's A1 did behind whole rows.
- **CLI:** no new command is right. Add the assumption list to `flow explain` (M7) and name `before` with a differing value in `flow trace` (H2).
- **Agent UX:** `.one(Ticket)` over a partial output as a type error is the best thing in it. Fix the pick and patch contradictions (M6). The added surface (11 words) is reasonable if `rest` stays out and `version: { perField }` goes.

## What can wait

- `version: { perField }`: nothing needs it first, it isn't in the model, and the brief's per-field cells don't require a wire form. Cut it for now.
- Tombstone eviction (13.5), with a cap and a note.
- The stamp-split memory work (section 9, 13.16): start with the simple form, measure on a hot feed.
- `doubts on $present from a dropped row` (13.4): run it on a real table first.
- Zero's binding, once H6 has a shape. TanStack first.
- `readsLagBy` (13.7): stay out.

## Before the builder starts, in order

1. You answer Q1 (H5), and whether A9 is reversed (H6).
2. Revise `entity-proposal.md` as a new proposal file: H1, H2, H3, H4, M1, M4, M5, M6, M7. Superseded text stays as prior art.
3. Extend the model first: ties, restarted versions, derived fields with `alsoChanges`, no-hold writes, a re-send after a window, answers with refresh, and a liveness oracle (M3).
4. Type spike on `pick` and `patch` (13.15), which M6 will otherwise surface late.
5. Then build, in the proposal's section 12 order.

Budget note: searches need 200,000 walks per configuration or more; two of the proposal's own mutants don't fail at 3,000.
