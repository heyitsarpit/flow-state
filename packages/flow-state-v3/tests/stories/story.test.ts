import { readFileSync } from "node:fs";
import { Effect, Layer, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { stories as payStories } from "../../fixtures/shop/stories/usual.ts";
import { account, bank, bankSetup } from "../../fixtures/transfers/app.ts";
import { Transfers } from "../../fixtures/transfers/machines/transfers.ts";
import { Bank } from "../../fixtures/transfers/server/bank.ts";
import { BankFake } from "../../fixtures/transfers/server/layer.ts";
import {
  bankStory,
  stories as transferStories,
  usual,
} from "../../fixtures/transfers/stories/usual.ts";
import {
  type Cut,
  Fake,
  Story,
  StoryFailed,
  StoryTurnLimit,
  type StoryRun,
} from "../../src/host/testing/index.ts";
import {
  actorRef,
  app,
  definition,
  deny,
  Flow,
  machine,
  runtimeSetup,
  transaction,
} from "../../src/index.ts";
import { countingHostTimers } from "./timers.ts";
import { checked } from "../rules/rules.ts";

const endings = (evidence: StoryRun["evidence"]) =>
  evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : []));

const faultOf = (run: Promise<unknown>) =>
  run.then(
    () => undefined,
    (fault: unknown) => fault,
  );

const data = (cut: Cut) => ({ now: cut.now, inspection: cut.inspection, records: cut.records });

