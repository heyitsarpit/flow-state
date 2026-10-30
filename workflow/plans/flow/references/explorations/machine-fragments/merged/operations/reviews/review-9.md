# Review 9 of operations-in-definition, revision 10 (2026-10-30)

One reviewer: correctness, simplicity and authoring. These are suggestions, not decisions. OD1–OD20 are taken as
fixed; this review judges only whether they are applied correctly and what they cause. It re-walks review 8's
findings and the lane model's F2–F9 against revision 10, reads the proposal end to end for contradictions, then hunts
across the lifecycle: several incarnations of one identity, reuse after a long gap, two tabs, Runtime disposal
mid-invocation, SSR, and Stories over the 33 reachable cells. Plans read against the proposal: `Runtime.plan` O3, O6,
O7, C2, V4; `Persistence.plan` O2–O7; `ServerRendering.plan` O3, O5; `React.plan` O2, O3; MD rules 14, 15 and C17.
Sketch 10 (`ops-review-7/10-shared-checklist.ts`) was re-walked. The lane model's in-progress revision 10 run
(`lane-model/output.txt`, "reading: revision 10 as written") was read as evidence: invariants 1–9 pass in every
mode, all 33 reachable cells are visited under the three holding policies, and the identity model's inv 11 and 12
pass. The model checks lanes, not the actor states that wait for them, which is where the Highs below are.

**Verdict: not ready for acceptance. There are 3 High findings, not zero.** Review 8 is closed inside the lane:
the table is exact, F2–F9 are resolved, and lanes go only to their own identity. The three Highs sit one level up,
where a lane's ending meets an actor's **saved state** or an actor's **current leaf**:

- **H1.** An ending that lands while a persisted identity has no live incarnation is evidence, but that identity's
  saved actor record survives (retain expiry) and is restored into the state that waited for it. 5.1 restores into
  PAYING and stays "Paying" forever although paid; 8.2 restores showing "Saved" after "ABC" was refused.
- **H2.** Runtime disposal ends a persisted identity's never-sent work `NotSent { Disposed }` as evidence. After a
  clean shutdown and reload, 8.2 shows "Saved" for an edit that was never sent, and the next `Loaded` reverts the
  draft. A crash, by contrast, delivers `NotSent { Restored }` and re-arms the autosave.
- **H3.** Where an adopted lane's endings arrive is not defined against MD rule 14. As rule 14 reads, they are late
  and route from the root, so 5.1's and 9.2's CARD fixes never run and R8 H3's deadlock returns. As the proposal
  intends (from the active leaf), an adopted `InFlight` Attempt's unknown can arrive in any leaf, and 9.2 deadlocks
  in PAYING while `UnresolvedHold` passes.

Each fix is a definition. None needs a new author word.

## Causes and fixes

| # | Cause | Findings | Fix at the cause |
| --- | --- | --- | --- |
| K25 | **"No binding actor, so evidence" ignores the saved actor record.** Revision 10 made lanes Runtime records, but which endings an identity's record must still see was decided by "is an actor bound now", not by "will a record of this identity be restored". | H1, H2 | An ending or `NotSent` of a lane whose identity has a saved actor record, admitted while no incarnation is bound, is saved as a **pending mapped outcome** of that record (Persistence O2) and delivered once to the restored incarnation (Persistence O4, MD C17). It is evidence only when no record survives (`disposeActor`, `forget`, not persisted). This already is Persistence O3's rule for endings that settle before the final capture; it becomes the one rule. |
| K26 | **Arrival in a new incarnation was assumed, not defined.** Rule 14 routes by the owner activation, which a new incarnation does not have; `UnresolvedHold` and S7c name only the initial leaf, but an adopted `InFlight` Attempt can end in any leaf, and a restored record starts in its saved leaf. | H3, M5 (part) | Define the route: `unknown { Restored }` and any ending of an Attempt whose owner activation belongs to an earlier incarnation are **current** events, from the active leaf. Rule 2's arrivals are every leaf a new incarnation can be in while the lane is unresolved. S7c says "the root" is where one handler covers them all. |
| K27 | **Local identity was attributed to Runtime O3, which has none.** O3 says `createActor` "always creates a new local actor"; React O2 "one fresh local actor per component incarnation". Revision 10's "(machine id, input by `Equal.equals`)" is new and load-bearing (sketch 10's drawer), but unamended and self-colliding. | M1 | Define local identity here, amend Runtime O3 and React O2/O3, state its limit, and give a rule for two orphans with one lane identity. |
| K28 | **The OD20 sweep is nearly complete.** A few plan clauses and earlier sentences still describe revision 9 or before. | M2, M3, L1 | Complete the list and the sweep (exact rows below). |

