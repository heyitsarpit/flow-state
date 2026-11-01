# Review 4 of operations-in-definition, revision 5 (2026-10-30)

One reviewer, correctness and authoring. These are suggestions, not decisions. OD1–OD5 are taken as fixed; this
review judges how revision 5 applies them and what they cause. Sketches are in the session scratchpad,
`ops-review-4/` (1-checkout-3ds, 2-per-field-autosave, 3-kanban, 4-search, 5-chat, 6-upload-queue). Findings fixed
in rounds 1–3 are not repeated.

**Verdict: another revision is needed, and it is small.** OD2, OD3 and OD4 are applied well. The verb now decides
one-off or live at every use. `VerbMismatch` closes review 3's mode (a). Field-list keys remove every closure and
every `thisX` in ending handlers. OD5 is applied faithfully in 3.8.1, but its consequences were not carried into
the proposal's own cases or into the members around it. Three new causes follow, and each needs one rule changed.
Two of the proposal's own cases now stop working: sign-in 5.2 cannot submit a code again after one unknown, and
kanban 9.4 drops moves silently. A third rule, `cancel` "empties its lane", silently drops the newer writes that the
hold made wait.

## Causes and fixes

| # | Cause | Findings | Fix at the cause |
| --- | --- | --- | --- |
| K4 | **The hold has no owner of its end.** Flow holds a retained unknown, but only the author's code can end the hold. Nothing checks that it is ever ended. The commits that wait behind it can't be seen: the row has no `waiting`, and memory flags such as `dirty` are cleared when the commit is made. | H1, H2, M1, M7, L4, L6 | **Add a `flow check` finding, `UnresolvedHold`** (spec below). It reads tokens only. **Add `waiting` to the write row**, or define `pending` as "sent or waiting work exists" and say so. Update 5.2 and 9.4, and add the `idle` guard to the `Loaded` handlers in 8.2 and 9.3. Keep the hold itself: OD5 and MD rule 25 leave no safe implicit default (see "The stuck lane" below). |
| K5 | **`cancel` names a lane, while `retry` names an Attempt.** Under `latest` and `serialize` a lane holds more than the addressable Attempt. Because `cancel` "empties its lane" (3.5, proposed), it also removes the waiting commit, and under the hold that commit is the user's newest intent. It ends silently, which contradicts MD rule 24 and C11 (`NotSent { why: "Cancelled" }`). | H3, the upload-queue bug | **`cancel` addresses the addressable Attempt, as `retry` does (N2).** It interrupts or releases that Attempt. A waiting commit is then sent, exactly as after a retry settles. An explicit `cancel(k)` outside an ending also ends a waiting commit, with `NotSent { why: "Cancelled" }` delivered (MD rule 24), never silently. This still has one meaning per member, so review 3's mode (c) does not come back. |
| K6 | **A key-less member's address depends on where the event came from at runtime, not on the token.** 3.3 says that, in a handler of an event several operations map, a key-less member of X "acts only if this turn's ending is X's". It doesn't say whether that applies to unkeyed operations. Each reading breaks one of the proposal's cases. Stories, `check()` and raised events have no ending at all. | H4, M2, L3 | **Allow a key-less member in exactly two places.** (a) On an unkeyed operation, it names the one lane everywhere (MD's meaning), and `flow check` warns `SharedEnding` when it stands in a handler of an event that other operations also map. (b) On a keyed operation, it may appear only in a handler of an event that this operation alone maps. Any other key-less member of a keyed operation is `KeyRequired`. Where handlers act on lanes, an event shared by several keyed operations must be split (5.3: `RenameUnsure`, `RemoveUnsure`). Nothing then runs as a no-op depending on runtime origin, and `flow check` can read every address. |
| K7 | **Some per-kind rules read closures or the store, where the proposal promised tokens and turns.** The domain default reads the entity from `.predicts`, which is a closure. The one-off read row is a passive read of an entry the lane does not hold. | M3, M4, L5 | The domain write names its entity as data. Either `write(moveCard, Card)`, or the default applies only to a `.predicts` whose entity is declared, `write(moveCard).of(Card)`. Proposed spelling only; the existing `.each({ of })` uses the same word. **The one-off row holds its entry** until the next lookup or `cancel`, so it changes only in the actor's turns. |
| K8 | **The hold assumes that queued writes depend on each other, and that the actor is the only writer.** | M5, M6 | Limit the claim to one actor (3.8.1). Say that a waiting commit's input is fixed when it is committed, so `If-Match` on top of the hold refuses every write that waited. Specify that for domain writes `basedOn` is computed at invocation. Write throttling as a stated limit: one-at-a-time sending of independent work is a memory queue in the machine. |

