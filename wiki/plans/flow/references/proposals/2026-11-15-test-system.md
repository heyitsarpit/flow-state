---
proposal test-system
status partial user 2026-11-15 [@proposal.test-tooling-reuse]
    proposed 2026-11-15
---
# One runtime, one way to run it: the test system after conformance (2026-11-15)

The conformance suite goes (the user, 2026-11-15). Everything else here is proposed. This file changes no code,
plan, Spec, Task or the Epic. It superseded an earlier draft, `stories-as-harness-2026-11-15.md` (deleted; in
git at `4f4ac9f5`): same direction, now with evidence, the other kinds of test, and a sequence. The work it
describes is now Tasks T62 to T70 in `wiki/tasks/V3/P2.task`; where the two differ, the Tasks win.

**Bottom line:** Flow gets five kinds of test and three tools, all plain.

- **Tests:** Story tests, rules checked on every run, generated Stories, compile-time tests, and the pure core
  tests that already sit beside the core.
- **Tools:** `Story` and `Fake` (script a run, stand in for the world), an inspection cut with a text trace
  (read a run), and two CLI commands that print them. All three are product features the plans already promise.
- **Nothing else:** no model, no second runtime, no gate file, no ledgers, no recorded outputs, no custom
  runner. Vitest runs everything.

**Stories, the CLI and inspection are Flow's own test harness** [decided: user 2026-11-15].

A spike proved the hard part: a Story drives the real Runtime over fakes on Effect's own `TestClock` and
scheduler, with no host timer and identical evidence on a second run.

**Why now:** core work is paused because the old suite cost more than the core. Since 9 November, 26 commits
touched `src/core` and 358 touched `conformance/`; the suite is 44,780 lines against a 4,067-line core, and its
own coverage gate reports 74 of 211 Invariants checked.

**Read first:** `wiki/plans/flow/Testing.plan` O1 to O4 and O6; `Inspection.plan` O1 and O4; the Epic's
"Preview cut first" rule. The checkpoint commit `52a883e6` holds the whole old suite.

**Risk:** the same shape as the last failure, infrastructure before core. Section 9 boxes the first slice at two
builder days and names what happens if it overruns. The second risk is a harness made of the product hiding
the product's bugs; section 7 is the answer.

## 1. Why the old system failed

Four causes produced the 37 problems on the user's list (section 10 maps each one).

1. **No smaller model can exist.** The core is already a pure `step`. The Spec model, predictors and belief
   were 9.4k lines restating a 4.6k-line core, so every core change was made twice or more.
2. **"Conformance" assumes several implementations.** The port, adapters, liar runtime and round-14 limits all
   served a second runtime that was retiring.
3. **Tests nobody reads need tests.** Falsify, liar, model mutation, the class gate, limits and pairs existed to
   prove the suite, and each needed its own rules and owed lists.
4. **Records keyed by what the core computes.** Attempt ids, script ids, `file:line` and run digests all change
   when the core changes, so the records went stale without anything real changing.

## 2. The system

### Five kinds of test

| Kind              | What it checks                       | Where                    | Needs              |
| ----------------- | ------------------------------------ | ------------------------ | ------------------ |
| Story test        | a decided outcome, by example        | `tests/<area>/*.test.ts` | Story, Fake        |
| Run rule          | a rule that must hold on every run   | `tests/rules/*.ts`       | a run to read      |
| Generated Story   | sequences nobody wrote, under faults | `tests/generated/`       | `propertyTest`     |
| Compile-time test | "the wrong thing is a type error"    | `tests/types/*.ts`       | `tsc`, already run |
| Pure core test    | the lane table and ledger, directly  | `src/core/*.test.ts`     | nothing; exists    |

Two more arrive with their features and need no tool: CLI output as text snapshots (`toMatchFileSnapshot`
exists in the installed Vitest), and a small contract test that runs once against the fake store and once
against real IndexedDB.

### Three tools, all public

- **`Story` and `Fake`** (`src/testing`): a Story is an array of steps as data; a Fake is a second Layer for a
  service the fixture already declares. `run()` is the only boundary.
- **Inspection** (`src/inspect`): `attachInspector` exists. Added: one runtime cut (lanes, timers, batches out,
  every live actor) and a plain-text trace of a run.
- **CLI** (`src/cli`): `flow story list`, `flow story run`, `flow trace <story>`. Thin over the same run. This
  replaces the scratch scripts builders kept rewriting (`play-one`, `classify`, `shrink-one`).

### What is deliberately not built

A Spec model or any predictor; a port or adapter; a gate file or checkpoint command; owed, limits or triage
lists; a recorded baseline; a mutation runner; stored generated scripts; a test DSL beyond `Story`.

