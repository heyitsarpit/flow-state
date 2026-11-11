# Conformance phase-out: from hand descriptions to an input/output validator (proposed, 2026-11-11)

**Bottom line (proposed):** about half of `packages/flow-state-v3/conformance/` (13,150 of 26,410 TypeScript
lines) becomes redundant once real fixtures, a reference derived from `Compiled`, the Spec model's compare and
production mutants exist. It retires in eight steps tied to the replan's slices. Four steps fold into existing
Tasks (T45, T47, each slice Task, T23). Two new Tasks are proposed: **T52**, the first cut after T47's pilot and
before T18, and **T53**, round-14 retired entirely after T24. Every step is gated by the same four checks: no lost
catch, the same coverage and matrix rows, derived equal to hand wherever both exist, and green Compile static
cases. The validator that remains has about 14,000 to 15,000 lines. Its work per run is: compile real fixtures,
derive their reference, replay scripts, compare with the model, and judge with oracles that read world facts.
Everything here is proposed. Seven questions for the user are in part 5.

**Why now:** today's `fixtures/` (1,720 lines) describes 12 machines by hand: typed descriptors, reference rows
and handler tables. That description runs parallel to the real machines, and `conformance/machines/` keeps a
third copy of Pay in the production API. The replan (R15 to R22, accepted) builds real fixtures, the model and
the generators, but it never says what each of them makes redundant, or when. If nothing retires it, the suite
keeps two descriptions of every machine and two judges of every run.

**Read first:** `replan-2026-11-11.md` (part 1 "The suite", part 3 slices), @spec.Conformance R15 to R23, advisor
Q1 to Q3 and Q5, @task.V3.T45, @task.V3.T47, @task.V3.T23.

**Correction to the brief:** production keeps no fixture copies under `src/`. The only copy in the production
API is `conformance/machines/pay.ts` and `pay.contracts.ts` (626 lines, Pay and Cells), which
`adapters/production.ts:18` imports.

## 1. Inventory

Counts come from `wc -l` at `0e491c4c`. Verdict codes: **S** stays, **R** replaced, **14** retired with round-14,
**D** deleted (part 2 says by what). "Uses" names the main importers.

### Contracts and registry (1,283)

| Module        | Lines | What it does                               | Uses                   | Verdict |
| ------------- | ----- | ------------------------------------------ | ---------------------- | ------- |
| `port.ts`     | 410   | The Port: `Boot`, `Runtime`, `Observation` | about 60 files         | S       |
| `surface.ts`  | 204   | Static Surface: construct, admit, cli      | static cases, adapters | S       |
| `suite.ts`    | 231   | Registry of guarantees and cases           | runner                 | S       |
| `coverage.ts` | 347   | Coverage gate per core Invariant           | runner, remainders     | S       |
| `not-yet.ts`  | 91    | 13 prose rows owed per Task                | `runner/main.ts`       | R       |

### The Spec model and its tests (`dsl/lifecycle*`, 7,192)

| Module                              | Lines | What it does                    | Verdict         |
| ----------------------------------- | ----- | ------------------------------- | --------------- |
| `lifecycle` and its 5 table modules | 2,404 | Tables A to C; pure transitions | S (the model)   |
| `lifecycle-step`, `lifecycle-owed`  | 667   | Step fold; owed (reads reports) | S, split in T45 |
| `lifecycle-trace.ts`                | 182   | Trace shape and builders        | S               |
| six `*.traces.ts`                   | 2,267 | 117 hand runs (replan: 137)     | R, rulings kept |
| `lifecycle.test.ts`                 | 443   | Replays the traces              | S, smaller      |
| `lifecycle-step.test.ts`            | 686   | Hand step mutants               | R               |
| `lifecycle-perturbations.ts`        | 543   | 340 perturbed reports (claims)  | D               |

The model imports only types and helpers from `fixtures/reference.ts` (`Reference`, `Row`, `Concurrency`,
`retains`, `mappedEvent`) and nothing from `src/`.

### Case engine (`dsl/`, 1,313)

| Module                      | Lines | What it does                        | Verdict           |
| --------------------------- | ----- | ----------------------------------- | ----------------- |
| `case.ts`                   | 594   | `Scenario`, `playCase`, step engine | S, becomes player |
| `oracle.ts`                 | 365   | `Fact`, `oracle`, `Mutant`, `Probe` | S                 |
| `actor.ts`                  | 115   | Typed actor view, hand Schemas      | R                 |
| `domain.ts`, `reports.ts`   | 138   | Attempt helpers; report decoding    | S                 |
| `play.ts`, `static-case.ts` | 101   | Crash play; static `expect`         | S                 |

