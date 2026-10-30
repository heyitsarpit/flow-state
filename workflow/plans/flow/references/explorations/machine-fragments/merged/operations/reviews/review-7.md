# Review 7 of operations-in-definition, revision 8 (2026-10-30)

One reviewer: correctness, simplicity and authoring. These are suggestions, not decisions. OD1–OD17 are taken as
fixed; this review judges only whether they are applied correctly and what they cause. It re-walks review 6's
findings against revision 8's table, checks the table as a state machine, checks the contract-shape change, and looks
for new holes in revision 8's proposed rules. Sketches 8 and 9 (`ops-review-6/`) were re-run, and one new app was
written in the session scratchpad: `ops-review-7/10-shared-checklist.ts`, a shared checklist where two actors (a
long-lived list and a per-item drawer) write the same records, with a `listen` stream and `If-Match`.

**Verdict: not ready for acceptance. There are 3 High findings, not zero.** Review 6 is closed: H1, H2 and H3 walk
correctly against revision 8's table, and K13–K16 are applied. OD16's timing made the table exact *inside* a turn.
The three Highs sit at the two edges the table still does not model:

- **H1.** A lane has no end of life. Disposing the actor (unmount, retain expiry) drops queued commits silently and
  kills the owner of a hold. 8.2's own fix for R6 H3 (CLOSED re-sends, then releases) fails as soon as the host
  disposes the actor on CLOSED, and `UnresolvedHold` passes.
- **H2.** "Not yet invoked" is undefined for a re-send. A retried domain write waits in its record queue (merge 4
  rule 31) across turns. A `cancel` there has no cell, and the natural reading reports a possibly landed write as
  `NotSent`.
- **H3.** Invocation of a promoted commit happens in step 6 of the ending's turn. An ending's turn that is `Denied`,
  `Unhandled` or `InvalidTurn` never reaches step 6, so the promoted commit is never sent and the lane stays
  `InFlight` forever.

Each fix is one or two sentences, and none needs a new author word.

## Causes and fixes

| # | Cause | Findings | Fix at the cause |
| --- | --- | --- | --- |
| K17 | **The table has every event in a lane's life except the end of its actor.** The lane outlives its states (3.7), but not its actor. OPS O7 waits only for *invoked* commits at disposal. Under the hold, `W` and a `Held` Attempt live as long as an outage, not one round trip, so disposal now meets them routinely. | H1, M3 (in part), L7 | Add a **dispose** row. `W` entries end `NotSent { Disposed }` as evidence, with merge 4 rule 30's store effects. A `Held` Attempt counts as released for rule 32. State the limit: a hold whose owner lives in a state the host disposes is lost, and `flow check` cannot see a host. Recommend persisting such actors (Runtime O3 keeps a saved record past retain), or tell the host to dispose only when `O.x.idle` holds. Optionally, add a `flow check` info "`latest` or `serialize` write in a non-persisted actor". |
| K18 | **Invocation is not part of the table.** The cells say "invoked after publish", as if invocation were instant and always happened. It waits for the Persistence O6 acknowledgement and for merge 4's record queue, and it hangs on step 6 running at all. Nor does the table track whether the addressable Attempt *was ever sent*, only whether this send is. | H2, H3, M1, L3, L9 | Define **invocation as its own step after publication, independent of the turn's outcome**: every Attempt that is promoted, minted or re-sent is invoked when its record queue and storage allow, whether its turn was accepted, denied or unhandled. Give `cancel` one rule by history: "before invocation, a first send ends `NotSent { Cancelled }`; a re-send returns to `Held` and is released (`Released`)". Scope promotion to "when the addressable Attempt is resolved or released". |
| K19 | **One `key` rule on every kind, with the opposite risk on reads.** On a write, a key with fewer fields serializes more, which is safe. On a read, a key with fewer fields aliases cache entries, which silently gives wrong data. Non-key fields are frozen at the first binding (OPS O2, O4). Every resource in the proposal lists every input field. | M5, L4 | Keep OD15. Add one check: `flow check` warns when a resource's `input` has a field outside `key` (`KeyOmitsInput`); a stream's resume field is exempt. State that non-key input is read only when the entry or session opens. |
| K20 | **Two facts placed in the wrong owner.** The amended rule 32 makes the store (shared, applied at settlement, rule 27) depend on actors' lane states (per actor, changed in their turns). The `basedOn` rebase is put in the lane, but merge 4 already orders writes to a record across lanes and actors in the record queue. | M3, M4 | Put both on the record queue, which the store owns. A mark stays while *its Attempt* is unresolved and not released; release is a store effect the table lists. Rebase along a record's queue, not a lane. |