## The stuck lane (the author's question)

**Is it a silent wrong state or a deadlock?** Both, depending on the concurrency policy. It never deadlocks the
actor; it deadlocks one lane for good.

| Policy | What the user sees after a toast-only unknown | Kind |
| --- | --- | --- |
| `latest` | The next commit is accepted into the waiting slot. A domain write applies its prediction (M4 rules 28, 29), so the card moves on screen. `pending` stays true and the commit is never sent. On reload it ends `NotSent { Restored }` and the card jumps back. | **silent wrong state** (9.4, the chat edit in sketch 5) |
| `reject` | Every later commit ends `NotSent { Rejected }`, and an `idle` guard denies `Uncertain`. The handler maps `Rejected` to whatever message it already had. | **visible, with the wrong reason** (5.2: "Too many requests") |
| `serialize` | The queue grows behind the head until 64, then `Overloaded`. | silent, then loud |

**Should `flow check` catch it? Yes, and it can, from tokens alone.** Proposed `UnresolvedHold`. Take a write
operation X with `latest`, `reject` or `serialize` that maps `unknown` to event U. For each leaf where U can arrive,
follow every branch of U's handler that contains neither `X.retry` nor `X.cancel`. It passes if some transition
that is not an ending, and is reachable by state tokens from that branch's target, contains `X.retry(k)` or
`X.cancel(k)`. Examples are 8.2's `RetrySave`, 5.3's `ReconcileLike` schedule and 5.1's STUCK → READING →
`answered`. Severity:

- **Error** when no such member exists anywhere in the definition: 5.2, 9.4, sketch 5's edit.
- **Warning** when one exists but cannot be reached from that branch's target. Guards are closures, so
  reachability is over-approximated.

8.2, 9.3, 5.1, 5.3 and 8.1 pass. `flow explain` should print the hold:
`MoveUnsure (last branch)  holds move; nothing releases it`.

**Is there a better default? No.** I weighed three options:

- **Release implicitly when the handler neither retries nor cancels.** This brings back the late-landing race
  that OD5 closes, and it makes "do nothing" mean "give up". That is a hidden mode.
- **Retry implicitly.** MD rule 25 forbids it.
- **Release on state exit.** This ties a server fact to UI structure, and 8.2's hold is meant to outlive states.

The hold is correct as the default. What is missing is the check, plus a row that shows waiting work. Correctness
first means an explicit `cancel`, required by `flow check`, not a quieter default.

## Correctness

**H1 (K4). Sign-in (5.2) cannot submit a code again after one unknown, and resend breaks after one unknown
resend.** 5.2 was not updated for OD5. `verify` is `reject`, keyed by `challengeId`. Steps:

1. The verify ends unknown, and `CodeUnchecked` goes to ENTERING with "Couldn't check the code, try again".
2. Nothing retries or cancels it, so the lane holds.
3. On the next `Submit`, `O.verify.idle(thisChallenge)` denies `Uncertain` for the rest of the challenge.

