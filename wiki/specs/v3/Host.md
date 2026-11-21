# Host: companion to the Host Spec

Status: proposed. This holds what does not fit @spec.Host: the walkthrough, the problem classes, the principle
ledger, the fit to today's code, the seams, the user's calls, the open holes and the process notes. The Spec is
pre-coding analysis, best-guess guidance, revisable whenever building shows it wrong; each change is recorded in
`wiki/specs/specs.log`. Nothing here is decided by the user; every call below is proposed.

Terms (`Quiescent`, `Published`, `EdgePhase`, `Fate`, `Verdict`) are the Spec's `model` and `algorithm`. Other Specs
are named in backticks: `Schedules`, `Changes` (the turn walk), `Records`, `Operations`, `Types`. Paths are under
`packages/flow-state-v3/` unless rooted. The Safari facts are `prototypes/safari/RESULTS.md`.

## 1. Walkthrough: a checkout stepper, two quick clicks, a closed tab, a second tab

The shop's `CheckoutFlow` (`fixtures/shop/machines/checkout-flow.ts`, `persist: true`) is a stepper: ADDRESS,
SHIPPING.METHOD, SHIPPING.SLOT, PAY, with `Back`. The page binds it through the React hooks (not built yet).

```tsx
// existing: CheckoutFlow, actorRef        NEW (@task.V3.T111): FlowProvider, useActorByRef, useView
// user-defined: Stepper, setup, FlowRef
function Stepper() {
  const flow = useActorByRef(FlowRef, {})                       // a stable handle; render sends nothing
  const step = useView(flow, (s) => s.state)                    // useSyncExternalStore over the memo
  return <button onClick={() => flow.send(CheckoutFlow.E.Back())}>{step}</button>
}
```

**Two quick clicks.** The user is on PAY and clicks Back twice, about 40 ms apart, so in two browser tasks.

1. Click 1 calls `send(Back)`. The driver is idle, so `run()` drains at once: one step, one `Turn`, the flow's
   incarnation changes and the step reports `touched = {flow}`. The step's `Persist` command marks the record; the
   edge goes `Quiet -> Marked{at: now + 5 s}`.
2. The inbox is empty and no mail is owed, so the slice publishes: the flow's new snapshot is built and compared with
   the memo's (`PAY` against `SHIPPING.SLOT`), it differs, the version goes from 7 to 8, the memo is written, and only
   then is the flow's one listener told. The cart's listeners are not told: the cart was not touched.
3. React re-reads `getSnapshot` (the memo, the same object until the next publication) and renders SLOT.
4. Click 2 is a new task: one more slice, version 9, one notify, a render of METHOD. Two clicks, two publications,
   two notifies; neither shows anything but a finished turn. The edge stays `Marked` at the first click's time.

Had a click fanned out to 150 mail items (a cart change heard by 150 consumers), the drain would yield after 100
(`drainYield`, `core/defaults.ts:39`) and serve the rest in a later task (`host/driver.ts:374-379`). A rule of "one
publication per drained slice" would publish after 100 and again after 150: two renders, the first showing 100
consumers updated and 50 stale. Under the Spec's table the first slice owes mail and publishes nothing; one
publication shows all 150.

**Closing the tab while the write is held.** Two seconds later the user closes the tab. `pagehide` fires; the edge's
hidden row issues the batch at once (`Marked -> Out`); the IndexedDB transaction starts; the page dies. Chrome lands
it; Safari, entering the bfcache or closing, never answers it and lands nothing (RESULTS item 2: 0 of 12 and 0 of 6).
The edge cannot know which: the batch's fate is unknown, and the app must be right under both.

**Reopening in a second tab.** The user opens the shop in a new tab. Its Runtime asks the lock; the first page is
gone, so it is `Owner` and reads the store. If the batch landed it restores METHOD; if not, the last batch that
landed, PAY. Both are endings a user can accept, because the stepper never sent anything on Back. Had the first tab
still been open, the second would boot `Second`, read nothing and save nothing until it reloads.

