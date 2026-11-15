import { Effect, Exit, Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { stories as payStories } from "../../fixtures/pay/stories.ts";
import { BankApi } from "../../fixtures/transfers/contracts.ts";
import { account } from "../../fixtures/transfers/machine.ts";
import { bankServer } from "../../fixtures/transfers/server.ts";
import { config, send, stories as transferStories } from "../../fixtures/transfers/stories.ts";
import { Fake, Story, StoryFailed, type Step } from "../../src/host/testing/index.ts";
import { actorRef, app, definition, machine, transaction } from "../../src/index.ts";
import { at, callsOf, countingHostTimers, endings, keysOf } from "./read.ts";

const landsOnce = [Story.attach(account), send(account, "t1", 500), Story.checkpoint("sent")];

describe("Story", () => {
  it("is inert data until run(), and keeps its own steps (Stories R1, I1, I2)", async () => {
    let opened = 0;

    const counted = Fake.server(BankApi, () => {
      opened += 1;

      return {
        transfer: () => Exit.succeed({ receipt: "r" }),
        balance: () => Exit.succeed({ cents: 0 }),
      };
    });

    const steps: Array<Step> = [...landsOnce];
    const story = Story.app(config, [counted], steps);
    steps.push(send(account, "t9", 100));

    expect(opened).toBe(0);
    expect(story.steps).toHaveLength(3);

    const run = await story.run();

    expect(opened).toBe(1);
    expect(endings(run)).toEqual(["transfer success success"]);
  });

  it("rejects a fault of its script with StoryFailed (Stories R2, I13)", async () => {
    const control = await Story.app(config, [bankServer], landsOnce).run();

    expect(endings(control)).toEqual(["transfer success success"]);

    const faulty: ReadonlyArray<readonly [string, ReadonlyArray<Step>]> = [
      ["nothing held for", [...landsOnce, bankServer.release("transfer")]],
      ["never used", [bankServer.hold("transfer"), ...landsOnce, bankServer.hold("transfer")]],
      ["never used", [...landsOnce, Fake.store.refuse()]],
      ["no store write held", [...landsOnce, Fake.store.release()]],
      ["twice", [...landsOnce, Story.checkpoint("sent")]],
    ];

    for (const [problem, steps] of faulty)
      await expect(Story.app(config, [bankServer], steps).run()).rejects.toThrow(problem);

    await expect(Story.app(config, [bankServer, bankServer], landsOnce).run()).rejects.toThrow(
      new StoryFailed({ problem: `two fakes of ${bankServer.id}` }),
    );
  });

  it("fails a step whose page never goes idle (Stories R4)", async () => {
    const spin = transaction({
      id: "Spin/spin",
      input: { id: Schema.String },
      key: ["id"],
      concurrency: "reject",
      services: [],
      commit: () => Effect.forever(Effect.yieldNow),
    });

    const Spinner = definition({
      id: "Spin/Spinner",
      persist: false,
      states: ["ON"],
      events: { Go: { id: Schema.String } },
      internalEvents: { Done: {} },
      memory: {},
      operations: ({ E }) => ({
        spin: spin.outcomes({ success: E.Done, failure: {}, unknown: E.Done }),
      }),
    });

    const SpinnerMachine = machine(Spinner, ({ S, O }) => ({
      default: S.ON,
      on: { Go: { actions: [O.spin.commit(({ event }) => event)] }, Done: {} },
    }));

    const spinner = actorRef(SpinnerMachine, "s");
    const steps = [Story.attach(spinner), Story.send(spinner, { _tag: "Go", id: "1" })];

    const spins = Story.app(
      { app: app({ id: "spin", machines: { spinner: SpinnerMachine } }) },
      [],
      steps,
    );

    await expect(spins.run()).rejects.toThrow("never went idle");
  });

  it("records time, the runtime cut, each call and the store at a checkpoint (Stories R8, I11)", async () => {
    const run = await Story.app(
      config,
      [bankServer],
      [
        Story.attach(account),
        bankServer.hold("transfer"),
        send(account, "t1", 500),
        Story.advance("2 seconds"),
        Story.checkpoint("held"),
        bankServer.release("transfer"),
        Story.checkpoint("done"),
      ],
    ).run();

    const held = at(run, "held");
    const done = at(run, "done");

    expect(held.now).toBe(2000);
    expect(held.runtime.lanes.map((l) => [l.operation, l.phase, l.retryCount])).toEqual([
      ["transfer", "OnWire", 0],
    ]);
    expect(held.evidence).toBeGreaterThan(0);
    expect(done.evidence).toBeGreaterThan(held.evidence);
    expect(held.runtime.timers.map((t) => [t.kind, t.dueAt])).toEqual([
      ["Schedule", Option.some(20_000)],
    ]);
    expect(callsOf(held.received)).toEqual(["transfer held 0"]);
    expect(held.received[0]?.args[0]).toEqual({ transferId: "t1", cents: 500 });
    expect(keysOf(held, "lane")).toHaveLength(1);
    expect(keysOf(held, "actor")).toHaveLength(1);
    expect(held.batches.every((b) => b.status === "landed" && b.page === 0)).toBe(true);

    expect(callsOf(done.received)).toEqual(["transfer landed 0"]);
    expect(done.runtime.lanes).toEqual([]);
    expect(keysOf(done, "lane")).toEqual([]);
    expect(done.runtime.actors.map((a) => a.snapshot.memory)).toEqual([{ notice: "sent r1" }]);
  });

  it("gives equal evidence, checkpoints and end on a second run, with no host timer (Stories R4, R10, I4, I12)", async () => {
    const all = [...Object.values(transferStories), ...Object.values(payStories)];

    const { result: runs, calls } = await countingHostTimers(async () => {
      const pairs = [];

      for (const story of all) pairs.push([await story.run(), await story.run()] as const);

      return pairs;
    });

    expect(calls).toEqual({ timeout: 0, interval: 0, immediate: 0 });
    expect(runs).toHaveLength(6);

    for (const [first, second] of runs) {
      expect(first.evidence.length).toBeGreaterThan(0);
      expect(second.evidence).toEqual(first.evidence);
      expect(second.checkpoints).toEqual(first.checkpoints);
      expect(second.end).toEqual(first.end);
    }
  });
});