## Review 6 against revision 8

| R6 | Status | Walk |
| --- | --- | --- |
| H1 force save | **closed** | 8.2's `ForceSave` `[cancel, save]` in `Held` + `W`: `cancel` releases "AB" → "ABC" promoted (`InFlight`, not invoked) → `save` ("ABCD") meets the `InFlight` cell → `W`. "ABC" is sent, then "ABCD". The final text is "ABCD". (L3: "ABC" is a wasted request.) |
| H2 reconcile offline | **closed** | 5.3: unknown → `Held`, the key appears, the timer is armed → `ReconcileLike` `retry`: the after lane is `InFlight`, so the key leaves in that turn → the re-send's unknown → `Held` → the key re-appears and is armed again → after 3, the fallback releases and the unlike is promoted. No other event is needed. |
| H3 `CloseAnyway` offline | **closed in the machine, reopened by the host** (H1) | 8.2: `cancel` interrupts "AB" → `Held` in CLOSED → CLOSED re-sends 3 times, then releases → "ABC" is promoted, and its own unknowns are re-sent and released. The check now errors without CLOSED's handler. But CLOSED is the state in which a page unmounts its editor. |
| K13 timing | **closed**, with M1 and L1 | Cells in step 5, in action order. `Idle + W` is gone. The published `pending` is true in the commit turn (merge 4 rule 28). |
| K14 terminal pass | **closed** | `reject` only. R6 M2's "later alternative" is applied to every owner. New false negative: M7. |
| K15 names | **closed** | `outstanding` on `serialize`; mark vs `uncertain` (amendment: M3); tags as Q36. |
| K16 inventory | **mostly** | Missing: MD 2.7.12 ("at settlement … the waiting start is invoked now" now happens at admission, then step 6), MD 2.7.8's two tables (`latest`'s addressable Attempt is "the newest start"; `serialize` "none"), and OPS O7 ("`cancel` cancels queued and running commits"). See M6. |
| M3 `cancel`/`allow` | **partly** | The table exists, but it is incomplete and wrong under `allow` (M2). |
| M7 `basedOn` | **closed as scoped** | Committed base, transitive, released predecessor: all stated. The scope is wrong (M4). |
| M9 fan-out | **stated cut** | as recommended |
| L1–L6 | applied | L2's "a policy suite" is applied in 3.8.1, but 3.11 still says a Story can visit all 22 cells (M6). |

## Is the table a complete, deterministic state machine?

**Inside a turn: yes.** With OD16, every member in the action list meets one cell and one address.

- `[commit, commit]` from `Idle`: `InFlight`, then `W` (`latest`), `Rejected` (`reject`) or appended (`serialize`).
- `[cancel, cancel]` in `Held` + `W`: releases, then `NotSent { Cancelled }` for the promoted head. Both spellings
  give the same result.
- `[retry, retry]` in `Held`: a re-send, then evidence `InFlight`.
- `[commit, cancel]` from `Idle`: the cell says "promoted this turn and not yet invoked". A *minted* commit is not
  promoted, but MD rule 24 gives the same answer. Say "minted or promoted" (part of K18).
- `[retry, cancel]` in `Held`: no cell (H2).

**Across turns: no.** The rows describe what members and endings do, but not when an Attempt actually goes on the
wire (K18). Three gaps follow:

- the cross-turn "not yet invoked" window (H2);
- turns that never reach step 6 (H3);
- the end of the actor (H1).

**The "cannot occur" cells.** All 8 are still unreachable. They are unreachable *for the addressable Attempt*: under
`cancel` concurrency, an interrupted older Attempt's ending lands while a newer one is `InFlight`. The table must
route that ending as evidence by Attempt id, not as "unknown in `InFlight`" (L8).

