---
proposal spec-test-tooling
status proposed 2026-11-20
---
# Test tooling and fakes: design and Spec

**Verdict:** keep `Story`, `Fake`, `run` and the generator; change three things. (1) Every fake resource gets one
explicit life with one transition table, hostile by default, and each row is pinned by a contract function run on the
fake and on the real thing. (2) The run verdict becomes one pure function of the finished run, applied by `run()`
itself, so no test can forget it; it is derived and never stored. (3) Hostility moves out of the generator into world
words, so hand-written Stories, sequence tables and generated Stories meet the same world. Nothing here adds a
harness, ledger or second runtime; it deletes one (`seam.ts`) and shrinks the generator's private state.

Everything below is proposed until the user accepts it. Paths are under `packages/flow-state-v3/` unless rooted.

## 1. What exists

| File (`src/host/testing/`)                                      | Holds                                                                                             | State of it                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `story.ts` `Story.app`, `storyOf`, `forkReloads`                | inert steps as data; `run({ steps, seed })`                                                       | holds; reviewed                                                                                                   |
| `steps.ts` `Step`, `WorldWord`, `StoryFailed`, `StoryTurnLimit` | the step and world vocabulary; `hide`, `show` exist                                               | holds; missing steps in section 3.5                                                                               |
| `run.ts` `startRun`, `run`, `runFrom`, `runForked`, `finish`    | the run cursor: `tab`, `current`, `noted`, `evidence`, `page`, `late`, `uses`                     | holds; `finish` (631) raises two verdict parts as script faults; the dispose arm reaches `admission` and `driver` |
| `fake.ts` `makeWorld`, `makeStore`, `Fake.*`                    | calls, holds, drops, offline, cleanups; store hold, refuse, refuseHeld, refuseLoad                | holds; no close, no late, no never as a word, no duplicate; `Fake.storage.layer` (804) never closes               |
| `generate.ts` `generate`, `propertyTest`, `quieting`            | draws steps; emulates late and reordered answers with its own `timers`, `offline`, `landOnReload` | works; about 15 mutable cursors with several writers each: an implicit state machine                              |
| `sweep.ts` `pairSweep`                                          | 8 phases by 7 faults                                                                              | holds; items owed in @task.V3.T97                                                                                 |
| `store-contract.ts` `storeContract`                             | the Store contract (@task.V3.T58), run on a Layer                                                 | holds; header says refused and torn batches cannot be arranged                                                    |
| `seam.ts`                                                       | drives Runtime internals for four host test files                                                 | a second way to run the runtime; deleted by @task.V3.T97                                                          |
| `clock.ts` `tabClock`                                           | Effect scheduler and `TestClock` per tab                                                          | holds; settle cost owed (T97 3g)                                                                                  |

Outside it: `tests/rules/rules.ts` holds 21 run rules as a plain list and `checked(run)` (574), which a test must
remember to call; `tests/rules/sweep.ts` and `reloads.ts` run every Story at every reload position in three modes
through `forkReloads`, split by hand into 8 quick and 12 stress shard files; root `tools/faults/` plants the faults
of `tests/faults.ts`; root `package.json` wires `test`, `test:stress`, `test:coverage`, `faults`.

What is wrong or missing, each from a review:

- **Kind fakes.** `dispose({ forget: true })` deleted nothing on real IndexedDB and every Node test passed, because
  the fake store never closes (@task.V3.T58 close review; @task.V3.T112). A load that never answers leaves `ready`
  silent. Fake servers ignore idempotency keys; a control call overwrites an endpoint of the same name.
- **The verdict is in five places.** `finish` (unused words, late cleanups), `checked`, `judgedVariant`, `swept`,
  and `propertyTest`'s `judged`. `PropertyTestFailed` does not exist in code (`propertyTest` returns failures);
  @plan.Testing.O6 says it rejects. No verdict exists for a leaked resource.
- **Rules that read reports, not the world.** A rule that reads only what the runtime reports is a false pass; the
  batches the fake received are the truth. Turn I9 and I14 rules blamed one actor's turn for another's.
- **One-occasion tables.** T57's table read one key, default starts and one occasion; four reviews found bugs it
  could not see; T118's three-step two-key sequences found 365 wrong rows of 8,000 on their first run.