**The Story that tests it** (`closeTab` and `openTab` are new):

```ts
// existing: ensure, send, checkpoint, world, Fake.storage.hold   NEW: closeTab, openTab
// fixture-local (fixtures/shop/stories/usual.ts:30): storeStory   user-defined: backTwiceThenClose, mainFlow, ...
export const backTwiceThenClose = storeStory("shop/back-twice-close")
  .ensure(mainShopper).ensure(mainCart).ensure(mainFlow)
  // ... Begin, address, method, slot as in checkoutSteps; storeSetup captures at once (captureMs: 0) ...
  .checkpoint("pay")                                    // PAY has landed
  .world(Fake.storage.hold())                           // the next batch is held: the store is slow
  .send(mainFlow, CheckoutFlow.E.Back())                // batch 1 (SLOT) issued, held
  .send(mainFlow, CheckoutFlow.E.Back())                // METHOD waits in pending behind batch 1
  .closeTab("main")                                     // NEW: pagehide issues batch 2 behind batch 1; death
  .openTab("second", (t) => t.ensure(mainFlow).checkpoint("reopened"))   // NEW: a fresh page, same store
```

- `storeSetup` captures at once (`fixtures/shop/app.ts:116`), so without the `hold` word nothing would be in flight at
  `closeTab` and both fates would reopen at METHOD: the hold makes the Story test the death.
- `closeTab` runs the hide listeners: the hidden row issues the pending METHOD mark as a second batch ordered behind
  the held one. Both batches are held at death and take the fate word: `abort` (default, Safari) keeps PAY, `land`
  (Chrome) lands SLOT then METHOD in order. The reload sweep runs the Story in both fates.
- The verdict runs inside `run()`: the flow's turns rule, `Records`' round trip, the publication drift rule and
  `CleanupLeft` all judge the finished run; a break rejects `StoryFailed { verdict, run }`.
- `run.checkpoints.reopened.read(mainFlow).state` is `"PAY"` under abort and `"SHIPPING.METHOD"` under land, and
  never `"SHIPPING.SLOT"` (the stale-batch ending a single in-flight batch would allow).

## 2. Problem classes

| Family                                   | Known members                                                                                                         | Handling                                                                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. A reader sees an unfinished world     | compare after write, `Serve` later, a read inside a drain, `getSnapshot` allocating, a capture between `Serve` slices | **removed:** `publish` and `Capture` take a `Quiescent`, whose only door `quiescent(world): Option<Quiescent>` checks mail; snapshots are read from the memo only |
| B. Delivery out of step with publication | emit stamping, once per step, the stop path, the release alarm                                                        | **one point:** `publish` hands its version to `emits.deliver` after the memo write; stop and dispose are rows of one table                                        |
| C. Page death and unanswered writes      | `out = true` forever (`edge.ts:200`), the reload's crash semantics (`run.ts:402-414`)                                 | **one point:** the death occasion and its fate word; the edge's `Closed` row                                                                                      |
| D. One tab in the model                  | `Tab.name: "main"` (`testing/steps.ts:17`), one clock, no lock fake                                                   | **removed** for the single-tab model (`Tab<T>`); a step on a gone or unopened tab is **one point**, a script fault                                                |
| E. A run that escapes its verdict        | five verdict places, `checked` forgotten, `lenient`, a config the test never loads                                    | **one point:** `Story.app` requires `rules`; the one unjudged runner is internal (`runUnjudged`), and `verdictOf` is its only judge                               |
| F. Lifecycles in flags                   | `edge.ts:61-65`, `sweep.ts:186-191`, `generate.ts:474-506`, quieting (`generate.ts:355-392`)                          | **removed** for the edge (each phase carries its own pending, so `Quiet` holds none) and the sweep; the generator's lifecycles are **deleted** with its timers    |
| G. Scans over a growing history          | `generate.ts:512` to `fake.ts:475`, `story.ts:274-283`, `sweep.ts:80`, `run.ts:521-525`, `clock.ts:27`                | **one point:** counters and cursors owned by the fake world, written where the fact is written                                                                    |
| H. Fakes kinder than the real thing      | sleepers private, four stores, a store that never closes, the death's clock settle                                    | **one point:** one store in `platform/memory.ts`; `left` read from the Owners; the Dying window is the synchronous hide listeners only                            |

