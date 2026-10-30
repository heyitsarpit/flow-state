# Review 5 of operations-in-definition, revision 6 (2026-10-30)

One reviewer: correctness, simplicity and authoring. These are suggestions, not decisions. OD1–OD8 are taken as
fixed; this review judges how revision 6 applies them and what they cause. Contract shapes (params/input naming,
schema fields, Q27, Q30) are out of scope. Review 4's sketches were re-run against revision 6, and one new app was
written: `ops-review-5/7-onboarding-wizard.ts` in the session scratchpad.

**Verdict: not ready for acceptance; another small revision is needed. There are 2 High findings, not zero.** OD6,
OD7 and OD8 are applied faithfully. Review 4's H1, H2 and H4 are closed. H3 is closed for retained unknowns. K4 to K6
are closed at their causes, and the cases now walk correctly. Two new Highs come from the fixes, and each needs one
sentence changed:

- **H1.** Revision 6 applies OD7's "then the waiting commit is sent" to an Attempt that is still in flight. A
  `cancel` that interrupts a request then sends the next write at once, while the interrupted one may still be on
  the wire. That brings back the late-landing race in its most likely form, in 8.2's own `CloseAnyway`.
- **H2.** The row's `uncertain` is not defined while a held unknown is being re-sent. 5.3's reconcile schedule keys
  on it. A keyed timer fires once per key appearance, so under the natural reading the like is never re-sent after
  the first reconcile, and the waiting unlike waits forever.

The Mediums are the `UnresolvedHold` spec and three per-lane limits that the text states as per-actor.

## Causes and fixes

| # | Cause | Findings | Fix at the cause |
| --- | --- | --- | --- |
| K9 | **"The addressable Attempt" is defined by lane state, while key-less members in an ending are defined by the ending.** Revision 5 could treat the two as the same because a held lane had one sent Attempt and nothing behind it. OD7's promotion breaks that. So does `serialize`'s hold, which gives a FIFO an addressable head that MD N2 says it cannot have. | H1, M4, M5, L5 | **An interrupted Attempt is an unknown like any other: retained, holding its lane.** Only a *retained* unknown is released by `cancel`, and only then is the waiting commit sent. This is OD7's wording ("after it is released"); revision 6 extended "released" to "interrupted". **Define key-less `retry`, `retryable` and `cancel` in an ending as that ending's own Attempt.** If that Attempt is no longer addressable, `retry` and `retryable` deny `NothingToResend` and `cancel` does nothing. Say whether `retry` and `retryCount` exist on a held `serialize` head; this amends N2. |
| K10 | **The write row's flags are defined in prose against lane states that change during a re-send.** `uncertain` ("holds an unknown") and `waiting` ("queued behind a held unknown") have no stated value while a re-send is in flight. `pending` quietly changed its MD meaning. Patterns built on the flags then depend on an unstated choice. | H2, L1 | Define the row by what exists in the lane, not by why. **`pending`**: a sent Attempt is in flight. **`uncertain`**: the addressable Attempt's last ending was unknown and it is not in flight. **`waiting`**: a never-sent commit exists. Each is true in exactly one lane state, with no flicker rule and no "because". Mark `pending` as NEW MEANING against MD rule 21, which counts a waiting start as pending. |
| K11 | **`UnresolvedHold` treats every guard as passable, including Flow's own token guards whose verdict during a hold is known.** It also treats a hold as a problem where no later commit can happen. | M1 | Over-approximate closures only. Treat a transition guarded by `X.idle(k)` as blocked while X holds. Count a `retry` behind `X.retryable` as an owner only if its fallback also reaches an owner. Pass a branch from whose target no commit of X is reachable. That stops warnings on terminal states such as 5.1's LEFT. |
| K12 | **The hold orders one lane, but the text and the version story treat it as ordering the actor.** | M2, M3, M7 | Say "per lane" in 3.8.1's limits. Rebase `basedOn` across the lane's own resolved writes only, not to "whatever is current at send" (M2). Record cross-operation dependency and aggregate `idle` as a stated limit (M3). Give the one-off read row the `key` of the entry it holds, as write rows have (M7). |

## Fix verification (review 4)

