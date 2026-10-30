# Review 2: operations in fragments, revision 2 under F8

**Status: advice to the main session.** Nothing here is decided. Reviewed: [../proposal.md](../proposal.md) revision 2
(commit `0f6b1a4a`) under F1–F8 ([../decisions.md](../decisions.md)); F8's Q11–Q13 are read as decided (all A), though
the proposal still shows them as open. Checked against [../../machine-design.md](../../machine-design.md) (rules 1, 6,
9, 14, 17, 20–24, 37, 42, 44–46; 2.5; 2.7.13–2.7.15) and OD1–OD26. Review 1's sketches (`upload.ts`, `follow.ts`,
`comments.ts` in the review-1 scratchpad) were walked again under revision 2 plus F8. Nothing was type-checked.

## Verdict

**Not yet ready. There are four Highs, not zero.** Review 1's two Highs are closed in principle: the subject on the
lane (FO3) ends the shared-lane deadlock, and FO4 states what freeze and thaw do. Every review 1 Medium and Low is
closed or replaced by a narrower item below. The new Highs come from two places. Three come from F8: "release on
leave" is written as a keyed member call, but it is really a standing property of the subject's lanes (H1). The
proposal recommends it for like and follow, where it loses the user's writes (H3). The subject is defined per
placement, not per placement path (H4). The fourth is review 1's H2 one step on. Freeze makes a released lookup
evidence, and with no thaw event (Q13) a fragment can wait forever (H2). Each fix is a sentence or a table row. Only
H1's recommended form touches public syntax.

**Highs: 4** (H1–H4). **Mediums: 3. Lows: 7.**

## Review 1: what is closed