- **Time.** `sweep-stress-land-0` runs 193 s against 164 s (@task.V3.T117). Under coverage, tests that pass alone
  in 2 to 5 s time out; `test:coverage` turns extra flags into file filters and writes no report on failure.

## 2. State inventory

| State                   | Owner (one)                                                      | Values                                    | Inputs that change it in one step                                                      |
| ----------------------- | ---------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| Store life, per store   | `makeStore`                                                      | `Open`, `Closed`                          | services scope closes; `Fake.storage.close()` word; a fresh open after reload          |
| Write life, per batch   | `makeStore`                                                      | `Held`, `Landed`, `Refused`, `Unheard`    | arrival with the next word; `release`; `refuseHeld`; reload; close                     |
| Load life, per open     | `makeStore`                                                      | `Pending`, `Loaded`, `Refused`, `Unheard` | arrival; `refuseLoad`; `holdLoad`, release; close; tab death                           |
| Call life, per call     | `makeWorld`                                                      | section 3.2                               | arrival with the next wire word; release; network word; clock; caller abort; tab death |
| Network                 | `makeWorld`                                                      | `Online`, `Offline`                       | `Fake.network.offline`, `online`                                                       |
| Page life, per tab      | `startRun`                                                       | `Shown`, `Hidden`, `Gone`                 | `hide`, `show`, `reload`, `closeTab`, `openTab`                                        |
| Run cursor              | `startRun`                                                       | step index, tab, open count, noted events | each step                                                                              |
| Server truth            | `makeWorld`                                                      | the fixture's own value                   | a handler; a control word                                                              |
| Draw cursor (generated) | `sourceOf` in `generate.ts`                                      | random position, steps left, queue        | each draw                                                                              |
| Verdict                 | nobody: derived                                                  | list of breaches                          | none; computed once from the finished run                                              |
| Time bounds             | `tests/limits.ts` plus the `test` block of root `vite.config.ts` | numbers                                   | a recorded re-measurement only                                                         |

Seams (typed values crossing):

- **In, from Store (@task.V3.T58):** the `Store` service `{ load, write(batch) }`, `StoreScope`, and the failure a
  closed store gives. This concept implements that contract in the fake; it never changes it.
- **In, from rules-on-machines (@task.V3.T106):** `Rule = { rule: string; breaches: (run: StoryRun) => Breach[] }`,
  the existing shape of `tests/rules/rules.ts`. Author rules arrive as more values of this type.
- **Out, to every concept:** `StoryRun` (steps, evidence, checkpoints, trace, the calls and batches the fakes
  received, and new: `left`, what the world still held at the end); `Step` and `WorldWord` as data.
- **Out, to the CLI (@spec.StaticCli.R1, R9):** a Story read as data; the same `verdictOf` for `flow story run`.
- **Out, to saved records and fragments:** the steps of section 3.5.

## 3. The design

### 3.1 Store, write and load life (owner: `makeStore`)

One `life` value and one queue of words per store. `Fake.storage.layer` and the Story's store become the same
function, so `storeContract` runs on what Stories use.

| Life   | Input                                    | Next   | Effect seen by the app                                    | Logged                |
| ------ | ---------------------------------------- | ------ | --------------------------------------------------------- | --------------------- |
| Open   | write, no word                           | Open   | lands                                                     | `Landed`              |
| Open   | write, `hold`                            | Open   | parked on a `Deferred`                                    | `Held`                |
| Open   | write, `refuse`                          | Open   | fails `StoreRefused`, lands nothing                       | `Refused`             |
| Open   | `release` on a held write                | Open   | lands, then answers                                       | `Landed`              |
| Open   | `refuseHeld`                             | Open   | oldest held fails, lands nothing                          | `Refused`             |
| Open   | load, no word                            | Open   | answers the records (seeded order)                        | `Loaded`              |
| Open   | load, `refuseLoad`                       | Open   | fails; `ready` settles with the failure                   | `Refused`             |
| Open   | load, `holdLoad` (**new**)               | Open   | parked; never silent: left pending is a breach at the end | `Pending`             |
| Open   | close (scope finalizer, or `close` word) | Closed | held writes settle by the close mode (open item O1)       | each held write       |
| Closed | write or load                            | Closed | fails with the Store contract's closed failure            | `Refused after close` |
| Closed | `release`, `refuseHeld`                  | Closed | script fault: nothing is held                             | none                  |
| any    | the calling tab died                     | same   | never answers; a landed write still lands                 | `Unheard`             |

