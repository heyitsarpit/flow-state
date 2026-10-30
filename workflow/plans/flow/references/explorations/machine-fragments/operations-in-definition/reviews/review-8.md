# Review 8 of operations-in-definition, revision 9 (2026-10-30)

One reviewer: correctness, simplicity and authoring. These are suggestions, not decisions. OD1–OD19 are taken as
fixed; this review judges only whether they are applied correctly and what they cause. It re-walks review 7's
findings against revision 9's table, then hunts across the whole lifecycle in one pass: several actors of one
definition, rebinding across releases, a restored hold in a state with no handler, Runtime disposal, offline, SSR
hydration, and Stories. Sketch 10 (`ops-review-7/10-shared-checklist.ts`) was re-walked (it is a sketch, not
runnable code), as were sketches 8 and 9 for the new rows. Plans read against the proposal: `Runtime.plan` O3, O6,
V4; `Persistence.plan` O2–O6; `ServerRendering.plan` O2–O5. TanStack Query's source was read at every 10.3 citation.

**Verdict: not ready for acceptance. There are 3 High findings, not zero.** Review 7 is closed: H1's silent drop,
H2 and H3 walk correctly against the table, and K17–K20 are applied. Inside one actor's life, the table is now exact
across turns. The three Highs sit at the edge revision 9 moved: the Runtime now owns the lane's behaviour, but the
lane's **identity** and its **storage** are still the actor's, and the arrival of a restored hold was not checked
against the cases.

- **H1.** A new actor of the definition adopts **every** orphaned lane of that definition, whatever it edits. The
  editor for d2 receives d1's hold; checkout B receives checkout A's held `pay` and can never pay. Two live actors
  then write one document on two lanes, and R3 H1's late landing comes back.
- **H2.** An orphaned lane of a persisted actor has no persistence owner. Its progress is not captured, a promoted
  commit cannot get Persistence O6's acknowledgement, and re-ensuring the actor restores a stale copy of a lane that
  is still live in the Runtime. The reference app's editor (`persist: true, retain: "10 minutes"`) is this path.
- **H3.** A rebinding actor receives `unknown { Restored }` in its initial leaf. 5.1, 9.2 and 9.6 do not handle
  it there, or handle it without a path to an owner, so they deadlock (`Pay` and `Start` are denied `Uncertain`
  forever). `UnresolvedHold` passes vacuously when the arrival leaf has no handler, and 5.7 still says "passes".

Each fix is a definition. None needs a new author word. One Medium has an optional owner question (Q40).

## Causes and fixes

| # | Cause | Findings | Fix at the cause |
| --- | --- | --- | --- |
| K21 | **Runtime ownership was applied to the lane's behaviour only.** OD19 moved endings and invocation to the Runtime, but the lane's identity on rebind is "the definition", not the actor, and its storage is still inside the actor's saved record (Persistence O2: "pending writes follow their actor"). | H1, H2, M4, M5 (part) | A lane is identified by **(actor identity, contract id, key)**, where the actor identity is Runtime O3's: the ref (machine id, actor id) for a shared actor, and (machine id, input by `Equal.equals`) for a local one. An actor adopts only orphans of its own identity. Lanes are **Runtime records for persistence** too: captured bound or orphaned, acknowledged per lane, never copied into the actor's record. |
| K22 | **`UnresolvedHold` assumes every way into `Held` delivers U to a handler.** Two ways do not: a rebind into an initial leaf that has no U handler (Unhandled), and a storage-refused re-send, which returns to `Held` and delivers nothing. | H3, M1 | Rule 2: an arrival leaf where U has no handler adds the same implicit branch that keeps the hold as R7 M7's "declined" branch. A storage-refused re-send delivers `unknown { StorageFailure }`. `retryCount` counts invoked re-sends. Re-walk every case from its initial leaf. |
| K23 | **The Runtime's own edges have no rows.** Runtime disposal and SSR hydration both change lanes, and both plans already say something about commits there. | M2, M3 | Add a **Runtime disposal** row (no new invocation once disposal starts). State that **hydration reads as the restore row**, with a transferred in-flight Attempt counted as acknowledged. |
| K24 | **The OD19 sweep is incomplete.** Sentences that say "the actor's lane, changed only in its turns" remain, and four plan clauses that OD19 contradicts are not in the amendment list. | M5, L1–L8 | Complete the list (M5). Correct 10.3's two inexact readings (L3). |