The user must go back to the password step to get a new challenge. `resend` is `reject` and unkeyed, and
`ResendUnsure` is `{ target: "self" }`. The next `Resend` ends `NotSent { Rejected }` and is mapped to
`ResendRefused`, which reads "Too many requests, try again later". That is the wrong reason, and it repeats
forever. Fix: release the unknown in both handlers (`actions: [O.verify.cancel]`, `[O.resend.cancel]`). A failed
code check holds no server fact worth waiting for, and resending a code is safe to repeat. With that change,
`UnresolvedHold` passes.

**H2 (K4). Kanban (9.4) drops moves silently.** Steps:

1. `MoveUnsure` re-sends 3 times, then shows a toast.
2. Card c1's `move` lane holds for the rest of the session.
3. The user drags c1 again. The commit waits behind the hold, but its prediction shows (M4 rules 28 and 29: a
   waiting `latest` start joins the record queue), so the card sits in the new column with `pending: true`.
4. It is never sent, because no transition retries or cancels `move` outside its ending.

`LabelUnsure` has the same flaw. The 9.4 view reads `pending` only, so the stuck card shows as "moving" forever.
Fix: add `O.move.cancel` and `O.label.cancel` to the toast branches, and read `uncertain` in `CardView`.

**H3 (K5). `cancel` "empties its lane" silently drops the user's newer write.** 3.8.1 says it directly: in 5.3, "a
toggle made while a like is unknown waits in the lane". Steps:

1. The like ends unknown. The user unlikes, and the unlike waits.
2. The reconcile schedule re-sends 3 times without an answer.
3. `LikeUnsure`'s last branch runs `O.like.cancel`. That empties the lane, so the waiting unlike "ends silently"
   (3.5) and its prediction is removed.
4. The heart shows "liked". The toast says only "Couldn't confirm your like". The unlike is gone, with no ending.

The same happens in 5.3's `Unsure` (a rename made while an earlier rename is unknown) and in 8.4's `Unsure`. Under
unkeyed `serialize` the whole queue goes (sketch 6). Separately, ending a waiting commit silently contradicts MD
rule 24 and C11, which replaced OPS O7's silent cancel with `NotSent { Cancelled }`. K5's fix makes `cancel` act on
the addressable Attempt only, after which the waiting unlike is sent. Releasing the unknown keeps the residual risk
3.8.1 already states: the released write may land later.

**H4 (K6). Each reading of the shared-event rule breaks one of the proposal's own cases.**

- **Reading A: the rule applies to every key-less member.** 5.1's READING `Intent` is `read`'s ending, so
  `answered = [O.pay.cancel, O.challenge.cancel]` does nothing. `pay` keeps its unknown, and CARD's `Pay` is denied
  `Uncertain` for good. The checkout can never be paid again after "The payment did not go through. Try again."
- **Reading B: unkeyed members always act.** 8.4's `Unsure` lists `O.clear.cancel`, and `clear` is unkeyed. A
  `done` toggle that ends unknown then interrupts an unrelated `clearCompleted` in flight. That turns it into an
  unknown too, which delivers `Unsure` again and forces a repair of every predicted record.

Under either reading, a key-less `retryable` in a shared event returns an unspecified result when the ending
belongs to another operation. K6 removes the rule instead of choosing a reading:

- **Unkeyed members always name their one lane.** 5.1 keeps working. 8.4's `O.clear.cancel` then cancels `clear`
  whatever ended, which is a visible author bug, not a runtime no-op. `flow check` warns (`SharedEnding`) when an
  unkeyed member stands in a handler of an event that other operations also map, and 8.4 drops `O.clear.cancel`
  from that list or gives `clear` its own event.
- **Keyed members stand only in events that their operation alone maps.** 5.3 and 8.4 split `Unsure` per
  operation.

**M1 (K4). In 8.2 and 9.3, a held write's older text overwrites the draft while the newer text waits.** Steps:

1. `AutosaveDue` clears `dirty` and commits "A". "A" lands, but its response is lost, so it ends unknown.
2. The user types, and "AB" is committed and waits behind the hold.
3. The live `doc` pushes version 5 ("A"). `Loaded`'s guard sees `!dirty && 5 > 4` and sets the draft to "A".
4. The user's "B" disappears from the editor.
5. If the user types "C", "AC" replaces the waiting "AB", and "B" is lost for good.

Revision 4 had the same window, but only for the length of a request. The hold stretches it to the length of the
unknown, which can be minutes. Sketch 2 shows the per-field version. There, `updateMemory` has no lane accessor, so
the author writes `operations.save.find(...)`, which is the `find` that R16 bans. Fix in the cases: guard `Loaded`
with `O.save.idle(thisDoc)`. Fix at the cause: K4's `waiting` on the row, and `O.x.get(operations, k)` in callbacks
as well as in views.

**M2 (K6). Ending events that don't come from an ending.** A Story that sends `E.LikeUnsure({ id })` to drive a
state, a `check(s, E.MoveUnsure(...))` from a view, and a schedule or `raise` that emits a mapped event all reach a
key-less member that has no ending to address. Under 3.3 the member silently does nothing, so a Story and the
runtime diverge. Fix: Stories drive endings through the operation (`Story.ending(O.like, "unknown", { id })`, the
evidence 3.11 already names). A mapped event may not be the `send` of a schedule or a `raise` when its handler holds
a key-less keyed member. Both are checkable from tokens.

