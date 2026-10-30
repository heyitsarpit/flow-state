# Review 6 of operations-in-definition, revision 7 (2026-10-30)

One reviewer: correctness, simplicity and authoring. These are suggestions, not decisions. OD1–OD10 are taken as
fixed. This review judges revision 7's write-lane table (3.8.1) as a state machine, checks review 5's findings
against it, and checks the amendments to MD and merge 4. Contract shapes (params/input naming, schema fields, Q27,
Q30) are out of scope. Two apps were written in the session scratchpad, `ops-review-6/`:
`8-upload-queue-r7.ts` re-runs review 4's sketch 6 (a `serialize` queue), and `9-bulk-archive.ts` is new (archive
selected over many threads, with Undo and a per-thread star).

**Verdict: not ready for acceptance. There are 3 High findings, not zero.** OD10's form is right. It is the first
revision in which every review-5 scenario can be walked cell by cell, and the table is where the remaining holes
show. Review 5's H1 is closed, and so are K9 (with one exception, M1), K10's definitions, M4, M6, M7 and most Lows.
The three Highs come from two causes. Each fix is one or two sentences, and none needs a new word:

- **H1.** The table has no time inside a turn. A commit made in the same turn as a release, or in an ending's
  handler while a commit waits (`Idle + W`), has no cell. Read literally, the newer commit is sent first and the
  older waiting one lands after it.
- **H2.** Review 5's H2 is **not closed**. MD 2.5 computes `keys` in step 5, before the turn's actions change the
  lane. So no evaluation ever sees the re-send as `InFlight`, and 5.3's reconcile timer still never re-arms.
- **H3.** `UnresolvedHold`'s new "terminal" pass assumes nothing can wait behind the hold. But a commit that is
  already in `W` is waiting. In 8.2, `CloseAnyway` during an outage strands "ABC" for good, and the check passes.

## Causes and fixes

| # | Cause | Findings | Fix at the cause |
| --- | --- | --- | --- |
| K13 | **The table's transitions have no place in MD's turn (2.5).** Cells say "invoke at step 6" and "promote at step 6". But MD computes every effect-only read (`keys`, `when`, `params`, selects) in step 5, publishes in step 6, and starts actions after publishing. So which lane state a guard, a `keys` function, a later action in the same list, and the published row see is unstated. `Idle + W` is a real in-turn state that the three columns hide. | H1, H2, M1, L1, L2 | **Compute "after lanes" the way MD computes after memory.** In step 5, after the selects, apply the turn's members to the lane in action order, using the table. **Promote at once:** when a lane leaves `InFlight` or `Held` with `W` non-empty, `W`'s head becomes the addressable Attempt, `InFlight` and not yet invoked. Step 6 publishes the after lanes and invokes after publishing. Guards keep "pre-turn lanes with the turn's ending admitted" (MD rule 22). Effect-only reads (`keys`, `when`, activity `params`) read the after lanes. `Idle + W` and the step-6 refinement then disappear. A `cancel` of a promoted head that has not been invoked is MD rule 24's before-invocation case, `NotSent { Cancelled }`, so `[cancel, cancel]` still drops the waiting commit (R5 M5). |
| K14 | **`UnresolvedHold` reasons about commits that may come, not about the work already waiting.** The terminal pass and the owner search look forward from the branch. `W` exists at the moment the hold starts. | H3, M2 | Allow the "no commit reachable" pass only for `reject`, where `W` is always empty. Under `latest` and `serialize`, an owner is required. Apply "a `retry` behind `retryable` counts only with a fallback" to every owner, not only to U's branches. |
| K15 | **One reference stands for several things that the author names separately.** A `serialize` lane is one Attempt to its members but many items to its UI. A record is written by several lanes, but the proposal argues about marks per lane. One `unknown` event carries both "the user stopped it" and "the connection dropped". | M4, M5, M6 | State each one where it lands (the M findings). No new member is needed. |
| K16 | **Amendments and new words are not inventoried.** Revision 7 lists two amendments (MD N2, rule 21). The table also changes MD rules 16, 17, 19 and 24, C7, C11, C18 and merge 4 rules 29 and 31. The `basedOn` rebase needs a version that plain transactions do not declare. | M7, M8, the concept count | List every rule the table amends. Give `basedOn` a stated source, or scope the rebase to domain writes. |

