# T45 step 3: the expect half (accepted, orchestrator, 74911f8d)

The lifecycle model and the turn anchor become the expect half. They build what each step owes or allows from suite
facts, labelled when the suite makes them, and from the fixtures' references. Every oracle becomes the compare side.
It matches reports and runtime answers against those items and refuses what does not fit (Conformance R19, R20). The
tables stay. What changes is where their inputs come from: the model stops binding obligations on the runtime's word.

Accepted with the review's changes (code:workflow/plans/flow/references/proposals/t45-expect-half-review-2026-11-11.md):
B1 to B4 and N1 to N5 are folded in below, and its five decisions replace the Flagged list.

**Why now:** a locator counted about 15 report uses that create obligations and about 55 that choose among them
(@task.V3.T45, comment of 2026-11-11). The liar gate leaves 9 round-14 mutants green.

**Read first:** @spec.Conformance R19 to R22, T37, T38, T40; advisor Q1 and Q2
(code:workflow/plans/flow/references/proposals/advisor-answers-2026-11-11.md); code:packages/flow-state-v3/conformance/dsl/lifecycle-step.ts#step.

**Prior draft:** four Haiku sidecars attacked a first draft from four angles: Spec citations, feasibility, the
model turning into a runtime, and completeness. This version folds in their findings. The first draft predicted
memory and timers, and allowed "nothing" after a kill; all three are gone.

## 1. The boundary

- **Facts split three ways (B1).** `SuiteFact` is its own union: what the suite drove, what its world answered, and
  the fixtures (`Drove`, `Answered`, `Requested`, `Ensured`, `Released`, `Disposed`, `Forgot`, `Reloaded`,
  `DisposingRuntime`, `Advanced`, `Unstoppable`, `Stepped`, `Dropped`, and the fact that a batch was written).
  `RuntimeAnswer` is what the runtime chose outside its reports: a batch's `purpose`, the Attempts a batch
  `acknowledges`, a `Read` row, and dispose's Exit. `Reported` stays as it is. Expect admits a runtime answer only
  where a `limits.ts` row names it: `acknowledges`, and `purpose` until the store can tell a flush from a batch.
  Liar mode replays runtime answers along with the reports, so a lie told through one is still caught.
- **Expect** (the T40 lint bans `Observation`, `Turn`, `Delivered`, `TurnPart` and `RuntimeAnswer` imports, in every
  module expect imports, N2):
  - `dsl/lifecycle.ts`, `lifecycle-lives.ts`, `lifecycle-lanes.ts`, `lifecycle-rules.ts`, `lifecycle-owed.ts`,
    `lifecycle-fold.ts`, `lifecycle-model.ts`;
  - a new `dsl/expect.ts`, cut from `lifecycle-step.ts`;
  - `turn/anchor.ts`, and a new `turn/predict.ts`, cut from `selection.ts` and `late.ts`;
  - the fixtures' references and folds (`fixtures/`).
- **Compare** is `dsl/compare.ts`: the rest of `lifecycle-step.ts`. It walks the step's reports in order. Each report
  must fit an item that expect holds, matched per lane and per actor, never across lanes (Actors I31 and Restore R3
  order endings within a lane only). A fitting report gives expect only the index of the alternative it fits.
  Expect then advances along that alternative's predicted move, never along the report's fields. A report that fits
  nothing is refused. An owed item still unmatched when it falls due is refused.
- **Every refusal names an Invariant.** An item's refusal names its cell's Invariant. A report that fits no item
  names its kind's default, from one table (N1):

  | Kind     | Invariant     | Kind                                                   | Invariant          |
  | -------- | ------------- | ------------------------------------------------------ | ------------------ |
  | `Minted` | WriteLanes I1 | `Ended`, `Delivered`, `Parked`, `Unparked`, `Recorded` | WriteLanes I15     |
  | `Sent`   | WriteLanes I1 | `Evidence` Released, Superseded                        | WriteLanes I12, I8 |
  | `Turn`   | Turn I2       | `Incarnated`, `Finished`                               | Actors I10         |

  Compare emits today's `LifeStep` (`before`, `after`, `applied[].refusals`).
- **The oracles that read `lives` (N4)** are `disposal`, `lane-queue`, `idle-guard`, `late-results`, `retry-count`
  and `evidence-kinds`. Each one takes its actual from reports and its expectation from `lives`, never both from
  `lives`. Step 2 checks them one by one.