| R4 | Status in revision 6 | Note |
| --- | --- | --- |
| H1 sign-in | **closed** | `CodeUnchecked` cancels in VERIFYING and at the root; `ResendUnsure` cancels in TWO_FACTOR and at the root. Walked: the next `Submit` passes `idle`. See M6 for the price. |
| H2 kanban | **closed** | The toast branches of `MoveUnsure`, `LabelUnsure` and `RebalanceUnsure` cancel; `CardView` reads `uncertain`. |
| H3 cancel drops waiting | **closed for retained unknowns**; reopened in a worse form for in-flight ones (H1) | 5.3 and 8.4 walk correctly after a give-up. |
| H4 shared events | **closed** | OD8 by token; 5.1's `answered` works; 5.3 and 8.4 split their events. |
| M1 Loaded overwrites | **closed** | `idle` guards in 8.2 and 9.3; `get(operations, k)` exists for 9.3-style per-field memory updates. |
| M2 ending events not from endings | **closed** by S15 | See L3 for a simpler rule. |
| M3 domain default is a closure | open as Q30 | out of scope |
| M4 one-off row emptied by gc | **closed** | The row holds its entry. It still shows another actor's refetch outside this actor's turns. That is fine, but 3.7's "lanes change only in this actor's turns" should say "status" (L7). |
| M5 two tabs, `If-Match` | stated (Q31, Q32) | Q32's recommendation weakens `If-Match` (M2). |
| M6 throttle under serialize | stated as a cut | |
| M7 partial mapping | **closed** by `UnmappedUnknown` | It can merge into `UnresolvedHold` (rules audit). |
| L1–L6 | applied | L3 (an interrupted unknown looks like a retained one) disappears entirely with K9's fix. |

Review 4's sketches against revision 6:

| Sketch | Revision 6 |
| --- | --- |
| 1 checkout | `answered` works (OD8). The `UseOtherCard` release from STUCK is still unflagged. It is the stated residual ("a released write may land later"), and it stays the author's call. |
| 2 per-field autosave | Bug closed with `O.save.get(operations, { docId, field })` in `Loaded`'s `updateMemory`. The hand-built key records remain. |
| 3 kanban | Bug closed. |
| 4 search | Bug closed. |
| 5 chat | L4 closed. A toast-only `EditUnsure` is now an `UnresolvedHold` error. The echo friction remains: a `cancel` on the echo interrupts an in-flight retry, whose unknown re-runs `PostUnsure` and marks a delivered message "unsure". K9's fix turns that into a retained unknown that `retryable` re-sends with the same id, and the server answers "posted". |
| 6 upload queue | The silent drop is closed (the head only). Whether `O.put.retry` and `retryable` exist under `serialize` is undefined (M4). |

## Correctness

**H1 (K9). `cancel` of an in-flight write sends the waiting write while the interrupted one may still land after
it.** 3.5: "If it is in flight, it is interrupted, and its unknown ending is delivered once and not retained ...
Then the waiting commit is sent." 8.2, as written:

1. "AB" is in flight, and "ABC" waits (`latest`, one in flight and one waiting).
2. The user presses Close. `Close` is denied `InFlight` by `O.save.idle`, so the UI offers `CloseAnyway`, which runs
   `O.save.cancel(thisDoc)`.
3. The fetch for "AB" is aborted, but its body is already at the server. "ABC" is sent at once with a different
   `attempt.id`, so idempotency does not fence them.
4. The server applies "ABC", then the slower "AB". The document is "AB", and the user's last characters are gone.
   No ending says so.
5. "AB"'s `unknown(Cancelled)` routes late to the root `SaveUnsure`. Its first branch is a key-less
   `retryable({ times: 3 })`. 3.5 defines `retryable` as "the lane's addressable Attempt", which is now "ABC" in
   flight, so it passes. Then `O.save.retry` either re-sends an outstanding Attempt, which ends
   `NotSent { Rejected }` (MD rule 16) and shows "Not sent (Rejected)" with `dirty: true` in CLOSED, or, read as "the
   ending's Attempt", denies `NothingToResend`. In that case the second branch says "Newer edits wait for it" when
   nothing waits.

Revision 5's "empties its lane" could not do this, because nothing newer was sent. The residual risk that 3.8.1
states ("a released write may land later") was argued for retained unknowns, whose requests are long gone. An
interrupted request is the case where a late landing is likely. OD5's guarantee, "nothing newer is sent while an
older write is unknown", is broken by the proposal's own escape hatch. The same shape applies to every user-facing
"stop" on a `latest` or `serialize` lane.