Debt still handled one by one: the eight test-tooling casts (the Spec's `realization`); the real browser's `pagehide`
timing (whether the fork's first slice creates the transaction before freeze) is a browser-tier check, not a type.

## 3. Principle ledger

| Principle                                       | Held or traded                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One owner per state                             | held: S1 to S14, one writer each                                                                                                                                                                                                                                                                                               |
| Store facts, derive views                       | held: the verdict, `left`, `passed`, settled and overdue are derived; the memo is a view keyed to the version                                                                                                                                                                                                                  |
| Explicit states                                 | traded: `Out.waiting` and `Out.at` stay `Option`s under I20. A tagged `Waiting` (ticketed or timed) was tried and left two cases without a home: a `Later` accept onto a ticketed batch, and a dead time inside `Backoff`. Edge, sweep, publication life and tab life are tagged; the verdict is a record of independent facts |
| Total tables                                    | held after the three edge cells changed (head landed, head refused, accept Now, in `Out`): the publication, edge, tab and verdict tables have every cell; unreachable cells are named                                                                                                                                          |
| Survives a reload                               | held: nothing here is saved; the death occasion says what the next boot reads                                                                                                                                                                                                                                                  |
| Same rule at every scope                        | held: publication per actor, whatever its scopes; fragments ride their actor's snapshot (instances and fragments are open in `Types`)                                                                                                                                                                                          |
| A throw in user code changes only its own check | held: listeners, emit listeners and rule checks each in their own `Result.try`                                                                                                                                                                                                                                                 |
| Effect at the edges                             | traded: keyed forks for `wake`, retry and `serve`, and `FiberMap` for `left`, but the driver's inbox and the edge's one wake are synchronous structures beside Effect's `Queue` and `Schedule`, because a slice runs to its end without yielding                                                                               |
| Simple                                          | traded twice: `touched` adds a field to `Out`; the hide drain steps `Serve` synchronously                                                                                                                                                                                                                                      |
| No arbitrary limits                             | held: no write timeout added; `QUIET_LIMIT` kept as measured                                                                                                                                                                                                                                                                   |

**Fixtures checked:** shop's `CheckoutFlow` and `checkoutSteps` (a stepper, reload mid-flow, section 1); transfers'
`hideFlush` and `hiddenRefusing` (`fixtures/transfers/stories/visibility.ts:30-103`);
`tests/stories/storage.test.ts:58-80` and `tests/write-lanes/payment-leave-and-reload.test.ts:184-216` (both fates
already pinned, now named); session's `workspaceHide`; wizard's `reloadedPastHold`. No fixture runs two tabs today.

## 4. Fit to today's code

Verdicts: keep, change, delete, new. Coders use this to know which code is redundant or to be superseded.

| Code                                                                         | Verdict             | Change and callers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `host/driver.ts` `drainInbox`, `run`, `stop`                                 | change              | slice end per the publication table; judge between step and sink; ring inbox; `running` reset in `finally`; callers `runtime.ts`                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `host/publication.ts`                                                        | new                 | S1, S2, S4, S5; called only by the driver                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `host/runtime.ts` `getSnapshot` (403-405)                                    | change              | reads the memo; `subscribe` added to the handle's internal port                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `host/snapshot.ts` `snapshotIn`                                              | keep                | called only by `publish`, `final`, `PublicationDrift` and inspection; `asOutside` (236) replaced by `project`                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `host/emits.ts`                                                              | new                 | the emit listener sets; called from `publish` step 5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `host/judge.ts`                                                              | new                 | the machine rule judge of the Spec's algorithm                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `core/world.ts` `Out` (770); `tx.ts` `draft`/`put`/`drop` (165-180)          | change              | `Out` gains `touched`, `lifeChanged`; snapshot fields written with a key-to-actor map; `stepEnds` last in `step` (`Operations`)                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `core/step.ts` `Capture`                                                     | change              | takes a `Quiescent`; the hide drain steps `Serve` itself                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `host/edge.ts` (61-65 flags, `pump`, `settle`)                               | change              | one `transition` over the edge table; `wake` and retry one keyed task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `host/platform/browser.ts` `onHidden`                                        | keep                | the death's hide; `pageshow` belongs to @task.V3.T27                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `host/testing/steps.ts` `Tab`, `Step`                                        | change              | `Tab<T>`; `closeTab`, `openTab`; `heldWrites` renamed `inflight`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `host/testing/run.ts` `reopen` (402-414), `boot`, `finish`                   | change              | tabs over one world; death per the tab table; `left`; the double turn count (`admit` and the inspector) kept once                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `host/testing/fake.ts` `makeStore` (558-660), `Fake.storage.layer` (798-830) | change              | wrap `platform/memory.ts`; per-open batch index; `Dying` hold; counters per endpoint                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `host/testing/seam.ts`                                                       | change, then delete | `run.ts:40, 392, 559-577` drive `attach`, `detach`, `send`, `forget` through it today. Replacement: the binding's port (`acquire` returns the release; `send`; `whenReady`) on the internal route, the same port React uses, plus public `dispose({ forget })`; then `run.ts:393, 457` stop importing `Input`. The nine host unit tests (`src/host/{cleanups,close,hidden,identity,lanes,ledger,life,restore,runtime}.test.ts`, `src/host/test/cleanups.ts`) move to Stories or the port in @task.V3.T97; the file goes once the last importer is gone |
| `host/testing/generate.ts` `sourceOf`, `propertyTest`                        | change              | the generator and sweep phase table; every seed; `judged` calls `verdictOf`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `host/testing/sweep.ts` `tryCell`, `cellOf`, `PHASES`                        | change              | the sweep phase; fork per fault; `LANE_PHASES` derived                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `host/testing/clock.ts` settle                                               | change              | ring index                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `host/testing/config.ts` `defineConfig`                                      | change              | gains `rules`, imported from the rules module                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `host/testing/story.ts` `Story.app` (211-216), `run`, `forkReloads`          | change              | `rules` required in the options (121 calls in 56 files, most through fixture helpers such as `storeStory`); `run()` judged; `checked`, `lenient` deleted; `runUnjudged` internal                                                                                                                                                                                                                                                                                                                                                                       |
| `tests/rules/rules.ts` (35, 542-578)                                         | change              | rules return `Broken`; `checked` deleted; the list moves to `tests/rules/list.ts`, which imports no vitest                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `host/cli/main.ts`                                                           | change              | the exit table; `flow trace` prints the verdict; `RunRejected` narrowed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `host/testing/steps.ts` errors (99-104, 117-134)                             | change              | today's `StoryFailed` renamed `StoryScriptFault` (four test files assert it); `StoryTurnLimit` folded into the new `StoryFailed { verdict, run }`                                                                                                                                                                                                                                                                                                                                                                                                      |
| `host/trace.ts` (47, 105), `host/print.ts`                                   | change              | render and decode `closeTab`, `openTab`, `inflight` and `Tab<T>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `host/testing/samples.ts` (166-175)                                          | change              | prints `Story.app(...)` with `rules` and `inflight`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `host/inspect.ts`                                                            | change              | the version, `releasing` with ages (@task.V3.T49)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `host/testing/steps.ts` `WorldWord` (36-45)                                  | change              | `late(d)`, `never()`, `duplicate()`, `network.offline` with its advance; the generator rests on them                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `heldWrites` users (28 files: 6 fixtures, about 14 tests)                    | change              | renamed `inflight` in one edit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `platform/memory.ts`                                                         | new                 | the one store; closes with its scope and refuses after; the fake wraps it                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

The edge's own entry in the code audit's section on the edge (flags, `pump`, `settle`) is the same row as
`host/edge.ts` above.

## 5. Seams with other Specs

The Offers and Needs are in the Spec's `composition`. Points a reader may miss:

- **`Changes`:** `Out.touched` and `lifeChanged` are a core change in that area (question 4 below). Both Specs edit
  `driver.ts`; one Task lands the turn rows first, then the slice end. The public `Published` face (incarnation,
  `why` with three values) is shared (proposed). A hidden page is not a use change in v1: timers keep their
  deadlines; a throttled wake fires each overdue timer once; the edge's drain and capture cover a freeze (proposed).
- **`Operations`:** the release alarm publishes with no host code; `stepEnds` is the core step's last row;
  `releasing` with ages is inspection's. Its hole on the public event for `refetch` is the Spec's Q6.
- **`Records`:** the host owns the mutation applier, `Fake.storage.mutate(kind)`; the alphabet is `Records`'.
- **`Schedules`:** the breach id of an inverted row is `StoryFailed.verdict.broken[0].rule`.
- **`Types`:** `compiledOf` is called at Runtime start and in `Story.app`; `Broken.rule` is typed from its rule ids.

Tasks (no scope changed): @task.V3.T111 (publication, binding, the edge), @task.V3.T112 (world, tabs, death, one
store), @task.V3.T114 (verdict, judge, `propertyTest`, CLI table), @task.V3.T97 (sweep, generator, `seam.ts`, reach
flags, Story helper type names), @task.V3.T117 (cost rows), @task.V3.T27, @task.V3.T30, @task.V3.T127.

## 6. Questions for the user

Each is a departure from an earlier concept or an open choice. All are proposed; none is decided by the user. Where a
resolution round answered a question, it is marked agent-answered and stays proposed until the user accepts it.

1. **A publication is a slice that leaves no mail owed.** [proposed; recommend A, agent-answered] Departs from "a
   drained slice". Trace B: one click, 150 consumers, `drainYield` 100: publication at 100, a render showing 50
   stale consumers, a second publication at 150. A: the first slice publishes nothing; one publication. Cost:
   `send(); getSnapshot()` after a chain longer than 100 shows the chain's start until the next task (only then).
   C: drain without yielding; one publication, but a long chain blocks the page.
2. **Run rules live in one rules module that `flow.config.ts` and `Story.app` both import.** [proposed; recommend A;
   a user call, overturning an earlier placement of run rules in the config] The config only the CLI loads; the
   first version's `Story.app(config, app)` makes a cycle: `flow.config.ts` imports `fixtures/index.ts`, which imports
   every Story. Trace A: `tests/rules/list.ts` (no vitest) exports `rules`; the config's `rules` and each
   `Story.app(setup, { ..., rules })` import it; `discover` refuses a Story whose `rules` is not the config's value
   (identity); 121 calls change, most inside a few fixture helpers. Trace B: rules on the app (`app({ rules })`). C: a
   vitest setup file registering a global (hidden state; rejected). Linked to the types design's question on machine
   rules having no `enabled` flag.
3. **Emits are delivered once per publishing slice, after the publication.** [proposed; recommend A, agent-answered]
   Trace B: a listener reading `getSnapshot` at an emit sees the previous publication. A: the Spec. B: per step, and
   an emit's listener must not read the snapshot.
4. **The core's `Out` gains `touched` and `lifeChanged`.** [proposed; recommend A, agent-answered] A: the snapshot
   fields are written through a key-to-actor map, so marking is by construction; `PublicationDrift` checks it in
   Story runs. B: compare every identity per publication, O(A) per slice, no core change: safer and costlier.
5. **A reload runs `pagehide` first; the fate word is `inflight`, default `abort`.** [proposed; recommend A,
   agent-answered] Today a reload is a crash (no hide listener) with `heldWrites`. A: the tab table; a crash is
   `hide: false`. B: keep crash semantics; the `pagehide` flush is never exercised in Stories.
6. **`propertyTest` runs every seed and rejects after the last.** [proposed; recommend A] B: stop at the first
   failure (today; faster, hides other rules' failures).

   ```ts
   // before: rejects at seed 3; seeds 4 to 50 never run    after: runs 50, rejects once, listing every failed seed
   ```
7. **A `Later` mark during a store's backoff waits for the retry, except once when hidden.** [proposed; recommend A,
   agent-answered, with the edge's changed cells: the flag lives in `Out`, a waiting ticket issues when the last
   batch lands] Today it cancels the retry after one capture interval. B: keep today's.
8. **The verdict is a record of four facts.** [proposed; recommend A]

   ```ts
   // before: the first matching outcome, "Unfinished"      // what broke is hidden
   // after:  verdict: { broken, neverBroke, unfinished, inconclusive }
   ```
9. **The binding's props before attach are part of creation, and Safari display-bound cases are counted as skipped.**
   [proposed; accept] No trace here changes them.
10. **A capture reads only a world with no mail; a hide drains the mail synchronously first.** [proposed; recommend A,
    agent-answered; the model holds] Trace B (today): a 150-consumer fan-out yields at 100; the page hides; the
    capture saves 100 updated and 50 stale consumers, and the 50 follow-ups are lost on reload (mail is not saved).
    A: the capture rule; cost: a hide blocks for the owed chain's length. C: save the mail (`Records`' format; larger
    change).
11. **A hide issues behind a batch already flying.** [proposed; recommend A, agent-answered, with the edge's cells]
    Trace B (today): a slow PAY batch is out, two Backs wait, the page hides and dies: METHOD is lost under both
    fates and the store may hold SLOT, an ending no fate word names. A: the second batch, ordered by the store
    contract. B: keep one batch and name the loss in the fate table.
12. **An `expectBroken` entry may narrow to a step, an actor or a predicate, and the reload sweep drops it from
    forks.** [proposed; recommend A] It extends the decided `.rules({ expectBroken, off })`; a bare rule keeps its
    decided meaning (breaks at least once).

    ```ts
    // decided (not built): story.rules({ expectBroken: [Pay.rules.NoLostWrite] })              // breaks at least once
    // after, also allowed: story.rules({ expectBroken: [{ rule: Pay.rules.NoLostWrite, step: 3 }] })   // NEW: step?,
    //                      actor?, where?
    ```
    Trace B (rule id only): an inverted Story expecting a turns rule at the dropped retry passes when the rule breaks
    at `Begin` on another actor; in the sweep, a fork before the step fails `neverBroke`.
13. **A hung store holds disposal until `disposalBound`.** [proposed; recommend A, agent-answered] A: no write timeout
    (the user's "no arbitrary limits"); disposal's existing bound ends it and the waiting tickets are answered
    false. B: a disposal ticket skips the hung batch, issuing behind it at once.

Every departure: 1 (the "drained slice" rule), 2 (the placement of run rules), 3 (once per step), 4 (the core's `Out`),
5 (today's reload), 6 (today's `propertyTest`), 7 and 11 (today's edge), 8 and 12 (the earlier switch table), 10
(today's capture), 13 (today's hung write).

## 7. Open holes

| Id  | Severity | Hole                                                                                                                                                                | Why open                                                 |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| O1  | medium   | Publication liveness under unbounded input: if inputs outpace the drain, mail stays owed and nothing publishes                                                      | accepted as overload; no bound designed                  |
| O2  | low      | `touched` is marked by construction for the snapshot-input list; a snapshot input added outside it is caught only by `PublicationDrift` in Story runs               | a core change in `Changes`' area (question 4)            |
| O3  | medium   | Whether the `pagehide` fork's first slice creates the IndexedDB transaction before freeze                                                                           | browser tier only                                        |
| O4  | low      | The React spike (renders per publication, Strict Mode, transitions) is not run                                                                                      | no binding exists                                        |
| O5  | low      | `Locks` fake rows beyond the tab table (two scopes, a disposing same-document owner) are the binding's lock table's, not re-derived here                            | @task.V3.T27's table stands                              |
| O6  | low      | The model checks the tables, not the package; the package sequences of the Spec's `tests` are not written                                                           | design round                                             |
| O8  | medium   | The revised tables (several flying batches, the quiet capture, matched `expectBroken`) were not re-run in the executable model; the edge's three changed cells were | usage; the revision kept to the reviews' findings        |
| O9  | medium   | The public event a view sends for `refetch` is not designed; blocks build for @task.V3.T122                                                                         | outside this design                                      |
| O10 | closed   | The mutation generator: the alphabet is `Records`', the applier and the sweep are @task.V3.T112's                                                                   | -                                                        |
| O11 | medium   | Generated runs and `quieting()` with several tabs: per-tab views and whether samples draw tabs                                                                      | not designed; generated runs stay single-tab until it is |
| O12 | low      | One version across actors in one render: the binding's read (one external store over the version, or per actor) is not chosen                                       | @task.V3.T111 with the React spike (O4)                  |
| O13 | low      | The hide drain blocks the page for the owed chain's length; no measure of a long chain at `pagehide`                                                                | bench, browser tier                                      |
| O14 | minor    | The reach flags `cancelsAcknowledging`, `retainsUnknown` have no row in the generator's table, and the Story helper types have no exported names                    | @task.V3.T97's work                                      |
| O15 | minor    | The edge keeps `Out.waiting` and `Out.at` as `Option`s: the invariant that guards it is model-checked, not typed                                                    | a stated trade                                           |
| O16 | low      | The expected-break matching rule (an Expect matches every fitting break; two Expects may match the same break) was not re-run in the model                          | text only                                                |
| O17 | low      | Context propagation across the host (the runtime plan's context outcome) was not checked against the publication table                                              | not checked                                              |

## 8. Process notes

- **What went wrong.** The host and tooling designs were written against a binding and a verdict that do not exist,
  so their premises went untested: one rested on a synchronous drain, and the judging of `run()` rested on a config
  the test never loads. The tooling's quadratic scans grew one feature at a time and showed up only as coverage
  timeouts. `it.fails` hides which property breaks; the verdict's rule ids fix that.
- **Order of work.** (1) The executable model of the publication, edge and verdict tables, kept in the package's tests
  as plain functions. (2) `touched` in the core with `PublicationDrift` red first. (3) `publication.ts` with the
  fan-out Story red. (4) The edge's table and the quiet capture, their sequences red against today's flags. (5) The
  world: one store, tabs, death, the fate word, with `back-twice-close` red. (6) `verdict.ts`, the rules module,
  `Story.app`'s `rules`, `checked` deleted in one change (one writer of the verdict). (7) The cost counters with the
  cost check red.
- **Lessons.** A design's example Story should be run, or at least traced against its fixture's setup, before review:
  the first walkthrough Story was vacuous on its own fixture (`captureMs: 0`). A model of the edge found three
  holes the text hid (a flag with no home while a batch flies, a ticket stuck behind a flying batch, a hidden retry
  that livelocked); the cure is the one invariant I20, checked over every cell, not three separate edits.
- **Where a review pays off.** After step 3 (a React spike against the memo: renders per publication) and after step
  6 (a fresh agent derives 30 verdict cells from the verdict rules alone and compares).