| RV1 | Revision 2 | Walk under rev 2 + F8 | Status |
| --- | --- | --- | --- |
| H1 many copies, one lane | FO3 subject on the lane; decline | follow-author per post: P1 commits (subject P1), unknown, P1 removed (parked for P1); P2's toggle ends `NotSent { Rejected }` → `Failed` toast; no `W`, so no record-queue join (rule 28) and no cross-actor wait; P2's `retry(own)` is `NothingToResend` | **closed** for one level; **H4** for nested placements |
| H2 freeze/thaw reads | FO4: release at freeze, re-place at thaw; Q13: no `Flow.entry` | comments panel on a tab (`.resumable()`): list re-placed at thaw, `Listed` prunes drafts, parked `Posted`/`PostUnsure` delivered at thaw, `resendPost` re-keys. Good. LiveFeed ticket: stuck `"owed"` (H2 below) | **partly**: subscriptions closed, lookups not |
| M1 chain | FO0 reads the whole path | `Autosave.resumable()` in a subroutine: construction error | closed (H4 is about what the chain *means*) |
| M2 `Fragment.O` for reads | write lanes only (FO2) | two `LiveFeed`s read by instance path | closed |
| M3 creating raise | FO6 order + `idle` default | composer `Attach` + raise meets an adopted hold: denied, not `NotSent` | closed (L1: FO6's list omits reset) |
| M4 upgrade | 2.5 key equality | 4.1 `docId` hold adopted by copy `d1` | closed for 4.1; **M3** for the other shapes |
| M5 requirements | FO9 carries `R` | host Story without `UploadApi` fails to type | closed |
| M6 stranded unique key | FO8 structural warning; Inspection "unplaced" | composer `Remove` without `idle`: warned | closed for `.each`; **M2** for `resetOn` |
| M7 thing changes in life | Q11, Q12 (F8) | avatar as a root trait with `resetOn`, or `.each` of one with release: both shorter | closed, given H1's fix |
| M8 two placements | fold pattern stated (FO3) | profile header folded into suggestions | closed (stated cost) |
| M9 adopted `Conflict` | `mine` from `input.body` | copy removed, 412, re-added: user's text kept | closed |
| L1–L6 | `Reconnect` guarded; ticket `.resumable()`; FO8 vacuity stated; `keys` read own rows; released-landing comments; FO2 says hosts ask | each walked | closed |

## Root causes

**R1. Release on leave is a property of the subject's lanes, but it is written as one member call** (H1, H3). The 2.4
row describes Runtime behaviour that outlives the turn: an interrupted Attempt is "released when it lands". But the
syntax is `O.x.cancel(k)`, a member with a key select that rule 22 evaluates in step 5 of the leaving turn. Nothing
records the intent on the lane. The key names one lane, while a subject can own many. Endings already parked for the
subject are not covered.
*Fix:* release on leave is a **Runtime step over every lane of that operation whose subject is the ending
incarnation's**, recorded as a mark on the lane record. It is not a member evaluated against memory.

**R2. The subject is defined per placement kind, not per placement path** (H4, M1, M3). "Nothing for a root trait"
holds only when the root trait is at the actor's root. FO0's chain rule admits a root trait inside an `.each` copy,
and there "nothing" is shared by every copy.
*Fix:* the subject is the **list of subject parts from the actor's root to the placement**. Each `.each` contributes
its copy key, each `resetOn` its reset value, and any other placement nothing. It is persisted as a string array.

**R3. "No thaw event" is safe only if every wait that a freeze cuts ends in a delivery** (H2). FO4 makes a
freeze-released lookup `Superseded` evidence. But rule 17 lists only "a newer lookup or `cancel`" as releases that
make evidence, so a freeze is not one of them.
*Fix:* a lookup cut by a freeze **ends**. It ends `failure { Interrupted }`, which rule 37 already forces every read
to map, and is parked for the thaw.

## High

### H1. Release on leave, as written, releases the wrong lane, refuses the removal, or is lost after landing

Q12's sample, in `upload.trait.ts`:

```ts
whenAbandoned: [O.put.cancel(({ memory }) => ({ ref: memory.ref }))],   // existing: whenAbandoned, cancel; NEW MEANING (F8): release on leave
```

Four failures, each from text the proposal has now:

1. **The key select reads after memory.** Rule 22 and 2.5's table put "retry and cancel key selects" on after memory.
   A `.from` mapper in `whenAbandoned` reads before memory; a member there has no rule.
   - *`.each` removal:* the copy is dropped from after memory, so the select has nothing to read. That is a failing
     select, so `InvalidTurn`. The host's `Remove` (or the avatar's `Choose`) is refused every time.
   - *`resetOn` reset (Q11):* the trait's after memory is the **new** incarnation's. `memory.ref` names subject B's
     lane. The ending incarnation is subject A, so FO3 declines the `cancel` ("nothing, with evidence"). A's write is
     never released. FO9 still says "releases on leave", so FO8's warning is suppressed. For a domain write the hold
     keeps the record's uncertain mark, and any queued `W` blocks every other actor's write to that record until the
     actor ends (MD 2.7.13). That is a silent cross-actor wait.
2. **One subject, many lanes.** The comments panel and the section 5 composer have one subject (the thread) and one lane
   per `clientId`. A keyed `cancel` releases one of them; the rest strand.
3. **The release of an Attempt on the wire is decided at landing, and nothing records it.** The row says "the ending
   that lands with no incarnation of that subject is applied and then released instead of parked". Take a persisted
   identity that reloads, or a Runtime that is disposed, before the interrupt's ending is admitted. The restore row
   delivers `unknown { Restored }`; no incarnation has the subject, so FO5 **parks** it as `Held`. The avatar ref never
   returns, so the lane record is `Held` forever and `runtime.unsettledWrites()` is never empty. A re-add in that window
   is also unspecified: it adopts the lane (FO6), and nothing says whether the release still applies.
4. **Endings already parked for the subject.** A `.resumable()` trait is frozen. Its upload lands while it is frozen,
   so the ending is parked. It is then reset on return (rule 1 runs `whenAbandoned` then). The `cancel` finds the lane
   `Idle` and does nothing, and the parked ending stays: the record counts as non-`Idle` "until delivered", which is
   never.