**Fix (K9), within OD7.** An interrupted Attempt's `unknown(Cancelled)` is delivered and **retained** like any
unknown, so the lane keeps holding. A `cancel` of a retained unknown releases it (`Released`), and only then is the
waiting commit sent. Consequences:

- 8.2's `CloseAnyway` re-sends "AB" with its own id from the root handler, then sends "ABC". The order is correct.
- 5.1's `TookTooLong` leads to UNSURE, which retries the same id (L3's wasted step is gone).
- 8.1's `UploadUnsure` cancel then releases a retained unknown instead of a no-op.
- 3.5 loses the "delivered once and not retained" clause, and one rule goes.
- The ending's Attempt is again the addressable one in every handler. Also state the key-less definition directly
  (K9), so that it does not rest on that equivalence.

Under `cancel` and `allow` concurrency, which do not hold, nothing changes.

**H2 (K10). 5.3's reconcile can stop after one re-send, and the waiting unlike then never goes.** 5.3's `reconcile`
is keyed on `operations.like.filter((l) => l.uncertain)`. MD rule 23: a keyed timer is "armed when the key first
appears, cancelled when it leaves, firing once". `LikeUnsure`'s first branch has no action; it relies on the
schedule. Steps:

1. The like ends unknown. Key `{ id }` appears, and the timer is armed.
2. Three seconds later, `ReconcileLike` runs `O.like.retry(named)`, and the re-send is in flight.
3. The proposal does not say whether `uncertain` is true while a held unknown is being re-sent. Under the natural
   reading (the server state is still unknown, so the view should keep "unsure"), it stays true. The key never
   leaves, and the timer does not re-arm.
4. The re-send ends unknown. `retryCount` is 1, so `LikeUnsure`'s first branch passes and does nothing.
5. No timer fires again. The like holds forever, and the unlike the user made waits forever with its prediction
   shown. `UnresolvedHold` passes, because `ReconcileLike` is reachable by tokens.

This is review 4's H2 shape, in the case revision 6 cites as the model reconcile. The other reading (false while in
flight) works, but makes 8.2's status line flicker between "Not confirmed" and "Saving…". The proposal must choose.

**Fix (K10).** Define the three flags by lane state, one state each: `pending` (in flight), `uncertain` (last
ending unknown and not in flight), `waiting` (a never-sent commit exists). 5.3 then re-arms on every unknown. Add
5.3's three-re-send walk as a Story. `waiting` defined as "a never-sent commit exists" also stops depending on
`uncertain`, so it no longer flickers during a re-send.

**M1 (K11). `UnresolvedHold` has token-readable false negatives and a false positive in 5.1.** It is computable from
tokens: the leaves where U can arrive (owners by rule 14, ancestors for late endings), U's branches, state-token
reachability, and the tokens `X.retry` and `X.cancel`. But:

- **False negative: an owner behind `idle`.** `Unsure: { ...toCard("Couldn't confirm") }`. CARD's `Pay` is guarded
  by `O.pay.idle` and leads to PAYING, whose `TookTooLong` cancels. The check passes (PAYING is reachable). At run
  time `idle` denies `Uncertain` for as long as the hold lasts, so PAYING is never reached and the lane is stuck.
  That is review 4's H1 shape, and the check misses it.
- **False negative: a budgeted retry with no fallback.** `UNSURE: { on: { CheckNow: { guard:
  [O.pay.retryable({ times: 3 })], actions: [O.pay.retry] } } }`. The check passes, but after three re-sends
  `retryable` denies `RetryLimit` forever.
- **False positive: terminal leaves.** 5.1: Leave from PAYING goes to LEFT, `pay` ends late, and the root `Unsure`
  runs `{ target: "self" }` in LEFT. No transition from LEFT holds a `pay` member, but one exists in the definition,
  so this is a **warning**. 5.1's "UnresolvedHold passes" is therefore false as specified. The hold is harmless
  there, because no later commit of `pay` can happen.
- **Inherent, to state:** on a keyed operation, which key a `cancel(k)` names is a closure, so a release of another
  key counts as an owner.

Fix: K11's three refinements. Each reads tokens only. The rule's sentence becomes: "from each branch that keeps the
hold, some owner is reachable without passing `X.idle`, a `retry` counts only with a reachable fallback, and a
branch from whose target no commit of X is reachable passes."

