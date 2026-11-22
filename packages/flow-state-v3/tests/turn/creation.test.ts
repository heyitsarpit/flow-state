import { Effect, Option, Result, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Story } from "../../src/host/testing/index.ts";
import {
  actorRef,
  app,
  definition,
  Flow,
  FlowError,
  machine,
  runtimeSetup,
} from "../../src/index.ts";
import { issues } from "../checkout.ts";
import { refusal } from "../refusals.ts";
import { loose } from "../../src/test/loose.ts";

const Alarm = definition({
  id: "Creation/Alarm",
  states: ["WAITING", "RANG"],
  events: {},
  internalEvents: { Ring: {}, Never: {} },
  memory: { gap: Flow.initial(Schema.Number, 2 ** 31) },
  schedules: { ring: {}, broken: {} },
});

const AlarmMachine = machine(Alarm, ({ S, E }) => ({
  default: S.WAITING,
  states: {
    WAITING: {
      schedules: {
        ring: { schedule: "1 second", send: E.Ring },
        broken: { schedule: ({ memory }) => memory.gap, send: E.Never },
      },
      on: { Ring: S.RANG },
    },
  },
}));

const alarm = actorRef(AlarmMachine, "alarm");

const alarms = runtimeSetup({ app: app({ id: "alarms", machines: { alarm: AlarmMachine } }) });

describe("creation (Turn R14, T6)", () => {
  it("Turn R14: an out-of-range computed delay at creation is reported as an issue, and the state's other schedules are still armed", async () => {
    const run = await Story.app(alarms, { id: "creation/alarm", fixtures: [] })
      .ensure(alarm)
      .advance("1 second")
      .checkpoint("rang")
      .run();

    expect(run.checkpoints.rang.read(alarm)?.state).toBe("RANG");
    expect(issues(run.evidence)).toEqual(["InvalidTurn"]);
  });
});

describe("the outside snapshot (Turn R23)", () => {
  const Doc = definition({
    id: "Creation/Doc",
    states: ["CLEAN"],
    events: {},
    memory: {
      body: Flow.initial(Schema.String, ""),
      draftKey: Flow.private(Flow.initial(Schema.String, "k")),
    },
  });

  it("an actor's outside snapshot omits its private fields", () => {
    const DocMachine = machine(Doc, ({ S }) => ({ default: S.CLEAN }));

    const runtime = runtimeSetup({
      app: app({ id: "docs", machines: { doc: DocMachine } }),
    }).construct();

    Effect.runSync(runtime.ready());
    const doc = runtime.ensureActor(actorRef(DocMachine, "d"));

    expect(doc.getSnapshot()).toEqual(
      Option.some(expect.objectContaining({ memory: { body: "" } })),
    );
  });
});

// The reasons a definition whose handle starts from `start` is refused with.
const reasonOf = (start: string) =>
  Result.match(
    Result.try({
      try: () =>
        definition({
          id: "Compile/Computed",
          states: ["A"],
          events: {},
          memory: { email: Flow.input(Schema.String), handle: Flow.initial(Schema.String, start) },
        }),
      // FLOW_STATE_ALLOW_UNKNOWN: whatever the construction threw, told apart below.
      catch: (error: unknown) => error,
    }),
    {
      onSuccess: () => [],
      onFailure: (error) =>
        error instanceof FlowError ? error.diagnostics.map((d) => d.details["reason"]) : ["raw"],
    },
  );

describe("a computed start (Compile R5)", () => {
  it("Compile R5: Flow.initial given a function is refused InvalidConfiguration at the field, never run", () => {
    const runs = { count: 0 };

    const computed = loose(() => {
      runs.count += 1;

      return "x";
    });

    expect(
      refusal(() =>
        definition({
          id: "Compile/Computed",
          states: ["A"],
          events: {},
          memory: {
            email: Flow.input(Schema.String),
            handle: Flow.initial(Schema.String, computed),
          },
        }),
      ),
    ).toEqual([["InvalidConfiguration", "memory.handle"]]);
    expect(reasonOf(computed)).toEqual(["ComputedStart"]);
    expect(runs.count).toBe(0);
  });
});
