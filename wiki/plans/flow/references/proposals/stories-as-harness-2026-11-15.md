# Stories as the harness: Flow tests itself with its own public tools (2026-11-15)

**Status: superseded by `test-system-2026-11-15.md`,** which keeps this direction and adds the evidence, the
other kinds of test and the sequence. Kept as prior art. The user's decision of 2026-11-15 stands: reuse
Stories, the CLI and the inspection tooling as the core's own test harness.

**Bottom line:** there is one runtime, so there should be one way to run it on purpose. Everything that runs
Flow to look at it (Flow's own tests, the bench, generated tests, the CLI, later the docs) goes through three
public tools: a **Story** scripts the run, a **Fake** stands in for the outside world, and **inspection** reads
what happened. Flow's tests become Stories over fixtures with plain assertions. Nothing private sits between a
test and the runtime, so every test also hardens what users get.

**Why now:** the conformance suite is being removed (checkpoint `52a883e6`). Its replacement so far, the rehosted
cases in `packages/flow-state-v3/tests/`, keeps the prototype's private test language. Building a second private
harness would repeat the mistake at a smaller size.

**Read first:** `wiki/plans/flow/Testing.plan` O1 to O4 and O6, `Inspection.plan` O1, O3, O4,
`wiki/specs/core/StaticCli.spec`, and the Epic's "Preview cut first" rule, which schedules Stories and inspection
after the first release.

**Risk:** a harness made of the product can hide the product's bugs: a wrong `inspect` makes a wrong test pass.
Section 5 says how that is kept honest. The second risk is scope: `Testing.plan` is 381 lines written against the
prototype, and building all of it first would stall the core for weeks. Section 3 cuts it to what the built core
can exercise.

## 1. From scratch: what a test of Flow is

A run of Flow has exactly three parts, and each needs one tool:

- **What is driven.** User acts (attach, send, detach, dispose, forget) and world acts (a service answers or
  stays silent, storage lands or refuses a batch, time passes, the page reloads). As data, in order: a Story.
- **What stands outside.** The services a machine's contracts call, the store and the clock. Each is replaced
  whole, through the same Effect service the app uses in production: a Fake.
- **What is read.** Public snapshots at named points, the evidence stream, and what reached the fakes:
  checkpoints and a trace.

Every consumer is then the same run, read differently:

| Consumer | What it does with a run |
| --- | --- |
| A test | asserts on checkpoints and evidence, citing the Spec rule |
| The bench | times it |
| A generated test (`propertyTest`) | builds Stories from seeded steps, checks properties, shrinks, emits a Story |
| `flow story run`, `flow trace` | prints it |
| A builder debugging | the same `flow trace`, in place of private scratch scripts |

## 2. Where the data comes from

The fake is not a network simulator. It is a second Layer for a service the fixture already declares, so the
value reaches the machine through the commit's real code in both cases.

```ts
// existing: Context, Data, Effect, Layer, Schema, transaction, definition, machine, Flow, Outcome
// user-defined: Bank, Declined, Lost, transfer, Transfers, TransfersMachine, bankOverFetch, bank, lostThenReload
// NEW (names from Testing.plan; shapes not designed yet): Fake.server, Story.machine, drop, reload, checkpoint

// fixtures/transfers/contracts.ts
export class Declined extends Data.TaggedError("Declined")<{ readonly code: string }> {}
export class Lost extends Data.TaggedError("Lost")<Record<string, never>> {}

export class Bank extends Context.Service<
  Bank,
  {
    readonly transfer: (
      input: { readonly transferId: string; readonly cents: number },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<Record<string, never>, Declined | Lost>;
  }
>()("fixtures/transfers/Bank") {}

// A real app: the value comes from fetch.
export const bankOverFetch = Layer.succeed(
  Bank,
  Bank.of({
    transfer: (input, options) =>
      Effect.tryPromise({
        try: () =>
          fetch("/api/transfers", {
            method: "POST",
            headers: { "Idempotency-Key": options.idempotencyKey },
            body: Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(input),
          }).then(() => ({})),
        catch: () => new Lost({}),
      }),
  }),
);

export const transfer = transaction({
  id: "Bank/transfer",
  input: { transferId: Schema.String, cents: Schema.Number },
  key: ["transferId"],
  concurrency: "reject",
  services: [Bank],
  commit: (input, { attempt }) =>
    Effect.flatMap(Effect.service(Bank), (bank) =>
      bank.transfer(input, { idempotencyKey: attempt.id }),
    ).pipe(Effect.catchTag("Lost", (e) => Outcome.unknown(e))),
});

// fixtures/transfers/machine.ts
export const Transfers = definition({
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
    Done: { updateMemory: () => ({ notice: "" }) },
    Declined: { updateMemory: ({ event }) => ({ notice: `Declined (${event.code}).` }) },
    Unsure: { updateMemory: () => ({ notice: "Check your statement before sending again." }) },
  },
}));

// fixtures/transfers/server.ts: the same service, answered from typed truth.
export const bank = Fake.server(Bank, {
  truth: { balance: 1000 },
  transfer: (truth, input) =>
    input.cents > truth.balance
      ? { truth, fail: new Declined({ code: "insufficient" }) }
      : { truth: { balance: truth.balance - input.cents }, ok: {} },
});

// fixtures/transfers/stories.ts
export const lostThenReload = Story.machine(TransfersMachine, { id: "transfers/lost-then-reload", fixtures: [bank] })
  .send("Send", { transferId: "t1", cents: 500 })
  .world(bank.transfer.drop())
  .reload()
  .checkpoint("reloaded");

// tests/restore/held-write.test.ts
it("a write whose answer was lost is still unsure after a reload (Restore R3)", async () => {
  const run = await lostThenReload.run();

  expect(run.checkpoints.reloaded.memory.notice).toBe("Check your statement before sending again.");
  expect(run.checkpoints.reloaded.read(bank).balance).toBe(500);
});

// bench/transfers.bench.ts
bench("transfers/lost-then-reload", () => lostThenReload.run());
```

**Before** (the rehosted case today): an untyped network keyed by operation name, a `c` case object, helpers
such as `onWire(c)` and `c.answer("pay", Answer.Lost())`, and ids such as `PAY-15/reload-holds-exactly-once`.

**Added:** `Story`, `Fake.server`, checkpoints, a typed fake beside each fixture's machine, stories beside both.
**Dropped:** the case object and its helper file, the untyped network, the script JSON format, case ids, and the
fixtures' `user`, `sketch`, `composite` and `codes` fields (a user model returns later as `propertyTest` steps).

## 3. The first slice (v0)

`Testing.plan` stays the direction. v0 is only what the built core can exercise and what today's 79 passing
cases and 10 bench workloads need to be expressed.

- **In v0:**
  - `Story.machine` and `Story.app`; steps `send`, `ensure`, `detach`, `dispose`, `advance`, `reload`, `world`,
    `checkpoint`; `run()` returning checkpoints, evidence and `end`;
  - `Fake.server` (typed truth, one handler per service function, and the plan's wire words `hold`, `release`,
    `drop`, `duplicate`) and `Fake.storage` (land, refuse, hold);
  - Effect's `TestClock` and one settle rule in place of the two hand-written clocks
    (`tests/harness/world/clock.ts`, `src/host/testing/page.ts`);
  - a checkpoint's reads: state, memory, an operation's row, a fake's truth, the requests a fake received;
  - a plain-text trace of a run, and `flow story list`, `flow story run`, `flow trace <story> [--at]`.
- **After v0, each with the feature it needs:** `propertyTest` (first, since it is the generated testing the
  old suite's parts stood for), tabs, `together`, fragment Stories, `setContext`, hydration, `StoryFrame` and
  the player, frames per publication, trace export and import, redaction, `inspect(app)` and `flow check`.

## 4. Fixtures

A fixture is a small app as a user would write it, in one folder with the same four files:

```
fixtures/<name>/
  contracts.ts   the service it calls, and its transactions and resources
  machine.ts     definition and machine
  server.ts      the fake of that service: typed truth and handlers
  stories.ts     named journeys: the usual path, a lost answer, a reload mid-write, a long stress run
```

- Short stories with checkpoints are what tests assert on. Long ones are what the bench times. The same folder
  later gives `propertyTest` its step samples.
- A fixture earns its place by exercising features no other fixture does. Which features a fixture uses is read
  from its compiled machine, never from a hand-kept list.
- Today's five (sync, transfers, sign-in, pay, cells) all centre on a write with an unknown ending. The lab
  machines (serialize, latest, cancel, keyed, form, issues, stamp) return as fixtures when production builds
  their features. The reference apps (`references/checkout`, `references/dispatch-desk`) are the source for the
  realistic ones.

## 5. Keeping a self-hosted harness honest

- **A small trusted base.** A Story run may drive only the public API and the fakes, and may read only public
  snapshots and inspector evidence. It never reads the core's `World`.
- **The tools have their own tests** that use no Story: a fake's handler, the settle rule and the trace printer
  are each checked directly.
- **A dead core must fail everything.** With `step` stubbed to change nothing, every test must go red.
- **Known-wrong cores must be caught.** The old suite's 18 planted production faults
  (`conformance/adapters/production.mutants.ts` at the checkpoint), each a named wrong behaviour with the rule
  it breaks, are applied one at a time. Both checks run from a scratch script at each cutover, not as a gate.
- **Pure core tests stay beside the core** (`src/core/cells.test.ts`, `ledger.test.ts`), so the lane table is
  not judged only through the tools.

## 6. Layout

```
packages/flow-state-v3/
  src/
    core/       the pure step (unchanged)
    host/       the Effect driver and Runtime (unchanged)
    inspect/    attachInspector, the runtime cut, the trace printer     (public route, later)
    testing/    Story, Fake, run; later propertyTest                    (public route, later)
    cli/        flow story | trace; later check | explain | graph
  fixtures/     <name>/{contracts,machine,server,stories}.ts
  tests/        <spec area>/<rule>.test.ts: a story, a run, plain expects, the Spec id in the title
  bench/        <fixture>.bench.ts: times the fixture's long stories
```

## 7. Sequence

1. **Cut over to the bridge.** The rehosted tree stands at 88 passing tests in 0.7 s, all 79 baseline ids
   present, checks clean; the two known-red cases and the two honesty checks are still owed. Finish those, move
   the tree to `tests/bridge/`, then delete `conformance/` and `bench/`. The bench returns in step 3.
2. **Design v0 from scratch.** One Opus agent gets the problem, not the bridge: the inventory of steps and
   reads the 79 cases use, the three plans, this file, and the `effect-api-documentation` skill for exact
   Effect 4 APIs. It returns one proposal with full before and after on two unlike fixtures. The user answers
   in rounds.
3. **Build v0 on the smallest fixture.** `src/testing`, `src/inspect`, the trace printer, the transfers fixture
   in the new shape, its tests and its bench. Run both honesty checks on it. Then the idiomatic-Effect review.
4. **Port by Spec area.** Pay and cells become fixtures in the new shape; each bridge file is deleted as its
   cases land as stories. `tests/bridge/` is gone when the last one lands.
5. **The CLI's story and trace commands,** thin over the same run and printer.
6. **`propertyTest`,** with the first properties taken from the checks that read only evidence.
7. **Core work resumes** after step 3: each new rule starts as a failing story test.

Effort is unmeasured. My guess is a day for step 2 with the user's answers, one to two builder days for step 3,
and a day for step 4.

## 8. Records this would change (each needs the user's yes)

- The Epic's "Preview cut first": Story v0, the runtime cut and `flow trace` move ahead of the core slices.
- `wiki/specs/conformance/Conformance.spec` retires; the core Specs' `tests` sections name stories.
- `Testing.plan`, `Inspection.plan` and `CommandLine.plan` each gain a marked v0 slice.

## 9. Questions for the user

**Q1. The interim.**

- A (recommended): cut over to the bridge now, as step 1 says. The old suite and the bench go today; the bench
  is back with step 3.
- B: keep the old suite untouched until Stories carry the cases, and discard the bridge.

**Q2. The first slice.**

- A (recommended): v0 as in section 3, then `propertyTest`.
- B: build `Testing.plan` O1 to O4 in full before any test moves.

**Q3. Where it lives.**

- A (recommended): in `src/testing`, `src/inspect` and `src/cli` from the first commit, shaped as the public
  routes, exported once they have carried Flow's own tests.
- B: internal first, published later.

**Q4. The Epic.**

- A (recommended): Story v0 goes before T18, and core work resumes after step 3.
- B: resume core work on the bridge now, and build Stories alongside.