describe("Story", () => {
  it("is an inert chain: no Layer is built until run(), and a prefix is unchanged by its branches (Stories R1, R2, I1, I2)", async () => {
    let built = 0;
    const counted = Layer.merge(BankFake, Layer.effectDiscard(Effect.sync(() => void built++)));
    const prefix = Story.app(bankSetup, { id: "story/inert", fixtures: [counted] }).ensure(account);
    const one = prefix.send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }));
    const two = prefix.send(account, Transfers.E.Send({ transferId: "t2", cents: 600 })).reload();

    expect(built).toBe(0);
    expect(prefix.steps.map((s) => s._tag)).toEqual(["ensure"]);
    expect(one.steps.map((s) => s._tag)).toEqual(["ensure", "send"]);
    expect(two.steps.map((s) => s._tag)).toEqual(["ensure", "send", "reload"]);

    const ran = checked(await one.run());

    expect(built).toBe(1);
    expect(endings(ran.evidence)).toEqual(["success success"]);

    checked(await two.run());

    expect(built).toBe(3);
  });

  it("runs its own steps given back as data like run() (Stories R2, I3)", async () => {
    const first = checked(await usual.run());
    const again = checked(await usual.run({ steps: usual.steps }));

    expect(endings(again.evidence)).toEqual(["success success", "success success"]);
    expect(again.evidence).toEqual(first.evidence);
    expect(data(again.end)).toEqual(data(first.end));
    expect(data(again.checkpoints.sent)).toEqual(data(first.checkpoints.sent));
  });

  it("never builds the setup's own services, so a Story's tab runs on its fixtures (Stories R7, I19)", async () => {
    let setupBuilt = 0;

    const counting = runtimeSetup({
      app: bank,
      services: Layer.merge(
        BankFake.pipe(Layer.provide(Fake.world)),
        Layer.effectDiscard(Effect.sync(() => void setupBuilt++)),
      ),
      scope: "bank",
      persistence: { captureMs: 0 },
    });

    const run = checked(
      await Story.app(counting, { id: "story/fixtures", fixtures: [BankFake] })
        .ensure(account)
        .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
        .reload()
        .run(),
    );

    expect(setupBuilt).toBe(0);
    expect(endings(run.evidence)).toEqual(["success success"]);
  });

  it("types its fixtures and checkpoints, and is not exported (Stories R7, R12, R15)", async () => {
    // @ts-expect-error no fixture provides BankApi, which the bank's contracts list
    Story.app(bankSetup, { id: "story/none", fixtures: [] });
    // @ts-expect-error two fixtures of one service
    Story.app(bankSetup, { id: "story/two", fixtures: [BankFake, BankFake] });
    // @ts-expect-error a setup without the services its contracts list
    runtimeSetup({ app: bank });
    // @ts-expect-error a duplicate checkpoint name
    usual.checkpoint("sent");
    const widened: string = "later";
    // @ts-expect-error a widened checkpoint name
    usual.checkpoint(widened);
    // @ts-expect-error an event the definition does not declare
    usual.send(account, { _tag: "Bogus" }); // oxlint-disable-line flow-state/no-raw-event -- the type error is the test

    const run = checked(await usual.run());

    // @ts-expect-error a checkpoint the Story never named
    expect(run.checkpoints.nope).toBeUndefined();
    expect(run.checkpoints.sent.now).toBe(0);
    expect(run.checkpoints.sent.read(account)?.memory).toEqual({ notice: "sent r2" });

    // Not exported (Stories R15): the public entry names neither the tooling nor inspect; tests reach
    // them by path.
    const entry = readFileSync(new URL("../../src/index.ts", import.meta.url), "utf8");

    expect(/testing|inspect/.test(entry)).toBe(false);
  });

  it("rejects a fault of its script with StoryFailed, beside a control run that lands (Stories R4, I17)", async () => {
    const lands = bankStory("story/faults")
      .ensure(account)
      .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }));

    expect(endings(checked(await lands.run()).evidence)).toEqual(["success success"]);

    const throwing = Fake.server("Thrower", {
      truth: Schema.Struct({}),
      initial: {},
      endpoints: {},
      controls: {
        boom: Fake.control({}, (_truth: Record<string, never>) => {
          // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the fault under test: a control that throws
          throw new Error("boom");
        }),
      },
      // Behind no port: its lost error is the tooling's own.
      lost: () => new Fake.Lost(),
    });

    const failing = Layer.merge(BankFake, Layer.effectDiscard(Effect.fail("no bank")));
    const noBoot = Story.app(bankSetup, { id: "story/no-boot", fixtures: [failing] });

    const faulty = [
      ["nothing held at Bank.transfer", lands.world(Bank.transfer.release())],
      ["never used", lands.world(Bank.transfer.hold())],
      ["never used", lands.world(Bank.transfer.drop())],
      ["never used", lands.world(Fake.storage.hold())],
      ["never used", lands.world(Fake.storage.refuse())],
      ["nothing held at the store", lands.world(Fake.storage.release())],
      ["Thrower.boom threw", lands.world(throwing.boom({}))],
      [
        "after disposeRuntime",
        lands.disposeRuntime().send(account, Transfers.E.Resend({ transferId: "t1" })),
      ],
      ["did not boot", noBoot],
      ["empty", Story.app(bankSetup, { id: "", fixtures: [BankFake] })],
    ] as const;

    for (const [problem, story] of faulty) {
      const fault = await faultOf(story.run());

      expect(fault instanceof StoryFailed && fault.problem.includes(problem)).toBe(true);
    }

    const twice = [...usual.steps, ...usual.steps.slice(-1)];

    await expect(usual.run({ steps: twice })).rejects.toThrow("checkpoint sent twice");
  });

  it("rejects a step past 10,000 turns in one instant with StoryTurnLimit Turns, keeping the evidence up to the 10,000th turn (Stories R6, I7)", async () => {
    // A commit that answers at once chains its turns inside the send itself.
    const ping = transaction({
      id: "Ping/ping",
      input: { id: Schema.String },
      key: ["id"],
      concurrency: "reject",
      services: [],
      commit: () => Effect.succeed({}),
    });

    const Pinger = definition({
      id: "Ping/Pinger",
      persist: false,
      states: ["ON"],
      events: { Go: { id: Schema.String } },
      internalEvents: { Pong: Flow.uncertain({}) },
      memory: { n: Flow.initial(Schema.Number, 0) },
      operations: ({ E }) => ({
        ping: ping.outcomes({ success: E.Pong, failure: {}, unknown: E.Pong }),
      }),
    });

    const PingerMachine = machine(Pinger, ({ S, O }) => ({
      default: S.ON,
      on: {
        Go: { actions: [O.ping.commit(({ event }) => event)] },
        Pong: [
          {
            guard: [({ memory }) => memory.n < 10_050 || deny("Enough")],
            updateMemory: ({ memory }) => ({ n: memory.n + 1 }),
            actions: [O.ping.commit(() => ({ id: "again" }))],
          },
          {},
        ],
      },
    }));

    const pinger = actorRef(PingerMachine, "p");
    const setup = runtimeSetup({ app: app({ id: "ping", machines: { pinger: PingerMachine } }) });

    const fault = await faultOf(
      Story.app(setup, { id: "story/ping", fixtures: [] })
        .ensure(pinger)
        .send(pinger, Pinger.E.Go({ id: "1" }))
        .run(),
    );

    expect(fault instanceof StoryTurnLimit).toBe(true);
    expect(fault).toEqual(expect.objectContaining({ reason: "Turns", step: 1, instant: 0 }));

    const turns =
      fault instanceof StoryTurnLimit ? fault.evidence.filter((e) => e._tag === "Turn").length : 0;

    expect(turns).toBe(10_000);
  });

  it("Stories I7: the 10,001st turn of one instant rejects the run before it executes", async () => {
    let commits = 0;

    const ping = transaction({
      id: "Ping/ping",
      input: { id: Schema.String },
      key: ["id"],
      concurrency: "reject",
      services: [],
      commit: () => Effect.sync(() => void commits++).pipe(Effect.as({})),
    });

    const Pinger = definition({
      id: "Ping/Pinger",
      persist: false,
      states: ["ON"],
      events: { Go: { id: Schema.String } },
      internalEvents: { Pong: Flow.uncertain({}) },
      memory: { n: Flow.initial(Schema.Number, 0) },
      operations: ({ E }) => ({
        ping: ping.outcomes({ success: E.Pong, failure: {}, unknown: E.Pong }),
      }),
    });

    const PingerMachine = machine(Pinger, ({ S, O }) => ({
      default: S.ON,
      on: {
        Go: { actions: [O.ping.commit(({ event }) => event)] },
        Pong: [
          {
            guard: [({ memory }) => memory.n < 10_050 || deny("Enough")],
            updateMemory: ({ memory }) => ({ n: memory.n + 1 }),
            actions: [O.ping.commit(() => ({ id: "again" }))],
          },
          {},
        ],
      },
    }));

    const pinger = actorRef(PingerMachine, "p");
    const setup = runtimeSetup({ app: app({ id: "ping", machines: { pinger: PingerMachine } }) });

    const fault = await faultOf(
      Story.app(setup, { id: "story/ping-bound", fixtures: [] })
        .ensure(pinger)
        .send(pinger, Pinger.E.Go({ id: "1" }))
        .run(),
    );

    expect(fault instanceof StoryTurnLimit).toBe(true);
    expect(commits).toBe(10_000);
  });

  it("rejects a step whose settle never ends with StoryTurnLimit Settle (Stories R6)", async () => {
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
      internalEvents: { Done: Flow.uncertain({}) },
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
    const setup = runtimeSetup({ app: app({ id: "spin", machines: { spinner: SpinnerMachine } }) });

    const fault = await faultOf(
      Story.app(setup, { id: "story/spin", fixtures: [] })
        .ensure(spinner)
        .send(spinner, Spinner.E.Go({ id: "1" }))
        .run(),
    );

    expect(fault instanceof StoryTurnLimit).toBe(true);
    expect(fault).toEqual(expect.objectContaining({ reason: "Settle", step: 1, instant: 0 }));
  });

  it("gives equal evidence, checkpoints and end on a second run, with no host timer (Stories R5, R14, I5, I18)", async () => {
    const all: ReadonlyArray<Story<string>> = [
      ...Object.values(transferStories),
      ...Object.values(payStories),
    ];

    const { result: runs, calls } = await countingHostTimers(async () => {
      const pairs = [];

      for (const story of all)
        pairs.push([checked(await story.run()), checked(await story.run())] as const);

      return pairs;
    });

    expect(calls).toEqual({ timeout: 0, interval: 0, immediate: 0 });
    expect(runs).toHaveLength(all.length);

    for (const [first, second] of runs) {
      expect(first.evidence.length).toBeGreaterThan(0);
      expect(second.evidence).toEqual(first.evidence);
      expect(Object.values(second.checkpoints).map(data)).toEqual(
        Object.values(first.checkpoints).map(data),
      );
      expect(data(second.end)).toEqual(data(first.end));
      expect(second.end.read(Bank.transfer)).toEqual(first.end.read(Bank.transfer));
      expect(second.end.read(Bank)).toEqual(first.end.read(Bank));
    }
  });
});