## Is the table a complete, deterministic state machine?

**Completeness by policy.** The table covers `reject`, `latest` and `serialize`. `cancel` and `allow` are described
only in the policy notes, in prose. Under `cancel`, an unknown is "addressable in its own handler … then evidence
after that turn". That is a fourth, one-turn state (held only for this turn) with its own cells, and the table never
states it (M3). For the three holding policies, the rows are complete. The states are not.

**The states really number six.** They are `Idle`, `Idle + W`, `InFlight`, `InFlight + W`, `Held` and `Held + W`.
Under `reject` there are three, because `W` is always empty there. The table merges each pair into one column, which
is safe for every row except `commit` in `Idle + W` (H1) and `cancel` in `Idle + W` against the key-less rule (M1).
With K13's "promote at once", `Idle + W` stops existing, and the three-column table becomes exact.

**Determinism.** With K13, every cell names one address and one next state. Without it, `commit` in `Idle + W` has
three readings (send now, queue, or replace), and each gives a different observable result.

**The 8 "cannot occur" cells.** An ending in `Idle` or `Held` needs an Attempt on the wire in a lane that has none.
Walked:

- **Interrupt.** MD rule 24 and C11 keep the lane pending "until its turn", so the lane stays `InFlight` until the
  interrupt's ending is admitted. The cell's "the lane becomes `Held`" must mean at admission (L1). If it meant at
  the `cancel`, a `retry` in a later turn would re-send while the interrupted fiber was still exiting, and that
  fiber's `unknown` would then land in the `InFlight` column for the re-send. The cell stays unreachable only under
  the admission reading.
- **Reload.** The fiber is gone. An in-flight Attempt is re-delivered as `unknown { Restored }`, and nothing else is
  on the wire. The cells stay unreachable.
- **Two endings in one turn.** That is impossible: one ending is admitted per turn (MD 2.5 step 1), and a lane has
  at most one sent Attempt.
- **A `cancel` racing a settled request.** MD line 1115 says the ending is "the real one if it already settled". The
  cell should say so as well, but nothing becomes reachable through it.

So the 8 cells are unreachable, given the admission reading. One more cell is unreachable and is not marked:
`restore` in `Idle` with `W`. Persistence writes at turn ends, and `W` is promoted before a turn ends, so `Idle + W`
is never persisted (L2).

**Do the flags follow from the state alone?** Yes, as definitions. But *which* state a reader sees is K13's gap. The
published row after a commit turn, and `keys` in the retry turn, depend on when the cell is applied (H2).

**Can a Story reach all 22?** It can reach them per policy, not per machine. A Story drives only the transitions
that the machine has. A machine with no `[cancel, cancel]` and no commit in an ending can't reach `cancel` in
`Idle + W`. The `restore` cell for an unacknowledged Attempt needs a crash between the acknowledgement and the
invocation, which a between-turn Story reload cannot produce. So "a Story suite can enumerate the 22 cells" should
read "a policy test suite in Flow's own tests" (L2).

**Can `UnresolvedHold` be computed from tokens alone?** Yes. It needs:

- U's arrival leaves (rule 14 owners and their ancestors);
- the `X.retry`, `X.cancel`, `X.retryable` and `X.idle` tokens;
- state-token reachability.

| Kind | Case | Note |
| --- | --- | --- |
| False negative | an existing `W` in a "terminal" state | H3 |
| False negative | a budgeted non-ending owner with no fallback | M2: review 5's second case, still open |
| False negative | a closure guard that reads `O.x.get(operations, k).uncertain`, which is `idle` written by hand | inherent; state it |
| False negative | a keyed `cancel(k)` whose key never matches | stated |
| False positive | an owner path through `X.idle(k)` for a *different* key, which the check treats as blocked | rare; state it |

## High