## Review 8 against revision 10

| R8 | Status | Walk |
| --- | --- | --- |
| H1 wrong adopter | **closed for shared actors**; local actors: M1 | 8.2 two documents: d2's editor is another ref and adopts nothing; d1's next incarnation adopts "ABC" and re-sends it with its own id; no second d1 lane exists (3.8.1 identity paragraph, 5.7). 5.1 cart B, sketch 8 folder B: adopt nothing. |
| H2 no persistence owner | **closed for the lane; open for the actor record** (H1) | 5.7's retain-expiry walk: "ABC" is promoted and acknowledged by its lane record, invoked with no actor; reopen binds the one lane. But the restored *actor record* is from before "AB" succeeded and never sees `Saved` (H1). `disposeActor` keeps the orphans; `forget` removes both. |
| H3 restored hold in the initial leaf | **closed only if the route is current** (H3) | 5.1 rebind: CARD's `Unsure: S.UNSURE` → UNSURE → `CheckTick` → `retry`. 9.2: CARD's `SaveUnsure` releases. 9.6: root `StartUnsure`/`SubmitUnsure` with `draftId` from the event. All three work only if `unknown { Restored }` routes from the active leaf; rule 14 sends it from the root (H3). |
| K21 | **applied** | identity, Runtime records, per-lane acknowledgement, `disposeActor`/`forget`, decode independence. Local identity: M1. |
| K22 | **applied** | the "unhandled" branch (rule 2), `unknown { StorageRefused }` re-delivery, `retryCount` at the invoked cell, S7c's three obligations, the rebind-into-no-handler Story. Arrival set: H3. |
| K23 | **applied, with a regression** | Runtime disposal row exists; R8 M2's "a never-sent Attempt or `W` entry of a persisted identity is captured as never sent" was dropped (H2). SSR: lanes never hydrate (OD20); the consequence for the hydrated actor is not stated (M4). |
| K24 | **mostly applied** | S3, 3.7, R12, C1′, D9 reworded; the amendment rows for Runtime O3/O6, Persistence O2/O3/O6, ServerRendering O3/O5, MD 2.5 step 2 added. Missing rows: M2. Stale sentences: L1. |
| M1 refused re-send | **closed, with a contradiction** (M3) | 5.2: capture fails → `CodeUnchecked` delivered again with `StorageRefused` → next alternative. But a re-send "waits for no new acknowledgement", so what it waits for before invocation is not stated. |
| M2 disposal | **closed except persisted never-sent work** (H2) | |
| M3 SSR | **closed as decided** (OD20); M4 states the remaining consequence | |
| M4 orphan forever | **closed** (stated, Inspection lists, Q40) | |
| M5 sweep | **closed except M2's rows** | |
| L1 | **applied** (virtual idle lane; 4 no-op cells) | L9 below: one of the four reports evidence. |
| L2, L3, L4, L5, L6 | **applied** | L6's "by identity" needs a spelling for a local Story actor (L6 below). |
| L7 | **applied in part** | "in its first turn" is still singular for several deliveries (L3 below). |
| L8 | **applied in part** | the sentence is restored but its list still reads two ways (L2 below). |

## The lane model's findings against revision 10