**M3 (K7). The domain default reads a closure.** "A domain write defaults to its entity's primary key" (OD4) needs
to know which entity. `write(moveCard).predicts(({ input }) => Card.patch(...))` says so only inside the closure.
The types can infer it from the return type, but `flow check` and Inspection cannot. That contradicts 3.11's "print
every lane's key without running code" and R10 for every domain write that relies on the default. It also means
S4's "a `latest` write without a key" error can't be computed from tokens. Fix: make the entity data on the domain
write (K7's fix).

**M4 (K7). The one-off read row changes outside the actor's turns.** 3.7 says a one-off lane "holds the entry only
while a lookup runs" and that the row is a passive read. After a search settles, `gcTime` ("2 minutes") collects the
entry. 3.4's own example, `s.operations.results?.data?.hits ?? []`, then empties in an idle search box, and another
actor's refetch of `{ q }` changes it too. That contradicts "Lanes change only in this actor's turns" (3.7), and a
Story can't reproduce it from the actor alone. 9.5 avoids the problem only because it copies hits into memory. Fix:
the operation holds its entry until the next lookup or `cancel`, so the row is a held read, the way a placement is.

**M5 (K8). The late-landing claim holds within one actor only.**

- **Two tabs.** Persistence O7 runs a second tab independently. Tab 1's "A" is unknown and held. Tab 2 saves "X" as
  version 6. An hour later, tab 1's user presses Retry. If the original "A" never reached the server, the retry
  applies it as version 7 and overwrites "X". Tab 2 is not dirty, so its live `Loaded` replaces the draft. Tab 2's
  edit is silently gone.
- **`If-Match` does not compose with the hold.** 3.8.1 offers `If-Match` as the layer on top. But "AB" was
  committed while version 4 was current, and its input is fixed then (rule 22). After "A"'s retry succeeds as
  version 5, "AB" is sent with `If-Match: 4` and refused with 412. So the layer refuses every write that waited.
  Review 3's H1 raised this ("its base is stale whenever the older write lands"), and revision 5 does not answer it.

Fix: limit the claim to one actor, and state the `If-Match` interaction. Specify that a domain write's `basedOn` is
computed at invocation, which already holds for retries under M4 rule 31's "same `basedOn`" and has to be decided
for first sends of waiting writes. For plain transactions, say that the version must be read in the commit function
at send time, not in the select.

**M6 (K8). Under `serialize`, the hold blocks independent work.** Sketch 6 sends 20 photos one at a time. With
unkeyed `serialize`, photo 3's unknown holds photos 4 to 20 (3.8.1, proposed). With `key: ["ref"]` there is no
throttle, and `allow` has neither throttle nor hold, so "one at a time, independent" can't be written. That is
right as a cut, but it needs saying. Recommendation: keep `serialize` holding, since an unkeyed FIFO is "one thing"
under OPS O1, and record the memory-queue pattern (commit the next file on `Uploaded`) as the throttle in
`revisit.md`.

**M7 (K4). Partial mappings.** S10 says "a bare write's unknown is not retained". It doesn't cover a write that maps
`success` and `failure` but not `unknown`, which 9.4's `label` style allows. If that unknown is retained, no handler
ever sees it and the lane holds forever. If it isn't, then whether a write holds depends on which keys are mapped.
That is review 3's mode (a) again, moved from reads to writes. Fix: a non-bare write on a holding policy must map
`unknown` (a declaration error otherwise), and S10 depends on "maps nothing" only.

**L1.** 3.10 says a never-sent waiting commit "ends ... as interrupt". MD C2 replaced `interrupt` with
`NotSent { why: "Restored" }`. Under that rule, 8.2 after a reload mid-flight shows "Not sent (Restored)". The
autosave is armed only on `Typed`, so "AB" stays unsaved until the user types again. 9.3 re-arms through its keyed
schedule. Nothing is lost, but 8.2 should re-arm on `SaveFailed`.

**L2.** The 0.2 table says "a newer commit never releases an unknown (OD5)". 3.8.1 rule 5 proposes that under
`cancel` concurrency it does. State the exception in 0.2.

**L3.** After an explicit `cancel`, an in-flight Attempt's unknown is "delivered once and not retained". It reaches
the same handler as a retained unknown. In 5.1, `TookTooLong` leads to UNSURE, then 3 seconds pass, then
`retryable` denies `NothingToResend`, then STUCK. That works, but it wastes a step, and the handler can't tell the
two cases apart. A guard on `uncertain`, or the mapper's `reason`, would tell them apart.

**L4 (K4).** 5.4 sets a post to `"unsure"`, but `Bubble` renders only sending and failed, and `Resend` accepts only
`"failed"`. An unconfirmed message looks delivered, can never be re-sent, and its lane is persisted forever.

**L5 (K7).** M7 of review 3 is reduced less than 3.4 says. TypeScript is structural, so `O.move.get(s, column)`
type-checks because a column carries `id: string`. "A record of another entity" covers any record with an `id`.
Branded keys would fix it, but that is not proposed.

**L6 (K4).** In 8.2, `Close` is denied `Uncertain` for as long as the server is unreachable, and there is no discard
path. If that is intended, say it. Otherwise, add `Discard: [O.save.cancel(thisDoc)]`.

**Q27.** Recommendation A (`params: Schema` on a resource) is sound only where entries persist. A live placement
re-opens from params that the select computes again from restored memory, so most reads need no key Schema. Choose
A, but make it optional.

### The verbs (OD2): does the verb decide everywhere?

Yes. Every use is one token, `commit`, `lookup` or `subscribe`/`subscribe.each`, and the mapping only restricts it
(S11). A bare or failure-only resource may take either verb, and the rows agree (S12). Two verbs on one operation are
`VerbMismatch`. I found no case where the mapping still changes behaviour for reads. The leftover (M7) is on the
write side, in what the mapping does to the hold.

### Field-list keys (OD4): one event, several operations

5.1's `Intent` (three operations), 5.3's `Unsure` and `Failed`, and 8.4's `Unsure` are all affected. H4 and M2 are
the findings. Two smaller frictions:

- Keys whose fields come from two sources (memory `docId`, event `field`) still need a hand-built record (sketch 2:
  `thisField`, and the view's `{ docId, field: "title" }`).
- Ending payloads still copy the key (`FieldUnsure { field }`, `MoveUnsure { cardId }`) whenever the handler updates
  memory per thing. OD4 removed the key from members, not from bookkeeping.

## Authoring

Sketches are under revision 5. "Bugs" counts silent wrong states that the code as written allows.

| App | Ops | Friction | Bugs |
| --- | --- | --- | --- |
| 1 checkout 3DS (+ "use another card" from STUCK) | 3 | Key-less members in the three-operation `Intent` handler are ambiguous. The author must know to release after a read. A "use another card" escape that releases the unknown reopens the double charge, and nothing flags it. | 1 under reading A (H4) |
| 2 per-field autosave | 2 | Key copied into payloads. A hand-built key record twice. No lane accessor in `updateMemory` (`find`). | 1 (M1) |
| 3 kanban (+ comments panel) | 4 | The default key isn't readable by tools (M3). One lane per one-off read means a side-by-side view needs two operations. | 1 in 9.4 itself (H2) |
| 4 search | 1 | Two tags for "my lookup runs", and `Refreshing` also means another actor's refetch. | 0, or 1 when reading the row (M4) |
| 5 chat (+ edit my message) | 4 | No way to say "the feed echo answered the unknown" except `cancel`, which re-delivers an unknown from an in-flight retry. | 2 (L4; a toast-only `EditUnsure` holds edits, H2's shape) |
| 6 upload queue (new) | 2 | A throttle can't be written (M6). `cancel`'s scope under `serialize` is unclear. | 1 (H3 under `serialize`) |

The writing is shorter than in revision 4 everywhere: no closures, no `thisX` in endings, and no mirrors. Almost all
of the friction is new rules that the author must hold in mind. None of it is extra syntax.

## Concept count (0.2 claims 4 words, 0 modes, 10 rules)

- **Words: 4, which is fair.** They are `retryable({ times })`, `get`, `.outcomes()` and `subscribe.each`. Q27 A
  would add `params` on a resource, making 5. Authors meet the codes (`Uncertain`, `KeyRequired`, `VerbMismatch`,
  `Released`) but don't write them.
- **Modes: 2, not 0.**
  1. **A key-less member** names the lane (unkeyed), this ending's Attempt (keyed, own ending), or nothing (keyed,
     in another operation's ending) depending on the event's runtime origin. 0.2 calls this borderline, but it is
     a mode by 0.2's own definition, and K6 removes it.
  2. **Whether a write holds depends on its mapping**: bare never holds, mapped holds, and partial mapping is
     undefined (M7). M7's fix removes it.
- **Rules: about 16, not 10.**
  1. Lane identity per kind.
  2. Rows per kind, with `get` returning the idle row or `undefined`.
  3. Replacement per kind.
  4. The verb agrees with the mapping, and one operation uses one verb.
  5. `cancel` per kind and lane state (three outcomes on a write, one on a read).
  6. The hold per policy (`latest` and `reject` hold, `serialize` holds, `allow` doesn't, and under `cancel`
     concurrency a newer commit releases).
  7. `idle`'s two denials.
  8. Where a key-less member may stand.
  9. The domain default's conditions.
  10. Keyed schedules use key records and may read `operations`.
  11. `restartOn` per key, with `armOn` banned.
  12. A bare write's unknown is not retained.
  13. One-off lanes are not persisted.
  14. S4 at the operation.
  15. S6.
  16. Under `cancel` concurrency an interrupted Attempt is evidence only, while an explicit `cancel`'s is
      delivered once.

  Rules 14 and 15 predate revision 5.
- **Honest count: 4 words, 2 modes, about 16 rules.** K5 shortens rule 5 (one address, as with `retry`), K6 shortens
  rule 8 and removes mode 1, and M7's fix removes mode 2. That leaves 4 words, 0 modes and about 15 rules, and each
  of those rules can be checked from tokens.