- **The other oracles** stay compare-side and keep reading reports (`selection`, `refusal`, `publication`,
  `schedules`, `attempt-identity`, `ending-channels`, `evidence-kinds`, `idle-guard`, `disposal`, `graph-names`).
  R20 constrains obligations, not judges. Each one judges its report kinds against expect's predictions where expect
  has one (for example `Unhandled` and `Denied` from `turn/predict.ts`). The report kinds that are not lifecycle
  items are listed in section 4. Compare passes them to their owning oracle; it does not refuse them.
- **Ids.** A send's id is the suite's own fact (`Requested.request.key`). A mint is matched to its lane's owed mints
  in lane order (WriteLanes R6), not greedily. Id uniqueness and seeding stay with `attempt-identity` (WriteLanes R5,
  I6, I28), as advisor Q2 says.
- **Branches.** None, except where section 3 lists a choice. With silence judged, a kill never branches.

## 2. What derives each obligation

| Item                          | Derived from                                                                                                                                                                                                                                                                                                                                        | Rule                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| turn: event                   | `Drove` (with `to` for parts), an owed delivery's mapped event, or a firing predicted from the fixture's schedule table and `Advanced` (a delay memory computes comes from a fold, section 2b)                                                                                                                                                      | Turn R2, R14, R15, R19               |
| turn: from                    | a current ending: the anchored leaf. A late one: the owner's nearest surviving ancestor. After a kill with turns no capture holds: unknown until the next turn (the anchor's `Stored(none)`)                                                                                                                                                        | Turn R1, R20; WriteAhead I10         |
| turn: to, and Denied          | the handler alternatives in source order. A guard reads the lane state the model holds (`idle`, `retryable`, WriteLanes R9), a label on a suite fact (section 2a), or a fixture fold (section 2b).                                                                                                                                                  | Turn R2, R12; WriteLanes R9          |
| members, releases             | Table B's row for the predicted (event, from, to). The reported members are never read. A key-less member on a keyed operation outside its own ending is `KeyRequired` (WriteLanes R9), not round-14's targets (N3).                                                                                                                                | WriteLanes R9, R16                   |
| member key                    | the fixture fold that computes the commit's input (Pay's `intentId` from `Start`, section 2b). Checked against `Requested.request.input` once sent.                                                                                                                                                                                                 | WriteLanes R6, R9                    |
| mint or decline               | the lane's admission cell (Table B) and the lane state. A decline's reason comes from that cell, or from a labelled boot fact (section 4).                                                                                                                                                                                                          | WriteLanes R1, R7, R12               |
| send                          | a persisted head after its acknowledging batch lands (`Wrote`, `Acknowledged`). A non-persisted head after its turn. A retry's re-send after its capture. Counted from `Requested` only.                                                                                                                                                            | WriteAhead R13; WriteLanes R8        |
| ending                        | `Answered` through the fixture's `classify`: `Lost` is unknown (`mayHaveApplied`). A definite failure after an unknown send is unknown `StillUnknown`. `Never` gives no ending (no timeout reason). A cancel: `NotSent { Cancelled }` if the Attempt was never sent, else `unknown { Cancelled }`. Past the disposal bound: `unknown { Disposed }`. | WriteLanes R2, R3, R14; Actors I35   |
| delivery, park, unpark, letGo | Table C lives. Parked or delivered follows the suite's held uses (`Ensured`, `Released`, `Disposed`, `Forgot`).                                                                                                                                                                                                                                     | WriteLanes R10, I15; Actors R20, R21 |
| evidence                      | Released: a release row (WriteLanes R16), a not-retained unknown's turn (R4), cancel of a Held lane (R14). Superseded: `latest`'s supersede cell (R7).                                                                                                                                                                                              | WriteLanes R4, R7, R14, R16          |
| restore at a boot             | per lane in creation order: parked endings in saved order, each queued commit's `NotSent { Restored }`, then a Held or acknowledged head's `unknown { Restored }` last, unless its outcome landed (`saved`). Owed, never "or nothing".                                                                                                              | Restore R3, I5, I6; WriteAhead I17   |
| incarnation                   | `Ensured`, `Drove` or `Reloaded` of an actor with no live incarnation                                                                                                                                                                                                                                                                               | Actors R6, R9                        |
| an actor's end (`Finished`)   | owed (B2): no held use (`Released`, `Disposed`, `Forgot`), no work in flight in the lane state the model holds, and `Advanced` reaching the 100 ms grace. Allowed either way where in-flight work is not computable, and while the record cannot encode (the `encodable` label).                                                                    | Actors R8, I10, I37                  |
| disposal's end                | dispose's Exit, a runtime answer the suite records: settled by the 5 s bound, after every `NotSent { Disposed }` (decision 2). The `RuntimeDisposed` observation goes.                                                                                                                                                                              | Actors R22, R23, I35, I38            |

