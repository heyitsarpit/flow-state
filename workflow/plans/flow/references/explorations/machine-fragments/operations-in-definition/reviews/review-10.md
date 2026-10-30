# Review 10 of operations-in-definition, revision 11 (2026-10-30)

One reviewer: correctness, simplicity and authoring. This is the last authorised round. These are suggestions, not
decisions. OD1–OD21 are fixed; this review judges only whether they are applied correctly and what they cause. It
re-walks review 9's H1–H3 (K25, K26), M1–M5 and L1–L7 and the lane model's G1–G6 against revision 11 (commit
ddf46d4a), reads 3.8.1 end to end, and hunts at the lane–record–leaf boundary: a parked outcome after a release that
changed the machine, two parked outcomes for one record, a parked outcome beside a user event, a second device,
local actors, and Stories. Plans read against the text: MD rules 14, 15, 20 and C17; `Runtime.plan` O3, O4, O6;
`Persistence.plan` O2–O7; `Testing.plan` O7; `React.plan` O2, O3; `ServerRendering.plan` O3. Cases walked: 5.1, 5.2,
8.2, 9.2, 9.3 and 5.7's revision 11 walks. The lane model (`lane-model/RESULTS.md`) still reports revision 10; its
K25/K26 extension was not in the tree when this review ran, so the two invariants 3.8.1 promises are not yet evidence.

**Verdict: not ready for acceptance. There are 2 High findings, not zero.** Review 9's three Highs are closed as
written: endings with no live incarnation reach the saved record, and adopted endings have a defined route. Both new
Highs follow from those fixes:

- **H1.** K26 made an adopted lane's success and failure arrive in **any** leaf, but only `unknown` got a check
  (`UnresolvedHold`). MD rule 20 (required handling) still checks the owner's leaves only. 5.1's own root `Intent`
  handler, written for late endings, ignores an adopted successful payment in CARD: the customer is charged, the page
  shows the card form, and the next `Pay` reports "We couldn't process this payment."
- **H2.** Revision 11's G2 text makes everything on the wire at Runtime disposal **evidence** under `cancel` and
  `allow`, which contradicts OD21 for a persisted identity: the restored record never hears of a write that settled
  before the final capture, or of one still unknown.

Both fixes are definitions plus example code. Neither needs a public API change.

## Causes and fixes

| # | Cause | Findings | Fix at the cause |
| --- | --- | --- | --- |
| K29 | **K26 widened where endings arrive, but only one of an operation's mapped events got a check, and the re-walks checked only `unknown`.** Rule 20 still reads "every leaf under its owner", which for an adopted Attempt is the old incarnation's leaf. Root handlers written as late-event ignores now also receive adopted endings. | H1, M1 | Rule 20 covers every event a write maps over the new-incarnation arrival set. Narrow that set soundly (M1). Fix 5.1's root `Intent`, and give 9.2 explicit root ignores. |
| K30 | **G2 ("nothing is held past a turn") was applied to sent work, not just to the hold.** The cancel table's Runtime disposal cell overrides OD21 and Persistence O3. | H2 | Only the *live lane* ends `Idle`. Endings and unsettled sent work of a persisted identity are parked or captured, exactly as in the holding table. |
| K31 | **A parked ending lives in the actor record, but the lane lives in a Runtime record.** Revision 10 gave lane records their own decode, their own acknowledgement and their own lifetime. K25 put the endings they produce back inside the actor record, which has a different decode, a different mapper version and an unstated in-memory copy. | M2, M3, M5 | One owner for a parked ending (M3). One routing test for an adopted Attempt, whenever it lands (M2). The Runtime's newest record is the restore source within a Runtime (M5). |
| K32 | **At Runtime disposal, `W` ends before its head.** Saved order then differs from lane order. | M4 | `W` ends `NotSent { Disposed }` after the head's ending or the disposal bound. |
| K33 | **The OD21 sweep is nearly complete.** | M6, L1–L6 | Exact rows below. |