Stored: `life`, the word queue, held entries, the records. Derived: a batch's status (from its log entry; T97 2i),
`unused()`, what is left held.

### 3.2 Call life (owner: `makeWorld`)

| Status                          | Input                                                        | Next             | Notes                                                                               |
| ------------------------------- | ------------------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------- |
| Arrived                         | network Offline                                              | Lost at request  | reaches no server (exists)                                                          |
| Arrived                         | word `hold` at request                                       | Held at request  | exists                                                                              |
| Arrived                         | word `drop` at request                                       | Lost at request  | exists                                                                              |
| Arrived                         | no word, handler present                                     | Handled          | handler runs once per idempotency key (**new**, R9)                                 |
| Arrived                         | no word, no handler                                          | Never            | `Effect.never` (exists); left at the end is evidence, not a pass                    |
| Held at request                 | `release`                                                    | Handled          | FIFO per endpoint (exists)                                                          |
| Handled                         | word `hold` at response                                      | Held at response | exists                                                                              |
| Handled                         | word `drop` at response                                      | Lost at response | handler effect kept (exists)                                                        |
| Handled                         | word `late(duration)` (**new**)                              | Late             | `Effect.sleep` on the tab's `TestClock`; no private timer list                      |
| Handled                         | word `never()` (**new**)                                     | Never            | named, so a Story says it on purpose                                                |
| Handled                         | word `duplicate()` (**new**)                                 | Answered twice   | second answer after the first; the runtime must drop it                             |
| Handled, Late, Held at response | answer when the caller is gone (aborted, disposed, tab dead) | Unheard          | the answer is produced and logged, delivered to nobody (**new** as a logged status) |
| any waiting                     | caller aborts                                                | cleanup runs     | cleanup may fail or die (exists: `FakeCleanupFailed`, `FakeCleanupDied`)            |
| Answered, Lost, Unheard         | any                                                          | same             | terminal                                                                            |

`times(n)` repeats a word for the next n calls; it is sugar over the word queue and writes no new state.

### 3.3 Page life (owner: `startRun`)

| Life          | Input                | Next            | Effect                                                     |
| ------------- | -------------------- | --------------- | ---------------------------------------------------------- |
| Shown         | `hide`               | Hidden          | listeners told; flush on hide runs                         |
| Hidden        | `show`               | Shown           | listeners told                                             |
| Shown, Hidden | `reload`, `closeTab` | Gone            | listeners cleared; calls and writes from it become Unheard |
| Gone          | `openTab`            | Shown           | a fresh page; a fresh store open                           |
| Gone          | `hide`, `show`       | Gone            | script fault `TabClosed`                                   |
| Hidden        | `reload`             | Gone then Shown | **new row to test:** a reload while hidden opens shown     |

### 3.4 The verdict: derived, one function, always applied

```ts
// NEW file: src/host/testing/verdict.ts
// existing: StoryRun, Rule (moved here from tests/rules/rules.ts, same shape)
// NEW: Breach, verdictOf, StoryRun["left"], PropertyTestFailed, UnusedWireRule, CleanupLeft

export type Breach = {
  readonly rule: string; // a rule's own name
  readonly step: number; // where it was first seen; the earliest is primary (@plan.Testing.O8)
  readonly evidence: ReadonlyArray<TraceRecord>;
};

export const verdictOf = (run: StoryRun, rules: ReadonlyArray<Rule>): ReadonlyArray<Breach> =>
  [...toolingRules, ...rules]
    .flatMap((r) => r.breaches(run))
    .toSorted((a, b) => a.step - b.step);
```

`toolingRules` are plain `Rule` values in the same list, reading only the finished run:

| Rule                         | Reads                                                         | Breach when                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UnusedWireRule`             | `run.left.words`                                              | a wire or storage word no call or write consumed (today a script fault in `finish`)                                                                                                             |
| `CleanupLeft`                | `run.left` after the last tab closed                          | a call still waiting whose caller never aborted it; a write or load still pending; a page listener still attached; a store still Open; a sleeper still on the clock; a cleanup that failed late |
| Flow's run rules             | evidence, trace, and the batches and calls the fakes received | the 21 existing rules, unchanged                                                                                                                                                                |
| author rules (@task.V3.T106) | published snapshots                                           | supplied by that Task as `Rule` values                                                                                                                                                          |

Leak detection needs no fiber inspection (Effect 4.1.4 has no `Supervisor`): everything an app can leave behind in
a Story sits in a fake, so `left` is a read of the world's own state at the end. `left` is built in `finish`.

Before and after, a Story test:

```ts
// before: the test must remember `checked`; a forgotten one is judged by nothing
const run = checked(await Checkout.run());