### 2a. Labels: what the suite records when it makes a fact

Payloads and memory stay opaque inside expect (R19; advisor Q2). The suite's driver and its fake server already
construct every value a guard or key reads. They attach labels at that point, outside expect:

```ts
// CHANGED: Drove gains labels the driver computes from the fixture's typed payload.
Drove: { actor; event; to; labels: Labels };
// CHANGED: Answered gains the fixture's labels of the answer it gave.
Answered: { request; answer; labels: Labels }; // e.g. "capturable" (one predicate, cited)
// CHANGED: the boot's release, so OldVersion is a fact.
Reloaded: { release: number };
// NEW: labels are named values a fixture's label functions compute; expect never reads a payload.
type Labels = Readonly<Record<string, Json>>;
```

- Each label function lives in one place (`fixtures/`), next to the event or answer it reads. It has its own
  fixture test whose expected values come from the Spec's tables (for example, the capturable status list), not
  from the machine's own predicate. That bounds the common-mode risk that a fold shares the runtime's misreading.
- Labels are computed at play time, never stored in a script, so a shrunk or replayed script cannot carry stale
  ones.
- `answerAtOnce` records `Answered` too (today it records none).
- Firings are not facts (B1): the world clock's timers are the runtime's. The `schedules` oracle compares the
  reported firings with the predicted ones.

### 2b. Memory a guard, key or delay reads: fixture folds (decision 1, option B)

Memory reaches more than guards (B3). Pay's keys (`intentId`, set by `Start`), `WAITING`'s `retry` delay
(`retryInMs`, from `Busy`'s `retryAfterMs`), `unsureChallenge`'s `clientSecret`, Pay's `Leave` guard (`authorized`,
`receipt`), `Busy`'s `busyTries`, and LateQueue's `Unsure` flag (set by the driven `Cancelling`) all read memory.

- Each fixture's reference declares **one fold per memory field that a guard, key or delay reads**, and nothing
  else. A fold sits next to the `updating(…)` alternatives that set its field, written alternative by alternative
  from the handler table: state tokens, the event, and the labels of the fact that caused the turn.
- A fold reads labels and earlier fold values only. It never reads the runtime's memory, a report, or a payload
  through a codec. So R19's opacity holds for everything the runtime holds; the fold is part of the fixture's
  source and reference, which R20 names as suite facts.
- Each folded field stays only while a model mutation kills it (T39).
- A spec-log entry asks for a wording note on Conformance R19 ("memory opaque", except fixture-reference folds),
  for the user's read.
- `claimed` is deleted: its rows' guards become folds.
- Stop rule: a fold that needs a new guard kind, or any change to Flow's public API, stops the build for the user.

## 3. Choices, as allowed sets

| Choice                                                    | Allowed                                                                         | Rule                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------- |
| interleaving of different lanes' endings in one step      | any; compared per lane                                                          | Actors I31; Restore R3 |
| hold-leaving ending within one lane at the disposal's end | last; the rest in any order                                                     | Actors R22, I31        |
| the leaf after a kill with turns no landed capture holds  | any leaf those turns reached                                                    | WriteAhead R10, I10    |
| what a batch written in a step holds (B4)                 | some prefix of the step's turns, from the turn that issued it to the step's end | WriteAhead R7, R10     |
| an actor's end where in-flight work is not computable     | ended or not                                                                    | Actors R8              |

A kill never makes "the restore, or nothing" a choice: the landed capture decides which one is owed. With B4, the
landed capture is one of a known set of prefixes, so a kill owes, for each Attempt, what every prefix in the set
agrees on, and allows what they disagree on. B4 lands before step 5's generators.

## 4. Report kinds outside the lifecycle, and the four report-only cases