**Promotion as written** (M1). "Whenever a lane leaves `InFlight` or `Held` with `W` non-empty, `W`'s head becomes
the addressable Attempt." Read literally, this promotes in three wrong places:

- on `unknown` (`InFlight` → `Held`), which would send newer work past an unknown, R3 H1's race;
- on `retry` (`Held` → `InFlight`);
- on restore, where restore must never invoke (OPS O3).

The cells say otherwise, so an implementer who reads cells is safe. But this sentence is OD16's decided definition.

**`HeldThisTurn`** (M2) is sound for `cancel` concurrency, where at most one Attempt is live. It has no rows for
success, failure, interrupt, restore, `idle` or `retryable`. Under `allow` it is wrong: "turn end → `Idle`" while
other Attempts are still on the wire. No case in the proposal uses `cancel`, `allow` or `serialize` (L6).

**`UnresolvedHold` from tokens alone.** Yes, still computable.

| Kind | Case | Note |
| --- | --- | --- |
| False negative | the host disposes the actor in the owner's state | H1, inherent: state it |
| False negative | U's handler declines entirely (every alternative guarded, no fallback), so the turn is `Denied` and the hold has no branch | M7 |
| False negative | an owner reached only through a schedule whose `keys` closure never includes the lane | inherent, like the other closures |
| False positive | an `X.idle(k)` for a different key (stated) | unchanged |

## High

**H1 (K17). Disposing the actor drops queued commits and kills the hold's owner. `UnresolvedHold` passes.** OPS O7:
"Actor disposal waits for invoked commits". During disposal, "outcome events are dropped" (OPS O3). Runtime O3
disposes a shared actor when its retain passes after its last use. A `createActor` actor goes when its component
unmounts. Neither the table nor 3.7 says what happens to `W` or to a `Held` Attempt then. 8.2, offline, in a
single-page app:

1. "AB" is `Held`, and "ABC" is queued. The user presses Close, which is denied (`Uncertain`). They press
   `CloseAnyway`: `cancel` releases "AB" and promotes "ABC" → CLOSED.
2. The page unmounts the editor on CLOSED (the obvious host code: `if (S.CLOSED.is(s)) onClose()`). The actor is
   disposed. "ABC" was promoted and invoked after publish. If disposal won the race, it was never invoked and is
   dropped with no ending. If it was invoked and ends unknown, CLOSED's `SaveUnsure` (R6 H3's fix) never runs,
   because the actor is gone.
3. In the `InFlight` variant of step 1, "AB" is still on the wire when CLOSED is entered. Its unknown arrives at a
   disposed actor, and "ABC" waits behind a hold whose owner no longer exists.

The user's last edit is lost. Nothing in types, the table or `flow check` names it. `useBeforeUnload` does not fire
on in-app navigation. Sketch 9 (bulk archive) shows the same: archive, then Undo while the archive is held, then
navigate away. The Undo is queued, then dropped, and the threads stay archived. Sketch 8: pick 20 photos and leave the
folder, and 16 queued photos vanish. Before the hold (MD), `W` lived for one round trip. Now it lives for an outage.

**Fix (K17).** Add a dispose row:

- `W` entries end `NotSent { Disposed }` as evidence, with rule 30's store effects (predictions removed).
- A `Held` Attempt is released for rule 32 (M3).
- An `InFlight` one is waited for (OPS O7), and its unknown is evidence.

State the limit plainly: Flow cannot keep work whose actor the host disposes. For writes that must survive, persist
the actor (Runtime O3 keeps a saved record past retain, and restore re-arms via `NotSent { Restored }`), or dispose
only when `O.x.idle`. Optionally, add an info `HoldInLocalActor` for `latest` or `serialize` writes in an actor that
cannot persist. Add to 8.2 a sentence saying which host keeps the actor alive in CLOSED.

**H2 (K18). A `cancel` while a re-send waits to be invoked has no cell. The natural reading reports a write that may
have landed as never sent.** The cancel cell in `InFlight` has two cases: "invoked: interrupt", and "promoted this
turn and not yet invoked: `NotSent { Cancelled }`". A re-send is neither. It is not one turn's matter. Merge 4 rule
31 says a retry "joins the record queue", rule 30 holds that queue until the forced repair settles, and rule 29 says
the record queue decides when a write is sent. So a retried domain write can sit un-invoked for many turns. Sketch
10, walk E, on a slow network:

1. The drawer's rename "Milk" ends unknown → `Held`. Item 7's record queue is held for the forced repair.
2. `RenameUnsure` re-sends → `InFlight`. The re-send waits in the record queue.
3. The user presses `CloseAnyway` → `cancel` in `InFlight`, not invoked. MD rule 24's before-invocation case ends it
   `NotSent { Cancelled }`.
4. Rule 30 removes the prediction with no repair. The list shows the old title, and the drawer says "Not sent". The
   first send may have landed: the store now contradicts the server, and no repair is scheduled.

For a non-idempotent effect (8.1's upload: `UploadNotSent: S.CANCELLED` means "never left the device: nothing to
clean"), the same reading skips the clean-up of a landed upload. A promoted or first-send commit that waits on the
Persistence O6 acknowledgement or a record queue past its turn hits the same gap. There the natural reading
(`NotSent`) happens to be right.

**Fix (K18).** One rule, by history: *before invocation, `cancel` ends a first send `NotSent { Cancelled }`, and
returns a re-send to `Held` and releases it (`Released`, the mark kept).* Replace "promoted this turn" with "not yet
invoked, for any reason". Add the walk as a policy-suite case.

**H3 (K18). A promoted commit is never sent when its ending's turn does not reach step 6.** Revision 8: promotion
happens at once, in admission (step 1), when the ending resolves the addressable Attempt. "Step 6 publishes the after
lanes, then invokes every Attempt promoted or minted this turn." MD 2.5 step 2: when every alternative declines, the
event is `Denied` or `Unhandled`, "and then nothing changes". A failing select is `InvalidTurn`, a pre-commit
defect. In all three cases step 6 never runs. Before, MD 2.7.12 invoked the waiting start at settlement, outside any
turn. 9.3, written naturally:

1. `Saved: { guard: [S.OPEN.EDITING], ... }`, a guarded success handler with no fallback (common: 9.3 and 8.2 add
   `{ target: "self" }` fallbacks only to `Loaded`).
2. Doc d1 "A" is `InFlight`, and "AB" is queued. "A" succeeds while the machine is somewhere the guard declines →
   `Denied`. Or the handler's own commit select throws → `InvalidTurn`.
3. At admission, "AB" was promoted (`InFlight`). Step 6 does not run, so it is never invoked. `pending` is true
   forever, `Close` is denied forever, and every later save queues behind it. Nothing is held, so `UnresolvedHold`
   has nothing to report.

**Fix (K18).** Invocation does not depend on the turn's outcome. Every Attempt that admission or the turn promoted,
minted or re-sent is invoked after the turn ends, whether the turn was accepted or not. A `Denied` or `Unhandled`
ending turn still publishes its after lanes. MD 2.7.12's settlement row is amended to say so.

## Medium

**M1 (K18). The promotion sentence contradicts the cells.** "Whenever a lane leaves `InFlight` or `Held` with `W`
non-empty" also covers `InFlight` → `Held` (unknown) and `Held` → `InFlight` (retry). Read that way, an unknown
promotes the waiting commit, which is R3 H1's late-landing race. It also covers restore (`InFlight` unacknowledged →
`NotSent { Restored }`), where "neither restore nor hydration invokes a commit" (OPS O3). **Fix:** "whenever the
addressable Attempt is resolved or released by an ending or a member, except on restore".

**M2 (completeness). `HeldThisTurn`'s table is short, and wrong under `allow`.**

- It has no rows for success, failure, interrupt, restore, `idle` or `retryable`. Restore matters: an acknowledged
  Attempt restores as `unknown { Restored }` → `HeldThisTurn` → its handler may re-send.
- Under `allow`, the lane holds any number of Attempts, so "turn end → `Idle`" publishes `pending: false` while
  others are on the wire.
- The key-less rule "then the lane's addressable one" has no referent under `allow`.
- Under `cancel` concurrency, an interrupted older Attempt's ending must be routed by Attempt id as evidence, not by
  lane state (L8).