## 3. Evidence gathered for this proposal

### 3.1 The run works (spike, since moved out of the repo)

An Opus agent built a 382-line `Story`, `Fake` and run, an 82-line fixture and three tests. I read every line
and re-ran it: 3 of 3 pass in 0.2 s.

- **Time:** Effect's `TestClock.layer` replaces both hand-written clocks. `adjust` wakes sleeps in timestamp
  order and waits for the woken work to go idle before the next. A schedule (20 s) fired before the commit's
  own `Effect.timeoutOrElse` (30 s), in that order.
- **Event loop:** Effect's `Scheduler.MixedScheduler` with a task hook that pushes onto a list. Draining the
  list is settling. Effect has no "run to quiescence" call and none is needed: only scheduler hops create
  tasks, no sleep ends without `adjust`, and only steps resolve held calls. A cap of 100,000 tasks catches a
  fiber that yields forever. This replaces the plan's K-hop microtask rule.
- **Fakes:** a handler is the service's own method returning an `Exit`. A held call waits on a `Deferred`. The
  commit's real code runs throughout: its failure mapping, `Outcome.unknown`, its deadline.
- **Reload:** no Effect feature models a page dying. The run abandons the page: its task list is never drained
  and its clock never adjusted again. The store and the server state belong to the run, so the next page boots
  over them at the same time.
- **Determinism:** each test runs its story twice and compares evidence value for value. A guard counted host
  `setTimeout` and `setImmediate` calls across two runs: zero.

Seams `src/` needs, none made yet:

1. `runtimeSetup` always boots the browser platform (`runtime.ts:304`), so a Story takes a `RuntimeConfig`.
2. A schedule fires only for an actor with a use, and public `ensureActor` passes none. The Story attaches
   through the internal `testing.attach`.
3. The runtime cut, `cutOf(driver)` in `src/host/inspect.ts`.
4. `Row.waiting` is always `false` (`src/core/rows.ts`), so nothing can read whether commits wait behind a lane.

Not shown by the spike: the storage words, detach, forget and the disposals are wired but untested; the Pay
fixture was not run, and its `forkDetach` across a page death is unverified.

### 3.2 Hand cases need no model

The rehosted cases (`packages/flow-state-v3/tests/`, 81 cases, 0.7 s) were checked in a scratch copy.

- **Dead core:** with `step` returning the world unchanged, 80 of 81 go red. The one left green is a known-bug
  test that passes whenever its body fails.
- **Planted faults:** of the old suite's 18 named wrong behaviours, 17 edit the runtime. 16 are caught.
- **The miss:** `prod.refused-turn-reported` (Turn I14), an extra report after a refused turn that no case
  reads. One rule over evidence catches it. This is what run rules are for.

### 3.3 Where each Invariant can be checked

Three Haiku agents classified all 211 Invariants by the cheapest check that fully covers each. I sampled the
results and corrected one (WriteLanes I7 reads `retryCount` from the public row); treat the counts as a guide.

| Cheapest check                                                   | Count |
| ---------------------------------------------------------------- | ----- |
| The feature is not built yet                                     | 62    |
| Holds by type or by a single constructor                         | 20    |
| A rule over evidence                                             | 34    |
| A rule over public snapshots and rows                            | 10    |
| A rule over what the fakes saw (requests, keys, written batches) | 38    |
| Needs internal state no public read shows                        | 38    |
| A compile-time or construction test                              | 4     |
| Only an example can state it                                     | 5     |

What this says:

- **The fakes are the best witness.** 38 rules, most of WriteAhead, are about what reached the server or the
  store. A typed fake that logs requests and batches checks them with no access to the core.
- **38 rules need a read that does not exist.** They concern lane phase, kept rows, the mailbox, uses and
  timers. `Inspection.plan` O1 already promises most of that in `inspect(runtime)`. Building the cut turns
  these into ordinary rules and hardens inspection at once.
- **The table is a menu, not a backlog.** A rule is written when its feature is built or when a bug shows it
  was needed. Nobody writes 120 rules up front.

### 3.4 What the old suite knew

A Haiku agent harvested every owed list. Appendix A carries the result so nothing is lost at deletion: 8 known
production bugs (5 with a concrete reproduction) and 21 behaviours no case exercises.

### 3.5 What a run cannot show

- **Type errors:** the plans and `Compile.spec` make 31 "is a type error" promises. 5 `@ts-expect-error` checks
  exist in v3 today, run by the `tsc` step of `nub run check`.
- **Construction:** all 11 old construction cases are owed to T17; none passes on production. Two tests exist
  in `src/machine.test.ts`.
