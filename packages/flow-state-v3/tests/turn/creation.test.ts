import { Effect, Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Story } from "../../src/host/testing/index.ts";
import {
  actorRef,
  app,
  definition,
  Diagnostic,
  Flow,
  machine,
  runtimeSetup,
} from "../../src/index.ts";
import { issues } from "../checkout.ts";

const Alarm = definition({
  id: "Creation/Alarm",
  states: ["WAITING", "RANG"],
  events: {},
  internalEvents: { Ring: {}, Never: {} },
  memory: { gap: Flow.initial(Schema.Number, -1) },
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

const Words = definition({
  id: "Creation/Words",
  states: ["READY"],
  events: {},
  memory: {
    body: Flow.initial(Schema.String, "hello"),
    length: Flow.initial(Schema.Number, (fields) => String(fields["body"]).length),
    double: Flow.initial(Schema.Number, (fields) => Number(fields["length"]) * 2),
  },
});

const WordsMachine = machine(Words, ({ S }) => ({ default: S.READY }));

const words = actorRef(WordsMachine, "words");

const wordApp = runtimeSetup({ app: app({ id: "words", machines: { words: WordsMachine } }) });

describe("creation (Turn R14, T6; Compile R5)", () => {
  it("Turn R14: an out-of-range computed delay at creation is reported as an issue, and the state's other schedules are still armed", async () => {
    const run = await Story.app(alarms, { id: "creation/alarm", fixtures: [] })
      .ensure(alarm)
      .advance("1 second")
      .checkpoint("rang")
      .run();

    expect(run.checkpoints.rang.read(alarm)?.state).toBe("RANG");
    expect(issues(run.evidence)).toEqual(["InvalidTurn"]);
  });

  it("Compile R5, Diagnostics I5: a computed start that reads another computed field is a callback defect: the actor is not created and a Defect, a code of the closed list, is reported", async () => {
    const run = await Story.app(wordApp, { id: "creation/words", fixtures: [] })
      .ensure(words)
      .checkpoint("ensured")
      .run();

    expect(run.checkpoints.ensured.read(words)).toBeUndefined();
    expect(issues(run.evidence).every(Schema.is(Diagnostic.fields.code))).toBe(true);
    expect(issues(run.evidence)).toEqual(["Defect"]);
  });

  it("Compile R5: a computed start that spreads its fields still may not read a computed one", async () => {
    const Spread = definition({
      id: "Creation/Spread",
      states: ["READY"],
      events: {},
      memory: {
        body: Flow.initial(Schema.String, "hello"),
        length: Flow.initial(Schema.Number, (fields) => String(fields["body"]).length),
        double: Flow.initial(Schema.Number, (fields) => Number({ ...fields }["length"]) * 2),
      },
    });

    const SpreadMachine = machine(Spread, ({ S }) => ({ default: S.READY }));
    const spread = actorRef(SpreadMachine, "spread");

    const run = await Story.app(
      runtimeSetup({ app: app({ id: "spread", machines: { spread: SpreadMachine } }) }),
      { id: "creation/spread", fixtures: [] },
    )
      .ensure(spread)
      .checkpoint("ensured")
      .run();

    expect(run.checkpoints.ensured.read(spread)).toBeUndefined();
    expect(issues(run.evidence)).toEqual(["Defect"]);
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