// after: run() judges; rules come from the one place the project names them
const run = await Checkout.run(); // rejects StoryFailed { breaches } on any breach

// flow.config.ts  (existing: defineConfig, apps;  NEW: rules)
export default defineConfig({
  apps: [{ app: CheckoutApp, stories: ["features/**/*.story.ts"] }],
  rules: [oneStartPerActor], // user-defined; Flow's own config lists tests/rules/rules.ts `rules`
});
```

`propertyTest` keeps its search and shrink, and rejects `PropertyTestFailed { result }` on Fail or Inconclusive
after every run completes (@plan.Testing.O6); `result` carries seed, completed runs, the breaches and the shrunk
Story text. A script fault (a release with nothing held) stays a rejection of `run()`, never a counterexample.
Generated runs drop unused words before judging (existing, `generate.ts:847`), so `UnusedWireRule` judges written
Stories only. `lenient` is deleted: its one use is that case.

### 3.5 Steps the neighbours need (all **new**, all data)

| Step or word                                                              | For                                                  | Source                                                                |
| ------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------- |
| `app.reload({ as: OtherSetup })`                                          | save under build A, boot under build B; A, B, A, B   | saved-records 294-308; T57 fourth review                              |
| `Fake.storage.close()`, `holdLoad()`                                      | the store closing mid-run; a load pending at dispose | @task.V3.T112 comment 07:17                                           |
| `Fake.call(...).late(d)`, `.never()`, `.duplicate()`, `.times(n)`         | late, never, twice                                   | @task.V3.T112; reads-operations 443                                   |
| `Fake.stream` words: replay, skip, speak after close                      | the data layer's frames                              | data-layer 386-400 (designed there; the word shape is this concept's) |
| key list steps (add, remove, reorder), `freeze`, `thaw`, `Story.fragment` | fragment sequences                                   | fragments 332-350; @task.V3.T29                                       |
| `advance({ next })` skipping paused timers                                | schedules                                            | @task.V3.T29 acceptance                                               |

A fake cannot make a handler ignore abort or throw synchronously: those are properties of the user's service code,
so they are fixture services under `fixtures/services/`, not world words.

### 3.6 Generated Stories, sequence tables, sweeps

- **The generator draws data only.** `late`, `reordered` and the offline span become draws of the world words above.
  `timers`, `landOnReload`, `offline`, `offlineLeft`, `online` leave `sourceOf`; what stays is the random position,
  the steps left and the queue. An emitted failing Story then replays by its text alone.
- **Sequence tables are plain tests.** One function, no runner:

```ts
// NEW in samples.ts: every sequence of the atoms up to a depth, as step arrays
export const sequencesOf = <A>(atoms: ReadonlyArray<A>, depth: number): ReadonlyArray<ReadonlyArray<A>>