| Report                                                              | Who judges it, against what                                                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `Published`                                                         | `publication`: a turn's or an incarnation's publication (Turn I9, R9)                                                                |
| `Unhandled`, `Denied`                                               | `selection` and `refusal`, against `turn/predict.ts`'s alternatives (Turn R2, R8, I15)                                               |
| `Turn.parts`, route                                                 | `selection`, `graph-names`, `idle-guard`, against the predicted alternative (Turn R6, R20)                                           |
| `Issue` (InvalidTurn, UnmappedEnding, others)                       | `refusal` and `ending-channels`. A refused turn is predicted only for fixtures that declare a throwing action (a new fixture field). |
| `Evidence` InFlight, NothingToResend, StorageFailure, StorageSilent | `evidence-kinds` and `lane-queue`, from the store's facts (`Dropped`, `Wrote`)                                                       |
| `Recorded` ignored, evidence                                        | `delivered-once`, through Table C                                                                                                    |

The four report-only cases:

| Case               | Becomes                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| claimed rows       | **deleted.** Their guards are computed by fixture folds (section 2b). No limits row.                                                                                                                                                                                                                                                                                                                                |
| NO_POLICY declines | `OldVersion`: the `Reloaded.release` fact. `Unencodable`: the driver's `encodable` label. `NoPersistence`: a boot without persistence is the suite's own choice (WriteLanes R12, WriteAhead R1), so it is a boot fact; the second-tab refusal (WriteAhead R16) needs a fake-store change. `ModuleDisabled`: no core rule yet (WriteLanes R13, Q3, phase 5), so the model refuses it until then. **No limits rows.** |
| `Finished`         | **owed from facts** (decision 3, B2): Actors R8, I10, I37 (section 2). The Port keeps it as a compared report.                                                                                                                                                                                                                                                                                                      |
| `RuntimeDisposed`  | **dispose's Exit, a compared runtime answer** (decision 2): the suite records it, and the observation goes. CleanupFailed shows in the Exit too (Actors R23).                                                                                                                                                                                                                                                       |

## 5. Build order and checks

1. The fact split (B1), labels (section 2a), dispose's Exit, and the fixture folds (section 2b). Gate: the hand and
   derived rows stay equal (V3), and the catch matrix shows no lost catch (V1).
2. Cut `dsl/expect.ts` and `turn/predict.ts`, then `dsl/compare.ts`, one item kind at a time: turns and members,
   then mints, sends, endings, lives, restores, ends. After each kind: falsify round-14 at 147/147, the sweep
   baseline with no lost catch, and crash production no lower than 640. Check each of the six `lives` oracles (N4).
   Where a fold is not built yet, expect offers every alternative the table allows, and compare narrows to the one
   a report fits. That is weaker but honest; each fold then narrows the set to one.
3. The T40 lint, seen rejecting a planted import. T38's three planted runtimes: one omits an owed report, one adds
   a report that is neither owed nor allowed, one breaks a named cell.
4. Phase-out step 1: delete `lifecycle-perturbations.ts`, Table A's refuse-only cells and `claimed`. Each deleted
   cell names the check that keeps its Invariant (Conformance I38). Liar round-14: at most 9 greens is the
   phase-out's threshold. R21's gate is every behavioural mutant caught, with each green left listed as report
   truth.
5. B4's allowed capture set, before step 5's generators. Then a generator assert: the most branches alive at
   once, recorded on the first run (section 3).

## Decisions (orchestrator, 74911f8d)

1. Memory: option (B), as fixture-reference folds (section 2b); the R19 wording note goes to spec-log.
2. `RuntimeDisposed`: replaced by dispose's Exit, a compared runtime answer.
3. `Finished`: owed from facts (Actors R8, I10, I37); the Port keeps it.
4. The acknowledged set: a `limits.ts` row, with the liar gate extended to it. WriteAhead R5 fixes a lane record's
   identity (identity with its version, contract id, key), but not how the store's keys spell it. That spelling is
   the runtime's encoding, so the fake store cannot tell which lane a batch wrote without a codec. The check does
   not narrow the limit (lead, 2026-11-11).
5. The capture position: an allowed set (B4), replacing the stated limit.

Acceptance 5's file list changes with the split (N5). Obligation code moves from `lifecycle-step.ts`,
`lifecycle-owed.ts` and `turn/selection.ts` to `dsl/expect.ts` and `turn/predict.ts`, and the lint covers every
expect module. The intent is unchanged.