| F | Status | Text |
| --- | --- | --- |
| F1 | **stated** (OD20) | 3.8.1 "late-landing race": the released Attempt landing after a newer one is the stated limit, remedy a version precondition. Model: `inv3-limit-*` are the only failures. |
| F2 | **closed** | per-Attempt acknowledgement (761, 779); restore uses "acknowledged once ... even if its current re-send was waiting" (813). Model inv 1–3 pass. What a re-send waits for: M3. |
| F3 | **closed in the table; routing open** (H3) | restore of `Held` delivers once (813, 1095); rule 4 agrees. 5.7's F3 walk says the restored 8.2 receives it "in LOADING, its initial leaf", which contradicts Persistence O4 ("restore never runs initial again"): a restored record resumes in its saved leaf. |
| F4 | **closed** | 800: the new commit becomes the addressable Attempt. |
| F5 | **closed** | 806, 868: `unknown { StorageRefused }` → `Held` / `HeldThisTurn`. Reachability: M3. |
| F6 | **closed** | 860: never sent → `Superseded`; a waiting re-send → evidence (released), mint. |
| F7 | **closed, wording** (L2) | rule 2's head noun is back. |
| F8 | **closed** | 821–822. |
| F9 | **closed** | 874–879. Model: `cancel` and `allow` visit 29 of the holding table's 33 cells, by design (no `Held` between turns). |

## Is the table a complete, deterministic state machine?

**For the lane: yes.** 16 rows × 3 states = 48 cells, 15 cannot occur, 33 reachable, as counted; the model visits all
33 under `reject`, `latest` and `serialize`, and every reachable state reaches `Idle`. Each cell names one address
and one next state. The `cancel`/`allow` table is complete (F6, F9).

**For what the lane tells the actor: not yet.** Three things a cell says is "delivered" have no defined receiver:

- an ending while no incarnation is bound, when the identity's record will be restored (H1);
- never-sent work at Runtime disposal of a persisted identity (H2);
- any ending in a new incarnation, which has no owner activation for rule 14 (H3).

## High

**H1 (K25). A restored actor record waits for an ending that already landed as evidence.** Runtime O3: "Retain
expiry of a persisted actor disposes the live actor but keeps its saved record, so a later ensure restores it."
Revision 10 (3.8.1, "Never re-delivered"): "an ending that landed while the lane had no binding actor is evidence".
The record is restored into the state it was saved in (Persistence O4: "Restore never runs initial again"), with the
memory it had.

1. **5.1, persisted with retain.** The user leaves mid-PAYING by in-app navigation; retain passes; the actor is
   disposed in PAYING, record kept. `pay` succeeds in the Runtime: evidence, lane `Idle`, removed. The user returns:
   `ensureActor` restores PAYING. No `Intent` comes. `giveUp` fires → `TookTooLong` → `O.pay.cancel` in `Idle` does
   nothing → PAYING forever, "slow". The customer was charged; the page says "Paying". (After a reload the same: the
   lane record is gone, the actor record is PAYING.)
2. **8.2, the reference editor.** "ABC" is promoted after disposal and is refused (`Refused`): evidence. The user
   reopens d1: the restored record has `dirty: false` (cleared when "ABC" was committed) and no `error`, so the status
   line reads "Saved"; the next `Loaded` (`!dirty`, newer version) replaces the draft with the server's "AB". The
   edit is lost with no message.

Revision 9 had no restored record beside an orphan, so this is new with OD20's "records survive". Persistence O2
already has the vehicle ("Pending mapped outcomes survive for once-only delivery"), and Persistence O3 already uses
it at Runtime disposal.

**Fix (K25).** In 3.8.1, replace "With no binding actor, an ending is evidence." and the first sentence of "Never
re-delivered" with:

> With no binding actor, an ending is applied to the lane by the Runtime. If the lane's identity has a saved actor
> record (a persisted actor disposed by retain expiry, or awaiting reload), the ending is also saved as a pending
> mapped outcome of that record and is delivered once to the restored incarnation, in saved order (Persistence O2,
> O4), routed by rule 14 against the record's restored activations. Otherwise (no record: `disposeActor`, `forget`,
> a non-persisted or local identity) it is evidence. A `Held` lane whose unknown is already among those pending
> outcomes is not delivered again as `unknown { Restored }`, so the hold is still delivered exactly once.

Change the `dispose` row's "its ending is applied and is evidence until a rebind" to "its ending is applied; it is a
pending outcome of the identity's saved record if one exists, else evidence". Add an amendment row: **Persistence O2,
O3** "pending mapped outcomes: also endings of a persisted identity's lanes admitted while no incarnation is bound".
Add a Story: "retain expiry, the orphan's write succeeds, ensure: the restored state receives the ending". The model
can check it as a new invariant: every ending of a persisted identity reaches an incarnation of it or a fresh-start.

