# Review 3: operations in fragments, revision 3

**Status: advice to the main session.** Nothing here is decided. Reviewed: [../proposal.md](../proposal.md) revision 3
(commit `6634030b`) under F1–F9 ([../decisions.md](../decisions.md)), read end to end once. Checked against
[../../machine-design.md](../../machine-design.md) (rules 1, 6, 9, 10, 14, 16, 17, 20–24, 41–46, N1–N3; 2.5 steps 3–6;
2.7.13's dispose, rebind and restore rows; 2.7.14) and OD1–OD26. Review 1's sketches (`upload.ts`, `follow.ts`,
`comments.ts`) were walked again under revision 3. Nothing was type-checked.

## Verdict

**Not zero Highs: there is one High (H1).** Review 2's four Highs are closed as written. The new High is review 2's
H2 one step further on. A freeze-cut lookup's `Interrupted` is parked, but read lanes are never persisted (rules 42 and
46), and FO4 does not say where the parked ending lives. So a reload while frozen loses it, and 4.2's ticket is stuck
`"owed"` again. The same sample also strands a live, unfrozen feed across a reload, which the host-only form does not.
The fix is one sentence in FO4 and one line in 4.2. No public API changes.

**Highs: 1. Mediums: 3. Lows: 11.**

## Review 2: what is closed

| RV2 | Revision 3 | Walk under rev 3 | Status |
| --- | --- | --- | --- |
| **H1.1** select reads after memory | FO12: key-less, no select, a Runtime step | `.each` removal: no select, so no `InvalidTurn`; `resetOn` reset: marks path `["a"]`, not the new incarnation's | **closed** |
| **H1.2** one subject, many lanes | "every lane of that operation whose subject path is the ending incarnation's" | composer per thread: every `clientId` lane of `[threadId]` is marked | **closed** (see M1 for the guidance) |
| **H1.3** release lost at landing or reload | mark persisted on the lane record; restore row in the releasing table | avatar copy removed mid-upload, reload: `unknown { Restored }` applied, then `Released` evidence; `unsettledWrites()` empties. Re-add in the window: rebind row clears the mark, adopts | **closed** (L5: capture order) |
| **H1.4** endings already parked | mark row, `Idle` column | resumable upload frozen, lands (parked), reset on return: `whenAbandoned` runs (MD rule 1), parked ending becomes evidence, record removed | **closed** |
| **H2** freeze-cut lookup | FO4: ends `Interrupted`, parked, delivered first at thaw | ticket walk: t0+7 freeze cuts L2; at thaw `CatchUpFailed` → `resync` arms → `ResyncDue` while owed and idle → catch-up. Overdue timers fire once on return (MD rule 1) | **closed in memory**; **H1** across a reload |
| **H3** release for like and follow | FO12 "only for worthless work"; 2.8, 4.4, 4.5 corrected | board: X leaves the list mid-like, keep-busy line keeps the copy; no release | **closed** (M1: one residue in section 5) |
| **H4** subject per placement | FO3 path; 2.10 walk | two rows X, Y: X's lane `["X"]`, parked on removal, Y untouched, X re-added adopts | **closed** (L1: walk wording) |
| M1 decline scoped to `.each` | FO3, rule 20, amendment 19: "path not empty" | selection reset on query: decline mapped by rule 20 | closed |
| M2 FO8 no `resetOn` case | FO8 third bullet, Story walk | editor A, B, A | closed (L8: section 5 wording) |
| M3 upgrade shapes | 2.5 | 4.1 `by: "docId"` adopts; `by: "tabId"` orphans | closed (L3: bare-string `.each`) |
| L1–L7 | FO6 reset; 2.4 `retryable`; FO0 string `resetOn`; FO3 "no parked ending"; FO0 `.each` + `resetOn`; FO12 sample `onIdle`; F8/F9 throughout | composer under release: the removed copy's `onIdle` raises `Start` into the first queued copy; the interrupted put's `Stopped` lands on a releasing lane as evidence, so `onIdle` is not fired twice | all closed |

Review 1's sketches under revision 3: `follow.ts` follow-per-author, declined with `NotSent { Rejected }` (path
`["P2"]` ≠ `["P1"]`), mapped by rule 20's widened list. `comments.ts` is resumable on a node with no `resetOn`, so its
path is `[]` and no decline can occur. Its thaw delivers parked `Posted`. `upload.ts` uses key `["ref"]`, so a
replaced avatar never shares a lane with its successor. Under key `[]` it would, and FO3 declines the successor (L10).

## High

### H1. A freeze-cut lookup's parked `Interrupted` is not persisted, so a reload reopens RV2 H2

FO4 says the ending "is parked and delivered at the thaw". Write endings are parked on lane records (OD22), which
persist. A one-off read has no lane record, though. MD rules 42 and 46 say "one-off read lanes are not persisted", and
MD 2.7.15 says "on restore the row is `undefined` and nothing is delivered, so a state that was waiting for a lookup
must look up again". FO4 does not say where the parked read ending lives, so it falls under that rule.