**H1 (K13). A commit in the same turn as a release, or in an ending's handler while a commit waits, has no cell.
Read literally, the older edit is sent after the newer one.** Under `latest`, the `commit` row's `Idle` cell says
"mint an Attempt, invoke at step 6 → `InFlight`". Only the `InFlight` and `Held` cells say "a previous `W` ends
`Superseded`". The refinement then says `W` is promoted "at step 6, after the turn's actions". 8.2's editor, with a
"Discard unsure and save now" button written the obvious way:

1. "AB" is `Held` (unknown), and "ABC" waits in `W`.
2. The user types "D". `SaveNow` is not usable, because `idle` denies `Uncertain`. So the page offers `ForceSave`:
   `actions: [O.save.cancel(thisDoc), save]`, which releases and then saves the current draft.
3. `cancel` in `Held` releases "AB" → `Idle`, with "ABC" still in `W`.
4. `save` (the draft "ABCD") is in `Idle`, so it mints and is invoked at step 6. Step 6 then promotes `W`, but the
   lane is now `InFlight`, so "ABC" stays waiting behind "ABCD".
5. "ABCD" succeeds → `Idle` → "ABC" is promoted and saved. The document is "ABC". The user's last character is gone,
   and every ending says "Saved".

The same gap appears in an ending's handler. A `SaveFailed` that re-commits the current draft with "ABC" waiting
under `latest`, or a `serialize` `Uploaded` handler that commits the next file while photos wait, sends two
Attempts on one lane at step 6, which breaks D9's "one write in flight per key", or jumps the FIFO. The other
reading (treat `Idle + W` as `InFlight` for `commit`) is correct, but the table does not say so, and the step-6
wording points the other way.

**Fix (K13).** Promote at once and apply cells in step 5, in action order. Then `cancel` releases "AB" and promotes
"ABC" (`InFlight`, not yet invoked), and `save` meets the `InFlight` cell, so "ABCD" becomes `W`. "ABC" is sent,
then "ABCD". Under `serialize`, "ABCD" is appended to `W`. Add the step-2 walk as a Story.

**H2 (K13). Review 5's H2 is not closed: the reconcile key never leaves, because `keys` are computed before the
retry changes the lane.** MD 2.5 step 5: "From [the after memory], compute last every effect-only read: … `keys` …".
Step 6: "Publish once, then start actions." 3.12 lets `keys` read `operations`, but it does not say which lane
state. The only stated lane read is MD rule 22's: "the pre-turn lanes with the turn's own ending already admitted".
5.3, offline:

1. The like ends unknown → `Held`. The `{ id }` key appears, and the timer is armed.
2. `ReconcileLike` runs `O.like.retry(named)`. In step 5, `keys` read the lane: it is `Held` (pre-turn), so the key
   stays. The retry starts after publish → `InFlight`. No turn evaluates `keys` now.
3. The re-send ends unknown (offline, at once). Its turn admits the ending → `Held`. `keys` read `Held`, so the key
   is still there. It never left any evaluated list, so MD rule 23 ("armed when the key first appears … firing
   once") does not re-arm the timer.
4. `LikeUnsure`'s first branch passes (`retryCount` 1 < 3) and does nothing. The like holds forever, the waiting
   unlike waits forever, and `UnresolvedHold` passes.

5.7's walk ("`InFlight` (`uncertain` false, key leaves)") needs a turn to run while the re-send is on the wire.
Whether one runs depends on unrelated events: a `Listed` push, or the toast timer. So the reconcile works on a busy
page and stops on a quiet or offline one. The same gap makes the published `pending` lag one turn after every commit
(the row is published before actions start), which contradicts merge 4 rule 28 ("a start publishes with its turn").

**Fix (K13).** After lanes, computed in step 5, are what `keys`, `when` and published rows read. Then step 2's
`keys` see `InFlight`, the key leaves, step 3 re-adds it, and the timer re-arms. Add 5.3's three-re-send walk as a
Story with no other events in between. That is the case that fails today.

**H3 (K14). The terminal pass ignores a commit already in `W`. 8.2's `CloseAnyway` during an outage strands the
newest text, and `UnresolvedHold` passes.** 3.8.1 rule 2: "pass if no transition holding `X.commit` is reachable:
nothing can wait behind the hold". Under `latest` and `serialize`, `W` can be non-empty when the hold starts. 8.2,
with the server down:

1. "AB" is `InFlight`, and "ABC" is in `W`. The user presses Close, which is denied, then `CloseAnyway` →
   `cancel` interrupts "AB" → CLOSED.
2. "AB"'s `unknown { Cancelled }` → `Held` → the root `SaveUnsure` re-sends it 3 times, and each re-send ends
   unknown. The second branch holds (no `cancel`).
3. CLOSED has no `save` commit, so the check passes. "ABC" waits behind a hold that nothing in CLOSED can end. When
   the server returns a minute later, nothing re-sends, because no schedule exists in CLOSED.
4. On reload, "ABC" ends `NotSent { Restored }` → the root `SaveFailed` → memory `error`, in CLOSED, with no
   autosave. The text is gone.

Revision 6's paragraph says "`CloseAnyway` releases it and the newest text is still sent". Revision 7's walk says
"'ABC' is promoted at step 6 and saved". Both are true only when a re-send resolves. Revision 7's fix for H1 (the
interrupt holds) is right, but it moves the owner of "ABC" into the hold's handler, and the check no longer asks
for one. The same shape applies to any `latest` or `serialize` lane whose unknown can arrive in a "done", "left" or
"closed" state.