**Fix:** under `allow`, the state is a count, and `HeldThisTurn` is per Attempt. Add the missing rows (most are "as
`Idle`" or "as `InFlight`"). Say that the key-less fallback to "the lane's addressable one" applies only to the
holding policies.

**M3 (K20, K17). The amended rule 32 couples the store to actors' lanes, and a disposed lane leaves a mark that
nothing can clear.** "A write's success clears the record's marks only of Attempts whose lanes are resolved or
released."

- **Timing.** Merge 4 rule 27: store effects apply at settlement and "never depend on whether the ending routes
  current, late or superseded". Lanes change only in their actor's turns. To apply the amended rule at a tick's
  settlement, the store must read the drawer actor's lane (sketch 10, walk C).
- **Release becomes a store write.** A `cancel` in `Held` now changes what a later success may clear, so `Released`
  becomes a store effect. 3.8.1 says only "`Released` keeps the record's mark".
- **Disposal.** A lane that is disposed is neither resolved nor released. Item 7 then reads `uncertain` in every
  other screen forever, and the mark holds the record against collection (rule 32, E18) (walk B).

Sketch 9's walk A is closed by the amendment, so the intent is right. **Fix:** state the rule per Attempt, in the
store: "a later success clears every mark whose Attempt is resolved, released or disposed". Release and dispose are
listed store effects of the `cancel` and dispose rows. That is the same behaviour, with the fact owned by the record.

**M4 (K20). The `basedOn` rebase is scoped to the lane, but the record queue orders writes across lanes and actors.**
5.3, with `If-Match` (merge 4 says a server-checked `basedOn` is "the only protection"):

1. Like and rename of issue 1 are two lanes on one record queue (rule 29). Both are committed on v4.
2. The like lands → v5.
3. The rename is sent with `If-Match: v4` → 412 → "Couldn't save the title". The user's own write refused it.

Sketch 10, walk D, shows the same across two actors. Revision 8's lane-only rebase fixes `latest` and `serialize`
chains on one lane, not the common case of two fields of one record. **Fix:** rebase along the record's queue. A
queued write whose `basedOn` for record r equals the committed base of the write ahead of it takes that write's
returned version for r, transitively. The lane case is then a special case. Merge 4 already owns `basedOn`, the
version and the queue, so no closure is read. Q32's option A should say "record queue".

**M5 (K19). On reads, a required `key` that omits an input field silently aliases entries, and nothing checks it.**
OD15 rejected "default to every input field". For writes that is right: `key: []` on a `latest` write means "newest
of all". For resources, the key is the cache entry (OPS O1), and non-key fields are frozen at the first binding
("automatic requests use the oldest live binding's parameters", OPS O2).

`search/query` written `key: []`, the natural way to write "one cache entry for my search box", serves the first
query's hits to every later query, under one row whose `key` is `{}`. Every resource in the proposal (`docs/doc`,
`issues/in-project`, `todos/in-list`, `kanban/cards`, `dash/*`, `chat/since`, `onb/*`, `search/query`,
`chat/typing`) lists every input field, so on reads the required key is pure repetition with one wrong way to write
it. **Fix (no OD change):** `flow check` warns `KeyOmitsInput` when a resource's `input` field is outside `key`. For
streams, exempt the resume position (or warn there too, and let `after` be the one documented exception). Count it as
an author rule otherwise (concept count below).

**M6 (inventory). The OD12 and OD15 sweep is incomplete.** Each of these is a sentence an implementer would follow:

- 3.6: "`key` stays optional (OPS O1) … required under `latest` and `cancel` (declared or the domain default, checked
  at the operation)". This contradicts OD15.
- 3.11: "a `latest` or `cancel` write without a key at the operation (OD4: after the domain default; a type error
  first)". 4: "`latest` and `cancel` without a key are type errors at the operation, where the domain is known". Both
  are obsolete under OD15.
- 5.1's prose: "`confirm` and `handleNextAction` … need no key". The code says `key: []`.
- 3.2's `like` comment: "keyed by the domain's .predicts".
- 12 "Existing, unchanged": "`params` (mapper context)". 7's B17: "`params` kept in the mapper context". 3.1 and
  3.5: "`each`'s select returns a list of params". 3.10: "re-opens from its params". These should read `input`.
