# Review: T45 step 3, the expect half (2026-11-11)

Verdict: **ready with changes.** The boundary, the obligation table and the per-lane compare are right, and nothing
copies a round-14 result except one inherited rule (N3). Three findings block code: runtime outputs still enter expect
under the name "suite fact" (B1), `Finished` is already owed by the Actors Spec, so leaving it report truth leaves
incarnations chosen by a report (B2), and the memory question is wider than Pay's two guards, with option (A) wrong as
written (B3). Fold B1 to B3 into the proposal, then build. B4 must land before step 5's generators.

**Reviewed:** code:workflow/plans/flow/references/proposals/t45-expect-half-2026-11-11.md at 77c7342d, against
@spec.Conformance R19 to R22, Actors R8, R22, R23, I10, I37, WriteLanes R6, R9, WriteAhead R5, R10, and the code it
changes. No sidecars were started: every finding below was read from the files by the reviewer.

## Blocking findings

### B1. Runtime outputs are typed as suite facts, out of the liar gate's reach

Expect's input is "`SuiteFact` (every `Fact` but `Reported`)" (section 1). Four facts in that set carry values the
runtime chose, and the proposal adds a fifth:

- `Wrote.purpose`: the runtime's label on its write (`world/storage.ts`, `write(writes, purpose, …)`). `wrote` in
  `lifecycle-step.ts` saves the capture at once on `"flush"`, else holds it pending, so the label decides `saved`,
  and `saved` decides which restores are owed (section 2's restore row).
- `Acknowledged.attempts`: the runtime's `acknowledges` (decision 4 names this one only).
- `Read.row`: `life.runtime().row(…)`'s answer (`dsl/case.ts`, `row`). The lifecycle ignores it today; the type
  admits it.
- `Fired` (new, section 2a): the world clock arms anonymous timers for the runtime (`world/clock.ts`, `arm(at, fire)`
  has no name). A firing is the runtime's timer: a runtime that arms a wrong schedule creates a turn obligation, and
  one that never arms it owes nothing. Section 2 makes `Fired` a source of a turn's event.
- `RuntimeDisposed` as a suite fact (decision 2): dispose's settlement is the runtime's answer.

The liar gate (R21) swaps only `Reported` facts, so a mutant that lies through any of these steers expect and stays
green without counting as report truth. **Fix:** split `Fact` into suite facts (driven, world-answered, fixture) and
runtime answers. Expect's type admits a runtime answer only where a limits row names it (today `acknowledges`, and
`purpose` until the store can tell a flush from a batch); liar mode replays runtime answers with the reports.
Firings come from the fixture's schedule table and `Advanced` (Turn R14, R15), with a memory-computed delay from a
label (B3). `Fired` then has no role in expect, and the `schedules` oracle compares the reported turns against it.

### B2. `Finished` is owed by the Actors Spec; leaving it report truth keeps a report in expect

Section 4 and decision 3 say no Spec rule owes or defines `Finished`. Actors R8 does: a shared actor free of uses
and work in flight for the 100 ms grace ends at the grace's end, "owed, not only allowed" (agent decision
2026-11-11, audit G3), with I10 and I37. Today `ActorMove.Finished` sets the record to `"grace"`
(`lifecycle-fold.ts`), which makes the next `Ensured` an `Adopt` (`ADOPTABLE` in `lifecycle-step.ts`), which opens
lives. Section 2's incarnation row ("an actor with no live incarnation") needs the same knowledge. With `Finished`
report-only, a runtime that never ends an actor, or ends it early, picks the incarnation obligations.
**Fix:** expect owes the end from the held uses (`Released`, `Disposed`, `Forgot`), `Advanced` reaching the grace,
and the lane state it holds (no work in flight); an allowed set (ended or not) where in-flight work is not computable,
and the `encodable` label for R8's "waits while it cannot encode". The Port keeps `Finished` as a compared report.

### B3. Memory reaches keys, delays and more guards; option (A) changes Pay's behaviour

Read from code:packages/flow-state-v3/conformance/machines/pay.ts:

- Keys: `pay` and `void` are keyed by `intentId` (`ByIntent`), and every Pay commit, cancel and retry takes it from
  memory (`intent`, `withCard`), set by `Start`. Section 2's member-key row ("the `key` label the driver records on
  `Drove`") cannot give it: `PayRequested`, `RetryNow` and `Leave` carry no `intentId`. Before the send, the key falls
  back to the `Minted` report, a report choosing an obligation.
- Delays: `WAITING`'s `retry` schedule reads `memory.retryInMs`, set from `Busy`'s `retryAfterMs`.
- Guards 2b misses: `unsureChallenge` reads `memory.clientSecret`. LateQueue's `Unsure` reads a flag set by the
  driven `Cancelling`; the proposal calls it "already a fact", but it is a memory fold, which is option (B).
- (A)'s `busyTries` rewrite is wrong: `Busy` is a definite failure, so the `pay` lane is Idle, and `retryable` denies
  `NothingToResend` outside Held (WriteLanes R9). `RetryNow` issues a new commit, not a retry. Pay would always take
  `Busy`'s second alternative.
- (A)'s `Leave` guard ("the `pay` lane's last ending is a capturable success not voided") is no Flow guard: WriteLanes
  R9 has `idle` and `retryable` only. It needs memory, new states, or a new guard kind, which is a new concept and the
  user's.

**Fix:** take (B), framed as a fixture reference rather than a model feature (decision 1 below).

## Should fix (B4 before step 5)