## Review 9 against revision 11

| R9 | Status | Walk |
| --- | --- | --- |
| H1 (K25) restored record misses endings | **closed** | 5.1, persisted with retain: `pay` succeeds with no actor, so the lane goes `Idle` and `Intent` is parked. Ensure restores PAYING (its activation is restored, so rule 14 says current) and PAYING's `paid` goes to DONE. 8.2 "ABC" refused after disposal: `Saved` then `SaveFailed` are parked in lane order. Restore: `error`, `dirty: true`, autosave armed by `armOn: [E.SaveFailed]`, and `Loaded` is denied by `dirty`. Parking is in the dispose row (860), 3.8.1's owner paragraph (769–774) and Persistence O2/O3. The decode-independence gap is M3. |
| H2 (K25) clean shutdown loses queued work | **closed for the holding policies; reopened for `cancel`/`allow` (H2 below)** | 8.2: "ABC" ends `NotSent { Disposed }` and is parked; "AB" settles within the bound and is parked. Restore ends `dirty: true` with autosave armed. The walk (3259) states the order backwards, though 8.2 survives it (M4). |
| H3 (K26) adopted endings had no route | **closed for `unknown`; open for success and failure (H1)** | 9.2: `save` adopted in PAYING ends unknown, and the root `SaveUnsure` releases it. The rule 14 row, the C17 row and "What a new incarnation receives" agree. The 5.1 re-walk's reachability claim is wrong (M1). |
| M1 local identity | **closed** | Defined at 776–786. The Runtime O3 (local) and React O2/O3 rows were added. Oldest orphan first; the input-free limit is stated. `Equal.equals` is structural for plain objects in the installed Effect (`Equal.ts:117`). Wording: L4. |
| M2 plan rows | **closed except one stale row** | Persistence O3/O5/O6, MD 14, C17, LazyFeatures O3 and Inspection were added. The OPS O3/O7 row (1010) still says "endings with no binding actor are evidence" (M6). |
| M3 re-send waits for capture | **closed** | 807, 827–828 and 855 now read one way. |
| M4 SSR hydrated actor waits | **closed** | 864: stated limit. ServerRendering O3's phrase is removed. |
| M5 idempotency window | **closed** | Stated limit in 3.8.1's limits. The age bound is left to the owner. |
| L1 | **closed except 278 and 1168** | C1′'s "change only in its turns" stays (L6). 3.10's "in the restored incarnation's first turn" (1168) is stale against L3 (L3 below). |
| L2, L4, L5, L6, L7 | **closed** | |
| L3 several turns | **closed in 3.8.1; incomplete** | The list omits the head's own `NotSent { Restored }` (L2 below). The cancel table's restore cell still says "in the first turn" (923). |

## The lane model's findings against revision 11

| G | Status | Text |
| --- | --- | --- |
| G1 acked, never invoked → unknown | **closed** | 862 gives the reason (invocation may have begun) and the safety argument (idempotency key). Matches Persistence O6's "unless durable evidence proves the adapter could not have run". |
| G2 Runtime disposal under `cancel`/`allow` | **over-applied (H2)** | 924 makes "anything on the wire" evidence. The model's choice was for the waiting re-send's hold only. |
| G3 parked outcome vs `unknown { Restored }` | **closed for restore; missing in the rebind row** (L1) | Restore row (862) and delivery step 2 (884) say the parked outcome wins. An ensure after retain expiry is a rebind with a record, and the rebind row (861) has no such clause. Captures are atomic over the scope (Persistence O3), so the restore case is defensive. The rebind case is real. |
| G4 local actors and principle 2 | **closed** | 749–751: stated exception. |
| G5 restore never promotes | **closed** | 819–821. |
| G6 untestable hydration cells | **closed** | 868–869. |

## Is the table a complete, deterministic state machine?

