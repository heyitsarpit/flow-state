# T45 step 3: the expect half (proposed, 2026-11-11)

Proposal: the lifecycle model and the turn anchor become the expect half. They build what each step owes or allows
from suite facts, labelled when the suite makes them, and from the fixtures. Every oracle becomes the compare side.
It matches reports against those items and refuses what does not fit (Conformance R19, R20). The tables stay. What
changes is where their inputs come from, and that the model stops binding obligations on the runtime's word.

Everything here is proposed. Five items need a decision from someone other than the lead; they are listed under
Flagged.

**Why now:** a locator counted about 15 report uses that create obligations and about 55 that choose among them
(@task.V3.T45, comment of 2026-11-11). The liar gate leaves 9 round-14 mutants green.

**Read first:** @spec.Conformance R19 to R22, T37, T38, T40; advisor Q1 and Q2
(code:workflow/plans/flow/references/proposals/advisor-answers-2026-11-11.md); code:packages/flow-state-v3/conformance/dsl/lifecycle-step.ts#step.

**Prior draft:** four Haiku sidecars attacked a first draft from four angles: Spec citations, feasibility, the
model turning into a runtime, and completeness. This version folds in their findings. The first draft predicted
memory and timers, and allowed "nothing" after a kill; all three are gone.

## 1. The boundary

- **Expect** (the T40 lint bans `Observation`, `Turn`, `Delivered` and `TurnPart` imports):
  - `dsl/lifecycle.ts`, `lifecycle-lives.ts`, `lifecycle-lanes.ts`, `lifecycle-rules.ts`, `lifecycle-owed.ts`;
  - a new `dsl/expect.ts`, cut from `lifecycle-step.ts`;
  - `turn/anchor.ts`, and a new `turn/predict.ts`, cut from `selection.ts` and `late.ts`.

  Expect's input is `SuiteFact` (every `Fact` but `Reported`).
- **Compare** is `dsl/compare.ts`: the rest of `lifecycle-step.ts`. It walks the step's reports in order. Each report
  must fit an item that expect holds, matched per lane and per actor, never across lanes (Actors I31 and Restore R3
  order endings within a lane only). A report that fits nothing is refused. A fitting report advances only along the
  move that expect predicted. An owed item still unmatched when it falls due is refused.
- **Refusals name the Invariant of the cell that made the item.** Compare emits today's `LifeStep` (`before`,
  `after`, `applied[].refusals`), so the oracles that read `lives` keep their contract.
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
| turn: event                   | `Drove` (with `to` for parts), an owed delivery's mapped event, or a world `Fired` fact                                                                                                                                                                                                                                                             | Turn R2, R15, R19                    |
| turn: from                    | a current ending: the anchored leaf. A late one: the owner's nearest surviving ancestor. After a kill with turns no capture holds: unknown until the next turn (the anchor's `Stored(none)`)                                                                                                                                                        | Turn R1, R20; WriteAhead I10         |
| turn: to, and Denied          | the handler alternatives in source order. A guard reads only the lane state the model holds (`idle`, `retryable`, WriteLanes R9) or a label on a suite fact (section 2a).                                                                                                                                                                           | Turn R2, R12; WriteLanes R9          |
| members, releases             | Table B's row for the predicted (event, from, to). The reported members are never read.                                                                                                                                                                                                                                                             | WriteLanes R9, R16                   |
| member key                    | the `key` label the driver records on `Drove` (section 2a). Checked against `Requested.request.input` once sent.                                                                                                                                                                                                                                    | WriteLanes R6, R9                    |
| mint or decline               | the lane's admission cell (Table B) and the lane state. A decline's reason comes from that cell, or from a labelled boot fact (section 4).                                                                                                                                                                                                          | WriteLanes R1, R7, R12               |
| send                          | a persisted head after its acknowledging batch lands (`Wrote`, `Acknowledged`). A non-persisted head after its turn. A retry's re-send after its capture. Counted from `Requested` only.                                                                                                                                                            | WriteAhead R13; WriteLanes R8        |
| ending                        | `Answered` through the fixture's `classify`: `Lost` is unknown (`mayHaveApplied`). A definite failure after an unknown send is unknown `StillUnknown`. `Never` gives no ending (no timeout reason). A cancel: `NotSent { Cancelled }` if the Attempt was never sent, else `unknown { Cancelled }`. Past the disposal bound: `unknown { Disposed }`. | WriteLanes R2, R3, R14; Actors I35   |
| delivery, park, unpark, letGo | Table C lives. Parked or delivered follows the suite's held uses (`Ensured`, `Released`, `Disposed`, `Forgot`).                                                                                                                                                                                                                                     | WriteLanes R10, I15; Actors R20, R21 |
| evidence                      | Released: a release row (WriteLanes R16), a not-retained unknown's turn (R4), cancel of a Held lane (R14). Superseded: `latest`'s supersede cell (R7).                                                                                                                                                                                              | WriteLanes R4, R7, R14, R16          |
| restore at a boot             | per lane in creation order: parked endings in saved order, each queued commit's `NotSent { Restored }`, then a Held or acknowledged head's `unknown { Restored }` last, unless its outcome landed (`saved`). Owed, never "or nothing".                                                                                                              | Restore R3, I5, I6; WriteAhead I17   |
| incarnation                   | `Ensured`, `Drove` or `Reloaded` of an actor with no live incarnation                                                                                                                                                                                                                                                                               | Actors R6, R9                        |

### 2a. Labels: what the suite records when it makes a fact

Payloads and memory stay opaque inside expect (R19; advisor Q2). The suite's driver and its fake server already
construct every value a guard or key reads. They attach labels at that point, outside expect:

```ts
// CHANGED: Drove gains labels the driver computes from the fixture's typed payload.
Drove: { actor; event; to; labels: { key: Option<Json>; encodable: boolean } };
// CHANGED: Answered gains the fixture's labels of the answer it gave.
Answered: { request; answer; labels: ReadonlyArray<string> }; // e.g. "capturable" (one predicate, cited)
// NEW: world facts the model needs for timing and versions.
Fired: { timer: string; at: number };            // world/clock.ts records each firing inside an Advance
Reloaded: { release: number };                    // the boot's release, so OldVersion is a fact
```

- Each label function lives in one place (`fixtures/`). It has its own fixture test whose expected values come from
  the Spec's tables (for example, the capturable status list), not from the machine's own predicate. That bounds
  the common-mode risk that a fold shares the runtime's misreading.
- `answerAtOnce` records `Answered` too (today it records none).

### 2b. Guards that read memory: a fixture question (flagged)

Pay's `Leave` guard reads `authorized && receipt === null`, and `Busy` reads `busyTries`. Those memory fields
change with state: a `Confirmed` updates `authorized` only from `LEFT`, from `IDLE`, or from `PAYING` index 1, and
`Start` and `Placed` reset it. Following them means replaying the machine's memory updates, which makes the model a
second runtime and breaks R19's opaque memory. R20 calls such a fixture a bug. Two ways out:

- **(A), recommended:** change the conformance fixtures so that each guard reads lane state or a labelled fact.
  - Pay's `Leave` guards on "the `pay` lane's last ending is a capturable success not voided": lane state plus an
    `Answered` label.
  - LateQueue's `Unsure` guards on its driven `Cancelling`, which is already a fact.
  - `busyTries` becomes a retryable lane guard (WriteLanes R9).

  `claimed` is deleted.
- **(B):** keep the guards, and give the reference a fold per guarded field, written alternative by alternative from
  the handler table (state tokens included). This breaks R19's opacity for those fields.

## 3. Choices, as allowed sets

| Choice                                                    | Allowed                      | Rule                   |
| --------------------------------------------------------- | ---------------------------- | ---------------------- |
| interleaving of different lanes' endings in one step      | any; compared per lane       | Actors I31; Restore R3 |
| hold-leaving ending within one lane at the disposal's end | last; the rest in any order  | Actors R22, I31        |
| the leaf after a kill with turns no landed capture holds  | any leaf those turns reached | WriteAhead R10, I10    |

A kill never makes "the restore, or nothing" a choice. `saved` decides which one is owed.

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
| claimed rows       | **deleted.** Their guards are computed from section 2b's choice. No limits row.                                                                                                                                                                                                                                                                                                                                     |
| NO_POLICY declines | `OldVersion`: the `Reloaded.release` fact. `Unencodable`: the driver's `encodable` label. `NoPersistence`: a boot without persistence is the suite's own choice (WriteLanes R12, WriteAhead R1), so it is a boot fact; the second-tab refusal (WriteAhead R16) needs a fake-store change. `ModuleDisabled`: no core rule yet (WriteLanes R13, Q3, phase 5), so the model refuses it until then. **No limits rows.** |
| `Finished`         | **report truth, flagged.** No Spec rule owes or defines it. Its mutant (`publication`'s incarnation-end edit) stays report-only until the Spec defines it, or the Port drops it.                                                                                                                                                                                                                                    |
| `RuntimeDisposed`  | **flagged.** The Spec uses the name only for calls refused after admission closes (Actors R22). The disposal's end is `dispose`'s own result (Actors R23). Proposed: the suite records that result as a suite fact, and the Port observation goes. That is a Port change.                                                                                                                                           |

## 5. Build order and checks

1. Labels and world facts (section 2a), and the fixture change chosen in section 2b. Gate: the hand and derived
   rows stay equal (V3), and the catch matrix shows no lost catch (V1).
2. Cut `dsl/expect.ts` and `turn/predict.ts`, then `dsl/compare.ts`, one item kind at a time: turns and members,
   then mints, sends, endings, lives, restores. After each kind: falsify round-14 at 147/147, the sweep baseline with
   no lost catch, and crash production no lower than 640.
3. The T40 lint, seen rejecting a planted import. T38's three planted runtimes: one omits an owed report, one adds
   a report that is neither owed nor allowed, one breaks a named cell.
4. Phase-out step 1: delete `lifecycle-perturbations.ts`, Table A's refuse-only cells and `claimed`. Each deleted
   cell names the check that keeps its Invariant (Conformance I38). Liar round-14: at most 9 greens is the
   phase-out's threshold. R21's gate is every behavioural mutant caught, with each green left listed as report
   truth.
5. A generator assert: the most branches alive at once, recorded on the first run (section 3).

## Flagged (not decided)

1. Section 2b: fixture change (A) or memory folds (B). This is the reviewer's call, and the user's read.
2. `RuntimeDisposed` as a suite fact instead of a Port observation: a **Port change**.
3. `Finished`: no Spec rule. Either the Spec defines it, or the Port drops it (a **Port change**). Until then it is
   report truth.
4. The acknowledged set stays the runtime's claim (`storage.write`'s `acknowledges`). Making it a world fact needs
   the store to read Attempt ids from the bytes, which the Port's no-codec rule forbids. Until then: a stated limit,
   with the liar gate extended to it.
5. The capture position: `Wrote` is noted at the step's end, so one step's later turns are credited to its batch
   (stated limit, c12bbfdd). Recording the write at its call needs reports in write order, which round-14 does not
   give.
