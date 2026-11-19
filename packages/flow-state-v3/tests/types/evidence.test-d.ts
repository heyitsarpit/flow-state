import { Effect, type Option, Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import {
  type ActorKey,
  type AttemptId,
  type Channel,
  Evidence,
  type EvidenceOf,
  type LaneFact,
  type PhaseTag,
  type ReportCode,
  type RuntimeCut,
} from "../../src/host/inspect.ts";
import {
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

// Each `@ts-expect-error` names the rule its line breaks; beside it the correct use of the same
// parameter is asserted exactly, so a wrong line cannot fail because the type became `never`.

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

declare const run: StoryRun<never, typeof D>;
declare const erased: StoryRun;
declare const cut: RuntimeCut;
declare const diagnostic: Diagnostic;
declare const error: FlowError;
declare const tab: Tab;
declare const failure: Failure<"no double charge">;

describe("Stories R16, Turn R23: evidence a selector returns names its definition's states, events and operations", () => {
  it("a turn's states", () => {
    const turns = turnsOf(run, D.E.go);

    expectTypeOf(turns[0]?.to).toEqualTypeOf<"IDLE" | "ON.A" | "ON.B" | undefined>();
    expectTypeOf(turns[0]?.from).toEqualTypeOf<"IDLE" | "ON.A" | "ON.B" | undefined>();
    expectTypeOf(turnsOf(run, D.E.go, { actor: d1 })[0]?.to).toEqualTypeOf<
      "IDLE" | "ON.A" | "ON.B" | undefined
    >();

    // @ts-expect-error Stories R16: NOPE is no state of D
    turns.filter((t) => t.to === "NOPE");
    // @ts-expect-error Stories R16: NOPE is no state of D
    turns.filter((t) => t.from === "NOPE");
    // @ts-expect-error Stories R16: NOPE is no state of D
    turnsOf(run, D.E.go, { actor: d1 }).filter((t) => t.to === "NOPE");
  });

  it("a run whose app is erased reads text, as every generic rule does", () => {
    expectTypeOf(turnsOf(erased, D.E.go)[0]?.to).toEqualTypeOf<string | undefined>();
  });

  it("a turn's operations and a delivery's event", () => {
    const delivered = evidenceOf(run, D.E.go).filter((e) => e._tag === "Delivered");

    expectTypeOf(turnsOf(run, D.E.go)[0]?.members[0]?.operation).toEqualTypeOf<
      "place" | undefined
    >();
    expectTypeOf(delivered[0]?._tag === "Delivered" ? delivered[0].event : "go").toEqualTypeOf<
      "go" | "stop" | "Placed" | "Unsure"
    >();

    // @ts-expect-error Stories R16: plaec is no operation of D
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- the wrong line typed operation names refuse
    turnsOf(run, D.E.go).filter((t) => t.members.some((m) => m.operation === "plaec"));

    evidenceOf(run, D.E.go).filter(
      // @ts-expect-error Stories R16: stpo is no event of D
      // oxlint-disable-next-line flow-state/no-event-name-filter, typescript/no-unnecessary-condition -- the wrong line typed event names refuse
      (e) => e._tag === "Delivered" && e.event === "stpo",
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
    expectTypeOf(cut.owed[0]?.delivery).toEqualTypeOf<
      "Queued" | "Retrying" | "Waiting" | "Kept" | undefined
    >();
    expectTypeOf(cut.owed[0]?.channel).toEqualTypeOf<Channel | undefined>();
    expectTypeOf(cut.lanes[0]?.phase).toEqualTypeOf<PhaseTag | undefined>();
    expectTypeOf(cut.timers[0]?.kind).toEqualTypeOf<
      "Schedule" | "Grace" | "Silent" | "Bound" | undefined
    >();
    expectTypeOf<Channel>().toEqualTypeOf<"success" | "failure" | "unknown" | "notSent">();

    // @ts-expect-error Diagnostics R7: Typo is no delivery
    void (cut.owed[0]?.delivery === "Typo");
    // @ts-expect-error Diagnostics R7: faliure is no channel
    void (cut.owed[0]?.channel === "faliure");
    // @ts-expect-error Diagnostics R7: OnWre is no phase
    void (cut.lanes[0]?.phase === "OnWre");
    // @ts-expect-error Diagnostics R7: Shedule is no timer kind
    void (cut.timers[0]?.kind === "Shedule");
  });

  // A brand is a subtype of `string`, so an `===` between two brands, or a brand and text, still
  // compiles: the brands refuse at parameters (src/core/ids.test-d.ts), not at comparisons.
  it("a lane's attempt is an attempt id, and its actor an actor key", () => {
    expectTypeOf(cut.lanes[0]?.actor).toEqualTypeOf<ActorKey | undefined>();
    expectTypeOf(cut.lanes[0]?.attempt).toEqualTypeOf<AttemptId | undefined>();
    expectTypeOf(cut.owed[0]?.attempt).toEqualTypeOf<Option.Option<AttemptId> | undefined>();
  });

  it("the vocabularies have public names", () => {
    expectTypeOf<LaneFact>().not.toBeAny();
    expectTypeOf<ReportCode>().not.toBeAny();
    expectTypeOf<EvidenceOf<"Lane">["kind"]>().toEqualTypeOf<LaneFact>();
  });

  it("slow work names the input it ran", () => {
    type SlowInput = Parameters<typeof Evidence.SlowWork>[0]["input"];

    expectTypeOf<"Boot">().toExtend<SlowInput>();
    expectTypeOf<SlowInput>().not.toEqualTypeOf<string>();

    // @ts-expect-error Diagnostics R11: Bootz is no input
    Evidence.SlowWork({ work: "turn", input: "Bootz", ms: 1, budgetMs: 1 });
  });

  it("a lane's state and the cut's lifecycle are unions today", () => {
    expectTypeOf(cut.lanes[0]?.state).toEqualTypeOf<"InFlight" | "Held" | undefined>();
    // @ts-expect-error Diagnostics R7: Opne is no lifecycle
    void (cut.lifecycle === "Opne");
  });
});

describe("Diagnostics R2, R7: a diagnostic's details are the keys its code writes", () => {
  it("a misspelt detail key is refused", () => {
    expectTypeOf<keyof typeof diagnostic.details>().toEqualTypeOf<
      "reason" | "contract" | "first" | "refused" | "slot"
    >();
    expectTypeOf(diagnostic.details.refused).toEqualTypeOf<
      "Defect" | "InvalidTurn" | "GuardDefect" | "StorageFailure" | "CleanupFailed" | undefined
    >();
    expectTypeOf(diagnostic.details.slot).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(error.diagnostics[0].details.reason).toEqualTypeOf<string | undefined>();

    // @ts-expect-error Diagnostics R2: no code writes `reson`
    void (diagnostic.details["reson"] ?? null);
    // @ts-expect-error Diagnostics R2: no code writes `reson`
    void error.diagnostics[0].details["reson"];
  });
});

describe("Stories R10, R13: the testing tooling's own names are closed", () => {
  it("a tab's name", () => {
    expectTypeOf(tab.name).toEqualTypeOf<"main">();

    // @ts-expect-error Stories R10: the only tab is main
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- the wrong line the literal type refuses
    void (tab.name === "mian");
  });

  it("a property test failure's rule", () => {
    expectTypeOf(failure.rule).toEqualTypeOf<"no double charge" | "turn limit" | "inconclusive">();

    // @ts-expect-error Stories R10: Flow writes "turn limit"
    void (failure.rule === "turn limt");
  });
});

describe("Stories R11: a put's key stays raw text", () => {
  it("a key no key builder makes is the point of a put", () => {
    expectTypeOf<Parameters<typeof Fake.storage.put>[0]>().toEqualTypeOf<string>();
  });
});