*Fix (2.4 row, rules 6, 22, 24 and 46; the syntax part needs the owner):*

```ts
// before (revision 2): a keyed member in whenAbandoned
whenAbandoned: [O.put.cancel(({ memory }) => ({ ref: memory.ref }))],   // existing: whenAbandoned, cancel; key select reads after memory (rule 22)

// after (proposed): key-less; it names every lane of `put` whose subject is this incarnation's
whenAbandoned: [O.put.cancel],                                           // existing: whenAbandoned, cancel; NEW MEANING: release this subject's lanes on leave
```

Replace 2.4's "release on leave" row with this text:

> When an incarnation ends by removal, leaving or reset (not freeze or actor disposal), each lane of a listed
> operation whose subject is its own is marked **releasing** on its lane record (persisted, like the subject). In the
> leaving turn's step 5, a `Held` lane is released (`Released`). A waiting Attempt that was never sent ends
> `NotSent { Cancelled }` (evidence). Every `W` entry ends `NotSent { Cancelled }` (evidence). An Attempt on the wire
> is interrupted. Endings already parked for that subject become evidence. An ending that later reaches a releasing
> lane is applied to the lane and the store and then released, never parked. That includes a restore's
> `unknown { Restored }`. An incarnation of the same subject that starts before the lane is `Idle` clears the mark and
> adopts the lane (FO6).

Then FO9's flag reads "releases on leave", per operation. 2.7.14 is unchanged inside the fragment: release on leave is
not an owner while the incarnation lives. FO8's structural warning is suppressed only for operations that are listed.
**Public API:** the key-less form, with OD8's `KeyRequired` lifted for `whenAbandoned`. If the owner wants the keyed
form kept, the minimum fix is "a member in `whenAbandoned` reads the ending incarnation's pre-turn memory". That fixes
failure 1 only, and failures 2–4 still need the mark.

### H2. A lookup cut by a freeze is evidence and there is no thaw event, so 4.2's ticket stays "owed" forever

The ticket's feed is `LiveFeed.resumable()` on the Discussion tab. `resync` is one-shot (`"5 seconds"`,
`armOn: [E.Missed, E.CatchUpFailed]`). Walk:

1. `Missed` at t0: status `"owed"`, lookup L1, and `resync` armed for t0+5.
2. `CaughtUp { complete: false }`: lookup L2, with no re-arm (the second alternative). The pages keep coming.
3. At t0+5, `ResyncDue` finds a lookup in flight. `O.catchUp.idle` denies it, the second alternative is `self`, and
   nothing re-arms.
4. At t0+7 the user opens Details, which freezes the trait. The lookup in flight is released as `Superseded` evidence
   (FO4).
5. The user returns. Thaw re-places the session from `at`, but no schedule is armed, no `CatchUpFailed` comes, and
   `Flow.entry` does not fire (Q13). Status stays `"owed"` and `Message` only merges, so `at` never advances. `tries`
   is reset only by `advance`, so after five drops in total the feed goes `"offline"` for good, and every thaw
   re-subscribes from the old `at`.

FO4's claim that "4.2's `resync` is that schedule" does not hold. The before form (`Schedule.spaced` in `OWED`) did
not have this bug. The general fault is that FO4 contradicts rule 17: a freeze is not one of the releases rule 17 makes
evidence.