### Fixtures (1,720) and the production copy (626)

| Module                             | Lines | What it does                     | Uses                | Verdict  |
| ---------------------------------- | ----- | -------------------------------- | ------------------- | -------- |
| `fixture.ts`                       | 165   | `Fixture`, `referenceFor`        | `case.ts:200-202`   | R        |
| `reference.ts`                     | 243   | Types, helpers, row builders     | 22 files, the model | split    |
| `handlers.ts`                      | 269   | Handler types, builders          | 6 oracles           | split    |
| `pay.ts` (Pay, Cells)              | 274   | Hand `Checkout/Pay`              | 13 scenario files   | R (T52)  |
| `one-lane.ts` (5 labs)             | 187   | Five lane labs                   | lane cases, model   | R        |
| `keyed`, `stamp`, `issues`, `form` | 293   | Keyed, Held, Stamp, Issues, Form | 3 scenario files    | R        |
| `pay-steps.ts`                     | 127   | Pay step helpers                 | 10 scenario files   | 14       |
| `rows.test.ts`                     | 162   | Hand rows vs round-14            | test runner         | R        |
| `machines/` (2 files)              | 626   | Pay, Cells in public API         | `production.ts:18`  | S, moves |

Each hand descriptor names its prototype source in `prototypes/conformance/typed/` (for example
`fixtures/pay.ts:229`), which the prototype adapter loads by name (`adapters/prototype.ts:136-148`). The
descriptors are read only on the judging side (`dsl/case.ts:200-202`); the two are linked by catalogue name.

### Area oracles and helpers (3,446), scenarios (2,292), mutants (2,155), remainders (133)

| Group                                        | Lines | Reads                      | Verdict      |
| -------------------------------------------- | ----- | -------------------------- | ------------ |
| `attempt-identity`, `ending-channels`        | 682   | reference, server log      | S (boundary) |
| `refusal`, `publication`                     | 415   | Port; handler tables       | S            |
| six lane oracles (`lane-queue` and 5)        | 731   | model fold                 | S            |
| `actors/disposal.ts`                         | 374   | model, reference, Port     | S, grows (4) |
| `turn/selection`, `anchor`, `phases`, `late` | 995   | hand tables                | R (T17)      |
| `turn/schedules.ts`                          | 249   | handler tables, selection  | S            |
| 16 `*.scenarios.ts` (99 cases)               | 2,292 | hand fixtures, `pay-steps` | 14           |
| 17 `*.mutants.ts` (114, 4 probes)            | 2,155 | round-14 edits             | 14           |
| three `remainders.ts`                        | 133   | `coverage.ts`              | S            |

12 of the 13 oracles import the Port, and none imports `Compiled`. Five scenario files hold **case-only**
Invariant rows that no oracle judges: schedules (Turn I22), lane-keys, payment-retry, parts and refusal
(`suite.ts` `caseChecks`). Those cases cannot retire until an oracle or the model judges those rows. Scenarios
that document a ruling, and cases with a unique catch, survive as rulings or regression scripts (step 6).

### Adapters (2,069), world (725), static cases (1,502), runner (1,957)

| Module                               | Lines | What it does                        | Verdict  |
| ------------------------------------ | ----- | ----------------------------------- | -------- |
| `adapters/prototype*` (4 files)      | 1,340 | Round-14 Port and surface           | 14 (T53) |
| `adapters/production.ts`             | 387   | Port over `src/` for `pay`, `cells` | S        |
| `adapters/production.mutants.ts`     | 288   | 18 production mutants               | S, grows |
| `adapters/null.ts`, `null-static.ts` | 54    | Null runtime and surface            | S        |
| `world/` (5 files)                   | 725   | The fake world                      | S        |
| static cases, `graph*.ts`            | 997   | CMP-01 to 11, CLI-01 to 09          | S        |
| static mutants (3 files)             | 505   | Round-14 compiler edits             | 14       |
| `runner/` (11 modules)               | 1,957 | suite, falsify, liar, crash, gates  | S        |

Production has **no static surface**: `runner/args.ts:46-51` binds the null surface for production and says T17
builds it. Today the Compile static cases run only on round-14's compiler.

### Records