- Merge 4's projector, `read(x).list(Entity, ({ result }) => result.issues)` (5.3, 8.4, 9.4), still says `result`.
  Rename it to `output`, or state that merge 4's projector keeps its own word.
- 3.7: "at a commit or lookup (step 6)". This is now step 5 (OD16).
- 3.11: "a Story can visit each of the write-lane table's 22 reachable cells … a suite that does is the table's
  test". This contradicts 3.8.1's "a policy suite in Flow's own tests".
- 5.7's 8.2 row: "passes; CLOSED is terminal for `save`". This is revision 7's text. Revision 8 errors without
  CLOSED's handler.
- The amendment list is missing MD 2.7.12 (invocation at settlement), MD 2.7.8's two tables, and OPS O7's "`cancel`
  cancels this actor's queued and running commits for a key".

**M7 (K14). `UnresolvedHold` misses a U handler that can decline entirely.** Rule 2 walks "each branch of U's handler
that keeps the hold". With closures over-approximated as "may pass", the check never considers that every branch may
decline. `SaveUnsure: { guard: ({ memory }) => memory.online || deny("Offline"), actions: [O.save.retry] }`, with no
fallback, is `Denied` offline. The hold stays, and there is no owner, but the only branch has `retry`, so the check
passes. **Fix:** if every alternative of U's handler has a closure or Flow guard, add an implicit "declined" branch
that keeps the hold, with U's arrival leaf as its target.

## Low

- **L1 (K13).** MD 2.5 step 5 lists commit input selects and retry or cancel key selects among the "effect-only
  reads". Revision 8 says effect-only reads see the after lanes, but cells apply "after the selects", so those selects
  see the pre-turn lanes. Say that selects read lanes as guards do, and that only `keys`, `when`, activity inputs and
  rows read the after lanes.
- **L2 (R6 M1's fix).** "Then the lane's addressable one" means that a key-less `cancel` in a *success* or *failure*
  handler of a keyed operation ends the commit that admission just promoted (its own Attempt is resolved). This is
  consistent, but it is not obvious. Add it to the key-less paragraph.
- **L3.** Under `latest`, a promoted head that has not been invoked was never sent, but it is not replaceable
  (principle 1). Force save sends "ABC" only to overwrite it with "ABCD". Either state "a promoted head counts as sent
  for replacement" or let a `latest` commit replace a head that has not been invoked. The owner's choice. Correctness
  holds either way.
- **L4 (K19).** A stream mapper's `{ input }` is the session's *opening* input (OPS O4 keeps it while the key is
  unchanged). 5.4's `gap: … after: input.after` reports where the session opened, not where the gap was. Say so, or
  map from the `Session` signal's position.
- **L5.** With a full Schema `input` (OD14), a union's `key` must name fields present in every member (`keyof` of a
  union). A live row's new `key` names the new entry while `placeholder` data is the previous one's. A guard
  `row.key.x === memory.x` must also check `placeholder`. State both.
- **L6.** No case in the proposal uses `cancel`, `allow` or `serialize`. `HeldThisTurn`, the `serialize` head and
  `outstanding` are exercised only in review sketches. Bring sketch 8 (serialize) in as a case.