## Review 7 against revision 9

| R7 | Status | Walk |
| --- | --- | --- |
| H1 dispose | **closed for the drop; the hand-off is wrong** (H1, H2) | 8.2: `CloseAnyway` releases "AB" → "ABC" is promoted → CLOSED → unmount → dispose. "ABC" is invoked after the turn by the Runtime, and its success is evidence → `Idle` → removed. Nothing is dropped. If "ABC" ends unknown, the orphan is `Held`, and the next `Editor` actor of **any** document adopts it (H1). |
| H2 cancel by history | **closed** | Sketch 10 walk E: "Milk" `Held` → `RenameUnsure` re-sends → it waits in item 7's record queue (`InFlight`, sent before) → `CloseAnyway`'s `cancel` meets "a re-send": it returns to `Held` and is released. The mark is kept, and the forced repair runs. The record-queue entry must also be withdrawn (L2). |
| H3 invocation | **closed** | 9.3: "A" succeeds while `Saved`'s guard declines → `Denied`. Admission resolved "A" and promoted "AB". The effects are kept and published, and "AB" is invoked after the turn. `InvalidTurn` is the same. MD 2.5 step 2's "then nothing changes" needs the amendment (M5). |
| K17 | **applied, as OD19** | the dispose and rebind rows exist. The identity (K21) and the storage (K21) do not follow. |
| K18 | **applied** | "Invocation is its own step", by-history `cancel`, the storage-refused row, promotion only on resolve or release (R7 M1). Gap: a storage-refused re-send delivers nothing (M1). |
| K19 | **applied** | `KeyOmitsInput`; S4 says the rule. Edge: paged resources (L4). |
| K20 | **applied** | Marks are per Attempt in the record queue, and `Released` is a store effect. The rebase follows the record queue. Edge: a re-send's `basedOn` (L5). "A mark is never orphaned" is not true (M4). |
| M2, M7 | **applied** | `HeldThisTurn` has every row; `allow` is a count; the declined branch exists. M7's sentence in rule 2 is now split by its own parenthesis (L8). |
| M6, L1–L9 | **applied** | Q39 is asked. L3 is taken as "a never-invoked head is replaceable". |

## Is the table a complete, deterministic state machine?

**Within one actor's life, across turns: yes.** Each member, ending and Runtime step meets one cell and one address.

- **Invocation:** `waiting → on the wire` is its own row, and it does not depend on the turn's outcome.
- **`cancel` before invocation:** acts by history.
- **Storage refusal:** has its own cell.
- **The count:** 14 × 3 = 42 cells, 13 "cannot occur", 29 reachable, as stated. L1 is the one exception: two of the
  29 act on a lane that does not exist.

**At the actor's end: not yet.**

- **dispose** is exact.
- **rebind** has the wrong domain: it says which lanes an actor takes, but the choice is by definition (H1).
- **restore** has two sources for one lane once the Runtime also holds it (H2).

**At the Runtime's end: no rows.** Runtime disposal and hydration are missing (M2, M3).

**Who receives an ending when two actors bind the same (contract id, key)?** Under revision 9, this happens three ways:

- **Two live actors.** Each has its own lane, and each receives its own endings. For plain transactions nothing
  orders the two lanes; the proposal states this for domain writes only (3.8.1: "ordered by merge 4's record queue").
- **An orphan and a live actor.** The orphan stays with the Runtime: "If a live actor already holds that key, the
  orphan stays".
- **An orphan and a starting actor.** The orphan goes to whichever actor of the definition starts next and has no
  lane for that key. A starting actor has no lanes, because lanes are created by work, so it adopts every orphan of
  its definition. That is H1.

## High

**H1 (K21). A starting actor adopts every orphaned lane of its definition, so the wrong actor owns the hold, and
the right actor writes past it.** Revision 9: "Rebinding happens when an actor of the same definition starts … and
finds an orphaned lane of its definition whose (contract id, key) it does not already hold." Three walks:

1. **8.2, two documents.** d1's editor is disposed while "ABC" is `Held`. The user opens d2, and d2's editor
   adopts d1's lane.
   - In LOADING, the root `SaveUnsure` re-sends "ABC" (key-less, so it acts on the ending's own Attempt).
   - On the next unknown, its fallback writes "We couldn't confirm your last save" into **d2's** `memory.error`.
     d2's status line reads `O.save.get(s, { docId: d2 })`, which is clean.
   - The user reopens d1. d2's actor is live and bound to d1's lane, so the new d1 editor gets a lane of its own.
     Its `Loaded` guard `O.save.idle(thisDoc)` passes, and it saves "X".
   - d2 closes (its `Close` guard checks d2 only) and is disposed. The orphan is adopted by the next editor of any
     document, which re-sends "ABC" with its own id. If the first send never landed, "ABC" now lands **over "X"**.
     This is R3 H1's late landing, which the hold exists to close, across two actors.
2. **5.1, two carts.** `Stripe.confirm` is `key: []`. Checkout A is disposed in UNSURE (in-app navigation; `Leave`
   is denied, but unmount does not ask). The user opens checkout B, and B adopts A's held `pay` lane.
   - In CARD, the root `Unsure` looks up **B's** intent. B's `Intent` falls through to `{ target: "self" }`.
   - B's `Pay` is guarded by `O.pay.idle`, which denies `Uncertain` forever. The new cart cannot be paid.
3. **Sketch 8, two folders.** Folder A's `serialize` lane (`key: []`) is orphaned with photo 3 `Held` and 16 in `W`.
   Folder B's actor adopts it, and B's uploads queue behind A's photos. B's view shows A's progress.

Rebinding by definition was meant to make "restore and rebind one rule" (3.8.1), but persistence restores per actor
record, which is per actor identity. Runtime O3 already defines identity ("Two refs with the same machine and id"),
and the reference app keys its editor by ticket (`editor.ref.ts`). Separately, Runtime O3 says "No outcome, schedule,
issue or send from an old incarnation ever reaches a new one" (V4 tests it), and rebind contradicts it. It is not in
the amendment list.

**Fix (K21).** Replace the rebind paragraph's first two sentences with:

> A write lane is identified by (actor identity, contract id, key). An actor's identity is its ref, (machine id,
> actor id), for a shared actor (Runtime O3), and (machine id, input by `Equal.equals`) for a local actor. When an
> actor starts (created, ensured or restored), it adopts the orphaned lanes **of its own identity**, and no others.

Then:

- **Delete** "If a live actor already holds that key, the orphan stays". A shared identity has one live actor. Two
  live local actors with equal input are stated like two tabs (Q31): their plain writes are unordered.
- **Amend** Runtime O3 and V4: "except a write lane's hold, delivered to the new incarnation as `unknown { Restored }`,
  and the ending of an Attempt still on the wire".
- **Walk** 8.2, 5.1 and sketch 8 again: d2, cart B and folder B adopt nothing. 8.2's revision 9 walk already *says*
  "the next editor actor for that document", which is this rule, not the one written.