- **CLI:** all 9 old CLI cases are owed to T22; production has no CLI.
- **Bench:** `vp bench` does not exist in this toolchain. Today's bench prints turn medians and gates only a
  work fingerprint.

### 3.6 Spec and code disagreements found on the way

Not part of this proposal, listed so they are not lost. I verified the first two.

- `Codec I7` says no lane record has `mayHaveApplied`; `src/core/record.ts:39` defines it.
- `Row.waiting` is always `false` (above).
- `Compile I17` says services are checked by type; `runtimeSetup` takes `Layer<any>` (agent's finding).
- `Turn I30` wants unchanged snapshot parts to keep identity; `operationsOf` builds a new Map on every read
  (agent's finding).

## 4. The first slice

Where the data comes from: the fixture declares a typed service. A real app gives it a Layer over fetch. A
Story gives it a Layer made by `Fake.server`. The commit is the same code in both.

```ts
// existing: Context, Effect, Exit, Option, Schema, actorRef, app, definition, machine, transaction, Flow, Outcome
// user-defined: BankApi, Declined, Lost, transfer, Transfers, TransfersMachine, bank, account, bankServer
// NEW, proven in the spike: Fake.server, hold, release, dropRequest, dropResponse, Story.app, Story.attach,
//   Story.send, Story.advance, Story.reload, Story.checkpoint, run, checkpoints, received, evidence

// fixtures/transfers/contracts.ts
type Declined = { readonly _tag: "Declined"; readonly code: string };
type Lost = { readonly _tag: "NoResponse" };

export class BankApi extends Context.Service<
  BankApi,
  {
    readonly transfer: (
      input: { readonly transferId: string; readonly cents: number },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<{ readonly receipt: string }, Declined | Lost>;
  }
>()("fixtures/transfers/BankApi") {}

export const transfer = transaction({
  id: "Bank/transfer",
  input: { transferId: Schema.String, cents: Schema.Number },
  key: ["transferId"],
  concurrency: "reject",
  services: [BankApi],
  commit: (input, { attempt }) =>
    Effect.flatMap(Effect.service(BankApi), (api) =>
      api.transfer(input, { idempotencyKey: attempt.id }),
    ).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
      Effect.timeoutOrElse({
        duration: "30 seconds",
        orElse: () => Outcome.unknown({ _tag: "TimedOut" as const }),
      }),
    ),
});

// fixtures/transfers/machine.ts
const Transfers = definition({
  id: "Bank/Transfers",
  persist: true,
  states: ["READY"],
  events: { Send: { transferId: Schema.String, cents: Schema.Number } },
  internalEvents: { Done: {}, Declined: { code: Schema.String }, Unsure: Flow.uncertain({}) },
  memory: { notice: Flow.initial(Schema.String, "") },
  operations: ({ E }) => ({
    transfer: transfer.outcomes({
      success: E.Done,
      failure: { Declined: E.Declined.from((e: Declined) => ({ code: e.code })) },
      unknown: E.Unsure,
    }),
  }),
});

export const TransfersMachine = machine(Transfers, ({ S, O }) => ({
  default: S.READY,
  on: {
    Send: { actions: [O.transfer.commit(({ event }) => event)] },
    Done: { updateMemory: () => ({ notice: "sent" }) },
    Declined: { updateMemory: ({ event }) => ({ notice: `declined ${event.code}` }) },
    Unsure: { updateMemory: () => ({ notice: "check your statement" }) },
  },
}));

export const bank = app({ id: "bank", machines: { transfers: TransfersMachine } });
export const account = actorRef(TransfersMachine, "acct-1");

// fixtures/transfers/server.ts: the same service, answered from the run's own server state.
export const bankServer = Fake.server(BankApi, () => {
  const receipts = new Map<string, string>();

  return {
    transfer: (input, { idempotencyKey }) => {
      if (input.cents > 1000) return Exit.fail({ _tag: "Declined" as const, code: "limit" });
      const receipt = receipts.get(idempotencyKey) ?? `r${receipts.size + 1}`;
      receipts.set(idempotencyKey, receipt);

      return Exit.succeed({ receipt });
    },
  };
});

// fixtures/transfers/stories.ts
const config = { app: bank, scope: "story", persistence: { captureMs: 0 } };

export const lostThenReload = Story.app(config, [bankServer], [
  Story.attach(account),
  bankServer.hold("transfer"),
  Story.send(account, { _tag: "Send", transferId: "t1", cents: 500 }),
  bankServer.dropResponse("transfer"),
  Story.advance("5 seconds"),
  Story.reload(),
  Story.checkpoint("reloaded"),
]);

// tests/restore/unknown-write.test.ts
it("a write whose answer was lost is unknown after a reload, and was sent once (Restore R3)", async () => {
  const run = await lostThenReload.run();
  const cut = run.checkpoints.reloaded;
  const snapshot = Option.getOrThrow(cut.actors.get(account.name) ?? Option.none());

  expect(snapshot.memory).toEqual({ notice: "check your statement" });
  expect(cut.received.filter((r) => r.status === "landed")).toHaveLength(1);
  expect(run.evidence.filter((e) => e._tag === "Ended").map((e) => e.reason)).toEqual(["Restored"]);
});
```

**Before** (today's rehosted case): `play([Pay], (c) => { onWire(c); c.answer("pay", Answer.Lost()); c.reload();
c.eq("uncertain", row(s)?.uncertain, true); })` over an untyped network keyed by operation name.

**Added:** `Story`, `Fake.server`, four wire words, three storage words, checkpoints as cuts.
**Dropped:** the `c` case object, `harness/pay.ts`, the untyped network, the script JSON format, case ids, and
the fixtures' `user`, `sketch`, `composite` and `codes` fields.

A newcomer learns six things: a Story is data and `run()` runs it; the step words; `Fake.server` with handlers
that return an `Exit`; the wire words; the storage words; what a cut holds.

Cut from `Testing.plan` for this slice: `Story.machine` and `Story.fragment`, tabs, `together`, `setContext`,
hydration, frames, `StoryFrame` and the player, the one-address scheme, typed checkpoint keys, `duplicate`,
`defineConfig` discovery, trace export and import, redaction.

Open points for the design round, none settled:

- **One more wire word, `answer(method, exit)`** (mine, not in the spike). The 79 cases script answers such as
  "Busy, retry after 500 ms" call by call. Without it, each needs server state arranged to produce that answer.
  The Exit is the service method's own type, so the commit still classifies it; this is a fake's answer, not an
  injected outcome.
- **Calls nobody scripted land by default.** That suits the bench and generated runs, but a stray retry is
  answered silently. The alternative is a strict mode per Story.
- **Whether a Story may use the internal `testing` seam** (seam 2 above) or the public API must grow a use.
- **Steps as an array or as a chain.** The spike uses an array, which is the simplest thing that is data.

## 5. Fixtures

A fixture is a small app as a user would write it. Every fixture is one folder with the same four files.

```
fixtures/<name>/
  contracts.ts   the typed service it calls, and its transactions and resources
  machine.ts     definition, machine, app and actor refs
  server.ts      Fake.server for that service
  stories.ts     named Stories: the usual path, a lost answer, a reload mid-write, a long run for the bench
```

- **One source, three consumers.** Tests assert on the short stories, the bench times the long ones, and
  `propertyTest` later takes its step samples from the same folder.
- **A fixture earns its place** by exercising features no other does. Which features it uses is read from its
  compiled machine, never from a hand-kept list.
- **Today:** sync, transfers, sign-in, pay and cells, all centred on a write with an unknown ending. The lab
  machines (serialize, latest, cancel, keyed, form, issues, stamp) return when production builds their
  features. `references/checkout` and `references/dispatch-desk` are the source for realistic ones.
- **The bench** is one script, `bench/run.ts`, that runs each fixture's long story and prints the median and
  p99 cost per turn. An ordinary test asserts that a benched run does the same turns as a tested one. Timings
  are recorded at each Task's close; nothing gates on them until P8 sets budgets.

## 6. Rules, generated Stories, known bugs

**Run rules.** A rule is a plain function from a finished run to a list of breaches, named by its Spec id. One
helper applies every rule to every Story run in the tests, and `propertyTest` applies the same list.

```ts
// NEW: Rule   // existing: StoryRun from section 4
export const oneEndingPerAttempt: Rule = {
  rule: "WriteLanes I15",
  breaches: (run) => {
    const delivered = run.evidence.flatMap((e) =>
      e._tag === "Delivered" && Option.isSome(e.attempt) ? [e.attempt.value] : [],
    );

    return delivered.length === new Set(delivered).size ? [] : ["an Attempt's ending was delivered twice"];
  },
};
```

The starter set is small: the checks the rehost already carries (publication, disposal), one for the missed
fault (Turn I14), and one each for ending channels and Attempt identity. A rule lands only when it is green on
every Story and red on one planted fault.

**Generated Stories.** `propertyTest` draws steps from a fixture's samples and from the fakes' open calls, runs
them on the real Runtime, applies the rules, shrinks a failure by removing steps, and prints a Story to paste
into `stories.ts`. Nothing generated is stored. It needs the runtime cut to tell "quiet" from "still working".

**Known bugs.** One inverted test each, titled by the Spec rule it breaks, in the area it belongs to. No Task
id in code. Stated limit: an inverted test passes on any failure, as the dead-core check showed.

**Planted faults.** The 17 named wrong behaviours are the user's sense of "mutant": a defined wrong outcome the
tests must reject. Keep them as one data file, applied by a scratch script when the harness changes. They are
never a gate and never a score.

## 7. Keeping a self-hosted harness honest

- **A small trusted base.** A Story run drives only the public API and the fakes, and reads only public
  snapshots, the inspection cut and evidence.
- **The tools have their own tests** that use no Story: a handler, the settle loop, the trace printer.
- **Dead core and planted faults** are re-run whenever `src/testing` or `src/inspect` changes.
- **Pure core tests stay** beside the core, so the lane table is never judged only through the tools.
- **Fakes are checked against the real thing** once a real-browser run exists (P8).

## 8. Layout

```
packages/flow-state-v3/
  src/
    core/       the pure step (unchanged)
    host/       the Effect driver and Runtime; inspect.ts gains the runtime cut; trace.ts prints a run
      testing/  Story, Fake, run; later propertyTest
    cli/        flow story | trace; later check | explain | graph
  fixtures/     <name>/{contracts,machine,server,stories}.ts
  tests/
    <area>/     Story tests by Spec area: write-lanes, write-ahead, actors, turn, restore, reads
    rules/      run rules
    types/      compile-time tests
    generated/  propertyTest runs
  bench/        run.ts
```

## 9. Sequence

The order is: clean up, build the first slice, port the cases, then core work resumes; generated Stories and
the CLI land before T18. Section 13 is the task list. There is no design round (the user, 2026-11-15); the open
points are decided in section 12.

Process changes that follow: one builder; a red test first; `vp test` between edits; review at Task close
reading the diff of fixtures, tests and core. A ruling is asked as two traces, not as prose.

## 10. How each old problem is addressed

| Old problems (numbers from the user's list)                                   | What removes them                         |
| ----------------------------------------------------------------------------- | ----------------------------------------- |
| 1 to 6: several runtimes, cost per core Task, a suite larger than its subject | no model, one runtime                     |
| 7, 10, 14, 16, 20: the belief, thin scripts, lost coverage, the pairs gate    | nothing generated is stored               |
| 8, 13, 29, 30: owed rows, eight owed lists, clashing rules, wrong owners      | one inverted test per known bug           |
| 9, 15, 17: triage by line, what counts as caught, the mutant limit            | planted faults by name, no score          |
| 11, 12: the baseline, held traces                                             | no recorded outputs                       |
| 18, 19, 23, 27: gate drift, scratch traps, slow gates, false greens           | one command, about a second               |
| 21, 22: model gaps, code slips in the suite                                   | gone with the model; lint covers `tests/` |
| 24, 25, 31: stops for rulings, wrong assumptions, a wrong review note         | rulings as traces; fewer records          |
| 26: private tooling rebuilt per builder                                       | `flow story run`, `flow trace`            |
| 28, 32: stalls, the pending-test pattern                                      | one builder; `it.fails` stated once       |
| 33 to 37: temporary records, lint gaps, shell writes, plants, stray files     | lint and hook; faults in scratch only     |

## 11. Records this would change (each needs the user's yes)

- The Epic's "Preview cut first": the first Story slice, the runtime cut and `flow trace` move ahead of T18.
- `wiki/specs/conformance/Conformance.spec` retires; the core Specs' `tests` sections name Stories.
- `Testing.plan`, `Inspection.plan` and `CommandLine.plan` each gain a marked first slice.
- The suite-upkeep Tasks close as superseded; Appendix A's gaps become notes on their owner Tasks.

## 12. Decisions taken by the agent

The user declined a design round on 2026-11-15 ("this is about correctness") and left these to the agent. Each
is decided on correctness first, then simplicity, and each names how to reverse it. None is the user's own
decision; the user may overturn any of them.

1. **The ideas are valid, with three corrections.**
   - Deleting the old suite removes its crash sweep (a kill and reload at every step, 735 points, which found
     three real bugs). A reload sweep over every Story goes into the first slice (task B5).
   - The mutation-score target is dropped. Strength is shown by named planted faults and the dead-core check.
   - "Test code no larger than the core" is dropped. The measure is harness logic: small, and untouched by a
     core rule change.
2. **The interim: cut over to the bridge.** It was checked (section 3.2). Reverse: restore `conformance/` from
   `52a883e6`.
3. **Answers: handlers by default, plus `answer(method, exit)` for one held call.** Any typed answer is a legal
   input to Flow, which cannot assume a consistent server, so an override tests Flow honestly. An overridden
   call does not touch the fake's state. Reverse: delete the word; tests then arrange server state.
4. **Internal state: a runtime cut in `src/inspect`,** with rules written over it. It hardens a read the
   Inspection plan already promises. Reverse: move those rules into a test-only pass over `World`.
5. **Planted faults: kept** as one data file and one script, run by hand when `src/testing` or `src/inspect`
   changes. Never a gate. Reverse: delete both.
6. **Steps are an array, and unscripted calls land.** Tests that care assert on `received`.
7. **Pay is proven inside the first slice,** not after it. One Pay Story (a lost confirm, its deadline, a
   reload) must pass before the slice counts as done, because Pay's detached fiber across a page death is the
   one thing the spike left unproven. If it cannot pass, the reload model is wrong and work stops there.
8. **Core work resumes after the whole test system is done,** generated Stories and the CLI commands included
   (changed later on 2026-11-15; it was "after the port"). The known bugs in the consolidation's area were all
   found by generated runs, and the Epic starts a phase only after the previous one's completion audit.
9. **The tooling lives under `src/host/`,** not in `src/testing` and `src/inspect` as sections 2 and 13 first
   said. AGENTS.md defines the core as everything outside `src/host/`, pure and without the Effect runtime,
   and the lint enforces it. Public routes can map to these folders later. Reverse: move the folders and add
   them to the lint's exceptions.
10. **The bridge stays in `tests/bridge/` until phase C,** and the Conformance Spec keeps status `proposed`
    with "retired" in its basis, because `wk` allows open coverage items only on a proposed Spec.

## 13. Task list

Who: **me** is the orchestrating agent; builders are one at a time. Nothing is committed without the user's
word. Estimates are guesses.

### Phase A: clean up (me, about half a day)

Phase A is done (commits `e4a6a637` and `a3168ce4`): 262 tests pass in about a second, `nub run check` is clean,
dead core fails 80 of 81 bridge cases and 16 of 17 faults are caught.

- **A1. Keep the planted faults.** Save the 17 as `tests/faults.ts` and the scratch check as
  `tools/faults/run.ts`. Done: the script reports dead core red and 16 of 17 caught on the bridge.
- **A2. Move the rehosted tree to `tests/bridge/`.** Done: 81 cases pass; both known-red cases stay inverted.
- **A3. Delete `conformance/` and `bench/`.** Done: neither folder exists.
- **A4. Fix what named them:** root scripts and `verify`, the v3 `tsconfig`, `vite.config.ts` scopes, the lint
  rule tests, `FLOW-STATE.md`. Done: `nub run check` and `vp test` are clean.
- **A5. Grep the package** for `conformance`, `round-14`, prototype paths, Task ids and dated names. Done: no
  hit outside `prototypes/`.
- **A6. Records, on the user's yes to this list.** Retire `Conformance.spec`; rewrite the Epic's slice
  template, gates and review cadence; reorder "Preview cut first"; close the suite-upkeep Tasks as superseded;
  put Appendix A and section 3.6 as notes on their owner Tasks. Done: `wk check` is valid.

### Phase B: the first slice (one Opus builder, boxed at two days)

- **B1. Seams in `src/host`.** Boot a Runtime over a given platform; attach with a use; `cutOf` (every live
  actor, lanes with phase, kept rows, timers, batches out, uses). Done: each has a direct test.
- **B2. `src/testing`.** `Story`, `Fake.server` with five wire words, the fake store with three, the run on
  `TestClock`. Done: every step word has a test; a run twice gives equal evidence; no host timer is armed.
- **B3. `src/inspect`.** A plain-text trace of a run. Done: a text snapshot of one transfers run.
- **B4. Fixtures.** `fixtures/transfers` in the four-file shape, and one Pay Story (lost confirm, deadline,
  reload). Done: both pass; the Pay Story settles decision 7.
- **B5. `tests/rules`.** Five starter rules, the helper that applies them to every run, and the reload sweep
  over every Story. Done: each rule is red on one planted fault; the sweep is green.
- **B6. `bench/run.ts` and the same-work test.** Done: it prints median and p99 per turn for the long story.
- **B7. Dead core and planted faults against the new tests (me).** Done: dead core all red; the Turn I14
  fault is now caught.
- **B8. Idiomatic-Effect review** by a second Opus with the `effect-api-documentation` skill and its sidecars;
  the builder fixes what I verify. Done: no finding left open without a reason.

If the box is missed: stop, keep the bridge as the working tests, and report what blocked.

### Phase C: port (Sonnet per area, the Opus builder reviews; about a day and a half)

- **C1. The other fixtures.** `fixtures/pay`, `cells`, `sync` and `sign-in` in the four-file shape; the ten
  frozen workloads become long stories. Done: each fixture has a usual and a stress story.
- **C2. Port the cases by area:** write-lanes, actors, turn. Each bridge file is deleted as its cases land.
  Done: the same asserted values, case by case.
- **C3. The five reproductions in Appendix A** as inverted tests. Done: each is red for its stated rule when
  un-inverted.
- **C4. Delete `tests/bridge` and the old fixture files,** then run dead core and the faults again (me). Done:
  17 of 17 caught; one test style in the tree.
- **C5. `tests/types`.** One compile-time test for each "is a type error" promise production has built. Done:
  `nub run check` fails when a directive is unused.

**Core work may resume here,** with the rest of T54.

### Phase D: before T18 (one Opus builder, about two days)

- **D1. The CLI.** `flow story list`, `flow story run`, `flow trace`. Done: each prints from the same run and
  printer as B3.
- **D2. `propertyTest`.** Generated Stories from a fixture's samples and the fakes' open calls; the rules;
  shrinking; a failure printed as a Story. Done: a planted fault is found from a seed and shrunk to under ten
  steps.
- **D3. From T18 on,** each touched Invariant gets the cheapest check the survey names. Done: stated in the
  Epic's builder brief.

### What each task buys

| Asked for                                         | Delivered by                                         |
| ------------------------------------------------- | ---------------------------------------------------- |
| One runtime                                       | A3                                                   |
| A core change costs only itself                   | B2, C2: fixtures and Stories, no copy of the core    |
| Every rule has one home, found by its id          | B5 rule names, Story test titles; a grep finds it    |
| Bugs find themselves, and shrink                  | B5 reload sweep, D2                                  |
| Strength is shown, not assumed                    | A1, B7, C4: named faults and dead core, no score     |
| Fast feedback                                     | one command; about a second today, re-measured at C4 |
| Stories, replay, CLI and determinism keep working | B2, B3, D1 are those features                        |
| The 37 problems                                   | section 10                                           |

Targets to check at C4 and again after T18: no commit whose only job is making tests catch up with a core
change; `src/testing` plus `src/inspect` smaller than `src/core`; the full check under three minutes; builders
asking for rulings only on open Spec questions.

## Appendix A: what the old suite knew (carried over at deletion)

Known production bugs. The first five have a reproduction and become inverted tests.

| Bug                                                            | Rule           | Owner | Reproduction at the checkpoint       |
| -------------------------------------------------------------- | -------------- | ----- | ------------------------------------ |
| A delay past 2^31 - 1 ms is armed, not refused                 | Turn I14       | T17   | case `TURN-01/schedule-out-of-range` |
| Disposal reports Done before its final write is answered       | Actors I43     | T55   | `PAY-15/final-write-refused`         |
| A re-send's raised retry count is not captured before a reload | WriteLanes I7  | T19   | crash point `PAY-22@16`              |
| A flush holds only its own actor's record                      | WriteAhead I23 | T54   | `PART-transfers-varied-2001-shrunk`  |
| An adopted lane's later endings are routed against Actors R20  | Turn I2, I26   | T54   | `PART-cells-stress-3-shrunk`         |
| A commit queued behind a Held head is not ended at disposal    | Actors I38     | T9    | two scripts, status unjudged         |
| Any write discharges every dirty end                           | Actors I37     | T19   | only under an edit                   |
| A disposed actor's refused Unsent head never ends              | WriteLanes I15 | none  | none named                           |

Behaviours no case exercises, from `conformance/core-mutants-triage.ts` at the checkpoint, by owner:

- **T54:** two batches out and their silence timers; disposing one actor while another's lookup is out;
  cancelling a read; a send to an ended local identity; reading an owed identity at ready before touching it;
  a queued row at Runtime disposal and at `disposeActor`; a cancel on a key with a kept row; a non-persisted
  machine's actor record; an unknown row queued when the owed record is written.
- **T18:** InFlight evidence on a retry; one actor's exit and another's schedules; a due schedule at an ensure;
  cancel or retry on an Idle key; a commit whose non-key field cannot encode, and the NoPersistence decline; a
  commit from a non-entering leaf transition.
- **T55:** schedules after Runtime disposal starts; re-ensuring inside the grace; releasing with a schedule
  armed; a step inside the grace.
- **T9:** a turn storm past the drain's slice; a send that should restore an ended identity.
- **T17:** a 0 ms computed delay.

## Appendix B: agent log

Seven agents; I verified what I used.

- **Story run spike (Opus, two Haiku sidecars, `effect-api-documentation` skill).** Accepted: I read all 382
  lines, re-ran the three tests, and checked `MixedScheduler`'s constructor (`Scheduler.ts:176`) and
  `TestClock.layer` (`TestClock.ts:553`) in the installed Effect 4.0.5. Changed: I add `answer` as an open
  point; the agent rejected story-given answers as injected outcomes, but an Exit of the service method still
  passes through the commit. Noted: the spike fails the package's lint (77 errors), as a spike may; it now
  lives in the session scratchpad, not the repo.
- **Invariant surveys (3 Haiku).** Accepted as a guide. Changed: WriteLanes I7 from hidden state to a public
  row read. Two of their code observations verified (section 3.6); the rest are marked as theirs.
- **Known-gap harvest (Haiku).** Accepted: the eight bugs and their file references match `runner/gates.ts`
  and `parts/owed.ts` where I checked. Its count of 344 "gaps" includes 259 unbuilt Plan features, which are
  the roadmap, not bugs, and are left out here.
- **Type, construction, CLI and bench inventory (Haiku).** Accepted; I confirmed `vp bench` does not exist.
- **Prior art (Haiku, web).** Used for framing only: default handlers with a per-test override (MSW,
  Playwright routes), time that moves only when the test says (Effect, Playwright, Temporal), and a failing
  generated run reported as something to paste back (Hypothesis). Several of its rows were unverified and no
  claim here rests on them.
- **Honesty checks.** Mine, from a scratch script: dead core and the 18 planted faults (section 3.2).

## Appendix C: rules carried from the old suite's Spec

The deleted `Conformance.spec` (last copy at `52a883e6`) held principles any test system needs. Each is restated for
Story tests, run rules, generated Stories, compile-time tests, pure core tests and `nub run faults`, with where it
already lands. Entries 1 to 8 are in a record; 9 to 15 are in no record yet, each with the Task that should own it.

**Already in a record**

1. **An expected value never comes from output.** It is derived from the cited Spec rule; recorded output is a
   change detector only (old I11). Lands in the Epic's "Test the spec, not the code" constraint.
2. **Every Plan feature the runtime builds is reached by a test** (old I54). Lands in the Epic's "Every public
   feature in the Plans is represented in a fixture" and section 5; no gate counts it.
3. **A run is deterministic:** no wall clock or randomness, same input and seed, same evidence (old I19). Lands in
   T63 ("run twice gives equal evidence", "arms no host timer"), T65 (same trace) and T70 (same seed).
4. **A benched run does the same work as a tested one** (old I67). Lands in T66's same-turns test.
5. **An Invariant that no test can judge is named, with why** (old I38). Partly in T67's coverage record (Scope);
   its text does not say that each unjudged Invariant carries a reason.
6. **A test reads only public behaviour** (old I1, I2). Lands in T62's import rules and section 7.
7. **A failure names the Spec rule it breaks** (old I32). Lands in T64 (rules named by Spec id) and T70 (a failure
   prints as a Story); the step and seed are not stated.
8. **A failure a generator finds is kept and replayed** (old I49). Lands in T70 as a Story printed to paste into
   `stories.ts`; keeping it is by hand, and nothing checks that it was kept.

**In no record yet**

9. **A carried-over expectation counts only when its cited rule gives the same value** (old I41, R5). T67 asks
   for "the same values" as the case, which is the wrong test of a port. Owner: T67 acceptance line 1.
10. **A rule is anchored to what a fake received or the store holds**, never only to the run's own reports: a runtime
    that lies consistently passes a rule that compares reports with each other (old I63, I8, R4). A rule that only
    compares evidence says so, and no Invariant rests on such rules alone. Owner: T64.
11. **A red from a thrown scenario error or a timeout is not a catch** (old I18, I25, I16). A fault counts as
    caught only when a failing test cites the fault's rule, and a dead core must fail tests by assertion.
    `tools/faults/run.ts` counts any failing run as caught, and exits 0 when a fault is missed or stale. Owner: T64.
12. **A planted fault is applied exactly once, the unplanted control runs first, and plants are isolated in a copy**
    (old I14, I15, I17, I33). `tools/faults/run.ts` does this (stale edits are reported, the copy is removed) but
    no record states it; it joins an edit's path to the copy with no check that it stays inside. Owner: T64.
13. **Each test cites a Spec rule, and the citation resolves** against the Specs (old I9, I40). T63 and the Epic
    say tests cite rules; nothing checks that a cited id exists. Owner: T67, as a lint test over `tests/`.
14. **Each test has a time bound, and an overrun is a defect, not a verdict** (old I34). T63 caps a run at 100,000
    tasks (section 3.1) but no test time bound is stated. Owner: T63.
15. **A test's verdict does not depend on other tests, their order or the process split, and each run starts on
    fresh state** (old I20, I22). Only a repeated run is covered (entry 3). Owner: T63, as a Story run owning its
    store and fake state.
