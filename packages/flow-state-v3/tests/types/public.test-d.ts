import { Effect, Option, Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import type { ActorKey, OperationOf, RuntimeCut, Use } from "../../src/host/inspect.ts";
import type {
  CallStatus,
  Cell,
  ControlWord,
  Cut,
  EventOf,
  Generated,
  Property,
  RunFault,
  Samples,
  StoryRun,
} from "../../src/host/testing/index.ts";
import {
  evidenceOf,
  Fake,
  forkReloads,
  generate,
  pairSweep,
  propertyTest,
  publishedOf,
  samplesOf,
  Step,
  Story,
  turnsOf,
} from "../../src/host/testing/index.ts";
import type { TraceRecord } from "../../src/host/trace.ts";
import {
  actorRef,
  app,
  definition,
  Flow,
  machine,
  runtimeSetup,
  transaction,
  type Snapshot,
  type Unsettled,
} from "../../src/index.ts";

// Every public word hands out the app's own names where the app holds them. Each `@ts-expect-error`
// names the rule its line breaks; beside it the correct use of the same parameter is asserted
// exactly, so a wrong line cannot fail because the type became `never`.

const charge = transaction({
  id: "types/public/charge",
  input: { orderId: Schema.String },
  key: ["orderId"],
  concurrency: "reject",
  services: [],
  commit: () => Effect.succeed(1),
});

const Pay = definition({
  id: "types/public/Pay",
  states: ["IDLE", { ON: ["A", "B"] }],
  events: { go: {} },
  internalEvents: { Charged: {}, Unsure: Flow.uncertain({}) },
  operations: ({ E }) => ({
    charge: charge.outcomes({ success: E.Charged, failure: {}, unknown: E.Unsure }),
  }),
});

const Ship = definition({
  id: "types/public/Ship",
  states: ["READY"],
  events: { send: {} },
  internalEvents: { Shipped: {}, Lost: Flow.uncertain({}) },
  operations: ({ E }) => ({
    ship: charge.outcomes({ success: E.Shipped, failure: {}, unknown: E.Lost }),
  }),
});

const PayMachine = machine(Pay, ({ S }) => ({ default: S.IDLE, on: { go: S.ON.A } }));
const ShipMachine = machine(Ship, ({ S }) => ({ default: S.READY }));

type Ds = typeof Pay | typeof Ship;

const setup = runtimeSetup({
  app: app({ id: "types/public/shop", machines: { pay: PayMachine, ship: ShipMachine } }),
});

const story = Story.app(setup, { id: "types/public/shop", fixtures: [] });
const pay = actorRef(PayMachine, "p1");

declare const run: StoryRun<never, Ds>;
declare const cut: Cut<Ds>;
declare const request: Extract<TraceRecord, { readonly _tag: "Request" }>;
declare const paySnapshot: Snapshot<typeof Pay>;
declare const shipSnapshot: Snapshot<typeof Ship>;

// A write lane's row, as a snapshot's operations hold it.
type Row =
  Snapshot<typeof Pay>["operations"] extends ReadonlyMap<string, ReadonlyMap<string, infer R>>
    ? R
    : never;

describe("Stories R16: a selector's rows name the actor's machine and the turn's alternatives", () => {
  it("a turn's actor names its definition", () => {
    const [turn] = turnsOf(run, Pay.E.go);

    expectTypeOf(turn?.actor.machine).toEqualTypeOf<"types/public/Pay" | undefined>();
    // @ts-expect-error Stories R16: the turn's actor is a Pay actor, never Ship
    void (turn?.actor.machine === "types/public/Ship");
  });

  it("a turn's parts name the definition's state paths", () => {
    const [turn] = turnsOf(run, Pay.E.go);
    const part = turn?.parts[0];

    expectTypeOf(part?.node).toEqualTypeOf<"IDLE" | "ON" | "ON.A" | "ON.B" | "root" | undefined>();
    expectTypeOf(part?.target).toEqualTypeOf<
      "IDLE" | "ON" | "ON.A" | "ON.B" | "self" | undefined
    >();
    // @ts-expect-error Stories R16: OFF is no state of Pay
    void (part?.target === "OFF");
  });
});

describe("Inspection: a cut names the app's states and operations", () => {
  it("an actor's snapshot state is one of the app's states", () => {
    expectTypeOf(cut.inspection.actors[0]?.snapshot.state).toEqualTypeOf<
      "IDLE" | "ON.A" | "ON.B" | "READY" | undefined
    >();
    // @ts-expect-error Inspection: PAID is no state of the app
    void (cut.inspection.actors[0]?.snapshot.state === "PAID");
  });

  it("a lane's and an owed row's operation is one of the app's operations", () => {
    expectTypeOf(cut.inspection.lanes[0]?.operation).toEqualTypeOf<"charge" | "ship" | undefined>();
    expectTypeOf(cut.inspection.owed[0]?.operation).toEqualTypeOf<"charge" | "ship" | undefined>();
    expectTypeOf<OperationOf<Ds>>().toEqualTypeOf<"charge" | "ship">();
    // @ts-expect-error Inspection: chrage is no operation of the app
    void (cut.inspection.lanes[0]?.operation === "chrage");
    // @ts-expect-error Inspection: refund is no operation of the app
    void (cut.inspection.owed[0]?.operation === "refund");
  });

  it("a use names its actor by key and its use by the closed set", () => {
    expectTypeOf(cut.inspection.uses[0]?.actor).toEqualTypeOf<ActorKey | undefined>();
    expectTypeOf(cut.inspection.uses[0]?.uses).toEqualTypeOf<ReadonlyArray<Use> | undefined>();
    expectTypeOf<Use>().toEqualTypeOf<"story" | "host" | "component" | "context">();
    expectTypeOf(cut.inspection.uses[0]?.uses[0]).toEqualTypeOf<Use | undefined>();
    // @ts-expect-error Inspection: hook is no use
    void (cut.inspection.uses[0]?.uses[0] === "hook");
  });

  it("an erased cut stays text", () => {
    expectTypeOf<RuntimeCut["lanes"][number]["operation"]>().toEqualTypeOf<string>();
  });
});

describe("Runtime O1, Inspection: unsettled writes name the identity's machine and operations", () => {
  it("a cut's unsettled identity is one of the app's definitions, its lanes that definition's", () => {
    const [first] = cut.unsettled;

    expectTypeOf(first?.lanes[0]?.operation).toEqualTypeOf<"charge" | "ship" | undefined>();
    expectTypeOf(first?.actor.machine).toEqualTypeOf<
      "types/public/Pay" | "types/public/Ship" | undefined
    >();
    // @ts-expect-error Inspection: Paymnt is no machine of the app
    void (first?.actor.machine === "Paymnt");
  });

  it("a Runtime's unsettledWrites names its app's operations", () => {
    const runtime = setup.construct();

    expectTypeOf(runtime.unsettledWrites()).toEqualTypeOf<ReadonlyArray<Unsettled<Ds>>>();
    // @ts-expect-error Runtime O1: chrage is no operation of the app
    void runtime.unsettledWrites().filter((u) => u.lanes.some((l) => l.operation === "chrage"));
  });
});

describe("Stories T2: a trace's request row is the call log's shape", () => {
  it("a request names its server and endpoint and keeps the call's input and status", () => {
    expectTypeOf(request.status).toEqualTypeOf<CallStatus>();
    expectTypeOf<keyof typeof request>().toEqualTypeOf<
      "_tag" | "server" | "endpoint" | "input" | "status"
    >();
    // @ts-expect-error Stories T2: a request's status is the call's closed status
    void (request.status === "answerd");
  });
});

describe("Stories T2: a hand-written step names no machine and no envelope", () => {
  it("the actor steps are the Story's own words", () => {
    expectTypeOf<keyof typeof Step>().toEqualTypeOf<
      "disposeRuntime" | "world" | "advance" | "reload" | "checkpoint" | "$is" | "$match"
    >();
    expectTypeOf(story.send(pay, Pay.E.go())).toEqualTypeOf(story);
    // @ts-expect-error Stories T2: an actor step is written with the Story's send, which takes only its app's refs
    void Step["send"];
  });
});

describe("Stories T2: forks and generated runs keep the Story's app", () => {
  it("forkReloads' runs read only the app's refs", () => {
    const stray = actorRef(
      machine(definition({ id: "types/public/Stray", states: ["S"], events: {} }), ({ S }) => ({
        default: S.S,
      })),
      "s",
    );

    const forked = forkReloads(story, (_at, fork) =>
      Effect.map(fork(Step.reload({ reattach: true, heldWrites: "abort" }), []), (forkRun) => {
        expectTypeOf(forkRun).toEqualTypeOf<StoryRun<never, Ds>>();
        expectTypeOf(forkRun.end.read(pay)?.state).toEqualTypeOf<
          "IDLE" | "ON.A" | "ON.B" | undefined
        >();
        // @ts-expect-error Stories T2: Stray is no machine of the shop app
        void forkRun.end.read(stray);
      }),
    );

    expectTypeOf(forked).toEqualTypeOf<Effect.Effect<StoryRun<never, Ds>, RunFault>>();
  });

  it("a property, its samples and a generated run read only the app's refs", () => {
    const stray = actorRef(
      machine(definition({ id: "types/public/Stray2", states: ["S"], events: {} }), ({ S }) => ({
        default: S.S,
      })),
      "s",
    );

    const samples = samplesOf({
      id: "types/public/samples",
      story,
      names: { setup: "setup", fixtures: [] },
      actors: { pay },
      servers: {},
      failures: [],
      landedFailures: [],
      controls: [],
      values: { go: Pay.E.go() },
      steps: (s) => s,
    });

    expectTypeOf(samples).toEqualTypeOf<Samples<Ds>>();
    expectTypeOf(samples.story).toEqualTypeOf<Story<never, Ds>>();
    expectTypeOf(samples.values).toEqualTypeOf<
      ReadonlyArray<{
        readonly name: string;
        readonly value: EventOf<typeof Pay> | EventOf<typeof Ship>;
      }>
    >();
    expectTypeOf(generate(samples, { drawing: "usual", seed: 1 })).toEqualTypeOf<Generated<Ds>>();

    const property: Property<"no stray", Ds> = {
      rule: "no stray",
      breaches: (propertyRun) => {
        expectTypeOf(propertyRun).toEqualTypeOf<StoryRun<never, Ds>>();
        expectTypeOf(propertyRun.end.read(pay)?.state).toEqualTypeOf<
          "IDLE" | "ON.A" | "ON.B" | undefined
        >();
        // @ts-expect-error Stories T2: Stray is no machine of the shop app
        void propertyRun.end.read(stray);

        return [];
      },
    };

    expectTypeOf(
      propertyTest(samples, { profile: "usual", properties: [property], seeds: [1] })[0]?.rule,
    ).toEqualTypeOf<"no stray" | "turn limit" | "inconclusive" | undefined>();

    samplesOf({
      id: "types/public/wrong-values",
      story,
      names: { setup: "setup", fixtures: [] },
      actors: { pay },
      servers: {},
      failures: [],
      landedFailures: [],
      controls: [],
      // @ts-expect-error Stories T2: a sample's value is an event of the app
      values: { oops: 42 },
      steps: (s) => s,
    });
  });
});

describe("Turn R23: a write handle's row read takes its own definition's snapshot", () => {
  it("another definition's operations are refused", () => {
    expectTypeOf(Pay.O.charge.get(paySnapshot.operations, { orderId: "o1" })).toEqualTypeOf<
      Option.Option<Row>
    >();
    expectTypeOf(Pay.O.charge.get)
      .parameter(0)
      .toEqualTypeOf<ReadonlyMap<"charge", ReadonlyMap<string, Row>>>();
    // @ts-expect-error Turn R23: Ship's operations hold no charge rows
    void Pay.O.charge.get(shipSnapshot.operations, { orderId: "o1" });
  });
});

describe("Stories R8: world words are made by servers and Fake.storage, never by hand", () => {
  it("a server's control returns a control word", () => {
    const Bank = Fake.server("types/public/Bank", {
      truth: Schema.Struct({ balance: Schema.Number }),
      initial: { balance: 0 },
      endpoints: {},
      controls: {
        setBalance: Fake.control(
          { balance: Schema.Number },
          (_t: { readonly balance: number }, input) => input,
        ),
      },
      lost: () => new Fake.Lost(),
    });

    expectTypeOf(Bank.setBalance({ balance: 1 })).toEqualTypeOf<ControlWord>();
    // @ts-expect-error Stories R8: a control's input is its own fields
    void Bank.setBalance({ balence: 1 });
  });

  it("the run's server service and the world word constructors are not public values", async () => {
    const testing = await import("../../src/host/testing/index.ts");

    expectTypeOf<
      "Fake" | "Step" extends keyof typeof testing ? true : false
    >().toEqualTypeOf<true>();
    // @ts-expect-error Stories R8: WorldWord is a type; words come from servers and Fake.storage
    void testing["WorldWord"];
    // @ts-expect-error Stories R8: FakeWorld is a type; a port fake reaches its server through the server's own Effect
    void testing["FakeWorld"];
  });
});

const shopSamples = (id: string) =>
  samplesOf({
    id,
    story,
    names: { setup: "setup", fixtures: [] },
    actors: { pay },
    servers: {},
    failures: [],
    landedFailures: [],
    controls: [],
    values: { go: Pay.E.go() },
    steps: (s) => s,
  });

// Inverted: each line marked `wrong` compiles today. When its word carries the app the line fails
// the check: put `@ts-expect-error` on it, naming the rule. Each assertion of today's wide type then
// fails too: make it the exact narrow type named beside it.
describe("Stories T2 (inverted): the remaining words that erase the app", () => {
  it("Runtime O1: unsettledWrites takes no type argument, so no caller names a narrower app", () => {
    const runtime = setup.construct();

    expectTypeOf(runtime.unsettledWrites()).toEqualTypeOf<ReadonlyArray<Unsettled<Ds>>>();
    void runtime.unsettledWrites<typeof Pay>(); // wrong: Ship's rows typed as Pay's
  });

  it("Stories R16: a published record's actor names its definition", () => {
    const [published] = publishedOf(run, pay);

    // Narrow: "types/public/Pay" | undefined.
    expectTypeOf(published?.actor.machine).toEqualTypeOf<string | undefined>();
    void (published?.actor.machine === "types/public/Ship"); // wrong: a Pay actor's record
  });

  it("Stories R16: a dropped send's sender names a machine of the app", () => {
    const [dropped] = evidenceOf(run, Pay.E.go).filter((e) => e._tag === "SendTargetAbsent");

    // Narrow: Option<{ machine: "types/public/Pay" | "types/public/Ship"; name: string }> | undefined.
    expectTypeOf(dropped?.sender).toEqualTypeOf<
      Option.Option<{ readonly machine: string; readonly name: string }> | undefined
    >();
    void (dropped && Option.exists(dropped.sender, (s) => s.machine === "Paymnt")); // wrong
  });

  it("Stories T2: a run's, a sample's and a generated run's steps name the app's machines", () => {
    const samples = shopSamples("types/public/steps");
    const generated = generate(samples, { drawing: "usual", seed: 1 });

    const sentTo = (steps: ReadonlyArray<Step>) =>
      steps.flatMap((s) => (s._tag === "send" ? [s.actor.machine] : []));

    // Narrow, each: Array<"types/public/Pay" | "types/public/Ship">.
    expectTypeOf(sentTo(run.steps)).toEqualTypeOf<Array<string>>();
    expectTypeOf(sentTo(samples.steps)).toEqualTypeOf<Array<string>>();
    expectTypeOf(sentTo(generated.steps)).toEqualTypeOf<Array<string>>();
    void sentTo(run.steps).includes("Paymnt"); // wrong
    void sentTo(samples.steps).includes("Paymnt"); // wrong
    void sentTo(generated.steps).includes("Paymnt"); // wrong
  });

  it("Stories T2: a pair sweep's properties read the samples' app", () => {
    const stray = actorRef(
      machine(definition({ id: "types/public/Stray3", states: ["S"], events: {} }), ({ S }) => ({
        default: S.S,
      })),
      "s",
    );

    const samples = shopSamples("types/public/pairs");
    const wide: Property = { rule: "wide", breaches: (r) => (r.end.read(stray) ? ["stray"] : []) };
    const own: Property<"own", Ds> = { rule: "own", breaches: () => [] };

    expectTypeOf(pairSweep(samples, { properties: [own], seeds: [1], stopAt: [] })).toEqualTypeOf<
      Array<Cell>
    >();
    void pairSweep(samples, { properties: [wide], seeds: [1], stopAt: [] }); // wrong: reads Stray
  });
});