`gates.json` (at `294f63a3`, stale against HEAD `0e491c4c`), the catch matrices (prototype 200 rows, production
19), `core-mutants.tsv` and the liar lists are regenerated outputs; they stay, and the prototype ones go in T53.
`STATUS.md` (1,730 lines) was history; it was retired on 2026-11-11 and its live content moved to the Tasks' comments.

## 2. Verdicts by kind (proposed)

| Verdict               | Lines  |
| --------------------- | ------ |
| stays                 | 13,260 |
| replaced              | 6,190  |
| retired with round-14 | 6,420  |
| deleted               | 543    |

- **Stays, the validator core:** Port, Surface, registry, coverage, world, case engine, the model, the boundary
  and model-reading oracles, static cases, runner, production and null adapters, production mutants.
- **Replaced:** hand descriptors and builders (1,431), `rows.test` (162), `dsl/actor` (115), `not-yet` (91),
  hand traces (2,267), model tests (1,129, partly kept) and the Turn helpers (995).
- **Retired with round-14:** prototype adapters (1,340), area mutants (2,155), static mutants (505), hand cases
  (2,292) and `pay-steps` (127); also `limits.ts`, new in T45 (about 50).
- **Deleted:** `lifecycle-perturbations.ts`.

What replaces each piece:

- **Hand descriptors** (`pay.ts`, `one-lane.ts`, `keyed.ts`, `stamp.ts`, `issues.ts`, `form.ts`): real machines in
  `fixtures/`, each a twin of its prototype source, written in the slice that builds its features. A derived
  reference, `referenceOf(compiled)` (T47), gives events, states, handlers (`at`, target, `InState` and `Idle`
  guards, opaque `Check`, update), schedules, rows (the alternatives whose actions are lane members) and each
  operation's concurrency, key fields and ending map.
- **Not derivable from `Compiled`:** `classify` (how a commit turns an answer into a channel) depends on the
  commit's code, so the fixture declares it next to its server model. `releasesOnLeave` needs `whenAbandoned` in
  `Compiled`, which slice 3 adds.
- **`reference.ts` and `handlers.ts`:** the types and pure helpers (`retains`, `mappedEvent`, `possible`,
  `updatesAt`) move into the derived reference's module. The builders (`row`, `to`, `updating`, `guarded`) are
  deleted.
- **`rows.test.ts`:** an equality test, derived against hand, for as long as both exist. After that, while
  round-14 still runs hand cases, a check of derived against round-14's compiled machine. T53 deletes it.
- **Hand traces:** the small exhaustive search over the model (T45) reaches the same table cells. Traces that
  document a ruling are kept, about 400 lines (estimate).
- **`lifecycle-step.test.ts`:** model mutation (Conformance T39, T47) mutates every table cell, not a hand list.
- **`turn/selection.ts`, `anchor.ts`, `phases.ts`, `late.ts`:** the model's Turn section, written in slice 3
  (T17). It predicts the allowed alternatives from the derived handlers, gives a set where a guard is opaque,
  and the generic compare judges the reports.
- **`not-yet.ts`:** `limits.ts` for the round-14 reasons (T45), and matrix rows "owed by slice N" for the rest
  (T47).
- **Round-14 mutants:** production mutants written per slice for each oracle the slice judges (Conformance I12
  requires one per implementation under test), plus model mutation and core mutants.
- **Hand cases:** generated runs over the same fixtures. A case that catches something nothing else catches
  becomes a shrunk regression script in `conformance/regressions/`. A case that documents a ruling stays (R15).

## 3. Phase-out order (proposed)

Every step runs the same four validations. Steps that delete nothing still record the baseline.

- **V1, no lost catch:** falsify on each runtime still in the gates, with `writeMatrix`'s lost-catch failure
  (`runner/matrix.ts`, `main.ts:346`). The baseline is a mutant × case sweep (step 0), so a step that deletes a
  case knows what that case alone caught.
- **V2, same rows:** the coverage report keeps every Checked and CaseChecked Invariant. Once T47's matrix
  exists, the matrix rows stay the same.
- **V3, derived = hand:** wherever a hand descriptor and a derived reference both exist, they are equal: rows,
  handler tables, schedules, operation fields, and `classify` over every answer × `mayHaveApplied`.
- **V4, compiled output:** CMP-01 to CMP-11 are green on each real fixture's `Compiled`, through a production
  static surface.