*Fix (FO4, rules 17 and 42; no public API):* "Freezing ends the incarnation's one-off lookups with `failure {
Interrupted }`, parked and delivered at the thaw with the other parked endings. Subscriptions are released and placed
again at thaw." Rule 37 already requires `Interrupted` to be mapped, so 4.2's `CatchUpFailed` runs at thaw and arms
`resync`. Every fragment then recovers without a thaw event, and Q13 A becomes safe in general. Add the walk above to
FO10.

### H3. Q12 is recommended for like and follow, where leaving the list loses the user's write

Q12 (and 2.8, 4.4's comment, 4.5) says release on leave "removes 4.4's keep-busy line: a like whose issue leaves the
board is released". But the decided row interrupts an Attempt on the wire and ends a queued `W` with `NotSent {
Cancelled }`. Walk on the board: the user likes X. Within the request's 200 ms the board's subscription pushes a list
without X (someone moved it), so copy X is removed. The like is interrupted; if it had not reached the server, it is
lost. The store keeps the prediction until a forced repair, and the repair shows "not liked". No incarnation exists,
so no toast is shown. A second toggle queued behind a held one is dropped in the same way. This is a silent lost write,
and it comes from following the proposal's guidance.

*Fix (text only; no API):* release on leave is for work that is **worthless once its subject is gone**, such as a
replaced avatar, a discarded draft or a removed attachment. It is not for user intent that must survive a list
refresh. Keep 4.4's keep-busy line and the follow button's line. Change 2.8's first row to "keep for like and follow;
Q12 removes the raise-to-cancel for upload". Remove "Q12 would remove this line" from 4.4 and from 4.5's third bullet.
State this rule of thumb beside Q12's decision text.

### H4. A writing root trait inside an `.each` copy has subject "nothing" in every copy, so endings reach the wrong copy

FO0's chain rule admits this shape: an `.each` copy, with a root trait of the copied fragment under it. FO3 gives the
inner trait the subject "nothing". So every copy's inner incarnation has the same subject, at the same placement.

```ts
// issuerow.trait.ts    // user-defined: IssueRow, places LikeButton at its root
export const IssueRow = trait(
  { id: "IssueRow", memory: { id: Flow.input(Schema.String) }, traits: { like: LikeButton } },   // existing: traits in a fragment
  () => ({ traits: { like: { input: ({ memory }) => ({ id: memory.id }) } } }),
)
// board.definition.ts
traits: { rows: IssueRow.each({ of: "issueIds", max: 500 }) },                                  // existing: .each
```

Walk:
1. Row X's like ends unknown, and its lane (board, `issues/set-like`, `{ id: X }`) records the subject "nothing".
2. X is removed. Y is live at the same placement with the same subject, so Y is the binding incarnation (FO5). X's
   parked and later endings go to Y.
3. Y's `LikeUnsure` takes the key-less `retryable` for X's Attempt, and `reconcile` arms in Y. `retry(own)` names Y's
   key, so the result is `NothingToResend`. X's hold is never re-sent, and Y's `onFailed` toasts for X.
4. While both are alive, the same ambiguity applies to the current endings. FO11's row for Y also lists X's lanes.

*Fix (FO3, 2.5, rule 46; no public API):* R2's subject path. X's like has subject `["X"]`, which is inherited from the
`.each` above it. A root trait at the actor's root keeps `[]`. If the owner prefers to forbid the shape, FO0 must say
"a root trait only at the actor's root or at the root of a root trait". That forbids composing a writing trait inside
any copied fragment, which is a large cut.

## Medium

**M1. The decline and its checks are scoped to `.each`, but under F8 `resetOn` also gives a subject.** FO3's
parenthetical, its authoring rule, 2.6 and amendment 17 say ".each". Scenario: a writing trait with `resetOn` whose
reset value does not decide its key. Examples are a selection's bulk write reset on the list query, or a form reset
per session. Incarnation 2 is declined `NotSent { Rejected }` until the old reset value recurs, because a parked ending
keeps the lane non-`Idle` (L4). Under `latest`, `NotSent` is not required today, so an unmapped decline leaves the
handler's `"saving"` status forever and `flow check` passes. *Fix:* in FO3, rule 20 and amendment 17, replace "under
`.each`" with "on every placement whose subject path is not empty". Write the authoring rule as "**a write key belongs
to one subject**: decided by it (`docId`), or unique within it (`clientId`)". No API.

**M2. FO8 has no case for `resetOn`.** Reachability is vacuous, as it is for `.each`: the next incarnation must have
*the same reset value*. Which transitions change the value is a closure, so no structural check exists. Scenario: an
editor that switches documents without an `idle` guard, where A's held save is never seen again. *Fix:* FO8 states
this case. The documented default is Q11's sample: the transition that changes the reset value guards with
`Fragment.O.x.idle` for the current subject, unless the fragment releases on leave. Add the Story walk "A, B, A adopts
A's save". Inspection's "unplaced" lane covers the rest. No API.

**M3. 2.5's upgrade rule covers one shape.** It dropped review 1's condition that `by` names the contract's single key
field. If `by: "tabId"` and the key is `["docId"]`, the adopted hold is given subject `d1`, which no copy has, so it is
parked forever and not `orphaned`. The rule also does not cover Q11: a version that adds `resetOn` (a subjectless lane
meets a valued subject), one that removes it (a subject the root can no longer produce), or a subject path that
changes length (H4). *Fix:* "A lane whose recorded subject path has a shape the placement cannot produce is adopted by
key equality only when the placement's last subject part is the contract's single key field (`by` for `.each`, or the
reset value for `resetOn`). Otherwise it goes to `orphaned` (P19)." No API.

## Low

- **L1.** FO6's list of starts ("an entry, a copy added, a thaw, rebind or restore") omits **a reset**. 2.3's
  `resetOn` row says a return adopts, so add the reset to FO6 and to amendment 21.
- **L2.** 2.4's "member from another subject" row omits `retryable`. It should deny `NothingToResend`. Otherwise a
  retry-budget branch shows `"saving"` for a re-send that does nothing.
- **L3.** Q11 requires a string reset value, but MD's own `resetOn` returns arrays (3.4's pager). Say that a
  non-string `resetOn` on a fragment owning a mapped write is a type error, with the remedy (a joined key).
- **L4.** FO3 says the subject "stays until the lane is `Idle` again", while a record that holds only a parked ending
  "counts as non-`Idle`" (MD 2.7.13). Say "until `Idle` with no parked ending", which is what M1's scenario relies on.
- **L5.** `.each` together with `resetOn` on a writing fragment is not mentioned by F8's FO0 text. Say whether it is
  allowed. With H4's path the subject is `[reset value, copy key]`, so it is safe.
- **L6.** In review 1's `upload.ts` under Q12, a removed or replaced uploading copy frees a throttle slot, but
  `onIdle` is not notified, so queued files can starve. The fragment's `whenAbandoned` should list `callbacks.onIdle`
  beside the `cancel`.
- **L7.** F8 is not reflected in the text. Section 0 ("F7 … `cancel` in `whenAbandoned` deferred"; "owner questions"),
  the header's "only if the owner accepts Q12", FO0 ("Q11 would admit"), FO3/FO8/FO9/2.3/2.4/2.7 ("under Qn",
  "Q12 only"), 2.8's "owner" decisions, section 5's avatar and editor rows ("not in v1"), amendment 33's two "only"
  clauses, risk 2, and section 9.

## Lifecycle walks under F8 (what holds)

| Placement | Enter, leave, re-enter | Copy removed, re-added | Reset (Q11) | Actor dispose | Reload, rebind | Release on leave (Q12) |
| --- | --- | --- | --- | --- | --- | --- |
| Root trait at the actor's root | n/a | n/a | A → B: A's lanes parked; B's own keys proceed; A again adopts | OD19, unchanged | holds | at reset: **H1** |
| `.each` copy | holds (FO6) | holds, one level (FO3) | n/a | OD21 | holds | at removal: **H1**; like/follow: **H3** |
| `.resumable()` | subscriptions hold; lookups **H2** | n/a | reset on return: whenAbandoned runs; parked endings **H1.4** | as root | holds | not on freeze (correct) |
| nested (root trait in a copy) | **H4** | **H4** | **H4** | as above | **H4**, M3 | as above |

The reset cases: a reset while a write is held parks the hold for the old subject, and nothing is lost. An adopted
ending for the old subject reaches only a later incarnation with that reset value (FO5 plus the path). It is never
delivered to the new subject, because the decline and delivery are both by subject. `cancel` in `whenAbandoned`
against a hold is correct once H1's mark is in. A parked ending is turned into evidence by H1's row.

## The rules against rules 17–24, 37, 42, 44–46 and OD19–OD26

- **FO3 against rule 21 and OD20:** consistent. The subject is extra lane data; identity is unchanged. The decline uses
  existing endings (rule 16).
- **FO4 against rule 17:** **inconsistent** (H2). A freeze is not one of rule 17's evidence releases.
- **The 2.4 release row against rules 22 and 24:** inconsistent (H1.1). Against OD6, it is consistent once the release
  is declared per operation and marked on the lane, so the release is declared, not quiet.
- **FO6 against rule 44:** consistent, apart from L1.
- **FO8 against rule 45 / 2.7.14:** consistent for nodes and `.each`. `resetOn` is missing (M2).
- **Rule 20 with F8:** the `NotSent` requirement must follow the subject, not `.each` (M1). Adopted-ending handling
  over the trait's own `on` is unchanged. A releasing lane delivers nothing, so it adds no arrival.
- **`UnresolvedHold` with F8:** unchanged inside the fragment. At the host, the summary's "releases on leave" may
  suppress FO8's warning only if the release cannot be lost (H1.3).
- **Rule 46 / 2.7.15:** the lane record must carry the subject path (H4) and the releasing mark (H1). Both are
  strings or flags, so they decode without the machine (Q-f holds).

## Visibility

- **`flow check`** sees F8's additions through FO9. It cannot see M1's or M2's mistakes (both are closures). Stories
  and Inspection catch them.
- **Inspection** lists lanes with subject and "unplaced". Add "releasing".
- **Stories** (FO10) should add: H2's walk; H1's "removed during upload, reload, nothing parked"; H4's "two rows,
  one removed"; M2's "A, B, A".

## The amendment list (section 7): what F8 adds

Missing, in MD order:
- **rule 1:** `resetOn` on a fragment that owns a mapped write: a string reset value that is a subject part, and
  `whenAbandoned` with release runs on reset. Also "thaw does not fire `Flow.entry`" (Q13; 2.2.1 already implies it).
- **rule 6:** `whenAbandoned` may list a key-less `O.x.cancel` (H1).
- **rules 17 and 42:** a lookup cut by a freeze ends `Interrupted` at thaw (H2). This replaces amendment 20's "at
  freeze".
- **rule 20:** `NotSent` per subject (M1).
- **rule 22 / 2.5's table:** only if the keyed form is kept (H1).
- **rule 24 and 2.7.13:** the releasing mark and its cells.
- **rule 44:** "a reset" in FO6 (L1).
- **rule 45:** FO8's `resetOn` case (M2).
- **rule 46:** the subject path and the mark.

Amendment 33's two "only" clauses become unconditional.

## Concept count

There are no new words. The concepts are the **subject** (a path, after H4), the **binding incarnation**, the
**unplaced lane** and, from F8, **release on leave** (a lane mark). After the fixes: one existing word in a new place
(key-less `cancel` in `whenAbandoned`), one new place for `resetOn`, and one changed ending (a freeze-cut lookup). That
is the smallest set that covers F8 correctly.

## Ready for acceptance

**There are four Highs, so the proposal is not ready yet.** After H1–H4 (two sentences each, plus 2.4's row), the
proposal is ready. The only remaining owner question is H1's key-less form; its fallback works without it but fixes
only failure 1. The rest is polish: M1–M3, L1–L7, and the F8 edits in L7.

## For `revisit.md` (proposed, not written there)

- Releasing without interrupting (let the request finish, and release only the hold), if a real case needs it beside
  H3's rule.
- An age bound on a parked ending whose subject never returns (risk 6). Today it is bounded only by distinct keys.