Walk (4.2's ticket, a persisted identity):

1. Steps 1–4 of RV2 H2's walk: `"owed"`, `resync` already fired and was denied, then the freeze cuts L2. The
   `Interrupted` ending is parked.
2. The page reloads while the user is on Details. The frozen slice is restored (Persistence O2). The parked
   `Interrupted` is not, since nothing says it persists.
3. The user opens Discussion. At thaw nothing is delivered, no schedule is armed, and `Flow.entry` does not fire (F8).
   Status stays `"owed"` for good, which is RV2 H2's end state.

The same happens **without a freeze**. With `LiveFeed` at the root of a persisted `Room`, a reload while owed with a
catch-up in flight drops the lookup (OD9 Q26). The one-shot `resync` has already fired, and a trait has no restore
event, so nothing looks up again. The host-only form recovers because its `OWED` state holds `Schedule.spaced("5
seconds")`, which persists and ticks again. So the 4.2 sample makes things worse than the form it replaces. Q-k ("leave
no wait without an ending") and the revision-3 table's claim that Q13 A "is then safe" are true only for an actor that
is never reloaded.

*Fix (FO4, amendments 7 and 23, 4.2; no public API):*

> **Freezing** … ends each of its lookups with `failure { Interrupted }`. The ending is parked **with the frozen
> slice, which persists it** (Persistence O2, beside its frozen schedules) and delivers it at the thaw. A live
> incarnation's lookup is still not persisted (OD9 Q26). A fragment that waits on a lookup therefore needs a recurring
> schedule to look up again after a reload, because it has no restore event.

```ts
// before (revision 3, livefeed.trait.ts)
resync: { schedule: "5 seconds", armOn: [E.Missed, E.CatchUpFailed], send: E.ResyncDue },   // existing: armOn; one-shot

// after (proposed)
resync: { schedule: Schedule.spaced("5 seconds"), armOn: [E.Missed], send: E.ResyncDue },   // existing: armOn, Schedule.spaced (Effect); recurring, so it persists and survives a reload. ResyncDue is already guarded by "owed" and idle
```

Cost: a guarded no-op tick every 5 s after the first gap. If that is too much, `disarmOn` on a "synced" event is
possible, but `CaughtUp` also fires for incomplete pages, so it needs its own event. Add "reload while frozen during a
catch-up" to FO10's Story walks.

## Medium

**M1. Section 5's comment-composer row recommends release for posts, which repeats H3.** The row says "a discarded
thread's drafts may release on leave, all lanes at once (FO12)". A draft is memory, not a lane. The lanes are **posts
the user sent**. Releasing them interrupts a comment on the wire and drops queued ones. A thread copy also leaves
`.each` when the panel closes or the list refreshes, not only when it is discarded. *Fix:* "posts are user intent: keep
the hold and a keep-busy line (F6). Release on leave only if the thread itself is deleted, and then only if the posts
are worthless." Change no API.

**M2. A `resetOn` subject part can disagree with the incarnation's memory after a restore.** MD rule 1 says pending
resets are not persisted, and on restore "`resetOn` baselines are re-taken silently". Take an Autosave at the root
with `resetOn: docId`. A callback filling writes `docId: "b"`, so a pending reset is recorded. The page reloads before
the follow-up turn runs. The restored slice still holds doc `a` (input `docId: "a"`, its body and etag), but its
baseline, and so its path, becomes `["b"]`. Its next save commits key `{ docId: "a" }`:
- if `a`'s lane is not `Idle`, path `["a"]` ≠ `["b"]`, so it is declined and the document goes `"stalled"`;
- if the lane is `Idle`, the new lane records `["b"]` for key `a`. Later, switching to `a` makes a fresh `["a"]`
  incarnation, and `a`'s endings park for `["b"]`, which is the wrong subject.

*Fix (FO3, amendment 7):* "a `resetOn` subject part is the incarnation's own reset value, recorded when the
incarnation is created and persisted with its slice. On restore, if a writing placement's re-taken value differs, the
trait is reset (its `whenAbandoned` runs), not silently re-baselined." No API.

**M3. The amendment list (section 7) misses six places in MD:**
- **Rule 16** (declines): add the decline from another path. Under every concurrency, not only `reject`, a commit
  ends `NotSent { Rejected }`. Amendment 20 puts it on rule 21 only.
- **Rule 43** (`KeyRequired`): add the exemption for a key-less `cancel` in `whenAbandoned`. Amendment 11 states it on
  rule 6, but `KeyRequired` lives in rule 43.
- **Rule 41**: `activities` is "a list of placements" in states. Add "or a trait body (FO4)". Amendments 4 and 6
  cover 2.2.2 and key order only.
- **Rule 23 and N1**: add FO11. A fragment's `keys` and guards read its own rows, and a write row under `.each`
  lists only the lanes of that copy's path.
- **2.5 step 6** ("freeze resumable ones"): freezing also ends lookups `Interrupted` and parks them (FO4). Amendment
  27 lists steps 1, 3, 5 and 6, but not the freeze.
- **MD 2.2's lifecycle table** (the "On ending, except by an exit or a freeze" row): add "and releases the subject's
  lanes of any operation it lists (FO12)".

## Low

- **L1.** 2.10's step 2 says FO8's warning fires "unless it keeps busy keys". FO8 says the keep-busy line is not a
  token, so the warning still fires. Step 4 says X is re-added by "the keep-busy line". With that line X is never
  removed. Write step 2 as "a host without the keep-busy line removes X".
- **L2.** Nested writing fragments: FO9 should say a fragment's summary carries its **children's** write operations
  (contract, holding, releasing), and FO2 that `Fragment.O` reads any depth. The board uses `LikeButton.O.set` through
  `IssueRow` (2.10). `SharedContract` and FO8 at the board need it. Rule 10 hides the level below "for types", so this
  is an explicit exception.
- **L3.** 2.5's upgrade test needs "`by` names the key field". 4.4 and 2.10 use bare-string membership (no `by`), so
  a held like from the host-only board goes to `orphaned` after the upgrade. Either state it in 4.4, or allow the test
  "the contract has one key field and the lane's key value equals the copy key". That is weaker, since two id spaces
  can collide.
- **L4.** The releasing rows cover `Idle`, `InFlight` and `Held`. Say what happens under `cancel` and `allow`: a
  `HeldThisTurn` or `Held (parked)` lane is released, and under `allow` the rows apply per Attempt.
- **L5.** Order and capture. In step 5, the marks apply **after** every member of the turn, so a commit in a copy that
  the same turn removes is marked too. The mark is captured no later than the actor record that drops the incarnation.
  Otherwise a crash between the two captures reopens RV2 H1.3.
- **L6.** A frozen trait **reset on return** (MD rule 1): its parked `Interrupted` lookups are evidence, because the
  incarnation ended. Say so in FO4. Today it reads "delivered at the thaw" only.
- **L7.** 2.4's dispose row says "cells unchanged". That includes MD's "else evidence" for an identity with no saved
  record, while the parking row parks in a live actor. Write "cells unchanged, except the parking row" so the two rows
  cannot be read against each other.
- **L8.** Section 5's editor row: "A's save waits for A, B proceeds; the switch guards with `idle`". With the guard,
  the switch is refused, so nothing waits. Say "with FO8's guard the switch waits; without it, A's save waits for A".
- **L9.** Q-m "never drops user intent" is guidance, not a guarantee (risk 3). Write it as "is declared only for
  worthless work (guidance; Stories)".
- **L10.** "A write key belongs to one subject" cannot be checked in general (the key comes from a closure). One case
  is visible from summaries, though: a contract with `key: []` on a placement whose path is not empty puts every
  subject on one lane. `flow check` can warn there under the widened `SharedContract` (no new name). Beyond that, a
  decline from another path seen in a Story can be a Story-derived warning, as MD already does for list repairs.
- **L11.** FO0 should cite MD rule 9's "nested `.each` is out of scope", so a path has at most one copy key. 2.5's
  "adds or removes a level of `.each`" then means 0 to 1.

## The new parts, against the system

- **FO12's mark** (reload, rebind, parked, later ending): holds in every walk above, given L4 and L5. A rebind clears
  the mark, and the adopted lane delivers the interrupted Attempt's `unknown { Cancelled }`. Rule 20's adopted-ending
  check forces a handler (Upload: `Stopped`, then "stopped" with Retry), so it is visible, not silent.
- **Subject path with `resetOn`**: correct in a live actor, including the pending-reset edge (the commit records the
  old path, consistent with its select). M2 is the restore gap.
- **Rule 17's list** (amendment 18): "a fragment's lookup whose incarnation ended" and "an ending of a releasing lane"
  cover the parked endings turned to evidence, the dropped `W`, and L6's case. The freeze correctly produces an ending
  rather than evidence. H1 is about persisting it, not about rule 17.
- **"A write key belongs to one subject"**: `flow check` cannot enforce it beyond L10. The runtime decline is never
  silent where rule 20's widened `NotSent` requirement holds.

## Concept count

Unchanged from revision 3's 2.9. The fixes add no concept and no word.

## Before acceptance

H1 needs its FO4 sentence and the 4.2 line. After that, the proposal has zero Highs and is ready. Polish, in order:
M1 (one row of text), M2 (one FO3 sentence), M3 (six amendments), then L1–L11. None of these needs an owner question.

## For `revisit.md` (proposed, not written there)

- Delivering `Interrupted` on restore to every lookup a persisted incarnation was waiting on. This would reopen OD9
  Q26 for fragments, which have no restore event.
