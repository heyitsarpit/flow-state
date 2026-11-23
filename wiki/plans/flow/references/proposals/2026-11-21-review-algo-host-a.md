---
review review-algo-host-a
status open 2026-11-21
description Review of the host design finds it sound in its core but not Spec-ready: four Spec blockers, eight build blockers.
---
# Review A: the UI host and test tooling algorithm design, cluster 5b (2026-11-21)

**Verdict: ISSUES.** @proposal.algo-host is sound in its core move (one publication per quiet slice, one death
occasion, one verdict function) and the three tables the lead modelled held up under my traces. It is not yet
Spec-ready. Four findings block the Spec: the store is still shown an unfinished world, the death's clock settle hides
that in every Story, the hide-with-a-write-out cell loses marks under both fates, and `expectBroken` is the `it.fails`
weakness at rule granularity. Eight more block the build, mostly oracles that cannot fail and "removed" families that
are one point. No family needs a redesign.

Conventions: AH is @proposal.algo-host; AR is @proposal.algorithm-round; CS is @review.case-studies. `AH:n` is a line
of AH. Code is under `packages/flow-state-v3/src/`. Every trace below I derived from the tables and checked against
`host/driver.ts`, `host/edge.ts`, `host/snapshot.ts`, `core/life.ts` and `core/serve.ts`. No sidecars; I did not run
the lead's model (my traces are on cells the model's summary says it did not cover: death, locks, hide cells).

## 1. Required properties, derived before reading the tables