**M2 (K12). Q32's `basedOn` "at invocation" makes `If-Match` pass against the writers it is meant to refuse.** A
waiting write's `basedOn`, computed when it is sent, is whatever version the store holds then. If tab 2's "X" (v6)
reached this tab's live store while "AB" waited, "AB" is sent with `If-Match: 6` and overwrites "X". The user never
saw "X". Q31 then says cross-actor ordering is "the server's (a version precondition read at send time)", but a
precondition read at send time cannot fence what the user did not see. Fix: rebase across this lane's own writes
only. A waiting write committed on base b takes the version returned by the write it waited for, if that write's
base was also b. Otherwise it keeps b, and a 412 is then the right answer. The same applies to plain transactions:
"read the version in the commit function" needs the same rule, not "current". This is computable without closures:
the lane knows its own Attempts' bases and results.

**M3 (K12). The hold is per lane, so dependent writes across operations are unordered, and "all lanes idle" has no
member.** In the wizard (sketch 7), PROFILE's save is held as unknown, with a newer edit waiting. `Submit` is another
operation, so nothing holds it. The server finalizes the draft with the old profile. The waiting save is then refused
(draft closed) or lands on a submitted application. 3.8.1 says "the hold orders this actor's writes", which is not
what it does. The author's only guard is a closure over every key, with three hand-built key records:
`STEPS.every((step) => { const l = O.save.get(operations, { draftId, step }); return !l.pending && !l.uncertain &&
!l.waiting })`. `idle` on a keyed operation always takes one key. Fix: say "per lane". Put "an aggregate `idle` over
an operation's lanes" in `revisit.md`, and show the closure as the pattern. A new member is not worth adding until
a second case needs it.

**M4 (K9). Under `serialize`, can `retry` address the held head?** MD N2 and rule 21: `retry` "exists only where a
lane has an addressable Attempt (a type error under `allow` and `serialize`)", and the `serialize` row is
`{ pending, uncertain, outstanding }`, with no `retryCount`. Revision 6 makes `serialize` hold, so the head is "the
oldest unresolved sent one", but it never amends N2. If N2 stands, the only owner of a `serialize` hold is `cancel`.
Every unknown head must then be given up and may land later, which is the opposite of the Stripe guidance 3.8.1
cites. Sketch 6's `O.put.retryable({ times: 2 })` is a type error. Fix: say that under `serialize` the held head is
addressable (`retry`, `retryable`, and `retryCount` on the row). Alternatively, `serialize` does not hold (Q28 B).

**M5 (K9). "To drop the newer write as well, the author cancels again" works only within one turn.** After the
first `cancel` releases the unknown, the waiting commit "is sent". If a later turn cancels again, the commit is in
flight. That cancel interrupts it, and an `unknown(Cancelled)` re-enters U's handler. Under revision 6 that shows
the give-up toast for a deliberate discard; under K9's fix it holds. `NotSent { Cancelled }` arises only if the
promoted commit is invoked after the turn's actions, which 3.5 does not say. Under `serialize` there is no static
way to write "cancel every queued upload": an action list has a fixed number of cancels. Fix: say that the promoted
commit is invoked at step 6, after the turn's actions, so `[O.x.cancel, O.x.cancel]` releases and then drops. For
`serialize`, record "drop the queue" in `revisit.md` and don't invent a word.

**M6 (case). 5.2's release can strike a correct code.** "A code check holds no server fact worth waiting for" is not
true of one-time codes. If the unknown verify succeeded, the server consumed the code and may have opened a session.
After `cancel`, the user submits the same code. The server answers `WrongCode` (already used), and a strike follows.
Three of these give LOCKED_OUT for a correct code. Fix in the case: `CodeUnchecked` retries the same Attempt first
(`retryable({ times: 2 })`, after which the server answers what it did), then cancels. `UnresolvedHold` still passes.

**M7 (K12). A guard on the one-off read row answers for a different input.** The row is OPS O6's lane, which
carries no params or key. In the wizard, a name is typed, and the 300 ms debounce has not fired yet. The row still
holds the previous name's `Ready { available: true }`, so `Next` guarded on the row passes with an unchecked name.
3.4 shows views reading the row (`s.operations.results?.data?.hits`), which is harmless there, and 9.5 copies hits to
memory. A guard is where it bites. The workaround is a memory mirror (`checkedName`), which R9 forbids. Fix: the
one-off row carries `key`, the key record of the entry it holds, as keyed write rows do. A guard then compares
`row.key.name` with memory. No new word is needed.

