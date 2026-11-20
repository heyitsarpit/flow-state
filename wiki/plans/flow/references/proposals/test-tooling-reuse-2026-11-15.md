# One set of tools: Story, Fake, inspection and the CLI shared by Flow, apps and production (2026-11-15)

**Status: accepted (the user, 2026-11-15: "all agreed").** Every question in section 6 is decided as its
recommendation: Q1 A, Q2 A, Q3 A, Q4 A, Q5 A, Q6 A, Q7 A, Q8 A, Q9 A, Q10 A, Q11 A. Q4 edited @plan.Testing.O3
(fixtures replace the setup's services); the names and words the Plans lack are @plan.Pending D5 to D9. Where
this file and the Plan name the same thing differently, the Plan's name wins: `Fake.storage` for `Fake.store`,
`records` for reading the store, `run.evidence` for `run.endings`, and `read(endpoint)` (D8) for `requests`;
`forget` is `dispose(ref, { how: "forget" })`.

**Supersedes** in code:wiki/plans/flow/references/proposals/test-system-2026-11-15.md: section 2's "Three tools",
section 4's API, and section 12 decisions 3, 4, 6 and 9. Everything else there stands: the five kinds of test,
what is deliberately not built, run rules and the reload sweep, planted faults and the dead core, generated
Stories, keeping the harness honest, the evidence, and the sequence.

**Bottom line:** the Plans meant one public Story all along, and they still do. T63's array-and-closure shape is a
narrowing of the first slice, not a second design. The Spec's "the tooling is internal" line (Stories R11) took
"not exported yet" to mean "private". The proposal keeps one of each tool:

- **One Story and one runner.** The chained Story of @plan.Testing.O1 builds steps. Its data form (`Story.Step`) is
  the array T63 already has, so T63's steps become the chain's data. The runner stays fixed: TestClock, Effect's
  scheduler, a page per reload. It is not a service with several implementations.
- **What changes between worlds is the Layers, not the runner.** A fake is another Layer of a port that already
  exists: the app's own service, Effect's `HttpClient`, or Flow's `Store`. Truth and controls live in a
  `Fake.server` the run owns. The port carries nothing test-only, and one contract test, a plain function of a
  Layer, checks the fake and the real Layer alike.
- **One inspection and one CLI.** T63's `cutOf(driver)` is the first slice of the public `inspect(runtime)`. A
  checkpoint's runtime part is that same read. `flow story` and `flow trace` are thin over `run()` and one trace
  printer. Flow's package is a Flow project to its own CLI (`flow.config.ts` lists the fixtures).

**Why now:** the T63 builder is paused with Story and Fake uncommitted (log, 2026-11-15T13:28:48Z: "we may have a
confusion"). Its public shape will be copied into every fixture, Story and test T64 to T70 write. Changing it now
costs about a day. Changing it at T29 costs a rewrite of all of them.

**Read first:** `test-system-2026-11-15.md` sections 2, 4 and 12; @plan.Testing.O1 to O4;
@plan.Inspection.O1 and O4; @plan.CommandLine.O2; @plan.Package.O1; @spec.Stories; the T63 working tree under
`packages/flow-state-v3/src/host/testing/`.

**Risk:** two things only this file states.

1. T63's settle drains Effect's scheduler and sees no host Promise (Stories R4, its stated limit). That is fine for
   port fakes. It rules out a real adapter or SDK over a transport fake until the settle drains microtasks, as
   @plan.Testing.O2 specifies. Effect's own `HttpClientResponse.fromWeb` reads bodies through `Effect.tryPromise`
   (`node_modules/effect/src/http/HttpClientResponse.ts:414`, `:432`).
2. A fake can be faithful only to what a contract test pins. Without one, every fake drifts.

## 1. Finding: one Story was intended

**Verdict:** one public Story, used by app authors and by Flow's own tests. No record ever planned an internal
twin. Two things split it in practice:

- the first slice's simplifications: an array instead of a chain, closures instead of truth, a config instead of a
  setup;
- the phase stop on public names, which the Spec recorded as "internal".

### For one Story, public, shared

- `wiki/tasks/V3/log.task:3-4` (the user): "reuse stories and our cli and inspect tooling as the core's own test
  harness, these are supposed to be public anyways".
- `wiki/tasks/V3/epic.task:56-57`: "Flow's own tests run on the test tooling users will get (Story, Fake, the
  runtime cut and trace, the CLI)".
- `test-system-2026-11-15.md:61`: "### Three tools, all public".
- `test-system-2026-11-15.md:366-367`: "A Story run drives only the public API and the fakes".
- `wiki/plans/flow/Package.plan:33`: "flow-state/testing: Story, Fake (with Fake.server, Fake.storage …)".
- `wiki/plans/flow/Testing.plan:12`: "Story.app(setup, { id, fixtures?, world?, storage?, seed? }) accepts a typed
  RuntimeSetup."
- `references/checkout/features/Pay/pay.story.ts:7`: `import { Fake, Story } from "flow-state/testing";`.
- `wiki/tasks/V3/P5.task`, T29: "Build the rest of @plan.Testing on production and export it … P2 built the first
  slice that Flow's own tests run on."

### What reads as "two", and what it actually says

- `wiki/tasks/V3/P2.task:57`: "`Story`, `Fake` and `propertyTest` … stay unexported in this phase; exporting any of
  them … is the user's". This is about when to export: a stop for the user.
- `wiki/specs/testing/Stories.spec:96-99` (R11): "The tooling is internal … Nothing of Story, Fake or the runtime
  cut is exported from a public route". This is P2's stop restated as a property. Its source line cites
  `@phase.V3.P2 (stops: public entry-point names)`.
- `wiki/plans/flow/Package.plan:44-45`: "flow-state/internal/testing, which exports disposeRuntime for Flow's own
  suite, is not a supported route". This is one private function, not a second Story.
- `test-system-2026-11-15.md:99-101`: "The Story attaches through the internal `testing.attach`". This is a seam into
  the one Runtime, there because the public use is not built yet.
- `test-system-2026-11-15.md:368`: "The tools have their own tests that use no Story". These are tests of the tools,
  not a second tool.
- `test-system-2026-11-15.md:451-452`: "The tooling lives under `src/host/` … Public routes can map to these folders
  later." This is placement for lint, with export deferred.

### Where each syntax comes from

- **Chained:** lowercase `story.app(setup, { id, fixtures? })`, proposed in `da4776f9` (2026-11-01). It became
  `Story.app` and chained steps in @plan.Testing.O1. `superseded.md:364` records the rename. The checkout and desk
  references use it (`5cc0fe35`, 2026-11-01).
- **Array:** the spike in `test-system-2026-11-15.md` section 4 (`:260`, `Story.app(config, [bankServer], [`). That
  file left it open: "Steps as an array or as a chain. The spike uses an array, which is the simplest thing that
  is data" (`:305`). It was then decided by the agent, not the user: "Steps are an array, and unscripted calls land"
  (`:444`). From there it went into T63's acceptance and Stories R1.
- **Fakes:** the Plan's `Fake.server` holds typed truth, endpoints and controls. Fixtures there are client-half
  Layers (`Testing.plan:119-131`). The spike's `Fake.server(Service, () => handlers)` folds the server and the
  client half into one closure (`test-system-2026-11-15.md:243-255`). `Fake.fetch` is in the references
  (`stripe.fake.ts:230`) and the type stand-in (`references/typecheck/standin/testing.ts:207`), but in no Plan or
  Spec.

## 2. The proposed design

### Each concept once

Each entry gives the name, the module and route, and who uses it. Unless an entry says otherwise, app authors use
it too, and production code never imports it.

- **A scripted run:** `Story.app`, `.machine`, `.fragment`, chained. `src/host/testing/story.ts`, route
  `flow-state/testing`. Flow uses it in every Story test, the bench, the faults and generated Stories.
- **A step as data:** `Story.Step`, same module and route. `propertyTest` and `flow story describe` read it.
- **The runner:** `run()`, with no other name, in `src/host/testing/run.ts`. Not exported on its own. Every use goes
  through it.
- **The world:** `Fake.server`, `Fake.call`, `Fake.control`. `src/host/testing/fake.ts`, route testing. Flow's
  fixtures use it.
- **The run's servers:** `Fake.world`, a Layer, same module and route. Contract tests use it, Flow's and apps'.
- **A transport fake:** `Fake.http`, same module and route. Flow uses it for Pay over its real adapter.
- **A store fake:** `Fake.store`, same module and route. Every persisted Story uses it.
- **The store port:** `Store`, in `src/host/store.ts`, route `flow-state/persistence`. Story pages and the store
  contract use it; app authors use it for custom adapters. Production: `layerIndexedDb`.
- **A port fake:** no Flow name. It is a plain `Layer.effect` in user code, and fixtures use it.
- **The runtime cut:** `inspect(runtime)`, `src/host/inspect.ts`, route `flow-state/inspect`. Flow uses it in
  `checkpoint.inspection` and the run rules. Devtools use it, and production uses it in devtools and bug reports.
- **The model:** `inspect(app)`, same module and route. Flow uses it in construction tests, coverage and T70.
  Production build tools may use it.
- **Evidence:** `attachInspector`, same module and route. Flow records each run's evidence with it, and production
  hosts attach to it.
- **A trace:** `run.trace`, `render(trace, "text")`, `trace.export` and `trace.import`. `src/host/trace.ts`, route
  inspect. Flow uses it in T65 and to ask rulings as two traces. Production exports no trace (Inspection O4).
- **The CLI:** `flow story`, `trace`, `graph`, `check` and `explain`, in `src/host/cli/`, shipped as the `flow` bin.
  Flow's CLI tests run it over the fixtures.
- **Discovery:** `defineConfig`, `src/host/testing/config.ts`, route testing. Flow's own
  `packages/flow-state-v3/flow.config.ts` uses it.
- **A contract test:** no Flow name. It is a function of a Layer in user code. Flow has one for the store, and apps
  write one per port.

Each public tool has no private twin. Three seams reach the one Runtime from inside the package. Each is an
internal symbol, not a second tool, and none is visible to users:

1. `runtimeSetup` keeps its config under an internal key, so a Story boots the same setup over its own page
   platform. Today `runtimeSetup` hard-wires `browserPlatform()` (`runtime.ts:298-304`).
2. `inspect(runtime)` reads the driver through an internal key, as `attachInspector` already does with
   `InspectorId` (`runtime.ts:85`).
3. `testing.attach` stands in for the public use until the Runtime has a snapshots subscription
   (@plan.Runtime.O3: "a live snapshots subscription … waits as a use"). Question 11 covers it.

Planted faults (`tests/faults.ts`, `nub run faults`) edit a copy of the runtime. They are not tooling and have no
API.

### Where the data comes from: real HTTP, then the port, then Flow

The flow is `fetch` → Effect `HttpClient` → `BankHttp` adapter (production Layer of `BankApi`) → `transfer` commit
→ machine. In a Story the commit and machine stay the same, and only the Layer behind `BankApi` changes: `BankFake`
(port level), or `BankHttp` over `Fake.http` (transport level).

#### Before: T63 today (trimmed to one event, otherwise as written)

```ts
// fixtures/transfers/contracts.ts
// existing: Context, Effect, Schema, transaction, Outcome
// user-defined: Declined, Lost, BankApi, transfer
import { Context, Effect, Schema } from "effect";
import { Outcome, transaction } from "../../src/index.ts";

export type Declined = { readonly _tag: "Declined"; readonly code: string };
export type Lost = { readonly _tag: "NoResponse" };

export class BankApi extends Context.Service<
  BankApi,
  {
    readonly transfer: (
      input: { readonly transferId: string; readonly cents: number },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<{ readonly receipt: string }, Declined | Lost>;
  }
>()("flow-state-v3/fixtures/transfers/BankApi") {}

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
```

```ts
// fixtures/transfers/machine.ts
// existing: Schema, actorRef, app, definition, Flow, machine
// user-defined: Transfers, TransfersMachine, bank, account
import { Schema } from "effect";
import { actorRef, app, definition, Flow, machine } from "../../src/index.ts";
import { type Declined, transfer } from "./contracts.ts";

const Transfers = definition({
  id: "Bank/Transfers",
  persist: true,
  states: ["READY"],
  events: { Send: { transferId: Schema.String, cents: Schema.Number } },
  internalEvents: {
    Done: { receipt: Schema.String },
    Declined: { code: Schema.String },
    Unsure: Flow.uncertain({}),
  },
  memory: { notice: Flow.initial(Schema.String, "") },
  operations: ({ E }) => ({
    transfer: transfer.outcomes({
      success: E.Done.from((v: { readonly receipt: string }) => ({ receipt: v.receipt })),
      failure: { Declined: E.Declined.from((e: Declined) => ({ code: e.code })) },
      unknown: E.Unsure,
    }),
  }),
});

export const TransfersMachine = machine(Transfers, ({ S, O }) => ({
  default: S.READY,
  on: {
    Done: { updateMemory: ({ event }) => ({ notice: `sent ${event.receipt}` }) },
    Declined: { updateMemory: ({ event }) => ({ notice: `declined ${event.code}` }) },
    Unsure: { updateMemory: () => ({ notice: "check your statement" }) },
  },
  states: { READY: { on: { Send: { actions: [O.transfer.commit(({ event }) => event)] } } } },
}));

export const bank = app({ id: "bank", machines: { transfers: TransfersMachine } });
export const account = actorRef(TransfersMachine, "acct-1");
```

```ts
// fixtures/transfers/server.ts
// existing (T63): Fake.server   // existing: Exit   // user-defined: bankServer
import { Exit } from "effect";
import { Fake } from "../../src/host/testing/index.ts";
import { BankApi } from "./contracts.ts";

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
```

```ts
// fixtures/transfers/stories.ts
// existing (T63): Story.app, Story.attach, Story.send, Story.checkpoint, Story.advance, Story.reload,
//   bankServer.hold, bankServer.dropResponse, StoryConfig
// user-defined: config, lostThenReload
import { Story, type StoryConfig } from "../../src/host/testing/index.ts";
import { account, bank } from "./machine.ts";
import { bankServer } from "./server.ts";

export const config: StoryConfig = { app: bank, scope: "story", persistence: { captureMs: 0 } };

export const lostThenReload = Story.app(config, [bankServer], [
  Story.attach(account),
  bankServer.hold("transfer"),
  Story.send(account, { _tag: "Send", transferId: "t1", cents: 500 }),
  Story.checkpoint("sending"),
  bankServer.dropResponse("transfer"),
  Story.advance("5 seconds"),
  Story.reload(),
  Story.checkpoint("reloaded"),
]);
```

```ts
// tests/transfers/transfers.test.ts
// existing (T63): run, Story.actorIn, Cut   // existing: Option, expect, it
// user-defined in tests (private helpers): at, callsOf, endings, memoryIn
import { Option } from "effect";
import { expect, it } from "vite-plus/test";
import { account } from "../../fixtures/transfers/machine.ts";
import { lostThenReload } from "../../fixtures/transfers/stories.ts";
import { at, callsOf, endings, memoryIn } from "../stories/read.ts";

it("a lost answer reads unknown after a reload, sent once (Restore R3, I6)", async () => {
  const run = await lostThenReload.run();
  const reloaded = at(run, "reloaded");

  expect(reloaded.now).toBe(5000);
  expect(callsOf(reloaded.received)).toEqual(["transfer responseDropped 0"]);
  expect(endings(run)).toEqual(["transfer unknown Restored"]);
  expect(memoryIn(reloaded, account)).toEqual(Option.some({ notice: "check your statement" }));
});
```

#### After: one design

The definition and machine are unchanged, except that `Declined` is now imported as a class. The new parts are the
port's errors as Schema classes, a production adapter, a setup, the server, the port fake, the Story, the test,
the contract test and the config.

```ts
// fixtures/transfers/contracts.ts
// existing: Context, Effect, Schema, transaction, Outcome
// user-defined: Declined, NoResponse, Receipt, BankApi, transfer
// changed: Declined and NoResponse become Schema.TaggedError classes (were plain types), so the fake's
//   endpoints, the trace and `flow story describe` share one encoded form
import { Context, Effect, Schema } from "effect";
import { Outcome, transaction } from "flow-state";

export class Declined extends Schema.TaggedError<Declined>()("Declined", { code: Schema.String }) {}
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}
export const Receipt = Schema.Struct({ receipt: Schema.String });

export class BankApi extends Context.Service<
  BankApi,
  {
    readonly transfer: (
      input: { readonly transferId: string; readonly cents: number },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<typeof Receipt.Type, Declined | NoResponse>;
  }
>()("bank/BankApi") {}

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
```

```ts
// fixtures/transfers/bank-http.ts: the production Layer of the port. Real apps write this; Flow sends nothing.
// existing (Effect): Effect, Layer, Schema, HttpClient, HttpClientRequest, HttpClientResponse
// user-defined: BankHttp
// (exact Effect signatures to be checked with skill:effect-api-documentation when built)
import { Effect, Layer, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { BankApi, Declined, NoResponse, Receipt } from "./contracts.ts";

export const BankHttp = (origin: string) =>
  Layer.effect(
    BankApi,
    Effect.map(HttpClient.HttpClient, (client) =>
      BankApi.of({
        transfer: (input, { idempotencyKey }) =>
          HttpClientRequest.post(new URL("/transfers", origin)).pipe(
            HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
            HttpClientRequest.bodyJsonUnsafe(input),
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                200: (r) => Effect.flatMap(r.json, Schema.decodeUnknownEffect(Receipt)),
                402: (r) =>
                  Effect.flatMap(Effect.flatMap(r.json, Schema.decodeUnknownEffect(Declined)), Effect.fail),
                orElse: () => Effect.fail(new NoResponse()),
              }),
            ),
            Effect.mapError((e) => (e instanceof Declined ? e : new NoResponse())),
          ),
      }),
    ),
  );
```

```ts
// fixtures/transfers/machine.ts: the definition and machine are unchanged from "Before"; the app gains a setup
// existing: app, actorRef, runtimeSetup, Layer, FetchHttpClient
// user-defined: bank, bankSetup, account
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { actorRef, app, runtimeSetup } from "flow-state";
import { BankHttp } from "./bank-http.ts";

export const bank = app({ id: "bank", machines: { transfers: TransfersMachine } });

export const bankSetup = runtimeSetup({
  app: bank,
  services: BankHttp("https://bank.example").pipe(Layer.provide(FetchHttpClient.layer)),
  scope: "bank",
  persistence: { captureMs: 0 },
});

export const account = actorRef(TransfersMachine, "acct-1");
```

```ts
// fixtures/transfers/server.ts: the bank's truth, its endpoints and its controls; then the port fake
// NEW in code, existing in @plan.Testing.O3: Fake.server(name, { truth, initial, endpoints, controls }),
//   Fake.call, Fake.control
// NEW: Fake.call's `success` and `failure` Schemas; `handle` returns { truth, exit } (one result shape)
// renamed: the T63 handler closure `Fake.server(Service, () => handlers)` → truth + endpoints
// existing: Effect, Exit, Layer, Schema
// user-defined: Bank, BankTruth, BankFake
import { Effect, Exit, Layer, Schema } from "effect";
import { Fake } from "flow-state/testing";
import { BankApi, Declined, NoResponse, Receipt } from "./contracts.ts";

const BankTruth = Schema.Struct({
  receipts: Schema.Record(Schema.String, Schema.String),
  limit: Schema.Number,
});

export const Bank = Fake.server("Bank", {
  truth: BankTruth,
  initial: { receipts: {}, limit: 1000 },
  endpoints: {
    transfer: Fake.call({
      request: { transferId: Schema.String, cents: Schema.Number, key: Schema.String },
      success: Receipt,
      failure: Declined,
      handle: (truth, { cents, key }) => {
        if (cents > truth.limit) return { truth, exit: Exit.fail(new Declined({ code: "limit" })) };
        const receipt = truth.receipts[key] ?? `r${Object.keys(truth.receipts).length + 1}`;

        return {
          truth: { ...truth, receipts: { ...truth.receipts, [key]: receipt } },
          exit: Exit.succeed({ receipt }),
        };
      },
    }),
  },
  controls: {
    limit: Fake.control({ cents: Schema.Number }, (truth, { cents }) => ({ ...truth, limit: cents })),
  },
});

// The port fake is a plain Layer of the app's own port: no Flow API. `bank.transfer` answers
// Effect<Receipt, Declined | Fake.Lost>; this binding maps a lost answer to the port's own error.
// existing: Layer.effect, Effect.map, Effect.catchTag   // NEW: Fake.Lost (in the Plan; tag "FakeLost")
export const BankFake = Layer.effect(
  BankApi,
  Effect.map(Bank, (bank) =>
    BankApi.of({
      transfer: (input, { idempotencyKey }) =>
        bank
          .transfer({ ...input, key: idempotencyKey })
          .pipe(Effect.catchTag("FakeLost", () => Effect.fail(new NoResponse()))),
    }),
  ),
);
```

```ts
// fixtures/transfers/stories.ts
// existing in @plan.Testing.O1 (NEW in code): Story.app(setup, { id, fixtures }), the chain, .ensure, .world
// renamed: Story.attach → .ensure; dropResponse → drop({ at: "response" }) (or hold({ at: "response" })
//   never released); a fake's words move onto its endpoint: bankServer.hold("transfer") → Bank.transfer.hold()
// existing (T63): .send, .checkpoint, .advance, .reload
// user-defined: lostThenReload
import { Story } from "flow-state/testing";
import { account, bankSetup } from "./machine.ts";
import { Bank, BankFake } from "./server.ts";

export const lostThenReload = Story.app(bankSetup, { id: "transfers/lost-then-reload", fixtures: [BankFake] })
  .ensure(account)
  .world(Bank.transfer.hold({ at: "response" }))
  .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
  .checkpoint("sending")
  .advance("5 seconds")
  .reload()
  .checkpoint("reloaded");
```

```ts
// tests/transfers/transfers.test.ts: the same assertions, read through the public cut (no private helpers)
// existing in @plan.Testing.O4 (NEW in code): typed checkpoints, cut.read(ref), cut.read(server),
//   cut.requests(endpoint), cut.inspection, run.endings
// existing: expect, it
import { expect, it } from "vite-plus/test";
import { account } from "../../fixtures/transfers/machine.ts";
import { Bank } from "../../fixtures/transfers/server.ts";
import { lostThenReload } from "../../fixtures/transfers/stories.ts";

it("a lost answer reads unknown after a reload and reached the bank once (Restore R3, I6)", async () => {
  const run = await lostThenReload.run();
  const { reloaded } = run.checkpoints; // a typo here is a type error

  expect(reloaded.now).toBe(5000);
  expect(reloaded.requests(Bank.transfer)).toHaveLength(1);
  expect(Object.keys(reloaded.read(Bank).receipts)).toHaveLength(1); // the handler ran: truth changed once
  expect(reloaded.inspection.lanes).toMatchObject([{ operation: "Bank/transfer", state: "Held" }]);
  expect(run.endings.map((e) => `${e.channel} ${e.reason}`)).toEqual(["unknown Restored"]);
  expect(reloaded.read(account)?.memory).toEqual({ notice: "check your statement" });
});
```

```ts
// fixtures/transfers/bank.contract.ts: one contract, both Layers. App authors write one per port.
// existing (@effect/vitest): layer, it.effect   // existing: Effect, Exit, Layer, FetchHttpClient
// NEW: Fake.world (the run's server registry as a Layer, so a port fake runs outside a Story)
// user-defined: bankContract
import { layer } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { Fake } from "flow-state/testing";
import { expect } from "vite-plus/test";
import { BankHttp } from "./bank-http.ts";
import { BankApi, Declined } from "./contracts.ts";
import { BankFake } from "./server.ts";

const bankContract = (name: string, bank: Layer.Layer<BankApi>) =>
  layer(bank, { excludeTestServices: true })(`BankApi contract: ${name}`, (it) => {
    it.effect("one idempotency key gives one receipt", () =>
      Effect.gen(function* () {
        const api = yield* BankApi;
        const first = yield* api.transfer({ transferId: "c1", cents: 100 }, { idempotencyKey: "k1" });
        const again = yield* api.transfer({ transferId: "c1", cents: 100 }, { idempotencyKey: "k1" });

        expect(again).toEqual(first);
      }),
    );

    it.effect("over the limit is Declined, never NoResponse", () =>
      Effect.gen(function* () {
        const api = yield* BankApi;
        const exit = yield* Effect.exit(
          api.transfer({ transferId: "c2", cents: 1_000_000 }, { idempotencyKey: "k2" }),
        );

        expect(exit).toEqual(Exit.fail(new Declined({ code: "limit" })));
      }),
    );
  });

bankContract("fake", BankFake.pipe(Layer.provide(Fake.world)));

const sandbox = process.env["BANK_SANDBOX_URL"];

if (sandbox !== undefined) bankContract("sandbox", BankHttp(sandbox).pipe(Layer.provide(FetchHttpClient.layer)));
```

```ts
// packages/flow-state-v3/flow.config.ts: Flow's own project file, the same file an app keeps
// existing in @plan.Testing.O1 (NEW in code): defineConfig
import { defineConfig } from "flow-state/testing";
import { bank } from "./fixtures/transfers/machine.ts";
import * as transfers from "./fixtures/transfers/stories.ts";

export default defineConfig({ apps: [{ app: bank, stories: transfers }] });
```

```ts
// tests/cli/trace.test.ts: the CLI is tested over Flow's own fixtures, through the bin's entry
// existing in @plan.Inspection.O4 and @plan.CommandLine.O2 (NEW in code): render(trace, "text"), run.trace
// NEW: main(argv), the function the `flow` bin calls (one subprocess smoke test checks the bin itself)
import { expect, it } from "vite-plus/test";
import { lostThenReload } from "../../fixtures/transfers/stories.ts";
import { main } from "../../src/host/cli/main.ts";
import { render } from "../../src/host/inspect.ts";

it("flow trace prints the run's own trace (CommandLine O2)", async () => {
  const run = await lostThenReload.run();
  const out = await main(["trace", "transfers/lost-then-reload"]);

  expect(out.stdout).toBe(render(run.trace, "text"));
});
```

The transport-level variant runs the real adapter, so the adapter's status reading is tested too:

```ts
// NEW: Fake.http(server, routes): a Layer of Effect's HttpClient over the run's server (renamed from the
//   references' Fake.fetch, which replaced FetchHttpClient.Fetch); `status` maps a failure tag to a status,
//   and the body is encoded by the endpoint's own Schemas; Fake.Lost becomes a transport error
// user-defined: BankOverHttp
export const BankOverHttp = BankHttp("http://bank.test").pipe(
  Layer.provide(
    Fake.http(Bank, {
      "POST /transfers": {
        endpoint: "transfer",
        request: ({ body, headers }) => ({ ...body, key: headers["idempotency-key"] ?? "" }),
        status: { Declined: 402 },
      },
    }),
  ),
);
```

### How each public tool is the one Flow's tests use

Each tool below is used by Flow's own tests directly, with no private copy:

- **`Story`, `run()`:** every Story test (`tests/<area>/`), the reload sweep (T64), the bench's long Stories (T66)
  and generated Stories (T70).
- **`Story.Step`:** T70 draws and prints steps in this form, and `flow story describe` prints it.
- **`Fake.server` and its wire words:** every fixture's `server.ts`, and the run rules over what a fake received
  (T64).
- **`Fake.store`:** every persisted Story, and the store contract test against real IndexedDB (T58, T28).
- **`inspect(runtime)`:** every checkpoint's `inspection`, and the run rules over lanes, owed rows, timers and uses
  (T64).
- **`inspect(app)`:** construction tests and `story list --coverage`. T70 reads its samples from compiled machines
  through it.
- **`run.trace`, `render`:** T65's trace test, and every ruling asked as two traces.
- **`flow story`, `flow trace`:** T69's tests run `main` over `flow.config.ts`, which lists Flow's own fixtures.
- **`defineConfig`:** the package's own `flow.config.ts`.

T63 has two private twins today, and this proposal drops both:

- `src/host/testing/page.ts` hand-builds a second Clock and Scheduler for `lanes.test.ts` and `ledger.test.ts`
  (`page.ts:29`, `:47`). Stories' realization already says TestClock "replaces both hand clocks".
- `tests/stories/read.ts` reads cuts through test-only helpers. These become the public cut reads of
  @plan.Testing.O4.

### The runner: one, not a service with implementations

The question was whether `run()` should sit behind an Effect service with several implementations: a test runner
over TestClock and fakes, and some other runner. Here are the candidates for "some other runner", and what each
costs.

- **A. Two Stories, internal and public.** Runs the same scripts twice. Cost: two step vocabularies, an internal
  copy that hides the public one's bugs, and a break with "one way to run it" (epic.task:56). Verdict: no.
- **B. One Story, one fixed runner.** TestClock, Effect's scheduler, a page per reload. Cost: nothing beyond today.
  Verdict: **recommended**.
- **C1. A runner service with a live implementation.** A Story on the real clock in a real browser. Cost: it loses
  O2's guarantees (the same trace, settling, no host yield), and `advance` and `hold` would mean something else. One
  name would carry two semantics. Verdict: no.
- **C2. A runner service with a bench implementation.** The same run, timed. The bench already wraps `run()`. A
  second implementation would time a different path, against the constraint that a benched run does the same work.
  Verdict: no.
- **C3. A runner service with a player implementation.** `StoryPlayer` never executes (Testing O9). Verdict: not a
  runner.
- **C4. A runner service with a CLI implementation.** `flow story run` must print what `run()` returns (CommandLine
  O2). Verdict: not a runner.

What varies between real and test is the Layers: the app's ports, the `Store`, `HttpClient`. That already has
Effect's standard seam. Inside the runner, a page's platform (Host, TestClock, Scheduler) is built from Layers
(`run.ts:71-82` already does this with `TestClock.layer`). That stays internal.

### The settle

T63 drains Effect's scheduler. @plan.Testing.O2 drains microtasks with K quiet hops. Both run inside one host task
("never yields to the host"). The microtask drain also sees a resolved Promise. That is the only way a real
adapter over `Fake.http`, or an SDK with its own Promise (Stripe.js `handleNextAction`, `adapters/stripe.ts:29`),
can run in a Story. The proposal keeps T63's drain for T63 and moves to the Plan's drain when the first
Promise-based adapter lands. That is an internal change to `run.ts`, not an API change (question 7).

## 3. What is added and what is dropped

### Compared with T63's code

Added:

- **The chain over the existing step array, `Story.app(setup, { id, fixtures })`.** @plan.Testing.O1 asks for it,
  checkpoint keys get types, and the Story takes the setup rather than a copy of its config.
- **`Fake.server(name, { truth, initial, endpoints, controls })`, `Fake.call`, `Fake.control`.** Truth is a Schema,
  so `cut.read(server)`, `story describe`, trace export and T70's generated controls can read it. Several ports can
  share one truth, as checkout's ShopHttp and Stripe.js do.
- **`Fake.world`.** The run's server registry, which contract tests can also use.
- **`Fake.Lost`, mapped by the port binding.** A lost answer reaches the port's own error, so
  `catchTag("NoResponse")` runs. Today `dropResponse` only hangs (`fake.ts:229-233`).
- **Wire words on the endpoint: `hold({ at })`, `release`, `drop({ at, times })`, `duplicate`.** These are the
  Plan's four words. `at: "request"` or `at: "response"` replaces the two drop words.
- **`inspect(runtime)`, taking the public Runtime, with lane `state` Idle, InFlight or Held.** This is
  @plan.Inspection.O1, and T63's cut is its first slice.
- **Public cut reads: `read`, `requests`, `inspection`, `run.endings`.** They replace `tests/stories/read.ts`.

Dropped or renamed:

- `Story.app(config, fakes, steps)`: replaced by the chain. The array stays as `Story.Step` data.
- `StoryConfig`: the Story takes the setup.
- `Fake.server(Service, () => handlers)` closures: truth hidden in a closure allows no describe, no `read` and no
  shared truth.
- `dropRequest`, `dropResponse`: become `drop({ at: "request" })` and `drop({ at: "response" })`.
- `answer(method, exit)`: controls do the same job and keep truth consistent (question 6).
- `Story.actorIn`: becomes `cut.read(ref)`.
- `cutOf(driver)`: becomes `inspect(runtime)`.
- The hand clock and scheduler in `page.ts`: replaced by the Story's page (TestClock).
- `StoryFailed` carrying only `problem`: becomes the Plan's FlowError with evidence (T29, O8).

### Compared with the test-system proposal

Added:

- The Plan's chain and truth-based fakes come back, and the first slice uses them.
- Fakes at two levels, port and transport, both Layers of a port that already exists.
- One contract test per port, run against the fake and the real Layer. Section 2 named one only for the store.
- `inspect(runtime)` named as the cut. Section 12 decision 4 put it in `src/inspect` as an internal cut.

Removed or changed:

- Section 12 decision 6, "Steps are an array".
- Section 4's "a Fake is a second Layer for a service the fixture already declares" stays true, but a fake is no
  longer the server.
- Decision 3's `answer` word (question 6).
- The "internal" reading of decision 9, "Public routes can map to these folders later".

## 4. Fakes and real Layers

### The rule

A fake is a Layer of a port that production also implements. There are three ports a fake can stand behind, and
each has one real Layer and one fake.

- **The app's service** (`BankApi`, `ShopApi`, `StripeClient`), defined by the app. Real: `BankHttp`, or an SDK
  wrapper. Fake: `Layer.effect(Port, Effect.map(Server, …))`. It does not run the adapter.
- **Effect's `HttpClient`**, defined by Effect. Real: `FetchHttpClient.layer`. Fake: `Fake.http(server, routes)`. It
  runs the adapter.
- **Flow's `Store`**, defined by Flow. Real: `layerIndexedDb()` (flow-state/persistence). Fake: `Fake.store`. It runs
  Flow's persistence edge.

Effect pairs real and test Layers in the same way:

- `KeyValueStore` has `layerMemory` (`node_modules/effect/src/persistence/KeyValueStore.ts:344`), `layerFileSystem`
  (`:382`), `layerSql` (`:525`) and `layerStorage` over Web Storage (`:858`), all for one service.
- `Persistence.layerMemory` and `layerRedis` swap only the backing (`persistence/Persistence.ts:1157`, `:1165`).
- `HttpClient.make` builds a client from one function returning an Effect (`http/HttpClient.ts:858`).

### Where truth and controls live

TestClock is the pattern. Production code sees only `Clock`. The controls (`adjust`, `setTime`) are on `TestClock`,
a separate key that extends `Clock`, reached by module accessors (`testing/TestClock.ts:99`, `:629`). Flow's fakes
work the same way:

- **Truth** is in the `Fake.server`. It is a Schema'd value the run owns, created on first use in the run's
  registry (`Fake.world`), and shared by every tab, reload and port bound to it. The handlers are pure functions of
  truth and request. That keeps the checkout references' rule "the one implementation the Story fakes call … and
  the property test's oracle" (`references/checkout/adapters/server.ts:1-2`).
- **Controls** (`Bank.limit`, `Stripe.decline`, `busy`, `challenge`) are Story steps on the server. They are data,
  so the trace prints them, `story describe` lists them with their Schemas, and T70 generates them.
- **Wire words** (`hold`, `release`, `drop`, `duplicate`) are Story steps on an endpoint. They decide delivery,
  never the result (Testing.plan:126-127).
- **The port** carries none of these. The port fake binding only maps `Fake.Lost`, `Fake.Refused` and
  `Fake.Closed` to the port's own errors (Testing.plan:131).

### One contract test runs against both

A contract test is a plain function from `Layer<Port>` to a `describe` block. It runs with `@effect/vitest`
(`layer` at `node_modules/@effect/vitest/src/index.ts:288`). There is no Flow API for it. Prior art: TanStack DB
exports suite creators run against each collection adapter
(`codebases/db/packages/db-collection-e2e/src/index.ts:20-30`).

- **It checks only what both worlds can be put into.** A contract arranges state through inputs both accept: test
  card numbers, sandbox accounts, a fresh key. It never uses a fake's controls, which the real thing does not have.
- **The fake runs on every test run.** The real Layer runs against a sandbox when its URL or keys are set, and in
  P8's real-browser run for the store. T58 already asks for exactly this for the store: "A contract test of the
  store passes against the fake store and against real IndexedDB" (`wiki/tasks/V3/P3.task:179`).
- **Errors are Schema classes on the port.** The contract compares typed values. The fake's endpoints declare the
  same Schemas, so a fake cannot answer outside the port's vocabulary.

### Port fake or transport fake

- **Port fake:** the default. Use it for Flow's own fixtures and for any Story about Flow's behaviour. It misses the
  adapter: status mapping (the shop's three 409s, `adapters/shop-api.ts`), abort wiring, and an SDK's own retries.
- **`Fake.http`:** use it when the adapter is what is under test (checkout Pay), with one contract test per adapter.
  It needs the microtask settle if the adapter reads bodies through a Promise.

Stated limit: an SDK that owns its own I/O and retries (Stripe.js) is one port call per call. A Story cannot see its
retries. Its contract test against the sandbox is the only check.

### The store

`Store` today is a field of `Host` (`src/host/host.ts:28-35`, `Host.store: Option<Store>`). `StoreRefused` carries
nothing (`host.ts:17`). The proposal:

- make `Store` its own port, with a Schema'd error vocabulary (refused, quota, aborted), owned by T58;
- `layerIndexedDb` and `Fake.store` are its two Layers. T28's "in-memory adapter" is `Fake.store`'s implementation
  minus the wire words, not a third store;
- the store contract (load sees what landed; a batch lands whole or not at all; a refused batch changes nothing; an
  aborted batch lands nothing) runs against both. Flow ships it, so a React Native or SQLite store can check itself
  (question 8).

### Five different cases

1. **Checkout payment, lost response.**
   - Port: `ShopApi`, plus `StripeClient`.
   - Real: `ShopHttp` over `HttpClient`, and Stripe.js.
   - Fake: `Fake.http(Stripe, routes)` and a Stripe.js port fake, both on one `Stripe` server.
   - Truth: carts, intents and charges. Controls: `busy`, `decline`, `challenge`.
   - Checks: `hold({ at: "response" })` then a reload leaves one charge in truth and the payment unknown. Contract:
     one key gives one intent, and 402 and 409 bodies differ.
2. **Sync engine, a socket feed.**
   - Port: a feed that subscribes from a bookmark, delivers values, and closes.
   - Real: a WebSocket adapter.
   - Fake: `Fake.stream` on a server (the streams Task).
   - Truth: the log. Controls: push, disconnect.
   - Checks: a reconnect from a bookmark delivers missed values once. Contract: the same resume rule on the
     sandbox.
3. **Sign-in.**
   - Port: `AuthApi` with signIn, refresh and signOut.
   - Real: an OAuth SDK wrapper.
   - Fake: a port fake.
   - Truth: sessions. Controls: `expire`, `revoke`.
   - Checks: two tabs refresh and one wins. Contract: a revoked refresh is `Unauthorized`, never `NoResponse`.
4. **Entity domain with optimistic writes.**
   - Port: `TodoApi`, a write with a version and a list.
   - Real: an HTTP adapter.
   - Fake: a port fake.
   - Truth: rows with versions. Controls: `changeElsewhere`, `rejectNext`.
   - Checks: a prediction, then a repair or rollback (`cut.entity`). Contract: a stale version is `Conflict`.
5. **A SQL database or a third-party SDK as the backend.**
   - Port: `Repo` over Effect's `SqlClient`, or an SDK service.
   - Real: the `SqlClient` Layer, or the SDK wrapper.
   - Fake: a port fake, or the real `Repo` over an in-memory SQLite.
   - Truth: in the fake, or the database itself.
   - Checks: transactions and rollback come only from the real database. The contract runs `Repo` on in-memory
     SQLite and on the fake. There is no transport, so only port-level wire words apply.

## 5. What T63 changes now and what later Tasks own

T63 changes now only what fixtures, Stories and tests will copy. Each later Task builds on that without redoing it.

Now, in T63 (about a day, on the user's go), each with the later Task that builds on it:

1. The chain over the step array, `Story.app(setup, { id, fixtures })`, `.ensure` for attach, and typed checkpoint
   keys. Later: T29 adds `Story.machine`, `.fragment`, tabs, `together`, hydration, frames and the player.
2. `runtimeSetup` keeps its config under an internal key, and the Story boots it over its page platform. Later: T29
   settles the rule for fixtures versus setup (Testing.plan Q2).
3. `Fake.server` with truth, endpoints and controls; `Fake.world`; `Fake.Lost` through the port binding; port fakes
   as `Layer.effect`. Later: the streams Task adds `Fake.stream`, and T29 adds `Fake.Refused` and `Fake.Closed`.
4. Wire words on endpoints: `hold({ at })`, `release`, `drop({ at })`. Later: T29 adds `duplicate`, `times` and
   `UnusedWireRule`.
5. `cutOf(driver)` becomes `inspect(runtime)` in `src/host/inspect.ts`, with lane `state` as in Inspection O1.
   Later: T49 builds the rest of `inspect(runtime)`, `inspect(app)` and the route.
6. Public cut reads replace `tests/stories/read.ts`. Later: T67 ports the bridge cases onto them.
7. The transfers and Pay fixtures, rewritten to the above (about 40 lines each). Later: T67 adds the `cells`,
   `sync` and `sign-in` fixtures.
8. Stories R11 reworded to "not exported in P2; T29 exports `flow-state/testing`". Later: T29 exports the route.
9. Fix `transfers.test.ts:59`, a tautology (`110 - n >= 0`).

Later only, with nothing in T63:

- T64: run rules read `inspection` and `requests`.
- T65: `run.trace` and `render(trace, "text")` in `src/host/trace.ts`.
- T66: the bench calls `run()`.
- T69: `main(argv)`, `flow.config.ts` and `defineConfig` (first slice).
- T70: `propertyTest` over `Story.Step` and the servers' controls.
- T58: `Store` as a port, with the store contract. T28: `layerIndexedDb`.
- T67: `page.ts` goes when `lanes.test.ts` and `ledger.test.ts` move onto Stories.
- T29, or the Pay `Fake.http` fixture: the microtask settle, when the first Promise-based adapter lands.
- T29: cleanup at the end of a run (Testing O8). Today `run.ts:222` disposes nothing.

## 6. Questions for the user

Each question has options, a small before and after, and a recommendation. Nothing is decided.

**Q1. One Story or two?**

- A: one public Story. Stories R11 says "not exported in P2", not "internal".
- B: an internal Story for Flow's tests and a public one at T29.

```ts
// Before (Stories R11): "The tooling is internal … reached only by its path inside the package"
// After (A):            "Not exported in P2; @task.V3.T29 exports flow-state/testing. Flow's tests use the same
//                        Story by path until then."
```

Recommendation: A. B builds the tool twice, and the internal copy shields the public one from Flow's own tests.

**Q2. Should the runner be an Effect service with several implementations?**

- A: one fixed runner.
- B: a `StoryRunner` service with test and live implementations.

```ts
// Before: none exists.   After (B): Story.app(setup, opts).run().pipe(Effect.provide(StoryRunner.live))
// After (A): lostThenReload.run()   // the only runner; worlds vary through Layers
```

Recommendation: A. Section 2's table shows no second runner that keeps O2's guarantees.

**Q3. Steps: chain or array?**

- A: the Plan's chain, with the array as its data form.
- B: T63's array.

```ts
// Before (B): Story.app(config, [bankServer], [Story.attach(account), Story.checkpoint("x")])
// After (A):  Story.app(bankSetup, { id: "t/x", fixtures: [BankFake] }).ensure(account).checkpoint("x")
//             story.steps  // existing: the same Step array, for propertyTest and describe
```

Recommendation: A. It reads at a glance, checkpoint keys are typed, and it is what @plan.Testing.O1 and the
references already use.

**Q4. What does a Story run: the setup, or a copy of its config? And do fixtures replace or shadow?**

- A: the setup. Fixtures must cover every service the app's contracts list, which is a type error otherwise. A
  fixture reuses a production Layer by importing it, as `BankOverHttp` does.
- B: a config (T63).
- C: the setup, with fixtures shadowing its services (Testing.plan:139-140).

```ts
// Before (B): Story.app({ app: bank, scope: "story", persistence: { captureMs: 0 } }, [bankServer], [])
// After (A):  Story.app(bankSetup, { id: "t/usual", fixtures: [BankFake] })
```

Recommendation: A. C would still build `layerIndexedDb` or a real client under a fake, and Effect cannot drop part
of a built Layer. A is an upfront contract.

**Q5. Fake shape**

- A: the Plan's `Fake.server(name, { truth, initial, endpoints, controls })`, with port fakes as plain `Layer.effect`.
- B: T63's `Fake.server(Service, () => handlers)`.
- C: both, with B as sugar over A.

```ts
// Before (B): Fake.server(BankApi, () => { const receipts = new Map(); return { transfer: (i, o) => … } })
// After (A):  Fake.server("Bank", { truth: BankTruth, initial, endpoints: { transfer: Fake.call({ … }) } })
//             Layer.effect(BankApi, Effect.map(Bank, (bank) => BankApi.of({ transfer: … })))
```

(Elided here only. Section 2 has both in full.)

Recommendation: A. Truth hidden in a closure breaks `cut.read`, `story describe`, trace export and generated
controls, and cannot be shared by two ports. C is two ways to say one thing.

**Q6. Keep `answer(method, exit)`?**

- A: drop it; controls change truth and the handler answers.
- B: keep it as a public wire word.

```ts
// Before: bankServer.answer("transfer", Exit.fail({ _tag: "Declined", code: "manual" }))
// After (A): .world(Bank.limit({ cents: 0 }))   // the next transfer is Declined by the server's own rule
```

Recommendation: A. An answer that disagrees with truth reaches states the real server cannot. Controls show up in
the trace and in T70. Flow's own tests that need "Busy once" get a `busy({ times })` control, as checkout has.

**Q7. Transport fakes: at Effect's `HttpClient` or at `FetchHttpClient.Fetch`? And when does the settle change?**

- A: `Fake.http`, a Layer of `HttpClient`. Adapters use `HttpClient`. The microtask settle comes with the first
  Promise-based adapter.
- B: the references' `Fake.fetch`, which replaces the global `fetch`. It needs the microtask settle now.

```ts
// Before (references): ShopHttp(ORIGIN).pipe(Layer.provide(Fake.fetch(Stripe, routes)))  // a fetch Promise
// After (A):           ShopHttp(ORIGIN).pipe(Layer.provide(Fake.http(Stripe, routes)))   // an HttpClient Layer
```

Recommendation: A. It follows Effect's own seam (`HttpClient.make`), stays on the run's scheduler for request and
status, and leaves body reading as the one Promise to handle.

**Q8. Make `Store` its own port, and ship its contract test?**

- A: `Store` becomes a Context service with `layerIndexedDb` and `Fake.store`, and Flow exports `storeContract` from
  `flow-state/testing`.
- B: as A, without exporting the contract.
- C: keep `Host.store`.

```ts
// Before: Host.of({ store: Option.some(store), … })
// After (A): runtimeSetup({ app, services: Layer.mergeAll(BankHttp(url), layerIndexedDb()) })
//            storeContract("sqlite", mySqliteStore)   // NEW public name
```

Recommendation: A, built in T58 and T28. A custom store is the likeliest adapter users write.

**Q9. A Flow API for contract tests?**

- A: none. A contract is a plain function of a Layer, documented as a pattern.
- B: `Fake.contract(port, cases)`.

```ts
// After (A): const bankContract = (name: string, bank: Layer.Layer<BankApi>) => layer(bank)(name, (it) => {})
// After (B): Fake.contract(BankApi, { "one key, one receipt": (api) => Effect.void })
```

Recommendation: A. `@effect/vitest` already does it, and the constraint is "build nothing parallel to Effect".

**Q10. How much does T63 change now?**

- A: the left column of section 5 (about a day).
- B: finish T63 as built, and reshape everything at T29.
- C: all of @plan.Testing now.

```ts
// A: fixtures/transfers/{server,stories}.ts and the tests move to section 2's "After" before T64 starts
// B: T64 to T70 write about 40 more fixtures and tests in the array-and-closure shape, rewritten at T29
```

Recommendation: A. It is the part everything later copies.

**Q11. How does `Story.ensure` attach a use?**

- A: through the internal `testing.attach` until the Runtime has the public use (a snapshots subscription, the
  actor identity slice), then through that.
- B: add a public `runtime.attach(ref)` now.

```ts
// Now (A):   testing.attach(page.built, actor, "story", false)   // internal seam, one place, listed
// Later (A): actor.snapshots subscription held by the Story      // the same use React's hooks hold
```

Recommendation: A. B adds a public word that @plan.Runtime.O3 does not have.

## Appendix: sidecar log

Four Haiku sidecars ran read-only: intent across records (medium), Effect's real and test Layers (medium), prior art
for faithful fakes (medium), and an adversary for two Stories and for fakes outside the port (high). I verified
each finding I used against the file named.

Intent across records:

- Accepted: the Plans, the Epic and the user say one public Story (log.task:3-4, epic.task:56-57,
  Package.plan:33). I re-read each line.
- Changed: "Stories R11 'internal' conflicts with Package.plan:33". The conflict is real, but R11 restates the P2
  stop on export timing (P2.task:57). It is not a second tool.
- Changed: "the user has not settled array versus chain". The chain is in @plan.Testing.O1. The array was an agent
  decision (test-system:444), so the Plan is the standing record.
- Accepted: the chained syntax comes from `da4776f9`, and checkout was converted in `5cc0fe35`, both on 2026-11-01.
  `git log` confirms the dates.
- Accepted: `Fake.fetch` is in no Plan or Spec. A grep finds it only in the references and the type stand-in.

Effect's real and test Layers:

- Changed: `KeyValueStore.layerMemory` was found, but "the real counterpart not located". I found `layerFileSystem`
  (`:382`), `layerSql` (`:525`) and `layerStorage` (`:858`).
- Accepted: `Layer.mock` at `Layer.ts:4119`; the TestClock interface at `:99`, `layer` at `:553`, `adjust` at
  `:629`; `HttpClient.make` at `:858`; `FetchHttpClient.Fetch` at `:32`. I read each line in the installed 4.0.5.
- Accepted: test controls live on a separate key (TestClock extends Clock). It is the model for truth and controls
  in section 4.
- Accepted: `@effect/vitest` `layer` at `:288`, with `excludeTestServices`. The contract test uses it.

Prior art for faithful fakes:

- Accepted: `codebases/` has no XState test model, MSW or Pact code. The listing confirms it, and prior art is
  cited only where present.
- Accepted: TanStack DB's local-only collection shares the synced shape, and its e2e suite creators are reused
  across adapters (`local-only.ts:152`, `db-collection-e2e/src/index.ts:20-30`).
- Accepted: the checkout fakes are one server with port Layers over it, `Fake.fetch` under the real adapter, and
  truth as a Schema. I read `stripe.fake.ts` and `adapters/`.
- Accepted: `testing/shop.fake.ts` is named but missing. The listing shows only `stripe.fake.ts`; nothing here
  relies on it.

Adversary, for two Stories and for fakes outside the port:

- Accepted: the Story needs platform injection (`runtime.ts:298-304`). This is section 2, seam 1.
- Changed: "`answer` contradicts Testing.plan's 'cannot inject operation outcomes'". The Exit still passes through
  the commit, so it is not outcome injection. It is dropped instead so that answers stay consistent with truth
  (Q6).
- Accepted: `testing.send` bypasses admission (`testing.ts:28`, `runtime.ts:241`). A Story's send should use the
  public handle's `send`; it is listed under seams.
- Accepted: `page.ts` duplicates the clock and scheduler (`page.ts:29`, `:47`). Its removal goes to T67.
- Accepted: `testing.ts` exports nine functions against Package.plan's one. I counted them; the number shrinks as
  seams become public.
- Accepted: Pay's commit calls a weighted server model's `classify` (`fixtures/pay/contracts.ts:168-170`). This is
  fixture debt, and T63's Pay rewrite drops `ServerModel` from the commit.
- Accepted: a dropped response only hangs, so `catchTag("NoResponse")` is never reached (`fake.ts:229-233`).
  `Fake.Lost` through the binding fixes it.
- Accepted: a port fake misses status mapping, abort wiring and SDK retries. This motivates `Fake.http` and the
  stated SDK limit.
- Accepted: `StoreRefused` cannot carry quota or abort (`host.ts:17`). See Q8.
- Accepted: `run.ts:222` disposes nothing, and still-held calls pass silently. This goes to T29 (Testing O8).
- Accepted: `transfers.test.ts:59` is a tautology. I read it; it is listed for T63.
- Rejected: "`FLOW-STATE.md:37` names a missing `src/host/trace.ts`". T65 creates that file; the rule was set up
  ahead, as the Epic asks.