- **R1** Nothing that shows a world (screen, store, inspection) shows one that no finished chain produced.
- **R2** No accepted mark is lost while the page can still write; at death the loss is bounded by one fate word.
- **R3** A rule that cannot fire is never silent: a check either can fail on a real bug or the design says it cannot.
- **R4** A test's fake is never kinder than the browser at the one moment the design exists for (page death).
- **R5** Every "removed" family is removed by a type that cannot express a member (AR section 3's test).
- **R6** Every table cell is filled or named unreachable, over every life, phase and tab state the code has.

## 2. Blocks the Spec

### B1. The store is a reader too: `Capture` saves a world that owes mail (R1; cells 6.1 and 6.4 `issue`)

AH makes `publish` take a `Quiescent` world (family A "removed"). The edge's `issue` calls `input(Capture)`, and
`Capture` reads whatever world the driver holds. Trace: a click fans out to 150 consumers; the slice yields at 100
(`core/serve.ts:472`), the world owes mail, `Serve` is forked. The page is hidden (any mobile background, or
`onHidden` firing): the hide row, or Quiet-hidden accept-Later, issues at once; `Capture` is the next inbox item of
the same slice, so it runs before the `Serve` task. The record written holds 100 consumers updated and 50 stale. Mail
is not saved (AR), so on reload the 50 follow-ups never run. Expected: the store shows what the screen would. Actual:
a half chain saved, which is exactly "a world no finished chain produced" (H1) one reload later.

This is not only the O7 death hole: a `wake` that fires between two `Serve` tasks, or any hidden page, does it with
no death. AH files it as hole O7 (medium) and a seam question. It is inside this cluster: 6.1 decides when a world is
shown, and the edge is the other reader. Cell at fault: 6.4 `issue` (every row that issues) against 6.1 "mail owed".
Fix shape: the edge issues only for a `Quiescent`, or `Capture` is refused while `owesServe`, and the hide row drains
the owed mail synchronously first (no yield) and then captures. This turns O7 into a row, and it needs no AR change.

### B2. The death's `settleNow` makes the fake kinder than a browser exactly where B1 bites (R4; 6.5 and AH:568)

`close` runs the hide listeners, then `tab.clock.settleNow()`, then fates the batches. `settleNow` runs every task due
at this instant, including the forked `Serve` from the owed chain. Trace: fan-out click, then `closeTab("main")`
at once. In a browser, `pagehide` runs the listener (capture mid-chain, B1), and the page freezes: `Serve` never runs.
In the Story, `settleNow` runs `Serve`, the chain completes, the new `Persist` accept (the tab is Dying so `hidden()`
is true) issues a second batch inside the settle, and under `land` the complete chain is saved. Expected (browser):
a half chain, under `land`. Actual (Story): a whole chain. The Story's `land` ending passes where the browser's fails;
the reload sweep, "both fates at every position", cannot see it. Family H ("fakes kinder than the real thing") is not
removed here. Cell at fault: 6.5 Death paragraph, the settle, and the pseudo-code line `tab.clock.settleNow()`.
Fix shape: the Dying window is the synchronous run of the hide listeners only; a batch counts as Held if its store
call was invoked inside it; no timer, yield or answer task runs after it. If Effect's fork needs one scheduler tick to
invoke the store (hole O3), settle only the tasks the listeners themselves forked, never the whole clock.

### B3. Hide with a write out, and a refusal while hidden, lose marks under both fates (R2; 6.4 cells)

Trace 1 (held write, then hide): the PAY batch is issued at t (store slow). Two Back clicks at t+1 s: accept-Later in
`Out` puts the mark in `pending`. The tab is hidden at t+2 s: row hidden x `Out` is "Out; the answer's row issues at
once". The page dies with the answer never coming. Under `abort` the store holds an older state, under `land` the
older PAY batch lands; the METHOD mark is lost under both fates, though IndexedDB accepts a second ordered
transaction, and the design's I8 (one batch in flight) is the only reason it is not issued. The walkthrough's "PAY or
METHOD, never anywhere else" is true only because its Story never holds the first write. Expected: a decision, and a
Story with `hold` before the Backs. Actual: an unstated third ending (the stale batch), no fate word for it.

Trace 2 (refused while hidden): `Out` refused while hidden goes to `Backoff{now+C}`; AH:356 says so on purpose. A
hidden mobile page is frozen within seconds; the refused marks wait 5 s and die. Trace 3: accept-Later in `Backoff`
while hidden is "Backoff", but accept-Later in Quiet while hidden issues. Same page, same visibility, two rules.

I10 reads "no batch before `until` unless hidden or a ticket arrives", but the refused row ignores hidden, so I10 and
the table disagree. Cells at fault: hidden x `Out`, refused x `Out` (hidden), accept Later x `Backoff`, I10. Fix
shape: while hidden, `Backoff` retries on the next issue occasion (a new accept or the hide itself), or a hidden
refusal retries at once once; and decide hidden x `Out` as "second batch ordered after the first" or "lost, by
design, named in the fate table". Add the Story.

### B4. `expectBroken` passes for any reason (CS section 4; 6.6 switch table, I14)

`neverBroke` only checks that a rule id appears in `found` somewhere. Trace: an inverted-row Story expects
`TurnsRule` to break at the dropped retry; a setup bug makes it break at `Begin` on another actor, or a different
instance, for another reason. `expectBroken` passes; the step, actor and evidence are ignored. It is `it.fails` with
a rule id instead of a failure: it removes "any failure" and keeps "any breach of this rule". CS section 4 names this
class (a check that cannot fail for the right reason). I14 states the weak property ("broke at least once") and the
checks only test it.

Second trace, the reload sweep: 6.5 says the sweep runs every Story at every position in both fates, with the
same switch. A Story that expects a break at step 6 under `land` is judged at position 2 (the break cannot have
happened yet) and under `abort` (it never happens): `neverBroke` fails in nearly every fork. The table has no cell
for switch x fate x position. Cells at fault: 6.6 switch table (`expectBroken` row), 6.5 sweep paragraph, I14. Fix
shape: `expectBroken` takes `{ rule, at?: step, actor?, where?: (breach) => boolean }`, and a sweep fork applies it
only to the forks the Story names (or the sweep runs `expectBroken` Stories as written only).

## 3. Blocks the build

### K1. `PublicationDrift` cannot fail in the cases `touched` misses most (R3; 6.6, 6.1)

The guard runs "at every publishing slice, for every memo key not in `touched`". Three holes:

- **No publishing slice.** A step that changes a snapshot but has no `Turn` and a missing `touched` (a lane row
  settled by an answer, a context wave, props) leaves S3 empty; the slice is "S3 empty: nothing", and the guard never
  runs. The planted fault "a tx writer that does not mark `touched`" is caught only when some other actor was
  touched in the same slice. Fix shape: in test mode run the drift check at every quiescent slice end, empty or not.
- **Not in the memo.** It iterates memo keys, so a new actor whose creation forgot `touched` is never checked.
  Iterate `memo keys` union `world` keys.
- **Cross-actor reads.** `snapshotIn` reads `operationsOf(world, ...)`, which reads `world.lanes` and
  `lanesOfActor` (`core/schedule-plan.ts:51`), plus `quarantined`, `ended`, `records` and `life`. A lane row can change
  by another actor's turn or by a ledger write; `touched` of the writer does not name the reader. AH does not list
  which `World` fields `snapshotIn` reads, so the writers that must mark are not enumerated (O2 says "AT's writers").
  Fix shape: list the fields once, in a typed set, and have every writer of those fields go through one function that
  marks `touched` (a type, not a convention).

### K2. I10 cannot catch the fault it is paired with, and one planted fault is described backwards (R3; section 9)

Planted fault "a `Later` accept cancels the backoff, caught by I10". The fault delays the retry (new `Backoff` or
`Marked{now+C}` is later than `until`), so no batch issues before `until`: I10 holds. The harm is starvation: a
mark every `C/2` pushes the retry away forever. H6 "a refused batch is retried" needs a liveness check ("from
`Backoff`, with a mark every `C/2`, a batch issues by `until`"), which the alphabet (depth 6, safety invariants only)
does not have. Likewise "write the memo before comparing, caught by I3: every listener told": the fault makes the
compare see no change, so nobody is told; I3's "iff" catches it, but the stated reason is the opposite. Fix: add a
liveness check to the model and the package sequences; correct the row.

### K3. Nothing checks section 10, so the F5 timeouts have no failing check (R3; section 9 and I18)

I18 ("O(what the step changed)") appears in no check, alphabet or planted fault. Section 15 step 7 measures with
`bench --dev` before and after. Today's F5 bugs (`generate.ts:512`, `fake.ts:475`, `story.ts:274-283`) would pass
every row of section 9: the model has no cost, the Stories have no counter. A regression reintroducing a per-pull
scan fails only as a timeout in coverage, which is how CX F5 was found. Fix shape: the fake world exposes its counters
(S14 already owns them); a test asserts per-step reads of the call log, batches and inspect are constant between S and
2S steps. That check can fail on today's code.

### K4. Table totality (R6): cells with no row

- **6.1 keys on `Open`, `Disposed` and `stop` only.** The world's `Life` has `Inert`, `Booting`, `Open`, `Failed`,
  `Disposing`, `Disposed`, `Stopped` (`core/life.ts`). `Serve` is admitted only in `Open`, and `owesServe` is
  `mail.size > 0 && Serve admitted`. In `Booting`, `Inert`, `Failed` or `Disposing` a world can hold mail with
  `owesServe` false, so the third row publishes a world that owes mail (I1 as worded, "no mail owed", is false by the
  table). Name those lives, and define "owed" as mail present, not as `owesServe`.
- **6.4 omits the capture refusal occasion.** Today's `accept(when, refused)` and `write(..., refused)` answer tickets
  the capture step refused (`edge.ts:81`, `host/edge.ts` write). The table has no row for it; a ticket refused at
  capture is neither "landed" nor "refused" of a batch.
- **6.7 judge: a `Turn` with no `Published`** (a handled event that changes nothing) and a `Turn` that ends in
  `Finished` have no row. A turns rule that says "event X must change state" is never checked, and a rule on the
  terminal transition is never checked (`Finished: none`).
- **6.10 sweep.** `Quiet{pending}` has a payload no row writes; "stood" and "kept" in the nudge row are undefined;
  `Replay` x `quiet done` is "-" though a Story shorter than the fault position ends there.
- **6.5.** `Dying` is in S9 but has no column; `advance` says "the one clock moves" while Death says `tab.clock`.
  If there is one clock, `settleNow` on tab A also runs tab B's due tasks; say so.

### K5. "Removed" families that are one point (R5; section 3, family A, D, E, F)

AR's test: a type or signature cannot express a member; a convention is "handled at one point".

- **A.** `Quiescent` is `{ [quiescent]: true; world; at }` built by a `Quiescent(world, now)` constructor the driver
  calls (and `final` calls on a disposing world). Any caller with a `World` can build one; nothing checks mail. The
  brand is a convention. Make the constructor the only door and have it return `Option`, taking the world's mail size.
- **D.** `Tab<T>` names tabs, but acting on a `Gone` or never-opened tab is a runtime script fault (6.5 table): the
  single-tab model is removed, the life-state errors are not.
- **E.** `run()` has no unjudged return, but `finish`, `forkReloads` and the sweep run a Story internally and
  `propertyTest` "calls `verdictOf`" itself: three callers each apply the verdict, so one writer is by agreement. If
  the unjudged runner is exported (or exported to the sweep), TT-3's family returns. Hide it behind one opaque
  `Judged<StoryRun>`.
- **F.** `EdgePhase` and `Pending` are two records with joint constraints the types allow to break: `Quiet` with
  `pending.marked`, `Marked{at}` beside a separate `pending.due` (two sources of the same time), `Out` with no batch.
  Fold `due` into the phase and make `Quiet` carry no pending.

### K6. A run rule's `breaches` can throw, and nothing contains it (principle "a throw changes only its own check")

`verdictOf` is called "pure" and does `judged.flatMap(r => r.breaches(run, index))` with no `Result.try`. Machine
rules are contained (6.7); project run rules are not, though 6.6 lists them as one source. A throw rejects `run()`
with a defect, no rule id, step or evidence, which fails H9. Fix: catch per rule into a `RuleThrew` breach, as the
judge does, and add a planted fault.

### K7. Derived-field equality is unnamed (R1; 6.1 step 1)

`reuse` compares "state and memory by reference, derived fields structurally". The derived fields (`context`,
`issues`, `operations`, `schedules`) are rebuilt on every `snapshotIn`: `issues` are new `Diagnostic` class
instances, `operations` a `Map` of `Map`. Which equality? AR's principle "one equality and one codec" names X-5
(`Equal.equals` against `sameValue`); AH does not say. With reference equality on a rebuilt `Diagnostic`, every
publication is a change (H2 fails: I3 and I6 fail on a stable world). Name it, and add an I2 sequence with a
failing issue that stays failing.

### K8. A hung batch wedges disposal (6.4, "no write timeout")

`Interrupted` happens only at close, a batch out past `storageSilent` is "a derived inspection row". Trace: a store
that never answers on a live page (hung transaction, not a death). The edge stays `Out`; every later mark waits in
`pending`; disposal's `Now` ticket waits behind the hung batch ("accept Now x `Out`: waits in pending"); the
Runtime's `dispose()` never completes. H6's "waiting, out, or landed" is true and useless. This is today's
behaviour too, but the design claims the family "removed" (C). Either name it as a decision (a hung store holds
disposal; the user's "no arbitrary limits" stands) with a Story, or let a disposal ticket skip the line.

## 4. Minor

- **M1. Liveness under input (O1).** I agree with "accepted as overload", but there is no check that the overload
  case behaves as designed (no publication, then one). Add a Story with an input per `Serve` round and expect
  exactly one publication when it stops; today it is untested. `work.fork("serve")` replaces its key: say whether a
  replaced `Serve` can starve (it does not lose mail).
- **M2. Time-derived views.** 4.2 says `Published.at` is the time every snapshot of that version was derived at, and
  AO's overdue and age views read it. Nothing publishes at a deadline with no step, so such a view is stale between
  slices. State that every time-derived field has a core alarm, or that views are stale by construction.
- **M3. Breach fields.** `Breach.step` with two tabs: global step or per-tab? `RuleThrew` loses the rule that threw
  (summary only). Rule ids from project and machine unions can collide; refuse at config load.
- **M4. `stop` drops owed turns' emits with no word.** Right (the owed world is never shown), but H3 has no cell
  for "emit never delivered because its turn was never shown"; say so beside I4.
- **M5. `CleanupLeft` on an unfinished run** reads `left` of a run cut at a limit: breaches that are noise (Q8's
  record lists them beside the real ones). Mark them `partial`, or skip on `Limit`.
- **M6. `Marked{at}` vs the walkthrough** ("Marked{at: now + 5 s}") and 6.4's `Marked{due}`: the same value under two
  names. Folded into K5-F.

## 5. The eight questions (and one the design asks as nine)

| Q   | Verdict under my traces                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------- |
| Q1  | A holds, with B1: the rule must cover the store, or "no half chain" is shown to screens only            |
| Q2  | A holds; K5-E must hold with it, or a test can still reach an unjudged run                              |
| Q3  | A holds; M4 adds the stop cell                                                                          |
| Q4  | A holds only with K1 (drift at every quiescent end; the field list); B stays costlier and safer, say so |
| Q5  | A holds; B2 must change first, or the new pagehide Stories pass where the browser fails                 |
| Q6  | A holds                                                                                                 |
| Q7  | A holds; its fault needs the liveness check of K2; add trace 2 of B3 to the question                    |
| Q8  | A holds; M5 is its caveat                                                                               |
| Q9  | no trace changes PD4 or PD5                                                                             |

**Missing questions:** (1) B1: whether `Capture` is gated on a quiet world (the rule I recommend: yes, and at hide
drain first); (2) B3: what hide does with a batch already out; (3) B4: `expectBroken`'s granularity and its place in
a reload sweep; (4) K8: whether a hung store may hold disposal.

## 6. What held

- The 6.1 publish order (compare, write memo, notify, deliver) is total over the slice ends I tried: click fan-out,
  listener sends, stop mid-drain, dispose with mail owed (the core clears it, `core/disposal.ts:64`), a listener that
  unsubscribes and resubscribes.
- 6.4's `again` carry and "a ticket is answered only by its own batch" survive a refused batch, a ticket in `Out` and
  a close in every phase.
- The verdict table orders correctly with a throwing rule (`RuleThrew`), a rule in both lists (refused at build) and a
  rule broken only at the last seed (I16).
- The fate table gives both endings for `back-twice-close`, and the `Second` lock row keeps two tabs from both
  writing (I12), including a holder that dies while another tab waits.