- **Considered and not recommended:** one lane per (contract id, key) Runtime-wide (TanStack's cache-wide `scope`).
  It orders two live editors, but one actor's `retry` and `cancel` would act on another actor's Attempt, and a hold
  would need a hand-off in the middle of a live actor's life.

**H2 (K21). An orphaned lane of a persisted actor has no persistence owner.** Persistence O2: "Transactions have no
persist option: pending writes follow their actor." Persistence O3: "a persisted actor whose retain expired keeps its
saved record", which is the last capture. Revision 9 keeps the lane live in the Runtime after that capture. Walk 8.2
as the reference app writes it (`actorRef(..., { persist: true, retain })`):

1. "AB" is `InFlight` (acknowledged) and "ABC" is in `W`. The user leaves the document, and the retain passes, so the
   actor is disposed. The saved record holds "AB" in flight and "ABC" queued.
2. "AB" succeeds in the Runtime, and "ABC" is promoted. Persistence O6 says it "cannot invoke its adapter until
   storage acknowledges its Attempt", but no actor record is being captured. Either "ABC" waits forever, or it is
   invoked without durability, which O6 forbids ("never silently downgrades").
3. The user reopens d1. `ensureActor` **restores from the saved record** (Runtime O3). The restore row turns the
   stale "AB" into `unknown { Restored }` and "ABC" into `NotSent { Restored }`. Meanwhile the Runtime's live lane
   says "AB" succeeded and "ABC" is waiting or sent. One identity now has two lanes. The page says "Not sent" for an
   edit that may be saved, and re-sends "AB".
4. Also: `disposeActor` removes the actor's saved record (Runtime O3: "only explicit disposeActor or forget removes
   saved state"), so a reload loses the orphan's hold and `W` with no ending, although OD19 says disposal drops
   nothing.

**Fix (K21).** Add to 3.10:

> Write lanes are Runtime records. A capture includes every non-`Idle` lane of a persisted identity, bound or
> orphaned, under (actor identity, contract id, key). Persistence O6's acknowledgement is per lane record and does
> not need the actor. An actor's saved record holds no lanes. Restore at ready, and an ensure after retain expiry,
> bind the actor to the Runtime's one lane, never to a copy. `disposeActor` removes the actor's record and keeps its
> non-`Idle` lanes as orphans; `forget` removes everything. A local actor's lanes never persist (Persistence O2).

Amend Persistence O2 ("follow their actor's identity"), O3 (what a capture contains) and O6 (acknowledgement per
lane). This also answers rebinding across releases (see the lifecycle table): when the actor record no longer
decodes, its lane records still do, and the fresh actor of that identity adopts them in its initial leaf.

**H3 (K22). The restored hold arrives in the initial leaf, and three cases deadlock there while the check passes.**
S7c: "a newly started actor may receive `unknown { Restored }` in its first turn and must handle it". Rule 2 adds
"the definition's initial leaf" as an arrival leaf, but it enumerates "each branch of U's handler". With no handler,
there is no branch and nothing to check. The cases were not re-walked from their initial leaf:

| Case | Initial leaf | What happens on rebind (same identity, after H1's fix) | Check under revision 9 |
| --- | --- | --- | --- |
| 5.1 checkout | CARD | the root `Unsure` does a lookup and stays in CARD. `Intent` in CARD falls through. `Pay` is denied `Uncertain` by `O.pay.idle`. UNSURE, READING and STUCK cannot be reached from CARD. **Deadlock.** | the owners exist but cannot be reached: a **warning**. 5.7 says "passes" |
| 9.2 saved card | CARD (5.1's) | the same, plus `SaveUnsure` is handled only in SAVING | vacuous **pass** for `SaveUnsure` |
| 9.6 wizard | EMAIL | `StartUnsure` is handled only in STARTING: Unhandled, delivered once, never again. `Start` is guarded by `O.start.idle`. **Deadlock.** `SubmitUnsure` is the same, and `Submit` is guarded by `O.submit.idle` | vacuous **pass** |
| 8.2, 8.4, 5.3, 5.4, 8.1, 9.4 | root or initial leaf handles U | the owner runs | pass |
| 5.2 sign-in | PASSWORD | the root `CodeUnchecked` re-sends, then releases | pass |
| 9.3 workspace | OPEN | the root fallback patches a document that is not in `memory.open`, which does nothing. The owner is `RetrySave(named)` once the user reopens that document | pass (the owner exists only through the user) |

A deeper consequence follows. A new incarnation has only its input and initial memory. An owner that needs memory
set later (9.6's `draftId`, set on `Started`) cannot act unless the unknown event carries it. The key record is
already in the mapper context: `SubmitUnsure.from((_r, { key }) => key)`.

**Fix (K22).**

1. Add to rule 2: "An arrival leaf where U has no handler adds an implicit branch that keeps the hold, with that leaf
   as its target," the same branch as R7 M7's declined one. 9.6 then reports an error.
2. Reword S7c: "a holding write's U must be handled where a new incarnation starts (the root or the initial leaf),
   with a path to an owner, and its event must carry what that owner needs (the mapper's `key`), because the new
   incarnation's memory is initial."
3. Fix the cases:
   - 5.1: in CARD, `Unsure: S.UNSURE`. `intentId` is input, so UNSURE's checks work.
   - 9.2: the same, plus a CARD handler for `SaveUnsure`.
   - 9.6: `StartUnsure` and `SubmitUnsure` at the root, mapping `key` into memory and targeting STARTING and UNSURE.
   - 5.7: rows 5.1, 9.2 and 9.6.
4. Add one policy-suite walk: rebind into a leaf with no handler.

## Medium

**M1 (K22). A storage-refused re-send returns to `Held` silently, which breaks the owner chain.** The cell says "a
re-send: returns to `Held`" with no delivery. Every owner in the cases is a chain: U's handler re-sends, and the
next U decides again. Without a U, the chain stops.

- **5.2:** `CodeUnchecked` re-sends → storage refused → `Held` and no event. The `cancel` alternative never runs,
  and `Submit` is denied by `verify.idle`. This is R4 H1's deadlock, with the check passing.
- **8.2 CLOSED:** the hold stays, and the actor is then disposed.
- **The budget:** `retryCount` was already incremented at the `retry` cell, so a re-send that never left still uses
  up budget.

**Fix:** the cell delivers `unknown { StorageFailure }` (retained, → `Held`, as `interrupt` does), and `retryCount +
1` moves from the `retry` cell to the **invoked** cell for a re-send. OD1's "times counts re-sends" then counts sends.
The by-history `cancel` of a re-send that was never invoked no longer uses budget either.

**M2 (K23). Invocation during Runtime disposal has no rule, and OD19 makes the Runtime start new requests then.**
Runtime O6: "invoked commits are allowed to settle", and after 5 seconds they become unknown. Under OD19, actor
disposal orphans the lanes, and the Runtime "invokes what the table promotes". So a success during shutdown promotes
`W`'s head and **sends a new write**, which is then cut at 5 seconds into an unknown nobody owns. With logout, that
request goes out after the user signed out, on services being released. Persistence O3 also says "a commit that
settles before the final capture is saved as a pending mapped outcome and delivered after reload", while revision 9
says an orphan's ending is evidence, "never re-delivered".

**Fix:** add a **Runtime disposal** row:

> From the start of Runtime disposal, nothing is invoked. A never-sent Attempt or `W` entry of a persisted identity is
> captured as never sent (on reload, `NotSent { Restored }`); otherwise it ends `NotSent { Disposed }` as evidence.
> A waiting re-send stays `Held`. What is on the wire follows Runtime O6. An ending that settles before the final
> capture is saved as a pending mapped outcome (Persistence O3) and delivered to the restored actor; this is the one
> exception to "never re-delivered".

`Disposed` is a value of `NotSent`, not a word.

**M3 (K23). SSR hydration has no row.** ServerRendering O3: "An in-flight commit becomes unknown with its attempt …
reports DehydrateCommitInFlight … the actor's unknown outcome owns reconciliation", and "pending-commit facts"
transfer. O5: "an existing client actor wins over its hydrated copy", and "persisted actors beat hydrated copies".
The proposal mentions SSR only for `output` (3.3). Under the hold, that transferred unknown is a `Held` lane, and when
the hydrated copy loses, its lane must go somewhere.

**Fix:** "Hydration reads as the restore row. A transferred in-flight Attempt counts as acknowledged (the server
invoked it): `unknown { Restored }` → `Held`. Queued work never transfers (O3). When the client or persisted actor
wins (O5), the hydrated copy's lanes are evidence. `DehydrateCommitInFlight` already reports them, and with no
transferred predictions there is no mark." This is a stated limit, and it is rare: it needs a write sent while
rendering.

**M4 (K21). An orphan that is never adopted keeps its mark, and holds the latest edit, for the Runtime's lifetime.**
Revision 9: "a mark is never orphaned, because its Attempt is never orphaned". That holds only if the identity starts
again.

- **Sketch 10:** item 7's drawer is never reopened, or item 7 is deleted elsewhere. The Checklist then shows item 7
  `uncertain` for the session, and the mark keeps the record from being collected (rule 32, E18). R7 walk B returns
  for this case.
- **8.2:** the user leaves d1 while offline. Nothing re-sends "ABC" when the network returns (TanStack's
  `resumePausedMutations` does, `mutationCache.ts:231-239`).
- **No warning on tab close:** `useBeforeUnload(save.pending || save.uncertain || dirty)` was unmounted with the
  editor, so closing the tab later loses "ABC" with no warning.

**Fix (statement):**

1. Replace the sentence with "a mark lasts while its Attempt is unresolved; an orphan that no actor of its identity
   adopts keeps it until the Runtime ends, and Inspection lists it".
2. Add the walk to rule 4's limit.
3. Optional **owner question Q40** (public API, so not proposed here): a Runtime-level read such as "unsettled
   writes", for a host's `beforeunload`, as TanStack's `MutationCache` exposes its pending mutations.

**M5 (K24). The OD19 sweep.** Each is a sentence an implementer would follow:

- **"The actor's turns":** 3.3's table ("(actor, operation, contract key)"), S3 ("A lane's status changes only in the
  actor's turns"), 3.7 ("only in this actor's turns … No store event and no other actor touches it"), R12 ("the lane
  owns this actor's workflow"), and C1′ ("Lanes are the actor's workflow and change only in its turns"). These should
  read "the binding actor's turns, or the Runtime's steps for an orphan (invocation, endings)".
- **D9:** 3.6's "D9's one write in flight per key holds by construction" holds per binding actor, not per Runtime.
- **Missing amendments:**
  - Runtime O3 and V4 (H1);
  - Runtime O6 and Persistence O3 (M2);
  - Persistence O2, O3, O6 (H2);
  - ServerRendering O3, O5 (M3);
  - MD 2.5 step 2's "then nothing changes" (an ending's lane effects survive `Denied`, `Unhandled` and `InvalidTurn`).
- **5.7:** the rows for 5.1, 9.2 and 9.6 (H3), and 8.2's line "the actor's disposal in CLOSED drops nothing", which
  should also say who adopts the lane.

## Low

- **L1.** Lanes are removed when they hold nothing (3.3), so `dispose × Idle` and `restore × Idle` act on no lane, as
  `rebind × Idle` does. Either call the `Idle` column "the virtual idle lane", as `get` does, or count 27 reachable
  cells and 2 no-ops.
- **L2.** A released re-send has already joined its record queue (rule 31). Say "its record-queue entry is
  withdrawn, so it is never invoked".
- **L3 (10.3).**
  - `isPaused` is also true for a mutation paused between retries after a send (`retryer.ts:195-198`). "Only paused
    (never-sent) mutations are dehydrated" is exact only with `retry: 0`, and `continue()` (`mutation.ts:165-170`)
    then re-runs `mutationFn` with no idempotency key. That strengthens "different".
  - "A lane per key is a scope" is not quite right: a `scope.id` spans the whole `MutationCache`
    (`mutationCache.ts:160-175`), while a lane is per binding actor.
  - Cite `MutationCache`'s global `onError` and `onSettled` (`mutationCache.ts:19-45`, `mutation.ts:238-300`) as the
    prior art for "an orphan's endings are evidence that Runtime observers see". Say that they reach diagnostic
    observers.
  - The other citations check out: `mutationObserver.ts:96-99`, `mutation.ts:155-162`, 199 and 326-327, and
    `mutationCache.ts:177-185` and 231-239.
- **L4.** `KeyOmitsInput` on a paged resource: if a page cursor is an `input` field, it is non-key by design, as a
  stream's resume field is. Exempt it, or state that pages are not `input`.
- **L5.** A re-send keeps its first send's input (rule 31), `basedOn` included. Say "the rebase applies to never-sent
  writes only", so a re-send's `If-Match` does not change under its own idempotency key.
- **L6.** A Story disposes its actor and then drives an ending that lands on the orphan. `Story.ending(O.x, …)` names
  no live actor. Say that it addresses the lane by identity in the Story's Runtime, or move that cell to the policy
  suite.
- **L7.** "In its first turn" needs an order: after saved outcomes (Persistence O4) and before any external event.
  Several adopted holds are delivered in lane creation order.
- **L8.** Rule 2's sentence is now split. "(no `X.retry`, no `X.cancel`, or a `X.retry` behind `X.retryable` …)",
  which defines "keeps the hold", sits after the inserted M7 sentence. Move it back after "each branch of U's
  handler that keeps the hold".

## The lifecycle, in one pass

| Scenario | Under revision 9 | After K21–K23 |
| --- | --- | --- |
| Several actors of one definition alive | each has its own lanes; an orphan goes to whichever actor of the definition starts next (H1); plain writes of two live actors to one key are unordered | orphans go to their own identity only; two live local actors with equal input are stated like two tabs |
| Rebinding after the machine changed between releases | a `version` change discards the scope, lanes included (Persistence O5): no ending, ids and budgets lost, which is safe for the server and stated. With an unchanged `version` but a record that no longer decodes, the actor record is discarded **with its lanes** (H2) | lane records decode by the contract's `input` pick and are independent of the machine. The fresh actor of that identity adopts them in its initial leaf (H3's rule applies). A contract with no operation left goes to `orphaned` (P19), as 3.10 says |
| `unknown { Restored }` where nothing handles it | Unhandled, delivered once, never again; the check passes vacuously (H3) | an implicit branch makes it an error; cases fixed |
| Invocation while the Runtime disposes | promoted work is sent during shutdown (M2) | nothing new is invoked; never-sent work is captured or ends `NotSent { Disposed }` |
| Offline, then online | an unknown holds; nothing resumes automatically (stated, 10.3); an orphan's `W` waits for its identity to start again (M4) | the same, stated; Q40 for a host warning |
| SSR hydration | no row; the plans transfer an in-flight unknown (M3) | reads as the restore row |
| A Story over every reachable cell | the cells a machine allows, plus dispose and rebind in one Story Runtime; the orphan-ending cell has no address (L6); the rest are in the policy suite | as now, with L6 stated |

## Sketch 10 re-walked under revision 9

| Walk | Revision 8 | Revision 9 |
| --- | --- | --- |
| A, dispose on CLOSED | "Milk 2l" dropped | **closed**: invoked by the Runtime. If it ends unknown, the next drawer of **any** item adopts it (H1) |
| B, permanent mark | mark kept forever | **closed if the item's drawer is reopened**; still permanent if it never is (M4) |
| C, store reads a lane | coupling | **closed**: per Attempt, in the record queue |
| D, 412 from the user's own tick | 412 | **closed**: rebased along item 7's queue |
| E, `cancel` of a queued re-send | `NotSent` for a possibly-landed write | **closed**: `Held` → `Released`, the mark kept (L2) |
| F, stream `after` | opening input | stated (5.4's gap comment) |

Sketch 8 (uploads): leaving the folder no longer drops 16 photos, but folder B adopts them (H1). Sketch 9 (bulk
archive): the Undo stays queued, and the mailbox actor of the same identity adopts it. Correct after H1's fix.

## Concept count (0.2 claims 7 words, 0 modes, 15 rules)

- **Words: 7, agreed.** `Restored`, `StorageFailure` and `Disposed` (M2) are values. "Binding actor" and "rebind" are
  table labels. Q40 would add one, and it is not proposed.
- **Modes: 0, agreed.** After H1's fix, adoption uses Runtime O3's identity, which already differs for shared and
  local actors. That is an existing rule, not a new mode.
- **Rules: 15, agreed, if S7c says what an author must do.** As written ("must handle it"), the cases show that
  authors do not see what it requires. With H3's rewording, S7c holds three things: the hold outlives the actor; it
  arrives where a new incarnation starts; and its event must carry what the owner needs. That is still one rule.
- **The table: 14 rows, plus one** (Runtime disposal, M2), with hydration read as restore. Reachable: 29 as counted,
  27 by L1's reading. The rebind row's domain changes from the definition to the identity, with no new cells.

**State: 3 High findings (H1, H2, H3). Not zero.** All three are fixed by definitions:

- **K21 (H1, H2):** one identity for a lane, Runtime O3's, used for adoption and for storage.
- **K22 (H3):** an unhandled arrival is a branch that keeps the hold, and the cases are re-walked from their initial
  leaves.

None adds an author word. After them, M1 (one delivery) and M2 (one row), I expect a review with no Highs.