for (const steps of sequencesOf(atoms, 3)) it(print(steps), () => Home.run({ steps: steps.flat() }))
```

  The expected value comes from the Spec's table, computed in the test from the atoms, never from a run.
- **Atoms carry the five dimensions.** A fixture's samples name at least: a second key or copy, a non-default
  start (a world word before the first open), a reload under an edited build, one hostile word per fake it uses.
  A plain test over the manifests fails a fixture missing one (the guard, I12).
- **Reload sweep.** Unchanged in meaning: every Story, every position, three modes, forked from a saved prefix.
  Shards are derived from one list by index (`shardOf(stories, i, n)`), not 20 hand-kept files' contents.

### 3.7 Commands and time

| Command                            | What                                                                       | Bound                       |
| ---------------------------------- | -------------------------------------------------------------------------- | --------------------------- |
| `nub run test -- <path>`           | one area, quick tier                                                       | seconds                     |
| `nub run test`                     | quick tier, type tests                                                     | the recorded suite time     |
| `nub run test:stress`              | `*.stress.test.ts`                                                         | the recorded stress time    |
| `nub run faults --only <id>`       | one planted fault                                                          | per fault                   |
| `nub run test:coverage -- <flags>` | sets `FLOW_COVERAGE=1`, passes flags through, `--coverage.reportOnFailure` | quick tier times the factor |

One source for time: `tests/limits.ts` gives each long test its measured bound, and the `test` block multiplies
every timeout by a coverage factor when `FLOW_COVERAGE=1` (measured once, recorded with its reason). No test
writes its own number for coverage. The coverage summary is deleted at the start of a run, so a stale file cannot
be read as this run's.

## 4. Requirements and Invariants

Requirements (each is a check that fails on a wrong build):

- **R1** One way to run: no file under `src/host/testing/` or `tests/` imports `driver`, `admission` or `Input`
  (lint import rule). Source: epic constraint "one runtime, one way to run it".
- **R2** `run()` rejects on any breach of `verdictOf`; no exported route returns an unjudged run. Source:
  @plan.Testing.O8; the `checked` freedom.
- **R3** `propertyTest` rejects `PropertyTestFailed { result }` on Fail or Inconclusive, after all runs. Source:
  @plan.Testing.O6; @spec.Diagnostics.R1.
- **R4** A closed store refuses every later write and load with the Store contract's closed failure. Source:
  @task.V3.T58 close review; @task.V3.T112.
- **R5** The fake store closes when the services scope closes. Source: same.
- **R6** Every row of tables 3.1 to 3.3 has a Story and a planted fault that `nub run faults --only` catches.
  Source: @task.V3.T112 acceptance.
- **R7** `storeContract` passes on the Story's own store and on real IndexedDB, including the close rows. Source:
  @task.V3.T112; data-layer 29.
- **R8** A word nothing consumed is `UnusedWireRule`; a resource left at the end is `CleanupLeft` with evidence.
  Source: @task.V3.T114.
- **R9** A fake server answers a repeated idempotency key with the first answer and runs the handler once; a
  control word and an endpoint of one name is a script fault. Source: T29 comments 2026-11-18.
- **R10** A failing generated run prints a Story whose `run()` fails the same rule with no generator. Source:
  @plan.Testing.O6 (TP:305).
- **R11** Every timeout scales by one factor under coverage; `test:coverage` writes its report when a test fails
  and passes flags through. Source: @task.V3.T97 moved items.
- **R12** A time bound changes only with a recorded re-measurement. Source: @task.V3.T117.

Invariants:

- **I1** The verdict is a function of the finished run: `verdictOf(run, rules)` called twice gives equal lists, and
  no code writes a breach during a run (grep: `Breach` constructed only in rules).
- **I2** Each life in section 2 has one writer file (grep per state name; a second writer fails the guard test).
- **I3** Closed is terminal for a store instance; a reload opens a new instance over the same records.
- **I4** A landed write is in the records whether or not its answer was heard (lost, unheard, tab dead).
- **I5** A refused or aborted write changes no record.
- **I6** A call's handler effect happens at most once per idempotency key, and exactly once when the call reached
  Handled.
- **I7** No answer reaches a caller that is gone; it is logged `Unheard`.
- **I8** Held entries release oldest first per endpoint and per store.
- **I9** A rule reads what the fakes received (calls, batches) wherever the runtime also reports it; a rule test
  with a runtime that lies in its report fails. Source: P3 finding on false passes.
- **I10** A rule blames a turn only for records that turn caused (Turn I9, I14 fixes): each rule has a two-actor
  test where the other actor acts between.
- **I11** Same steps and seed give the same `StoryRun`, at every reload position.
- **I12** Every registered fixture's samples carry the five dimensions of 3.6, or name why one cannot apply.
- **I13** Every step kind and world word appears in at least one registered Story (the coverage test of T97).

Tables: 3.1 rows come from R4, R5, I3, I4, I5, I8; 3.2 from R9, I6, I7, I8; 3.3 from the page contract; 3.4 from
R2, R3, R8, I1, I9, I10.

## 5. Development strategy

Order, each resting on the one before:

1. **Fast tests (T117, widened):** profile the shard, fix or re-measure; land the coverage factor, flag pass-through
   and report on failure here (they own the same state: time bounds and commands). First, because every later
   close review runs coverage and every builder iterates on the suite.
2. **World lives (T112):** tables 3.1 to 3.3 and the new words. Spike first, in a scratch copy: make the store
   close with the services and refuse after, change nothing else, run the suite, and sort every red Story into
   runtime bug or kind-fake reliance. That count sizes the Task and is its first evidence.
3. **Verdict (T114):** `verdict.ts`, `left`, `PropertyTestFailed`, `rules` in the config, `checked` and `lenient`
   deleted. It needs `left` from step 2. T106 then adds rules only.
4. **One route (T97):** port the four host files onto Story, delete `seam.ts`, the dispose arm stops reaching
   internals; the generator draws data only; shards derived. Needs the close and hold-load words from step 2.
5. **Steps (T29):** section 3.5's remaining steps and `story describe`, as each neighbour Task needs them.

Risk: step 2's red Stories (unknown count until the spike); the close mode of held writes on real IndexedDB (O1);
moving hostility out of the generator changes what seeds draw, so recorded seeds stop replaying: emitted Stories
replace seed numbers as the durable record before that change.

Split by state ownership: T112 owns store, call, network and page life; T114 owns nothing stored (the verdict
functions and `left`); T97 owns the run cursor and the draw cursor; T117 owns time bounds and commands; T29 owns
the step vocabulary. Proposed move: the coverage-run items from T97 to T117; the idempotency and fake-server items
from T97's list to T112 (they are call life).

## 6. Testing strategy

- **Contract twice.** `storeContract` gains close rows and runs on the Story's store and on IndexedDB in the browser
  tier; a `pageContract` (hide, show, reload while hidden) runs on the fake page and a real page. A fake kinder
  than the real thing then fails a named case, which is the guard for that class.
- **Table tests.** One generated test per row of 3.1 to 3.3: for each (state, input) pair the test builds the state
  by steps, applies the input, and checks next state, the app-visible effect and the log entry. Pairs outside the
  table must be script faults; the test enumerates the full product so a missing row is red.
- **Sequences.** `sequencesOf(words, 3)` over the store words with two tabs and two stores (two apps); depth 4
  behind `FLOW_STRESS`. Atoms include reload, close, hide, a late answer landing after dispose.
- **Verdict tests.** For each tooling rule a Story that leaks exactly one thing (a held call never aborted, a
  pending load, an attached listener, an open store, a sleeper) and one that leaks nothing; a two-actor test per
  blaming rule (I10); a lying-report test (I9).
- **Planted faults** (in `tests/faults.ts`): store does not close; closed store accepts a write; refused write
  lands; lost answer skips the handler effect; duplicate key runs the handler twice; unheard answer delivered;
  `verdictOf` skips `CleanupLeft`; `run()` returns on a breach; `propertyTest` resolves on Inconclusive; the
  coverage factor ignored. The faults runner must show each test green on the unchanged tree first.
- **Guards.** The import rule of R1; the one-writer grep of I2; the manifest check of I12; the vocabulary coverage
  of I13.
- **Bench.** `--dev` points for: one Story run (steps per second), one reload-sweep fork, `verdictOf` over a
  2,000-step run, clock settle against task count (T97 3g: must be linear). Suite, stress and faults wall time
  are recorded per tier, never mixed.

## 7. Handoff for the Opus leads

| Task | Read first                                                                                            | Decided                                                                           | Open, settle before code                                              | First commit                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| T117 | `tests/rules/sweep.ts`, `reloads.ts`, `tests/limits.ts`, root `vite.config.ts` test block, `bench.md` | one factor; flags pass through; report on failure                                 | whether the per-firing cost is a rule's cost; the factor's value      | a failing check that a coverage run of the two slow Stories passes; the profile   |
| T112 | `fake.ts` `makeStore` and `makeWorld`, `store-contract.ts`, `src/host/close.ts`, tables 3.1 to 3.3    | tables as written; hostile by default; red Stories are sorted, never switched off | O1 (close mode of held writes), from an IndexedDB contract case       | the table tests red, the spike's count, the contract's close rows red on the fake |
| T114 | `run.ts` `finish`, `tests/rules/rules.ts`, `generate.ts` `judged`, section 3.4                        | derived verdict; `run()` judges; `Rule` shape unchanged                           | D1, D2 below                                                          | the leak Stories and `PropertyTestFailed` test red                                |
| T97  | `seam.ts`, the four host test files, `generate.ts` `sourceOf`                                         | port file by file; same faults caught before and after                            | which fixture takes each ported test                                  | the fault list caught today, recorded by target; R1's lint rule red               |
| T29  | `steps.ts`, the neighbour seams in 3.5                                                                | steps are data                                                                    | D3; the word shapes for key lists and `Fake.stream` with their owners | type tests for each new step                                                      |

## 8. Proposed decisions

**D1. `run()` judges every run; rules are named once in `flow.config.ts`.**
Trace A (today): a new Story test calls `Home.run()` without `checked`; a run rule breach passes unseen.
Trace B (proposed): the same test rejects `StoryFailed { breaches }`; a test that wants the breaches reads them
from the rejection. Reverse by restoring `checked`.

**D2. Unused words and leftover resources are breaches (`UnusedWireRule`, `CleanupLeft`), not script faults.**
Trace A: a Story holds a call and ends; today it passes if the word was used. Proposed: `CleanupLeft` names the
call, its step and its status. Trace B: a Story declares `refuse()` no write meets; today `StoryFailed` text
"never used"; proposed the same failure as a named rule, visible in `flow story run` and to T106's judging.

**D3. A reload step may name another setup: `app.reload({ as: SetupB })`.**
Trace A: save a timer under build A, reload as B with the pause reason removed; the T57 B1 bug is a Story. Trace B:
A, B, A, B over one store shows a record written by B and read by A. Without it, edit tests need a private boot.

**D4. Move the coverage-run items from T97 to T117, and fake-server items from T97 to T112** (state ownership).
Trace A: T117 fixes the shard but coverage still times out, so its close review cannot run. Trace B: T97 ports
`life.test.ts` while T112 changes the same fake servers; one owner avoids two writers of `fake.ts` call life.

Open item **O1** (the T112 lead settles it by a contract case on IndexedDB, not the user): on close, do held
writes land (a connection close waits for its transactions) or abort (a forced close)? The table keeps both as a
close mode until the case answers; the default is whichever real IndexedDB does on `dispose`.

## 9. Sidecar log

Four Haiku sidecars (effort high): code inventory, review findings, Plans and seams, Effect prior art. No adversary
sidecar ran (the 30 minutes went to the four); the design is unchallenged by a second reader, which the first
review should weigh.

- Code inventory: **accepted** after reading `run.ts` 625-690 (`finish`, `lenient`), `fake.ts` 795-850 (the layer
  never closes), `rules.ts` 536-578 (`rules`, `checked`), `generate.ts` 1190-1215. Its mutable-state list for
  `sourceOf` is **accepted unverified** line by line; the design only relies on `timers`, `offline`, `landOnReload`
  existing there. "No `PropertyTestFailed`" **verified** by grep of `src/`. Its "ledger rebuilt in
  `deliveries.ts`, `places.ts`" is **rejected** as a problem: those are rules deriving from evidence, which is the
  intended shape.
- Review findings: Task asks **verified** against `wk show` for T97, T112, T114, T117. Line cites into
  `P3.task`, `P4.task` and the T118 counts (8,000 rows, 365 wrong) are **accepted unverified**. "Hide is stubbed,
  no page word" is **changed**: `steps.ts:69-70, 103-104` has `hide` and `show`, so the page table keeps them and
  adds only the reload-while-hidden row.
- Plans and seams: Testing.plan O6 and O8 text **verified** (TP:286-299, 355-364); epic constraints **verified**
  (`epic.task:54-59`). Sibling line numbers **accepted unverified**; the seam list in 3.5 should be checked
  against each sibling by the cohesion pass. Cohesion file names no owner for these seams: **accepted**.
- Effect prior art: "no `Supervisor` or `Fiber.roots` in 4.1.4" **accepted unverified**; the design does not need
  them (`left` reads the world). `Queue.shutdown`, `Latch`, `FiberSet` **rejected** as additions: `Deferred`,
  `Scope` finalizers and `TestClock` sleep, already imported, cover every row. `it.effect` from `@effect/vitest`
  **rejected** for now: 232 files use `vite-plus/test`, and a per-tab clock is already built on `TestClock`.
- Not checked by me: `tests/limits.ts` contents, `tools/faults/` internals, whether `defineConfig` readers
  (`flow story run`) can load rules without a cycle; the T114 lead checks the last before D1 is built.