- **L7 (K17).** A `reject` hold passed by the terminal pass (5.1's LEFT) is persisted and restored forever, with
  `uncertain: true`, the lane kept and the record's mark kept. This is fine, but say so: "the lane ends only on
  dispose".
- **L8 (M2).** Under `cancel` concurrency, an interrupted older Attempt's ending arrives while the newer one is
  `InFlight`. Say "an ending of an Attempt that is not addressable is evidence", so it is not read against the
  `unknown` in `InFlight` cell.
- **L9 (K18).** A failed Persistence O6 acknowledgement settles "through interrupt with StorageFailure evidence"
  before invocation. The table's interrupt row is after invocation (unknown → `Held`). A commit that was never sent
  would then hold its lane as `uncertain`. Map it like the before-invocation `cancel`: `NotSent`.

## The contract-shape change (OD12–OD15)

| Area | Applied | Note |
| --- | --- | --- |
| Mappers | yes: `{ input, attempt, progress, key }` for writes, `{ input, key }` for reads and streams | stream `input` is the opening input (L4) |
| Persistence | yes: keys decode with `input`'s pick, persisted resource data with `output` | changing `key` fields remains a persistence break (stated) |
| SSR | yes: "without `output`" | none |
| Stories | yes: fakes with two schemas | none |
| `flow check` | reads `key` against `input` as data | the obsolete OD4-default checks remain in 3.11 and 4 (M6). Add `KeyOmitsInput` (M5) |
| Merge 4 | domain writes state `key`; `.predicts` reads `input`; rule 34's warning re-stated | the projector's `({ result })` (M6) |
| Merge 6 | `input: { roomId, after }`, `key: ["roomId"]` | sound. `after` is read at open only, and reconnect uses `Session.reconnect`'s position, which is correct but should be stated (L4) |
| Leftover `result` or `params` | 7 places | M6 |
| Q37 (`output` omitted; `progress`) | open, used as A in 5.3 and 8.4 | fine as proposed |

**What the required `key` costs.** About 36 declarations across the cases:

- 5 are `key: []` on transactions, which costs one line and says something true.
- 19 more on transactions name the lane, which is the point.
- On the 11 resources, the key restates the input's fields every time (`input: { docId }, key: ["docId"]`). The one
  stream leaves out only its resume field. That is the repetition OD15 accepted, and without M5's check it carries one silent wrong form.

## Authoring: sketches under revision 8

| Aspect | Sketch 8, `serialize` uploads (re-run) | Sketch 9, bulk archive (re-run) | Sketch 10, shared checklist (new) |
| --- | --- | --- | --- |
| Reads well | `outstanding` gives "17 queued" with no memory (R6 L4 closed); the give-up releases and promotes | Undo queues behind the held archive on one lane; key-less members in `ArchiveUnsure` | two actors, one record; the list's `Item.get(s, k).uncertain` and the drawer's `O.rename.get(s, k).uncertain` are now told apart |
| Contract edits | `key: []` (+1 line) | `setStar` gains `key: ["id"]` (default gone) | 4 `key` lines, 2 restating input |
| Hacks | (1) the head's identity is derived from memory order (Q35 open) | (1) the fan-out loop, a stated cut (R6 M9) | none |
| Bugs the model allows silently | (1) a per-row Cancel hits the head (Q35, now stated); (2) **leave the folder: 16 queued photos dropped** (H1) | (1) closed: the star no longer clears the archive's mark (amended rule 32); (2) **Undo, then navigate away: the Undo is dropped** (H1) | (1) the drawer is disposed on CLOSED, so the newest title is lost (H1); (2) the mark is permanent after disposal (M3); (3) `CloseAnyway` during a queued re-send reports `NotSent` (H2) |
| Friction | reload: 17 `NotSent { Restored }` rows to re-pick | `serialize` must be chosen deliberately | the user's own tick refuses the user's own rename with 412 (M4); Close/CloseAnyway in every editor actor |
| `UnresolvedHold` | passes | passes | passes (it cannot see the host) |

## Concept count (0.2 claims 7 words, 0 modes, 14 rules)

- **Words: 7, agreed.** The live row's `key` is the one-off row's word in one more place. `HeldThisTurn` is a table
  label. `NotSent { Disposed }` (H1's fix) would be a value of an existing word, not a new word.
- **Modes: 0, agreed.** `key`'s opposite risk on reads (K19) is stated per kind, so it is not a mode by 0.2's
  definition. It is a trap without M5's check.
- **Rules: 14 written, 15 honest.** The 15th is "a resource's `key` must list every field that changes its output",
  which an author must hold unless `KeyOmitsInput` checks it. Also missing as definitions, but not as author rules:
  - the lane's end of life (K17);
  - invocation independent of the turn's outcome (K18);
  - `cancel` before invocation by history (K18).
- **The table.** 3 states × 10 rows is exact inside a turn. It needs one row (dispose) and one sentence (invocation)
  to be exact across turns. `HeldThisTurn` needs its missing rows, and a count under `allow` (M2).

**State: 3 High findings (H1, H2, H3). Not zero.** All three are fixed by definitions (K17, K18): a dispose row, "a
re-send cancelled before invocation is released", and "invocation does not depend on the turn's outcome". None needs
a new author word. After them, and M1's one-word scoping, I expect a review with no Highs.
