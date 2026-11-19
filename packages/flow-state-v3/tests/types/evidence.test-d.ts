import { Effect, type Option, Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import { Evidence, type RuntimeCut } from "../../src/host/inspect.ts";
import {
  type Cut,
  evidenceOf,
  type Failure,
  Fake,
  type StoryRun,
  type Tab,
  turnsOf,
} from "../../src/host/testing/index.ts";
import {
  actorRef,
  definition,
  type Diagnostic,
  Flow,
  type FlowError,
  machine,
  transaction,
} from "../../src/index.ts";

// Inverted: each line marked `wrong` compiles today. When its carrier lands the line fails the
// check: put `@ts-expect-error` on it, naming the rule. Each assertion of today's wide type (the
// `.not` of the narrow type, or the wide type itself) then fails too: make it the exact narrow
// type. A positive assertion that holds today stays as it is.

const place = transaction({
  id: "types/evidence/place",
  input: { orderId: Schema.String },
  key: ["orderId"],
  concurrency: "reject",
  services: [],
  commit: () => Effect.succeed(1),
});

const D = definition({
  id: "types/evidence/D",
  states: ["IDLE", { ON: ["A", "B"] }],
  events: { go: {}, stop: {} },
  internalEvents: { Placed: {}, Unsure: Flow.uncertain({}) },
  operations: ({ E }) => ({
    place: place.outcomes({ success: E.Placed, failure: {}, unknown: E.Unsure }),
  }),
});

const DMachine = machine(D, ({ S }) => ({ default: S.IDLE, on: { go: S.ON.A, stop: S.IDLE } }));
const d1 = actorRef(DMachine, "d1");

declare const run: StoryRun;
declare const cut: RuntimeCut;
declare const diagnostic: Diagnostic;
declare const error: FlowError;
declare const tab: Tab;
declare const failure: Failure;
declare const calls: Cut["calls"];

describe("Stories R16, Turn R23: evidence a selector returns names its definition's states, events and operations", () => {
  it("a turn's states", () => {
    const turns = turnsOf(run, D.E.go);

    expectTypeOf(turns[0]?.to).not.toEqualTypeOf<"IDLE" | "ON.A" | "ON.B" | undefined>();
    expectTypeOf(turns[0]?.to).toEqualTypeOf<string | undefined>();

    turns.filter((t) => t.to === "NOPE"); // wrong: no such state
    turns.filter((t) => t.from === "NOPE"); // wrong
    turnsOf(run, D.E.go, { actor: d1 }).filter((t) => t.to === "NOPE"); // wrong
  });

  it("a turn's operations and a delivery's event", () => {
    turnsOf(run, D.E.go).filter((t) => t.members.some((m) => m.operation === "plaec")); // wrong

    evidenceOf(run, D.E.go).filter(
      // oxlint-disable-next-line flow-state/no-event-name-filter -- the wrong line typed event names refuse
      (e) => e._tag === "Delivered" && e.event === "stpo", // wrong: no such event
    );
  });

  it("a misspelt field or tag is refused today", () => {
    // @ts-expect-error Turn R23: `too` is no field of a turn
    turnsOf(run, D.E.go).filter((t) => t.too === "A");
    // @ts-expect-error Turn R23: Delivred is no evidence tag
    evidenceOf(run, D.E.go).filter((e) => e._tag === "Delivred");
  });
});

describe("Diagnostics R7, WriteLanes R10: the runtime cut's rows use Flow's closed vocabularies", () => {
  it("an owed row's delivery and channel, a lane's phase and a timer's kind", () => {
    expectTypeOf(cut.owed[0]?.delivery).toEqualTypeOf<string | undefined>();
    expectTypeOf(cut.owed[0]?.channel).toEqualTypeOf<string | undefined>();
    expectTypeOf(cut.lanes[0]?.phase).toEqualTypeOf<string | undefined>();
    expectTypeOf(cut.timers[0]?.kind).toEqualTypeOf<string | undefined>();

    void (cut.owed[0]?.delivery === "Typo"); // wrong: no such delivery
    void (cut.owed[0]?.channel === "faliure"); // wrong: no such channel
    void (cut.lanes[0]?.phase === "OnWre"); // wrong: no such phase
    void (cut.timers[0]?.kind === "Shedule"); // wrong: no such timer kind
  });

  it("a lane's attempt is an attempt id, not an actor's key", () => {
    expectTypeOf(cut.lanes[0]?.attempt).toEqualTypeOf<string | undefined>();
    expectTypeOf(cut.owed[0]?.attempt).toEqualTypeOf<Option.Option<string> | undefined>();

    void (cut.lanes[0]?.attempt === cut.lanes[0]?.actor); // wrong: an actor's key is no attempt id
  });

  it("slow work names the input it ran", () => {
    expectTypeOf<Parameters<typeof Evidence.SlowWork>[0]["input"]>().toEqualTypeOf<string>();

    Evidence.SlowWork({ work: "turn", input: "Bootz", ms: 1, budgetMs: 1 }); // wrong: no such input
  });

  it("a lane's state and the cut's lifecycle are unions today", () => {
    expectTypeOf(cut.lanes[0]?.state).toEqualTypeOf<"InFlight" | "Held" | undefined>();
    // @ts-expect-error Diagnostics R7: Opne is no lifecycle
    void (cut.lifecycle === "Opne");
  });
});

describe("Diagnostics R2, R7: a diagnostic's details are the keys its code writes", () => {
  it("a misspelt detail key reads a silent null", () => {
    expectTypeOf(diagnostic.details).toEqualTypeOf<{
      readonly [x: string]: string | number | boolean | null;
    }>();

    void (diagnostic.details["reson"] ?? null); // wrong: no code writes `reson`
    void error.diagnostics[0].details["reson"]; // wrong
  });
});

describe("Stories R10, R13: the testing tooling's own names are closed", () => {
  it("a tab's name", () => {
    expectTypeOf(tab.name).not.toEqualTypeOf<"main">();

    void (tab.name === "mian"); // wrong: the only tab is main
  });

  it("a property test failure's rule", () => {
    expectTypeOf(failure.rule).toEqualTypeOf<string>();

    void (failure.rule === "turn limt"); // wrong: Flow writes "turn limit"
  });
});

describe("Stories R10: a call is named by its endpoint", () => {
  it("a misspelt endpoint in the call log", () => {
    expectTypeOf(calls[0]?.endpoint).toEqualTypeOf<string | undefined>();

    calls.filter((c) => c.endpoint === "confrim"); // wrong: no such endpoint
  });
});

describe("Stories R11: a put's key stays raw text", () => {
  it("a key no key builder makes is the point of a put", () => {
    expectTypeOf<Parameters<typeof Fake.storage.put>[0]>().toEqualTypeOf<string>();
  });
});