**H2 (K25). Runtime disposal loses a persisted identity's never-sent work without telling the restored actor.** The
Runtime disposal row: "Waiting, never sent: ends `NotSent { Disposed }`, delivered as evidence ... Each `W` entry
ends `NotSent { Disposed }`, evidence". R8 M2's fix said a persisted identity's never-sent work is "captured as never
sent (on reload, `NotSent { Restored }`)"; OD20 decided `NotSent { Disposed }` and said nothing about evidence. The same
cell saves an ending that settles before the final capture as a pending mapped outcome. Runtime disposal with stored
records kept is ordinary: `FlowProvider` disposes the old Runtime when the scope changes (dispatch-desk
`next/providers.tsx`), and plain dispose keeps saved data (Runtime O6).

Walk 8.2: "AB" on the wire, "ABC" in `W`. The user switches account; the Runtime disposes; "ABC" ends
`NotSent { Disposed }` as evidence; "AB" settles and is saved as a pending outcome. The user switches back; restore:
EDITING, draft "ABC", `dirty: false`, `Saved` (for "AB") delivered. Status "Saved"; the next `Loaded` (v of "AB",
newer than memory's) reverts the draft to "AB". After a crash instead, "ABC" restores `NotSent { Restored }` →
`SaveFailed` → `dirty: true`, autosave re-armed (8.2's revision 6 walk). A clean shutdown loses what a crash keeps.

**Fix (K25).** In the Runtime disposal row, `InFlight` and `Held` cells, replace "delivered as evidence" and "evidence"
for never-sent work with:

> ends `NotSent { Disposed }`; for a persisted identity it is saved with the final capture as a pending mapped
> outcome and delivered to the restored incarnation, like an ending that settles before the final capture;
> otherwise it is evidence. Predictions are removed (rule 30).

If the final capture fails, the last good capture's lane record restores per the restore row (`NotSent { Restored }`
or, if acknowledged, `unknown { Restored }`), which is also safe. Amend the Runtime O6 row's "queued commits end
`NotSent { Disposed }`" with "delivered after reload for a persisted identity".

**H3 (K26). An adopted lane's endings have no defined route, and either reading breaks a case.** MD rule 14: "If that
activation is alive, the event is current ... Otherwise it is late and ... routes from the nearest strict ancestor of
the owner whose activation is the one alive when the call started (the root at worst)." A new incarnation has no
activation of the old one. Revision 10 says only "in the new incarnation's first turn" and, for `InFlight`, "receives
the ending when it lands". MD rule 14 is not in the amendment list.

- **Reading A, rule 14 as written (late, from the root).** 5.1 rebind: the root `Unsure` runs (`self` + lookup) and
  CARD's `Unsure: S.UNSURE` never does; `Pay` is denied `Uncertain` for good. This is R8 H3 unchanged. 9.2's CARD
  `SaveUnsure` never runs either.
- **Reading B, the proposal's intent (current, from the active leaf).** 9.2: the checkout is disposed in SAVING with
  `save` on the wire. The new incarnation starts in CARD; the user picks `PaySaved` → PAYING. The adopted `save` ends
  unknown and `SaveUnsure` arrives in PAYING: no handler there or at the root → Unhandled → `save` is `Held` with no
  later U. `SaveCard` is denied `Uncertain` for the Runtime's life. Rule 2's arrivals (owner leaf SAVING, its
  ancestors, the initial leaf CARD) do not include PAYING, so the check passes. The same holds for a restored record:
  it resumes in its saved leaf (Persistence O4), so 5.7's F3 walk ("in LOADING, its initial leaf") is wrong; 8.2 is
  saved by its root handler, not by the reason given.

**Fix (K26).**

1. Add an amendment row, **MD rule 14**: "An ending of an Attempt whose owner activation belongs to an earlier
   incarnation, and every `unknown { Restored }`, is current: it routes from the active leaf. A restored record's
   pending outcomes keep rule 14 against its restored activations (MD C17)." Say the same in "What rebinding
   delivers".
2. Rule 2's arrivals: replace "the definition's initial leaf, where a new incarnation receives `unknown { Restored }`
   by rebind or restore" with "every leaf a new incarnation can be in while X's lane is unresolved: the initial leaf
   and every leaf reachable from it without passing a transition guarded by `X.idle` (rebind), and every leaf
   reachable without passing `X.idle` from a transition holding `X.commit` or from an arrival branch's target (a
   restored record resumes in its saved leaf)". The "unhandled" branch applies at each.
