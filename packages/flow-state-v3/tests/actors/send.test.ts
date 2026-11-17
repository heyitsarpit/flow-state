import assert from "node:assert/strict";
import { Effect, Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { account, savings } from "../../fixtures/transfers/app.ts";
import { bankStory } from "../../fixtures/transfers/stories/usual.ts";
import { attachInspector } from "../../src/host/inspect.ts";
import type { StoryRun } from "../../src/host/testing/index.ts";
import {
  actorRef,
  app,
  definition,
  Flow,
  FlowError,
  machine,
  runtimeSetup,
} from "../../src/index.ts";
import { checked } from "../rules/rules.ts";

const absent = (run: StoryRun) =>
  run.evidence.flatMap((e) =>
    e._tag === "SendTargetAbsent" ? [`${e.actor.name} ${e.event} ${e.reason}`] : [],
  );

const turns = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Turn" ? [`${e.actor.name} ${e.event}`] : []));

const send = (transferId: string) => ({ _tag: "Send" as const, transferId, cents: 100 });

describe("the send table (Actors R16, I25)", () => {
  it("Actors R16: a send to an identity with no record and no actor is dropped with SendTargetAbsent NoRecord, and creates nothing", async () => {
    const run = checked(
      await bankStory("send/no-record").send(account, send("t1")).checkpoint("sent").run(),
    );

    expect(absent(run)).toEqual(["acct-1 Send NoRecord"]);
    expect(run.checkpoints.sent.inspection.actors).toEqual([]);
  });

  it("Actors R16: a send to a disposed identity is dropped with SendTargetAbsent NoRecord", async () => {
    const run = checked(
      await bankStory("send/disposed")
        .ensure(account)
        .dispose(account)
        .send(account, send("t1"))
        .checkpoint("sent")
        .run(),
    );

    expect(absent(run)).toEqual(["acct-1 Send NoRecord"]);
  });

  it("Actors R16, R7: a send to an ended persisted identity restores it and is delivered, and is not a use", async () => {
    const run = checked(
      await bankStory("send/restores")
        .ensure(account)
        .send(account, send("t1"))
        .detach(account)
        .advance("1 second")
        .send(account, send("t2"))
        .advance("1 second")
        .checkpoint("later")
        .run(),
    );

    expect(absent(run)).toEqual([]);
    expect(turns(run).filter((t) => t.endsWith("Send"))).toEqual(["acct-1 Send", "acct-1 Send"]);
    expect(run.evidence.filter((e) => e._tag === "Incarnated")).toHaveLength(2);
    expect(run.checkpoints.later.inspection.actors).toEqual([]);
  });

  it("Actors R16: several sends to several actors keep their order", async () => {
    const run = checked(
      await bankStory("send/order")
        .ensure(account)
        .ensure(savings)
        .send(account, send("a1"))
        .send(savings, send("s1"))
        .send(account, send("a2"))
        .checkpoint("sent")
        .run(),
    );

    expect(turns(run).filter((t) => t.endsWith("Send"))).toEqual([
      "acct-1 Send",
      "acct-2 Send",
      "acct-1 Send",
    ]);
  });
});

const Counter = definition({
  id: "Send/Counter",
  states: ["COUNTING"],
  events: { Tick: {} },
  memory: { ticks: Flow.initial(Schema.Number, 0) },
});

const CounterMachine = machine(Counter, ({ S }) => ({
  default: S.COUNTING,
  on: { Tick: { updateMemory: ({ memory }) => ({ ticks: memory.ticks + 1 }) } },
}));

const counters = runtimeSetup({
  app: app({ id: "counters", machines: { counter: CounterMachine } }),
});

describe("the admission bound (Actors R14, I22)", () => {
  it("Actors R14, I22: past 1,024 pending events an external send throws AdmissionOverloaded and changes nothing", () => {
    const runtime = counters.construct();
    Effect.runSync(runtime.ready());
    const counter = runtime.ensureActor(actorRef(CounterMachine, "c"));
    const refused: Array<string> = [];
    let burst = true;

    // A listener that sends 1,100 events in one step: they queue behind the step that runs.
    attachInspector(runtime, (e) => {
      if (!burst || e._tag !== "Turn") return;
      burst = false;

      for (let n = 0; n < 1100; n += 1)
        try {
          counter.send({ _tag: "Tick" });
        } catch (error) {
          assert.ok(error instanceof FlowError);
          refused.push(error.code);
        }
    });

    counter.send({ _tag: "Tick" });

    expect(refused).toHaveLength(76);
    expect(new Set(refused)).toEqual(new Set(["AdmissionOverloaded"]));
    expect(Option.map(counter.getSnapshot(), (s) => s.memory["ticks"])).toEqual(Option.some(1025));
  });
});