**For the lane, yes, unchanged.** 16 rows × 3 states, 48 cells, 15 cannot occur, 33 reachable. Revision 11 changed
no cell of the holding table, and the model's revision 10 run still applies to it.

**For what the lane tells the actor, almost.** Every ending now has a receiver: a live incarnation, a parked
outcome, or evidence when no record survives. Two receivers are still wrong or unchecked:

- an adopted success or failure in a leaf where only a late-event ignore catches it (H1);
- sent work of a persisted identity at Runtime disposal under `cancel`/`allow` (H2).

## High

**H1 (K29). Adopted success and failure endings arrive in any leaf, and nothing checks that they are handled.**
Revision 11 amends MD rule 14: an adopted Attempt's endings are "current, from the active leaf". MD rule 20 is not
amended: "Every current event that can occur is handled totally from every leaf under its owner." For an adopted
Attempt, the owner is the earlier incarnation's leaf, so rule 20 checks PAYING and passes. `UnresolvedHold`'s new
arrivals cover only `unknown`. S7c says "the same holds for the adopted Attempt's success and failure", but no check
enforces it, and the 5.1 re-walk (3267) walked only `Unsure`.

**Walk, 5.1 (1711).** The root handler `Intent: [{ ...paid, guard: [S.LEFT, paid.guard] }, { target: "self" }]` was
written for late endings. Under rule 14, a late `Intent` reaches the root only from LEFT, the one way out of PAYING
without an ending.

1. The checkout is disposed in PAYING with `pay` on the wire, and no record survives. This happens with
   `disposeActor`, with a non-persisted shared ref after retain expiry, or when the record fails to decode (M3).
2. The new incarnation starts in CARD and adopts `pay` (3.8.1, 779).
3. `pay` succeeds. `Intent { succeeded }` is current from CARD. CARD has no `Intent` handler, the root's first
   alternative is denied (not LEFT), and `{ target: "self" }` runs. The lane is `Idle`.
4. The page shows the card form with no error. `Pay`'s `O.pay.idle` passes. A new Attempt confirms the succeeded
   intent, Stripe answers 400, and the contract maps it to `Rejected` (1398). `Refused` leads to `toCard("We couldn't
   process this payment.")`.

The customer was charged and is told the payment failed. For a contract without a server-side intent (a
`placeOrder` keyed by `attempt.id`), step 4 is a second order: a duplicated write.

**Generality.** Every machine whose root ignores were written for late endings has this problem, because rule 14
used to bound where those endings arrive.

- 5.2: the root `CodeAccepted: { target: "self" }` ignores an adopted successful verify in PASSWORD.
- 9.2: `CardSaved` and `CardRefused` have no handler outside SAVING, so an adopted attach that lands in CARD or
  PAYING is `Unhandled`. It counts as delivered (F8) and is lost. A total-handling check would flag this one.
- 8.2 and 9.3 handle `Saved` and `SaveFailed` at the root and are safe.

**Fix (K29). No public API change.**

1. Add an amendment row, **MD rule 20**: "every event a write operation maps (`success`, each `failure` tag,
   `unknown`) is handled totally from every leaf in that operation's new-incarnation arrival set (3.8.1,
   `UnresolvedHold` rule 2, as narrowed by M1); `{ target: "self" }` is the explicit ignore, as for late events; a
   missing handler is a `flow check` error naming the event and the leaf." Rule 2's "unhandled" branch already does
   this for `unknown`; this extends the same set to the other mapped events.
2. Add to S7c: "a root handler written for late endings also receives adopted endings in every leaf a new incarnation
   can be in; its ignore branch must be meant for them." This adds no rule: it states what S7c already covers.
3. 5.1: the root becomes `Intent: [{ ...paid, actions: answered }, { target: "self" }]`. Drop `S.LEFT` from the
   guard and release both lanes the way READING does. This changes nothing live: the only current `Intent` reaching
   the root comes from root-owned read lookups, which run only after a late `Unsure` (in LEFT). In LEFT the new
   handler also releases a held `pay` that the read answered; before, that hold stayed in DONE.