**Fix (K14).** Allow the terminal pass only under `reject`. 5.1's LEFT still passes, because `pay` is `reject`. In
8.2, the root `SaveUnsure`'s fallback releases: `actions: [O.save.cancel]`. "ABC" is then sent, with the stated
residual that a released write may land later. A CLOSED-only fallback works too. Then the check reports 8.2 as
written, which is the point.

## Medium

**M1 (K9, K13). In an ending, `O.x.cancel` and `O.x.cancel(named)` do different things.** The key-less rule: if the
ending's own Attempt "was released, … `cancel` does nothing". The table: `cancel` in `Idle + W` ends `W`'s head. R5
M5's `[O.x.cancel, O.x.cancel]` idiom is written in an unknown's handler, which is where it is needed. There, the
second key-less `cancel` names the released Attempt and does nothing. A keyed `cancel(named)` in the same handler
drops `W`. So the same two-member list releases-and-drops or only releases, depending on whether a key is written:
a mode by spelling. **Fix:** in an ending, the key-less form names the ending's Attempt, *then* the lane once that
Attempt is resolved. Or say plainly that dropping `W` from an ending needs the keyed form. With K13's
promote-at-once, the second `cancel` targets the promoted head (`NotSent { Cancelled }`), so a single rule ("a
key-less member in an ending names its Attempt; if that is resolved, it names the lane's addressable one") gives
the same result for both spellings.

**M2 (K14). Review 5's second `UnresolvedHold` false negative is still open.** Rule 2 requires a fallback only for
"a `X.retry` behind `X.retryable`" *in U's branches*. The owner search's second bullet counts any reachable
non-ending transition that holds `X.retry(k)`, including R5's own example:
`UNSURE: { on: { CheckNow: { guard: [O.pay.retryable({ times: 3 })], actions: [O.pay.retry] } } }`. Rule 3 says
"`X.retryable` blocks once its budget is spent", but bullet 2 does not apply it. After three re-sends, each
re-sent unknown routes back to UNSURE, `CheckNow` denies `RetryLimit` forever, and the check passes. **Fix:** one
sentence: "an owner guarded by `X.retryable` counts only if the same event has a later alternative that reaches an
owner".

**M3 (completeness). `cancel` and `allow` are not in the table.** OD10 asks for "every member and ending against
every state". Under `cancel` concurrency, an unknown is held for exactly its own turn: a key-less `retry` works
there, a `retry(k)` from a later user event gives `NothingToResend`, and `uncertain` is never visible to a view.
That is a state with its own cells. Under `allow`, the row is `{ pending, outstanding }` (3.2), but S13 says every
write row is `{ pending, uncertain, waiting, retryCount, progress? }`. **Fix:** two short tables, or two columns,
with `HeldThisTurn` named. Then the policy notes become readings of the table, as OD10 intends for the rest.

**M4 (K15). Under `serialize`, the addressable head cannot be identified, and a per-item `cancel` from a user event
silently hits it.** Sketch 8. The `serialize` lane is unkeyed, so OD8 makes a key-less `cancel` legal in any
handler. The user presses Cancel on photo 9 (waiting). `O.put.cancel` addresses the head, photo 4, which is
`InFlight`: photo 4 is interrupted, held, and re-sent twice by `UploadUnsure`'s retry-first branch, and photo 9 is
still uploaded. Nothing in types or `flow check` flags it. The row's `retryCount` and `progress` are the head's,
but the row doesn't say which item the head is, and promotion raises no event. The view must derive "head = first
non-done item in memory order", which is a convention (R1). MD N2's reason for excluding `serialize` was exactly
this. The amendment fixes `retry` for the held head and reopens the targeting problem for every other member.
**Fix:** on `serialize`, allow key-less `retry`, `retryable` and `cancel` only in a handler of the head's own
ending (as `allow` does). From a user event, require the author to name the item, which only a keyed or
memory-queued design can do. State it in the policy row. Optionally, give the row the head's key record (it is
`{}` when unkeyed, so this helps only keyed `serialize`).