- **B4. A capture credited with its whole step over-credits.** A batch issued mid-step holds only the turns up to
  its issue. Crediting later turns makes `saved` hold state that was never written, so after a kill expect owes a
  restore that a correct runtime cannot give: a false red. The crash-at-every-step and seeded generators will meet it.
  Replace the limit with an allowed set: the capture holds some prefix of the step's turns, from the turn that issued
  the batch (WriteAhead R7, R10) to the step's end. That extends section 3's "leaf after a kill" row.
- **N1. Unmatched reports name no cell.** "A refusal names the Invariant of the cell that made the item", but a
  report that fits nothing has no item. T38's second planted runtime needs a named Invariant. Give each report kind a
  default (an unowed mint is WriteLanes I1, an unowed ending I15, and so on) in one table.
- **N2. The lint misses expect's own modules.** Expect will import `lifecycle-fold.ts` and `lifecycle-model.ts`;
  neither is in section 1's list. `SuiteFact` derived from `Fact` still carries `Reported` through the type. Define
  `SuiteFact` as its own union, and lint every module expect imports.
- **N3. One round-14 result is copied.** Key-less members on a keyed operation outside their own ending "follow
  round-14 until the user answers" (`lifecycle-owed.ts`, Gotchas). WriteLanes R9 says KeyRequired. The proposal is
  silent; either apply R9 or list the row in `limits.ts` as a pending question.
- **N4. The oracles that read `lives` will read expectations.** `disposal`, `lane-queue`, `idle-guard`,
  `late-results`, `retry-count` and `evidence-kinds` read `lives.before` and `lives.after`. After the split those are
  expect's state. Each must take its actual from reports and its expectation from `lives`, never both from `lives`, or
  the check is a tautology. Check each in step 2.
- **N5. Acceptance names files the split empties.** Acceptance 5 names `lifecycle-step.ts`, `lifecycle-owed.ts` and
  `turn/selection.ts` for the lint; obligation code moves to `expect.ts` and `predict.ts`. Note the mapping on the Task;
  the intent is unchanged.

## Decisions

1. **(B), as a fixture reference:** one fold per memory field a guard, key or delay reads, in `fixtures/`, declared
   next to each `updating` alternative. Suite-internal; the R19 wording note goes through spec-log, for the user's
   read.
2. **Yes:** replace the observation with dispose's own result (its Exit, so CleanupFailed shows too), as a compared
   runtime answer, not a suite fact (B1). Suite-internal: the Port is the suite's adapter boundary.
3. **Neither option:** Actors R8, I10 and I37 define it. Expect owes it from facts (B2); the Port keeps it.
   Suite-internal.
4. **Accept as a limits row,** with the liar gate extended to it. First check whether lane record keys (WriteAhead
   R5) narrow it without a codec. Suite-internal; not a guarantee change.
5. **Replace the limit with an allowed set** (B4). Suite-internal.

Reasons:

1. R20 names "a fixture's source and reference" as suite facts, and advisor Q1 allows "a memory that is a plain fold
   of the driven events". The fold never reads the runtime's memory or a payload codec, so R19's opacity holds for
   what the runtime holds. (A) changes Pay's behaviour (B3) or needs a new guard kind, and it moves the conformance Pay
   away from the real Pay it copies. Each folded field is kept only while a model mutation kills it.
2. Dispose's settlement is the public API's own output and the thing R22 and R23 judge. Expect's deadline is the
   5 s bound on the clock; compare checks that dispose settled by then and that every `NotSent { Disposed }` came
   first (I38).
3. B2.
4. The store cannot read Attempt ids without a codec. WriteAhead R5 does fix a lane record's identity
   (identity, contract id, key): if the fake store can see which lane records a batch wrote, mint order per lane
   (WriteLanes R6) gives the head. Worth an hour's check; otherwise the limit stands.
5. A false red on a correct runtime is noise every generated run will hit, and section 3 already has the mechanism.

None of the five is a guarantee change or a Flow public API change. The Spec wording in decision 1 is a revision the
orchestrator may make with a spec-log entry; any new guard kind (option A's `Leave`) would be the user's.

## What it costs later slices

- **T47's fixtures and generators.** Each new fixture owes label functions and reference folds with their own fixture
  tests. Keep them next to the handler alternatives (`updating(…)` names the fields it sets) so a fixture is one
  description (advisor Q0), and so T47 copies a pattern rather than re-deciding it.
- **The script Schema (T45 owns it) and the bench replay (R23).** Labels must be computed at play time by the
  fixture's functions, never stored in a script. A shrunk or replayed script would otherwise carry stale labels.
- **The second runtime.** The folds are the common-mode risk. They are bounded by a field list, mutation-killed
  fields, and fixture tests whose expected values come from the Spec tables, as section 2a proposes.
- **Effect.** Nothing here rebuilds an Effect feature; the model stays plain TypeScript.

## Checks and sidecars

No sidecars were started. Each finding was read by the reviewer:

- B1: `world/storage.ts` (`write`, `Purpose`), `world/clock.ts` (`arm`), `dsl/case.ts` (`row`, `disposeRuntime`, the
  `Wrote` and `Acknowledged` records), and `wrote` and `landed` in `lifecycle-step.ts`.
- B2: Actors R8, I10 and I37. `ActorMove.Finished` in `lifecycle-fold.ts`, and `ADOPTABLE` in `lifecycle-step.ts`.
- B3: `machines/pay.ts` (`intent`, `withCard`, `Busy`, `RetryNow`, `unsureChallenge`, `WAITING.retry`).
  `fixtures/one-lane.ts` (LateQueue). WriteLanes R9.
- N4: grep for `lives.before` and `lives.after`.