4. 9.2: add `CardSaved: { target: "self" }, CardRefused: { target: "self" }` at the root (explicit ignores; the next
   `SaveCard` or `PaySaved` reads the saved cards again), or handle them.
5. 5.2: one sentence saying the root `CodeAccepted` ignore is deliberate for an adopted verify (the user signs in
   again).
6. Add a policy-suite walk and an app Story: "an adopted Attempt succeeds in the new incarnation's initial leaf".

**H2 (K30). Under `cancel` and `allow`, Runtime disposal turns a persisted identity's sent work into evidence.**
924: "a waiting re-send and anything on the wire end as **evidence**, the lane `Idle`, since nothing is held past a
turn here (G2)". This contradicts the following:

- OD21: an ending "for a persisted identity with no live actor is saved as a pending mapped outcome".
- Principle 2 (748): "a sent Attempt's ending is always delivered ... to that identity's saved record".
- Persistence O3: "a commit that settles before the final capture is saved as a pending mapped outcome".

The lane is `Idle`, so it is not captured (806). On reload nothing is delivered and the restore cell (923,
"acknowledged: `unknown { Restored }`") never runs.

**Walk.** A persisted uploader uses `concurrency: "cancel"` (8.1's shape). An upload is on the wire, and the user
switches account, so the Runtime disposes.

- If the upload settles within Runtime O6's bound, its success is evidence. After the user returns, the restored
  record is still UPLOADING and waits for an ending that never comes. This is R9 H1's shape.
- If the upload is still on the wire at the final capture, nothing is captured. The restored record waits, and
  because the lane is gone, a handler could not `retry` the same id anyway.

The holding table's cell (863) gets both cases right.

**Fix (K30). No public API change.** Replace the `InFlight` cell of the `cancel` table's Runtime disposal row with:

> From its start nothing is invoked. A waiting, never-sent Attempt ends `NotSent { Disposed }`. An Attempt on the
> wire follows Runtime O6 (it settles within the bound, or not). For a persisted identity, `NotSent { Disposed }` and
> an ending that settles before the final capture are saved as pending mapped outcomes (OD21, Persistence O3); a
> waiting re-send, or an Attempt still on the wire at the final capture, is captured as an acknowledged `InFlight`
> lane record, so a reload uses this table's restore cell (`unknown { Restored }` → `HeldThisTurn`, where a key-less
> `retry` can re-send the same id). Otherwise they are evidence. The live lane ends `Idle`: nothing is held past a
> turn (G2).