**L1 (K10).** 3.4 says "`pending` keeps its meaning: sent work is outstanding". MD rule 21 counts "a waiting `latest`
start included". It is a NEW MEANING, and should be marked. 3.2's table still gives `{ pending, uncertain,
outstanding }` for `allow` and `serialize`, without `waiting`, while S12 gives every write row `waiting`.

**L2.** The policy lists disagree. `UnmappedUnknown` covers `latest`, `reject`, `serialize` and `cancel`, but
`UnresolvedHold` covers `latest`, `reject` and `serialize`. Under `allow`, and under `cancel` with no newer commit, a
retained unknown that nobody retries keeps `uncertain` true and its lane persisted forever. Lanes are "removed when
they hold nothing". Fix: `allow` and `cancel` do not retain an unknown past its delivery (it is evidence after its
turn). Both lists then read "`latest`, `reject`, `serialize`", and rule 6's `cancel`-concurrency exception goes.

**L3.** S15's condition ("an event mapped by a keyed operation, whose handler holds a key-less member of it") is
harder to state than the rule it protects. "An event mapped by `outcomes` comes only from an ending" covers it, also
covers unkeyed operations, and costs nothing: no case schedules or raises a mapped event. Also say that `outcomes`
map only `internalEvents` (otherwise a view can `send` a mapped public event), and what `Story.ending` does on a lane
with no outstanding Attempt.

**L4.** `SharedEnding` is info that fires on the intended use (5.1). Cut it, or make it a warning only for a key-less
`retry` or `retryable` on an unkeyed operation in a shared event, where it can re-send the wrong operation's work.

**L5 (K9).** "The oldest unresolved sent one" excludes a failed Attempt, which is resolved. MD rule 21 kept a failed
addressable Attempt for `retry`. A `retry` after a failure is now `NothingToResend`, and the author commits anew
with a new id. That is correct under `latest` (re-sending a failed write after the waiting one would reorder them),
but it is a change to MD and should be stated.

**L6. Reload mid-hold works**, walked on 8.2, 9.4 and the wizard:

- An in-flight re-send restores as `unknown(Restored)` and is delivered, and `retryCount` persists, so the budget
  holds.
- A retained unknown restores and holds.
- The waiting commit ends `NotSent { Restored }`.

Two gaps. First, 3.10 doesn't say that a retained unknown whose ending was already delivered is **not** delivered
again on restore. If it were, 8.2's first `SaveUnsure` branch would retry after every reload. Second, 8.2 shows
"Not sent (Restored)" as an error, and the wizard's user must revisit a finished step. Both are visible and
correct, but read badly.

**L7.** 3.7, "lanes change only in this actor's turns", holds for a lane's status. A held one-off row's data still
changes when another actor refetches the entry (3.4 says so). The sentence should say "status".

## Rules audit (0.2's 17)

| # | Rule | Verdict |
| --- | --- | --- |
| 1 | Lane identity per kind | **keep** |
| 2 | Rows per kind (`waiting`, held one-off entry, `get` idle or `undefined`) | **keep**, redefine the flags by lane state (K10); add `key` to the one-off row (M7) |
| 3 | Replacement per kind | **keep** |
| 4 | Verb agrees with mapping; one verb per operation | **keep** (`VerbMismatch` earns it) |
| 5 | `cancel`: one Attempt on a write, the wait on a read | **keep, simplify**: K9 drops "an interrupted unknown is delivered once and not retained" |
| 6 | The hold per policy | **keep, simplify**: L2 drops the `cancel`-concurrency exception; three policies hold, two don't |
| 7 | `idle`'s two denials | **merge into 6**: `idle` passes when the lane would admit a commit; the code says why |
| 8 | Key-less addressing (OD8) | **keep**, defined as "that ending's Attempt" (K9) |
| 9 | The domain default's conditions | **keep** until Q30; **merge with 14** as "a key is declared, or the entity's primary key, else `[]`; `latest` and `cancel` need one" |
| 10 | Keyed schedules use key records | **merge into 1**: it is "the key record has one meaning everywhere" (3.3), not a rule an author holds separately |
| 11 | `restartOn` per key, `armOn` banned | **keep** |
| 12 | Bare never holds; a mapped holding write maps `unknown` | **keep the first half; move the second into 16**: an unmapped unknown on a holding write is `UnresolvedHold`'s first case, so `UnmappedUnknown` goes as a separate code |
| 13 | One-off lanes not persisted | **keep** (a fact authors need after a reload) |
| 14 | S4 at the operation | **merge with 9** |
| 15 | S6, one write operation per contract | **keep** |
| 16 | Every hold has an owner (`UnresolvedHold`) | **keep**, with K11's spec and 12's second half |
| 17 | Ending events only from endings (S15) | **keep, simplify** to "mapped events come only from endings" (L3) |

**Result: 17 → 14 rules.** Rules 7, 10 and 14 are merged away. Rules 5, 6, 12 and 17 get shorter. One code
(`UnmappedUnknown`) and possibly one info (`SharedEnding`) go. Nothing is cut that costs correctness. The two
definitions that are missing (the flags during a re-send, and when a promoted commit is invoked) are definitions,
not new rules.

## Concept count (0.2 claims 4 words, 0 modes, 17 rules)

- **Words: 6, not 4.** `retryable({ times })`, `get`, `.outcomes()` and `subscribe.each`, plus **`waiting`**, a new
  row field an author reads, and **`Story.ending`**, a new Story driver (proposed, Q33). `uncertain` is M4's word in
  a new place, so it is not counted. Codes authors meet but don't write: `Uncertain`, `KeyRequired`, `VerbMismatch`,
  `Released`, `NothingToResend`, `RetryLimit`, `UnresolvedHold`, `UnmappedUnknown`, `SharedEnding`.
- **Modes: 0 by 0.2's definition, 1 borderline.** On a write, `cancel` has one address but three effects by runtime
  lane state: interrupt (an unknown is delivered, and the next commit is sent), release (`Released`, then the next
  is sent), or end a never-sent one (`NotSent { Cancelled }`). The handler sees different things, and tools can't
  tell which from tokens. That is review 3's mode (c) in a milder form. With K9's fix the three effects remain, but
  each keeps "nothing newer while an older write is unknown", so it is a per-state rule, as `retry` has, not a mode.
- **Rules: 17 written, plus 2 missing definitions** (K10's flags during a re-send; M5's invocation point of a
  promoted commit). With the audit: **6 words, 0 modes, 14 rules.** All are token-checkable, except rule 9 until
  Q30.

## Authoring: sketch 7, an onboarding wizard (new)

Steps ACCOUNT → PROFILE → PLAN → REVIEW. Each step is saved to a server draft on Next (`latest`, keyed
`["draftId", "step"]`), a one-off lookup checks name availability while the user types, and a final `reject` submit
must not double-submit. The STUCK path checks status by a read. The file is
`scratchpad/ops-review-5/7-onboarding-wizard.ts`.

| Aspect | Under revision 6 |
| --- | --- |
| Reads well | Per-step lanes from the field list; key-less `retry` and `cancel` in `StepUnsure` (OD8); `waiting` and `uncertain` on a step dot; Back/Next fast, where p3 replaces a never-sent p2 with no stale guard; submit unknown → retry with the same id → UNSURE → status read → release. `UnresolvedHold` passes on all five operations. |
| Friction | The step key comes from two sources (memory `draftId`, the current step) and is hand-built twice (R4's sketch 2, unchanged). The key is copied into `StepUnsure`'s payload. In CHECKING, `Status` is the `status` read's ending, so releasing the keyed `submit` needs a key record built from memory. That is correct under OD8, but reads differently from 5.1's unkeyed `answered`. |
| Hacks | (1) "Every step confirmed" is a closure over `O.save.get(operations, …)` for three hand-built keys, because `idle` on a keyed operation takes one key (M3). (2) A memory mirror `checkedName`, because the one-off row does not say which name it answered (M7). |
| Bugs the model allows silently | (1) Without the closure, `Submit` passes while a step save is held (M3). (2) A guard on the row approves a stale name (M7). |
| Reload mid-hold | Correct. The in-flight re-send is redelivered with its budget, and the waiting step edit ends `NotSent { Restored }` → the step is marked unsaved → `Submit` is denied `StepsUnsaved` until the user passes that step again (L6). |

The writing is shorter than in revision 5 again. No closures in endings, no `thisX` and no mirrors appear, except
the two hacks above, and both come from per-lane limits, not from syntax.