| Step | Task               | Retires                        | Precondition                  |
| ---- | ------------------ | ------------------------------ | ----------------------------- |
| 0    | T45 step 1 (fold)  | nothing: the baseline          | falsify round-14 147/147      |
| 1    | T45 step 3 (fold)  | perturbations; claim cells     | compare; lint                 |
| 2    | T45 step 6 (fold)  | round-14 prose limits          | `limits.ts` gate              |
| 3    | T47 (fold)         | nothing (builds `referenceOf`) | T51 done                      |
| 4    | **T52 (new)**      | Pay, Cells descriptors; traces | step 3; T45's search          |
| 5    | T18, T20, T17, T24 | lab descriptors; Turn helpers  | features on production        |
| 6    | T23 (fold)         | redundant hand cases           | production mutants per oracle |
| 7    | **T53 (new)**      | round-14 entirely              | twins; parity by Invariant    |

### Step 0: baseline (fold into T45 step 1)

Refresh `gates.json` at HEAD, since it is stale at `294f63a3`. Add a `falsify --sweep` record per runtime
(mutant × case → red or green) as `catch-sweep.<runtime>.tsv`, and the coverage standings per Invariant. Every
later step compares against these.

### Step 1: claims out (fold into T45 step 3)

Once obligations read suite facts only and one compare judges the reports, the claim half becomes dead code: the
340 perturbations, Table A's refuse-only cells and the `claimed` handling in `lifecycle-owed.ts`. Advisor Q1
names the perturbation file deletable at this point. V1 runs on both runtimes, with liar round-14 greens no more
than 9.

### Step 2: limits list (fold into T45 step 6)

`limits.ts` rows replace the round-14 reasons in `not-yet.ts` and the README's round-14 limits. V2 holds: no
Invariant changes standing, and every row fails on round-14 by its Invariant.

### Step 3: the derived reference exists (fold into T47)

T47 already derives part references from `Compiled` and runs the Compile static cases on every composite's
`Compiled`. Running those cases needs a production static surface for `construct` and the data view, which the
runner says T17 builds (`runner/args.ts:46`). Question 4 proposes moving that slice of it into T47. This step
retires nothing, so V4 sets its baseline here.

### Step 4: the first cut (new T52, after T47, before T18)

`T52 Suite phase-out, first cut: Pay and Cells derived; traces generated` (proposed, effort about 1.5).

- `machines/pay.ts` and `pay.contracts.ts` move to `fixtures/pay/`, and `fixtures/` moves beside `conformance/`
  (question 1). Pay declares its `classify` beside its server answers.