3. S7c: "a holding write's U must be handled, with a path to an owner, in every leaf where a new incarnation can
   receive it; a root handler covers them all, and its event must carry what the owner needs (the mapper's `key`).
   The same holds for the adopted Attempt's success and failure: the handler cannot rely on memory set after the
   commit."
4. Cases: 9.2 moves CARD's `SaveUnsure` to the root (SAVING keeps its own). 5.1 passes as written under the new
   arrivals: the root `Unsure` keeps the hold in place, CARD and READING reach an owner, DONE and LEFT pass by
   `reject`'s terminal pass, and WAITING and PAYING are not reachable from CARD past `O.pay.idle`. 5.7's F3 walk:
   "in its saved leaf (EDITING), where the root `SaveUnsure` owns it".
5. Policy-suite walk: "an adopted Attempt ends unknown in a leaf other than the initial one".

## Medium

**M1 (K27). Local actor identity is new, not Runtime O3's, and collides with itself.** 3.8.1: "the actor identity is
Runtime O3's: ... (machine id, input by `Equal.equals`) for a local one". O3 has no local identity; it says
`createActor` "always creates a new local actor", React O2 "one fresh local actor per component incarnation", React
O3 "reveal creates a fresh one". The rule is load-bearing: sketch 10's drawer is `useLocalActor(DrawerMachine,
{ input: { id } })`, and its walk B closes only because a reopened drawer of item 7 adopts the old one's lane.

- **Collision.** 3.8.1 and 3.6: "two live local actors with equal input have two lanes for one key". Both have the
  same (actor identity, contract id, key). If both are disposed holding, a starting incarnation finds two orphans for
  one key, and its members can address only one.
- **Coarse input.** An input-free local machine (9.6's wizard has no input) makes every local actor of it one
  identity, so a fresh one adopts the previous one's hold. That is consistent (`key: []` says "one thing per
  identity"), but it is R8 H1's walk for locals and is not stated.

**Fix.** Replace "is Runtime O3's: ... for a local one" with "is Runtime O3's ref (machine id, actor id) for a shared
actor; for a local actor it is defined here as (machine id, input by `Equal.equals`), so a remounted or revealed local
actor with the same input adopts its predecessor's lanes". Add: "Two orphans with one lane identity (two equal local
actors both disposed holding) are adopted oldest first, one per (contract id, key); the rest stay orphans, listed by
Inspection. Stated limit: a local actor's input must carry what identifies its writes; an input-free local machine is
one identity." Amendment rows: **Runtime O3** ("`createActor` always creates a new local actor": its write lanes
follow the local identity above), **React O2, O3** ("fresh local actor", "reveal creates a fresh one": fresh memory
and state; write lanes are adopted by identity).

**M2 (K28). Plan clauses still contradicting the table.** An implementer would follow each:

- **Persistence O6:** "If acknowledgment fails, the adapter is not called; the occurrence settles through interrupt
  with StorageFailure evidence." Interrupt is the table's `unknown` → `Held`; the table says `NotSent
  { StorageRefused }` → promote. Extend the O6 row: "a failed acknowledgement ends `NotSent { StorageRefused }`, not
  an interrupt".
- **MD C17:** "Lanes persist with the actor ... saved endings ... routed by rule 14". Add a row: "lanes are Runtime
  records of the identity; saved endings route by rule 14 against restored activations; adopted endings are current
  (H3)".
- **MD rule 14:** H3's row.
- **Persistence O3:** "Explicitly disposed durable actors disappear from the next successful capture." The O3 row
  should add "their non-`Idle` lanes stay as orphan records".
- **Persistence O5:** "saved actor records for a machine id that no ... entry declares are discarded". Add "with that
  machine id's lane records, as evidence". Otherwise they can never be adopted and count toward the 4,096 records.
- **LazyFeatures O3:** a lane record decodes by its contract's `input` pick, and the contract lives in the lazy
  feature. Add "a lazy machine's lane records stay dormant, undecoded and uninvoked, until the feature is adopted".
- **Inspection:** "Inspection lists orphans" is a new obligation; add an Inspection row.

**M3. What a re-send waits for before invocation is stated two ways.** 761: "a re-send of an acknowledged Attempt
needs no new one"; 779: invoked when "the acknowledgement (once per Attempt) and its merge 4 record queues allow". 806:
a re-send is "refused only when the lane record's capture fails before invocation". If a re-send waits for no capture,
806's re-send case can occur only by a race and gates nothing; if it waits for one, 761 and 779 omit it. The model
implements the second reading (`capture-refused (re-send, delivers unknown)`), and OD20 decided the re-delivery.
**Fix:** in the `InFlight` row and the invocation paragraph, add "a re-send of a persisted lane waits for its lane
record's capture of the re-send (not a new acknowledgement: restore still reads 'acknowledged once')". Then 806 and
5.7's walk read as written.

**M4. A hydrated actor can wait for an ending that never comes.** ServerRendering O3 transfers "actor state and
memory" and said "the actor's unknown outcome owns reconciliation". Revision 10 (decided, OD20): lanes never hydrate,
the in-flight commit is evidence. A shared actor dehydrated in PAYING (5.1) hydrates in PAYING with no lane and no
ending: `TookTooLong`'s `cancel` meets `Idle`, and it stays PAYING. A client write may also land before the server's.
**Fix (statement):** in the SSR row: "the transferred actor receives no ending for it: a state that waits for one
waits until its own timers or the user move it; a later client write to that key is unordered with the server's
(stated limit, as two tabs). `DehydrateCommitInFlight` names the actor and its state". In the ServerRendering O3
row, add "'the actor's unknown outcome owns reconciliation' is removed".

**M5. Identity reuse after a long gap re-sends under an expired idempotency key.** Lane records persist with no age
bound, and `disposeActor` keeps orphans. An identity reopened weeks later adopts its hold and, in 8.2's root handler,
re-sends "ABC" with its original `attempt.id`. Servers keep idempotency keys for a window (Stripe: 24 hours), after
which the same key is a new request. The re-send then writes week-old text over what other devices saved, and for a
non-idempotent contract it can apply twice. 3.8.1 says the late-landing race "is gone for any contract that sends
`attempt.id`", with no window. **Fix (statement):** add to 3.8.1's limits: "A re-send is safe only within the
server's idempotency window. A hold adopted or restored later re-sends what is, to such a server, a new write;
contracts that can outlive their window send a version precondition (`basedOn` as `If-Match`), as for a released
Attempt, or the handler settles the unknown by a read (5.1) rather than a re-send." Optional owner question (public
API, not proposed): an age bound on adopted holds.

## Low

- **L1. Stale sentences.** Line 3's status ("five owner decisions applied"); section 0's correctness reason "(actor,
  operation, contract key)" (225); C1′'s decision column "change only in its turns" (256, beside its new
  parenthesis); S9 "persist by (contract id, key)" and "a rebind across a reload" (1193–1194: add the identity; a
  reload differs from a rebind for `W`); S7c "with queued commits kept" (true on rebind only; a reload ends them
  `NotSent { Restored }`); 3.5's `cancel` bullet "promoted this turn and not yet invoked" (by history, any turn, and
  the re-send case returns to `Held`); 10.3's heading "(revision 9)".
- **L2.** Rule 2: "a branch ... with no `X.retry`, no `X.cancel`, or only an `X.retry` behind ..." can be read as
  "no retry, or no cancel"; write "with neither `X.retry` nor `X.cancel`, or with only ...". "When that leaf, or the
  root above it, has no handler" → "when neither that leaf nor any ancestor handles U".
- **L3.** Several deliveries are several turns. "In its first turn" → "in its first turns, in this order: saved
  outcomes; then per lane in creation order, the head's `unknown { Restored }`, then its `W` entries'
  `NotSent { Restored }` (reload only)".
- **L4.** The `cancel` table's storage-refused and restore cells say "→ `Idle`" without "delivered"; add it, as the
  holding table has.
- **L5.** The SSR `Idle` cell is counted among "4 act on the virtual idle lane and do nothing", but it reports
  evidence. Say "change no lane".
- **L6.** `Story.ending` on an orphan "addresses the lane by identity": say how a Story names a local identity (its
  machine and input), since sketch 10's case is local.
- **L7.** 9.6's `Submit` guard uses `O.save.idle(thisDraft)` with a partial key, which is Q34 (open). 5.7's "passes"
  for 9.6 should say "with Q34 A".

## The lifecycle, in one pass

| Scenario | Under revision 10 | After K25–K28 |
| --- | --- | --- |
| Several incarnations of one shared identity | one live at a time; the next adopts its lanes; holds delivered once | the same; adopted endings route from the active leaf (H3) |
| Several local actors with equal input | one identity; collision undefined (M1) | oldest orphan first; the limit stated |
| Retain expiry, then ensure | the lane is the Runtime's one record (closes R8 H2); the record waits for endings that landed as evidence (H1) | those endings are the record's pending outcomes |
| Reuse after a long gap | adopted and re-sent under the original id | the same, with the idempotency-window limit stated (M5) |
| Two tabs (Q31) | holds as stated: Persistence O7 gives one tab persistence and the other none ("no tab sharing or handover"), so lane records never conflict; writes across tabs are unordered | unchanged |
| Runtime disposal mid-invocation | on the wire: Runtime O6's bound; waiting for its acknowledgement: `NotSent { Disposed }`; if that acknowledgement had been written and the final capture fails, restore reads it as `unknown { Restored }`, which is conservative (Persistence O6). Persisted never-sent work is lost to the restored actor (H2) | delivered after reload |
| SSR | lanes never hydrate (OD20); the hydrated state may wait (M4) | stated |
| Restore of a record | resumes in its saved leaf; the check and S7c assume the initial leaf (H3) | arrivals cover saved leaves |
| Stories over the 33 reachable cells | app Stories reach the cells their transitions allow; dispose and rebind by a second incarnation in the Story Runtime; Runtime disposal, SSR and the unacknowledged restore are policy-suite cells; the model visits all 33 under the holding policies | plus the H1 and H3 Stories; L6 for local identities |

## Concept count (0.2 claims 7 words, 0 modes, 15 rules)

- **Words: 7, agreed.** `retryable({ times })`, `get`, `.outcomes`, `subscribe.each`, `waiting`, `Story.ending`, the
  one-off row's `key`. `Restored`, `StorageRefused` (on `NotSent` and on the unknown), `Disposed`, `Released` are
  values; "binding actor", "orphan", "incarnation" are table labels. No fix above adds a word.
- **Modes: 0, agreed.** Rebind and reload differ in two cells (`W` kept or ended; an `InFlight` head left alone or
  turned unknown); they are rows, chosen by the host event, not author syntax. Shared and local identities differ
  (M1), as Runtime O3's actors already do.
- **Rules: 15, agreed, if S7c is H3's wording.** S7c holds: the hold outlives the actor; a new incarnation receives
  its lanes' endings in whatever leaf it is in, and a hold once; handle them at the root with what the event
  carries. M1's local-identity limit is part of S3 [1]. H1 and H2 remove an author rule rather than add one ("after a
  restart, a result may be missing").
- **The table: 16 rows × 3 states, 48 cells, 15 cannot occur, 33 reachable**, confirmed by the model. No fix adds a
  row or a cell.

**State: 3 High findings (H1, H2, H3). Not zero.** All three are definitions:

- **K25 (H1, H2):** an identity's saved record receives the endings it has not seen, as pending mapped outcomes;
  evidence only when no record survives.
- **K26 (H3):** adopted endings and `unknown { Restored }` are current, from the active leaf; `UnresolvedHold`'s
  arrivals are every leaf a new incarnation can be in; 9.2's handler moves to the root.

After them, the remaining work is polish: M1's local-identity text and amendments, M2's plan rows, M3's one clause,
M4 and M5's stated limits, and L1–L7. None changes the table, a decision, or public syntax. I expect the next
review to find no Highs, and the proposal to be ready for owner acceptance once the K25 and K26 rows are walked in
the lane model (an invariant that every ending of a persisted identity reaches a restored incarnation, and arrival in
a non-initial leaf).