**M5 (K15). An interrupted Attempt is now held, so a retry-first unknown handler re-sends what the user stopped.**
The interrupt is correct as a fact: the request may have landed. But almost every case's unknown handler starts
with `retryable → retry` (8.2, 9.4, 8.4, 5.3's create, 5.2). A "Cancel" on an in-flight money transfer: `cancel` →
`unknown { Cancelled }` → `Held` → the handler re-sends the same id. If the first request never reached the server,
the transfer is now made because the user pressed Cancel. In revision 6 the interrupted unknown was not
retained, so the key-less `retry` found nothing. Only 8.1 handles this correctly, because its handler always
releases. **Fix:** state the pattern. Where a user can stop a write, the unknown handler branches on the reason
first, and `Cancelled` releases. `Cancelled` comes from the mapper's reason, which is a closure, so
`UnresolvedHold` can't see it. Say so. If the owner wants it checkable, mapping `unknown` by reason is a contract or
outcomes shape question, so it is out of scope here: record it as a question, not a rule.

**M6 (K15). Another lane's success on the same record clears the held write's `uncertain` mark.** 3.8.1's merge 4
paragraph: "a later write from the same lane is sent only after the unknown is resolved … so it cannot clear a mark
the actor is still retrying; another actor's write still can". Merge 4 rule 30 releases the record queue once the
forced repair settles, not when the lane resolves. Rule 32: "a success of a later write to the record clears every
mark on that record". 5.3: a like on issue 1 is `Held` and reconciling. The user renames issue 1 (another
operation, another lane), the rename is sent, it succeeds, and the record's mark is cleared. `Issue.get(...)
.uncertain` is false while `O.like.get(s, issue).uncertain` is true and the like is being re-sent. Sketch 9 shows the
same with a bulk archive and a per-thread star. **Fix:** amend rule 32 so that a success clears marks only of
Attempts whose lanes are resolved or released. Or state it as part of K12's per-lane limit, and correct the
paragraph's claim.

**M7 (K12, K16). The `basedOn` rebase is underspecified in three ways.**

- **Chains.** Under `serialize`, W2 waited for W1, which was rebased from b to v2. "If that write's base was also
  b" must mean W1's *committed* base, or W2 keeps b and gets a 412 on the user's own third edit.
- **Released predecessors.** A released write returns no version, so the waiting commit keeps b. If the released
  write did land, the user's newest edit is refused by their own write. That is defensible, but it should be stated.
- **Plain transactions.** "Gets the same rebased value in its commit context" needs Flow to know which result field
  is the version and which input field is the base. A plain transaction declares neither. That is an unstated new
  contract word.

**Fix:** say "committed base" and "transitively". State the released case. Scope the rebase to domain writes, where
merge 4 already knows `basedOn`, until the owner decides the contract shape.

**M8 (K16). The amendment list is incomplete.** The table also changes:

- MD rule 16: a retry of an outstanding Attempt ended `NotSent { Rejected }`, delivered. It is now evidence
  `InFlight`.
- MD rule 17: "every start and every retry … delivers exactly one ending". Retry declines are now evidence.
- MD rule 19: "`pay.retry` after a definite failure stays allowed and sends the same id". That is the rule L5
  changes. Revision 7 cites rule 21.
- MD rule 24 and C7: "`cancel` cancels every outstanding Attempt". This is decided by OD7, but it is not marked as
  an amendment.
- MD C18: `retry` on `serialize` is a type error.
- MD line 818: `NotSent.why` lists `NothingToResend`.
- Merge 4 rule 31: `retry` only under `reject`, `latest`, `cancel`.
- Merge 4 rule 29: "`.cancel(key)` follows rule 24".

None of these is unsound. Each is a sentence an implementer would otherwise follow. **Fix:** one amendment list in
3.8.1. Consequence worth stating: a user's "Retry" in `Idle` now gives no ending, so the UI must not wait for one
(9.3's `RetrySave`).

**M9 (expressiveness). Work over a dynamic set of keys in one turn cannot be written.** An action list holds a
fixed number of members, and `commit`, `retry` and `cancel` have no per-key form. Several real cases need it:

- archive selected (sketch 9, per-thread shape);
- flush an offline outbox of N held notes on reconnect;
- "retry all unsure";
- "cancel all uploads".

The workaround is a memory queue plus a 0 ms keyed schedule used as a loop, one turn per key. It works, but it is
a hack, and it inherits H2's re-arm problem for retry-all. The bulk-contract shape (one `serialize` lane, one
request) avoids it and reads well. **Fix:** don't add a word now. Record "per-key fan-out of write members" in
`revisit.md` with these four cases, and show the bulk-contract shape as the pattern.

## Low

- **L1 (K13).** The `cancel`-in-`InFlight` cell should say "the lane stays `InFlight` until the interrupt's ending
  is admitted (MD rule 24, C11). That ending is `unknown { Cancelled }`, or the real ending if the request had
  already settled."
- **L2 (K13).** Mark `restore` in `Idle` with `W` as unreachable: `W` is never persisted in `Idle`. Say that
  "acknowledged" is per Attempt, so a `Held` Attempt whose re-send was not acknowledged restores as `Held` or
  unknown, never as `NotSent { Restored }`. Otherwise a reload would turn a possibly landed write into "never sent",
  remove its prediction, and promote `W`. Say "a policy suite" rather than "a Story suite" for the 22 cells.
- **L3.** The one-off row's new `key` breaks 3.4's "a one-off read and a live read of one resource therefore have
  the same row type". Give the unkeyed live placement's row `key` too, at no cost, or drop that sentence.
- **L4.** The `serialize` row loses MD's `outstanding` count. `waiting` is a boolean, so "17 queued" goes back to
  memory (sketch 8). Keep `outstanding` on `serialize` rows. Under `cancel` and `allow`, `uncertain` is never true
  in a published snapshot, so the row type should drop it there, or say so.
- **L5.** 5.2 says the key-less members in a `NotSent { Rejected }` ending "act on the rejected commit's own Attempt".
  MD rule 16 says a declined start has no Attempt. Say "a key-less member in a `NotSent` ending does nothing".
- **L6.** Most cases re-send in the unknown's own handler, with no delay (8.2, 8.4, 9.4). Offline, `fetch` fails
  at once, so a 3-send budget is spent in milliseconds, and the release follows. 5.1 and 5.3 re-send on a timer.
  Make that the documented default for unknowns, without adding a rule.

## Review 5 against revision 7

| R5 | Status | Note |
| --- | --- | --- |
| H1 in-flight `cancel` | **closed** | The interrupt holds (`Held`). Walked for 8.2, 5.1 and 8.1. It costs H3 and M5. |
| H2 `uncertain` during a re-send | **not closed** | The flag is defined. The schedule still never sees it false (H2). |
| K9 addressing | **closed**, except M1 | The key-less member names its ending's Attempt. |
| K10 flags | **closed as definitions** | When they are read is K13. |
| K11 `UnresolvedHold` | **partly** | The `idle` false negative and the LEFT false positive are closed. The budgeted non-ending owner is open (M2). A new false negative (H3). |
| K12 per lane | **stated** | M6 is a per-lane case the text still denies. M7 is the rebase detail. |
| M3 aggregate idle | open as Q34 | as recommended |
| M4 `serialize` head | **closed** as an amendment | It reopens targeting (M4 here). |
| M5 promotion point | **stated** | It is the source of H1. Under K13 it becomes "promote at once". |
| M6 5.2 codes | **closed** | |
| M7 one-off `key` | **closed** | type note L3 |
| L1–L7 | applied | L2 is applied, but it leaves the table incomplete (M3). L5 cites the wrong MD rule (M8). |

## Amendments checked

- **MD N2 (`serialize` head addressable).** It is sound for `retry` and `retryCount`: the head is always one sent
  Attempt, so "one reference, one thing" holds for the head. It is unsound for targeting from user events (M4).
  Merge 4 rule 31 must change with it (M8). With the record queue, a re-sent head joins its record queues again
  (rule 31) behind any other lane's queued write on the same record. That is fine: the server dedups by id.
- **MD rule 21, which is really rule 19 (a failed Attempt is not re-sendable).** It is sound under `latest` and
  `serialize`. Re-sending a failed write after `W` was promoted would reorder them. Rule 18 still makes a re-send's
  failure `StillUnknown`, so only first-send failures resolve. The cost: `retryable`'s budget no longer covers
  retries after a failure. 5.1's `busyTries` memory counter is the pattern for `Busy` and 429, and it is fine,
  because each new commit gets a new id after a known non-application.

## Authoring: two apps under revision 7

| Aspect | Sketch 8, `serialize` upload queue (re-run of R4's 6) | Sketch 9, bulk archive with Undo and star (new) |
| --- | --- | --- |
| Reads well | `retryable` and `retry` on the held head now type-check. The give-up releases and promotes, so nothing is dropped. The reload behaviour is right. | One `serialize` contract with `archived: boolean` makes Undo queue behind the archive on one lane. That is correct even while the archive is held. Key-less members in `ArchiveUnsure`. |
| Hacks | (1) The head's identity is derived from memory order. | (1) The per-thread shape needs a 0 ms keyed schedule loop to fan out (M9). |
| Bugs the model allows silently | (1) A per-row Cancel hits the head (M4). | (1) A star on a held-archive thread clears the archive's mark (M6). |
| Friction | `waiting` has no count (L4). A 100-photo pick overflows at 64. Queued photos all end `NotSent { Restored }` on reload. | `latest` would be wrong for bulk sets (B supersedes A's never-sent archive), and `serialize` must be chosen deliberately. Archive's select must read `lastArchived`, not the `selected` it clears (existing MD rule 22). |
| `UnresolvedHold` | passes | passes |

Neither app hits H1–H3 directly as written. Both hit them as soon as the user can "force save" (H1), the reconcile is
a keyed schedule (H2), or a "leave anyway" state exists (H3).

## Concept count (0.2 claims 6 words, 0 modes, 14 rules)

- **Words: 7, possibly 8.** These are the 6, plus the one-off row's **`key`**, a field authors read, counted as
  `waiting` was. The `basedOn` rebase for plain transactions needs a version source that no contract declares
  today. If that is kept, it is an 8th word (M7). `Story.ending(O.x, "interrupt")` is a value of an existing driver,
  so it is not counted.
- **Modes: 0 after M1's fix, 1 before.** The key-less and keyed `cancel` in an ending differ after a release.
- **Rules: 14 written, plus 3 missing definitions:**
  - where cells apply in the turn (K13);
  - the terminal pass's `W` condition (K14);
  - the `cancel` and `allow` states (M3).
- **Table size.** 3 columns × 10 rows, and 22 reachable cells, under-count the states: 6 under `latest` and
  `serialize`, 3 under `reject`. K13's "promote at once" makes the three columns exact, and it removes the step-6
  refinement. That cuts one definition rather than adding one.

**State: 3 High findings (H1, H2, H3). Not zero.** All three are fixed by definitions (K13, K14), not by new words or
rules. After them, I expect a review with no Highs.