- `referenceOf` replaces `fixtures/pay.ts`'s Pay and Cells for every runtime, round-14 included. The reference is
  the machine's, not the runtime's, and V3 shows the twin is the machine round-14 runs: hand equals
  round-14-compiled (today's `rows.test.ts`), and derived equals hand.
- `fixture.ts` becomes the real-fixture registry. `dsl/actor.ts` types the view from the definition's Schemas.
- Traces whose cells the search reaches are deleted. A trace that is kept names its ruling. The step mutant list
  in `lifecycle-step.test.ts` gives way to cell mutation.
- `not-yet.ts`'s remaining rows become matrix rows. The file is deleted.
- **Validation:** V3 for Pay and Cells (rows, handlers, schedules, every operation field, `classify`) before any
  deletion; V1 on round-14 and production; V2 for coverage and the matrix; V4 on Pay's and Cells' `Compiled`.
  Model mutation: every hand-listed step mutant is still killed, by the search or by a kept trace.

### Step 5: twins per slice (fold into each slice Task)

| Slice, Task | Twins written in `fixtures/`                      | Also retires                           |
| ----------- | ------------------------------------------------- | -------------------------------------- |
| 1, T18      | Serialize, Latest, Cancel, LateQueue, Keyed, Held | `one-lane.ts` but Release; `keyed.ts`  |
| 2, T20      | Stamp (release 1 and 2 keys; `up`)                | `stamp.ts`                             |
| 3, T17      | Release (trait, `whenAbandoned`), Form            | rest of `one-lane.ts`; `form.ts`; Turn |
| 8, T24      | Issues (entity writes)                            | `issues.ts`; the last builders         |

In each slice, the slice's builder:

- runs the hand cases on that fixture on production;
- writes production mutants per oracle the slice judges, mapped by Invariant from the round-14 mutants;
- deletes the descriptor once V3 holds.

**Validation:** V3; the same verdict per case on round-14 and production; V1 per Invariant on production against
step 0's round-14 baseline; V4 on each twin's `Compiled`. In T17, the model's Turn section must catch every
mutant that `selection`, `late` and `schedules` caught (V1) before the helpers go. The slice builder confirms each
twin's slice, since the lab sources were read only at their headers.

### Step 6: hand cases thinned (fold into T23)

T23 already takes round-14 out of the gates. Before that happens:

1. Each hand case's catches come from step 0's sweep, plus the generated rows the catch matrix gains in T45 and
   T47.
2. A case is deleted when two things hold:
   - every mutant it turns red is also turned red by a generated run or by a kept case;
   - it carries no case-only Invariant row.
3. A case that has a unique catch becomes a shrunk regression script that cites what it caught.
4. A case-only row moves to an oracle or a model check first, or its case stays.
5. `pay-steps.ts` and `dsl/actor.ts` go with their last user.

Pay's 66 cases depend on question 2. **Validation:** V1 and V2. The matrix rows keep their fixture kind, changed
from "hand case" to "part" or "regression" as the case moves.

### Step 7: round-14 retired (new T53, after T24)

`T53 Round-14 retired: prototype adapters, mutants and limits deleted` (proposed, effort about 1).

- **Retires:**
  - `adapters/prototype*.ts`;
  - every `runtime: "prototype"` mutant and the round-14 compiler and CLI mutants;
  - `limits.ts`, `catch-matrix.prototype.tsv`, `liar-prototype.txt` and the round-14 rows check;
  - the runner's prototype paths: `DEFAULT_RUNTIME` and the copy and edit of a runtime tree;
- **Precondition:**
  - every hand fixture has a twin, which happens after slice 8;
  - production static mutants exist (T17 for Compile, T22 for the CLI);
  - parity per Invariant: every Invariant that some round-14 mutant proves is proved on production, by a
    production mutant or by model mutation.
- **Validation:**
  - V2 with the Checked set unchanged;
  - V4;
  - falsify production, liar production and core mutants no worse than at T53's start.

## 4. End state (proposed)

Under `packages/flow-state-v3/`, with sizes for today's scope. Model sections added by slices 2, 4 and 5 are
growth from new Specs, not part of this count.

- **`fixtures/`:** real machines on `src/index.ts`, imported selectively: Pay and Cells, 10 lab twins, and the
  composite parts (`shape()`: machine, user model, server model, `classify`). About 2,000 lines at slice 1, and
  parts grow per slice (estimate).
- **`conformance/`:** Port, Surface, world, the script Schema, player, generator and shrinker, `referenceOf`, the
  Spec model (the lifecycle plus a Turn section) with the generic compare, the boundary oracles, static cases,
  production and null adapters, production mutants, the matrix, combination and coverage gates, the runner, and
  `regressions/` (data). 14,000 to 15,000 lines against 26,410 today (estimate).
- **`bench/`:** replays scripts on production with no observer, gated only by the work fingerprint, with turn
  cost recorded. About 200 to 300 lines (estimate).

The upper bound keeps the model at today's 3,253 lines. Advisor Q2's estimate of 40 to 50 percent fewer lines
after compare, which is unproven, gives the lower bound.

**Per run, the validator:**

1. Compiles each fixture it needs through production and derives its reference. It runs CMP-01 to 11 on each
   `Compiled`.
2. Takes the gate's scripts: generated from (part or app mix, profile, seed), plus every regression script.
3. For each script, has the Spec model compute what each step owes and allows. The player replays the script on
   production through the Port over the fake world. Boundary oracles judge against the server log and the store,
   and the compare refuses any report the model neither owes nor allows.
4. Records reach (cells, pairs) and the work fingerprint.
5. Gates:
   - case verdicts;
   - matrix and combination;
   - falsify on production, model mutation and core mutants;
   - liar;
   - coverage.

   It writes `VERDICT` lines and `gates.json`.

No hand reference, no hand handler table and no second runtime is left. A new bug becomes a shrunk regression
script.

## 5. Risks and questions

**Risks (no decision needed):**

1. **A check lost silently.** Generated runs carry no case expectations (advisor Q5). A hand case deleted for a
   case-only Invariant row, or for a literal snapshot value, loses a check that no mutant ever proved. Guards: the
   sweep baseline (step 0), the rule in step 6 that a case-only row moves first, and V2 on CaseChecked rows.
2. **Round-14 removed too early.** Most of the 147 kills ride on round-14 edits. Retiring them before production
   mutants cover each oracle breaks Conformance I12 and leaves oracles unproven. Guards: parity per Invariant
   before T53, and the lab fixtures for entities and traits on round-14 until their twins exist.
3. **The model grows into a runtime.** The Turn section (step 5, T17) is the likeliest place, because it could
   evaluate guards on memory. Guards: advisor Q2's five limits, so opaque guards give allowed sets and memory stays
   opaque. Also the model purity lint (Conformance T37), and deletion of any field no cell mutation kills (T39).
   Track lines per Invariant per section against the lifecycle's.
4. **The reference comes from the compiler under test** (replan question 6). Once the hand rows go, a compiler
   bug that drops an alternative also drops it from the reference. Guards: V4 on every fixture, and question 3.
5. **`classify` is not in `Compiled`.** Unless the fixture declares it beside its server model, a derived
   reference is incomplete for the channel oracles.
6. **Stale records.** `gates.json` is at `294f63a3`, and falsify round-14 is red at T45's pause. Step 0 refreshes
   both before anything retires.

**Questions for the user** (recommendation first):

1. **Where do `fixtures/` and `bench/` live?** (a) Siblings of `conformance/` under `packages/flow-state-v3/`, so
   that fixtures belong to neither consumer, with a lint stopping `conformance/` from importing `bench/`;
   (b) inside `conformance/`. Recommendation: (a). `bench/` imports the world and the player from `conformance/`.
2. **Pay as a generated part.** (a) Pay gains a user model and a server model (about 30 lines) and runs as a
   standalone part, not a composite, so its 66 hand cases can thin in step 6; (b) Pay's cases stay as named
   examples for good. Recommendation: (a). It touches replan decision 5 ("Pay is not converted"), so it needs your
   yes.
3. **An independent check of derived references.** (a) Keep Pay's hand rows and handler table as one frozen
   golden static case (about 300 lines), so a compiler bug cannot change the reference unseen; (b) rely on the
   Compile static cases alone. Recommendation: (a), for Pay only.
4. **A production static surface in slice R.** (a) Move `construct` and the data view of the production static
   surface from T17 into T47, which step 3 and V4 need; (b) leave V4 on round-14's compiler until slice 3.
   Recommendation: (a). It is a small part of T17, and T47's acceptance already assumes it.
5. **New Task T52** (step 4) between T47 and T18, or fold it into T47. Recommendation: a new Task. T47 is already
   effort 4, and this step's validation (V3) is separate work.
6. **New Task T53** (step 7): retire round-14 entirely after T24, or keep it as a mutant host indefinitely, as the
   replan leaves it after T23. Recommendation: retire it after T24, once parity per Invariant holds.
7. **Hand traces.** (a) The search replaces them, and only traces that document a ruling are kept; (b) keep all
   117 as the model's tests. Recommendation: (a). Model mutation shows whether a deleted trace killed something
   the search does not.

## Appendix: sidecar results

Three Haiku sidecars (effort high, read-only) inventoried `dsl/`; `turn/`, `write-lanes/` and `actors/`; and the
rest. I checked each finding used above.

- **a, `dsl/`.**
  - Accepted, each re-checked by grep: no `dsl` file imports `src/`; the traces are hand-written; the model's
    imports from `fixtures/reference.ts`; `lifecycle-perturbations.ts` is imported only by
    `lifecycle-step.test.ts`.
  - Changed: it listed `lifecycle-rules.ts` as hand-describing a machine. Its tables are the Specs' Tables A to C,
    so it is the model and stays.
- **b, area folders.**
  - Accepted: 12 of 13 oracles import the Port, and none imports `Compiled`. Mutants edit round-14, re-read at
    `write-lanes/resend.mutants.ts` and `runner/falsify.ts:95-98`. Four oracles ignore `graphs`
    (`turn/schedules.ts:226`, `selection.ts:509`, `publication.ts:150`, `idle-guard.ts:89`).
  - Changed: its counts of literal expectations are regex estimates, so I use them only to say the scenarios are
    literal.
- **c, adapters, runner, fixtures, top level.**
  - Accepted, each re-read: no production fixture copy in `src/`; production's two fixtures
    (`adapters/production.ts:54`); the prototype fixture list (`adapters/prototype.ts:136-148`); what
    `rows.test.ts` compares (`:144-159`); production has no static surface (`runner/args.ts:46-51`); `gates.json`
    is stale.
  - Rejected: nothing.