`allow` follows the same rule per Attempt (927 already sends `allow` to the `cancel` table's rows). Extend the model's
planned invariant ("every ending of a persisted identity reaches an incarnation of it or a fresh start") to `cancel`
and `allow` with Runtime disposal. As written in revision 11, it fails there.

## Medium

**M1 (K29). The new-incarnation arrival set is wider than 5.1's walk says, and the terminal pass is ambiguous.**
Rule 2 (1043–1046) defines the rebind arrivals as "the initial leaf and every leaf reachable from it without passing
a transition guarded by `X.idle`". In 5.1, CARD reaches UNSURE through `Unsure: S.UNSURE`, then PAYING through
`checkAgain` (guarded by `retryable`, not `idle`), then WAITING through `Busy`. So 3267's "WAITING and PAYING are not
reachable from CARD past `O.pay.idle`" is false.

In WAITING, the root `Unsure` keeps the hold and no owner is reachable without passing `idle`. Whether WAITING
passes then depends on an unstated question: does the `idle`-guarded `RetryNow` commit count as "a transition
holding `X.commit` is reachable" for `reject`'s terminal pass? If it counts, the result is a warning. If it does not,
it passes, for a reason the text does not give.

The path is not real. After U's own handler has run, the hold has been delivered once. Any further unknown comes from
a re-send this incarnation owns, and rule 14's owner arrivals already cover that.

**Fix (definition).**

- Stop the new-incarnation search at transitions that handle U and at transitions holding `X.retry` or `X.cancel`,
  as well as at `X.idle`. This is sound: after any of them, ownership or resolution belongs to the current
  incarnation.
- State that an `X.idle`-guarded commit does not count for the terminal pass.
- Correct 3267. With the narrowed set, the arrivals for `pay` are CARD, READING, STUCK, DONE and LEFT, and 5.1 passes.
- Use the same set for H1's rule 20.

**M2 (K31). An adopted Attempt routes differently depending on when it lands.** The rule 14 row (1020) and 877–881
give two tests:

- an ending of an Attempt "whose owner activation belongs to an earlier incarnation" is current from the active
  leaf;
- "a restored record's saved outcomes keep rule 14 against its restored activations".

An ensure after retain expiry is a new incarnation (Runtime O3), but its activations are restored. Take an `InFlight`
Attempt owned by restored PAYING when the incarnation has since left PAYING:

- if the ending lands before the ensure, it is parked and routed late, from PAYING's nearest surviving ancestor, with
  rule 15 applying;
- if it lands after the ensure, it is current from the active leaf.

The same fact gets two routes, and different handlers run. The converse also happens. An Attempt adopted from an
even earlier incarnation, then parked in this record, has no owner among the restored activations, so rule 14 routes
it late from the root. Had it landed while bound, it would have been current.

**Fix.** Use one test, by owner:

> At admission, test the owner against this incarnation's activations, restored ones included. If it is alive, the
> ending is current (rule 14). If it was an activation of this incarnation that has ended, the ending is late
> (rule 14). If it was never an activation of this incarnation (a rebind, or a lane adopted before the saved record),
> the ending is current from the active leaf.

Parked or not, this gives one route. Put it in the rule 14 and C17 rows.

**M3 (K31). Parked endings live in the actor record, so a release can lose them while their lane survives.**
Lane records decode on their own, by the contract's `input` pick ("When an actor record no longer decodes but its
lane records do ... the fresh incarnation adopts them in its initial leaf", 797–799). Parked endings are "pending
mapped outcomes" of the actor record (Persistence O2), already mapped to the old definition's events. This has three
consequences.

- **The record no longer decodes after a release.** The lane is gone (its success made it `Idle`) and the ending is
  gone with the record. The fresh incarnation starts in CARD, and that is H1's step 4 again. The model's planned
  invariant ("reaches an incarnation of it or a fresh start") fails here.
- **The record decodes, but the mapping changed.** For example, `pay`'s success is now mapped to `Paid` while `Intent`
  remains the read's event. The parked `Intent` from the old mapper is delivered into a machine that no longer
  expects it from PAYING. It is `Unhandled`, counts as delivered, and the fact is lost. Rule 20 on the new machine
  cannot see this, because the event no longer comes from that operation.
- **Persistence O5** says "Flow never partially restores an invalid scope". Adopting lane records beside a failed
  actor record is a partial restore, and O5 has no amendment row for it.

**Fix (behaviour; no API).** Park a lane's ending **on its lane record**: the contract's raw outcome (decoded by the
contract's `output` and error schemas, plus Flow's reasons), with the Attempt and the lane state after it. Map it
through the **current** definition's `outcomes` at delivery. A lane record with only a parked ending left counts as
non-`Idle` until delivered. Delivery order stays "saved order" (record outcomes first, then lanes in creation order),
and the same parked ending can serve a restored record or a fresh incarnation, so the planned invariant holds.

Add a Persistence O5 row: "lane records decode and restore independently of the actor record; a fresh incarnation
adopts them and their parked endings in its initial leaf." If the owner prefers whole-scope discard, delete 797–799
instead, and state that an incompatible release loses held writes too.

**M4 (K32). Runtime disposal reverses a lane's order.** 863: "from its start nothing is invoked ... Each `W` entry:
as 'waiting, never sent'", so `W` ends `NotSent { Disposed }` at the start of disposal. The head on the wire settles
later, within the bound. Saved order is therefore `W`'s `NotSent` first and the head's success second. Live, and on a
crash reload (step 2: head, then `W`), the head always comes first. The 8.2 walk (3259) states "`Saved` (for "AB"),
then `SaveFailed` (for "ABC")", which is the reverse of what the cell produces.

8.2 survives the true order, because `Saved` does not clear `dirty`. A success handler that clears an "unsaved" flag
would end "Saved" with "ABC" unsent, which is R9 H2's symptom.

**Fix.** `W` entries end `NotSent { Disposed }` when the head's ending is admitted, or when Runtime O6's bound ends,
so a lane's parked outcomes keep lane order. Correct the walk's wording.

**M5 (K31). Where a same-Runtime ensure restores from is unstated.** K25 parks an ending in "that record". After
retain expiry, the record exists in storage and, presumably, in the Runtime. If the capture that adds the parked
ending fails (Persistence O5: "the last good saved capture" stays), and ensure restores from storage, the restored
PAYING lacks the `Intent` while the lane is already `Idle`. That is R9 H1 again, behind a storage failure. A reload
in the same state is safe (the last good capture has the lane `InFlight` and acknowledged, so `unknown { Restored }`).

**Fix (statement).** "Within a Runtime, a disposed persisted actor's record, with its parked endings, is kept in the
Runtime's scope as lane records are; ensure restores from it, not from storage. Storage failure affects only reload,
where the last good capture is consistent." With M3's fix the parked ending is on the lane record, which the Runtime
already holds, and this is automatic.

**M6 (K33). Rows still missing or stale.** An implementer would follow each of these:

- **MD rule 20:** H1's row.
- **OPS O3, O7 (1010):** "endings with no binding actor are evidence" becomes "a pending mapped outcome of the
  identity's saved record if one exists, else evidence (OD21)".
- **Persistence O5:** M3's row.
- **Testing O7:** "closeTab ends it abruptly, with no final flush". The Story R9 H2 asks for ("a clean Runtime
  shutdown with queued work", 988) cannot be written as an app Story. Move it to the policy suite (Flow's tests).
  The alternative, a clean `closeTab`, is public Testing API and an owner question.
- **React O2, O3:** the pre-attach send buffer is external. Add "it flushes after a new incarnation's deliveries
  (3.8.1, steps 1–2)", so "before any external event" holds when a component sends on mount.

## Low

- **L1. The rebind row (861) needs G3's clause.** An ensure after retain expiry is a rebind with a record, and a
  `Held` lane whose unknown was parked meanwhile would be delivered twice. Add "unless that Attempt's outcome is among
  the record's pending outcomes".
- **L2. The delivery list (883–886) omits the head's own `NotSent { Restored }`** for a never-acknowledged head on
  reload. Step 2 should read: "the head's `unknown { Restored }` if `Held`, or its `NotSent { Restored }` if never
  acknowledged, then each `W` entry's `NotSent { Restored }` (reload only)".
- **L3. Stale "first turn".** 3.10 (1168), "in the restored incarnation's first turn", becomes "from its saved leaf,
  in delivery order (3.8.1)". The `cancel` table's restore cell (923) "in the first turn" becomes "in its delivery
  turn".
- **L4. Local lane identity is not unique while two equal locals are live.** 775 says a lane's identity is (actor
  identity, contract id, key), yet 781–783 says two live equal locals have two lanes for one key. Say: "for local
  actors this identity is the adoption key; while bound, a lane belongs to its binding actor".
- **L5. A second device.** Persistence is per store, and O7's Web Lock is per browser. A `KeyValueStore` shared across
  devices (O1 allows another store) would let two devices restore, retry and deliver one identity's lanes and parked
  endings. Re-sends would be deduplicated by `attempt.id`; deliveries and UI effects would not. State it: "lane
  records assume one writer per scope (Persistence O7); a store shared across devices is outside this design."
- **L6. C1′ (278)** still says "change only in its turns" beside its revision 10 parenthesis. Write "change only in
  the binding actor's turns or the Runtime's steps".

## The lifecycle, in one pass

| Scenario | Under revision 11 | After K29–K33 |
| --- | --- | --- |
| Several incarnations of one shared identity | one live at a time; the next adopts the lanes; a hold is delivered once; adopted endings are current from the active leaf; their success and failure are unchecked (H1) | checked by rule 20 over the narrowed arrival set |
| Retain expiry, then ensure | endings parked in the record (closes R9 H1); route depends on when they land (M2); restore source unstated (M5) | one owner test; the Runtime's record is the source |
| Parked outcome after a release that changed the machine | lost if the record fails to decode, or misrouted if the mapping changed (M3); O5 contradiction | parked on the lane record, raw, mapped at delivery |
| Two parked outcomes for one record | saved order; lane order kept, except at Runtime disposal (M4) | lane order always |
| A parked outcome and a user event in the first turns | outcomes before external events (Persistence O4); React's pre-attach buffer unstated (M6) | stated |
| Local actors | identity by input; oldest orphan first; never persisted (G4); adopted endings in any leaf (H1) | the same, checked |
| A record on a second device | not addressed (L5) | stated limit |
| Runtime disposal | correct under the holding policies, with `W` order reversed (M4); evidence under `cancel`/`allow` (H2) | parked or captured, in lane order |
| Two tabs, SSR, the idempotency window | stated limits | unchanged |
| Stories | app Stories reach dispose, rebind, retain expiry (TestClock) and crash reload; a clean shutdown cannot be written (M6) | the H2 Story moves to the policy suite, plus H1's Story |

## Concept count (0.2 claims 7 words, 0 modes, 15 rules)

- **Words: 7, agreed.** No fix here adds one. `answered` and the root ignores in H1 are user code.
- **Modes: 0, agreed, with one borderline.** A shared identity adopts by ref and a local one by input equality, with
  an oldest-orphan rule only for locals. That is two adoption rules for one concept, as Runtime O3's two actor kinds
  already are, so I count it as structure, not a mode.
- **Rules: 15, agreed, if S7c carries H1's sentence.** S7c becomes: "a new incarnation receives its lanes' endings,
  all of them, in whatever leaf it is in, and a hold once; handle them at the root, and make the root's ignores mean
  it." Rule 20 checks it. Honestly, an author also holds five **stated limits** that are not rules: a released
  Attempt landing late, two tabs, the hydrated actor that waits, the idempotency window, and the input-free local
  machine.
- **The table: 16 rows × 3 states, 48 cells, 15 cannot occur, 33 reachable.** H2 changes one cell of the
  `HeldThisTurn` table, not the holding table, so the count stands.

**State: 2 High findings (H1, H2). Not zero.** Both are definitions:

- **K29 (H1):** rule 20 covers every event a write maps over the new-incarnation arrival set; 5.1's root `Intent`
  drops `S.LEFT` and gains `answered`; 9.2 gains two root ignores. No public API.
- **K30 (H2):** under `cancel`/`allow`, Runtime disposal parks or captures a persisted identity's sent work, as the
  holding table does; only the live lane goes `Idle`. No public API.

After them, the remaining work is polish:

- M1: narrow the arrival set, which also corrects 5.1's walk.
- M2: one owner test.
- M3: park endings on the lane record. This is behaviour, and the most consequential of the Mediums.
- M4: lane order at disposal.
- M5: one sentence.
- M6: the rows above.
- L1–L6.

None changes a decision or public syntax. The owner question that remains is M6's clean `closeTab`, and only if the
H2 Story is wanted as an app Story rather than a policy-suite test. Before acceptance, the model should run the two
invariants 3.8.1 promises, extended to `cancel`/`allow` (H2), and to a record that fails to decode (M3).
