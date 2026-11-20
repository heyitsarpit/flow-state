import { Effect, Exit, Layer, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { BankApi, Declined, NoResponse, Receipt } from "../../fixtures/transfers/services.ts";
import { account, bankSetup } from "../../fixtures/transfers/app.ts";
import { Transfers } from "../../fixtures/transfers/machines/transfers.ts";
import { Bank } from "../../fixtures/transfers/server/bank.ts";
import { BankFake } from "../../fixtures/transfers/server/layer.ts";
import { bankStory } from "../../fixtures/transfers/stories/usual.ts";
import { Fake, Story, StoryFailed, type StoryRun } from "../../src/host/testing/index.ts";
import { checked } from "../rules/rules.ts";

const endings = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : []));

const Truth = Schema.Struct({ limit: Schema.Number });

describe("Fake server", () => {
  it("a control changes truth, and the next call is answered by the handler's rule; endpoints and controls are typed (Stories R8, R9, I9)", async () => {
    const run = checked(
      await bankStory("fake/control")
        .ensure(account)
        .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
        .checkpoint("first")
        .world(Bank.limit({ cents: 400 }))
        .checkpoint("lowered")
        .send(account, Transfers.E.Send({ transferId: "t2", cents: 500 }))
        .checkpoint("declined")
        .run(),
    );

    const { first, lowered, declined } = run.checkpoints;

    expect(first.read(Bank)).toEqual({
      receipts: { [first.read(Bank.transfer)[0]?.input.key ?? ""]: "r1" },
      limit: 1000,
      receiptChars: 0,
      receiptPad: "0",
    });
    expect(lowered.read(Bank).limit).toBe(400);
    expect(declined.read(Bank).receipts).toEqual(first.read(Bank).receipts);
    expect(endings(run)).toEqual(["success success", "failure Declined"]);

    // Typed (Stories R8, R9): endpoints, controls and their answers.
    const typed = Fake.server("Typed", {
      truth: Truth,
      initial: { limit: 0 },
      endpoints: {
        transfer: Fake.call({
          request: { cents: Schema.Number },
          success: Receipt,
          failure: Declined,
          // @ts-expect-error an Exit of a success the endpoint does not declare
          handle: (truth: typeof Truth.Type) => ({ truth, exit: Exit.succeed({ cents: 1 }) }),
        }),
      },
      lost: () => new NoResponse(),
    });

    expect(typed.transfer.hold()._tag).toBe("wire");
    // @ts-expect-error a control the server does not declare
    expect(Bank.raise).toBeUndefined();
    // @ts-expect-error a control input of the wrong shape
    Bank.limit({ cents: "high" });

    const bad = Fake.server("Bad", {
      truth: Truth,
      // @ts-expect-error a truth start that is not a value of the truth Schema
      initial: { limit: "x" },
      endpoints: {},
      lost: () => new NoResponse(),
    });

    expect(bad["~server"].name).toBe("Bad");

    // Each server names its lost error once (Stories, Fake.server's lost): one with none does not
    // compile, and a served endpoint of a server behind a port never fails with FakeLost.
    // @ts-expect-error a server that names no lost error
    void Fake.server("Unnamed", { truth: Truth, initial: { limit: 0 }, endpoints: {} });
    void Effect.map(typed, (served) =>
      // @ts-expect-error a served endpoint fails with the port's error, never FakeLost
      served.transfer({ cents: 1 }).pipe(Effect.catchTag("FakeLost", () => Effect.void)),
    );
  });

  it("truth lasts across reloads and starts at initial in every run (Stories R4, R8)", async () => {
    const story = bankStory("fake/lasting")
      .ensure(account)
      .world(Bank.limit({ cents: 10 }))
      .reload()
      .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
      .checkpoint("reloaded");

    const first = checked(await story.run());
    const fresh = checked(await bankStory("fake/fresh").checkpoint("start").run());

    expect(first.checkpoints.reloaded.read(Bank).limit).toBe(10);
    expect(endings(first)).toEqual(["failure Declined"]);
    expect(fresh.checkpoints.start.read(Bank)).toEqual({
      receipts: {},
      limit: 1000,
      receiptChars: 0,
      receiptPad: "0",
    });
  });

  it("the world option applies its words before the tab first opens (Stories R1)", async () => {
    const run = checked(
      await Story.app(bankSetup, {
        id: "fake/world",
        fixtures: [BankFake],
        world: [Bank.limit({ cents: 100 })],
      })
        .ensure(account)
        .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
        .run(),
    );

    expect(endings(run)).toEqual(["failure Declined"]);
  });

  it("a handler that throws fails the run (Stories R4)", async () => {
    const Broken = Fake.server("Broken", {
      truth: Truth,
      initial: { limit: 0 },
      endpoints: {
        transfer: Fake.call({
          request: { cents: Schema.Number },
          success: Receipt,
          failure: Declined,
          // RETURN_TYPE: the endpoint's answer type, which a handler that only throws cannot infer.
          handle: (): {
            readonly truth: typeof Truth.Type;
            readonly exit: Exit.Exit<typeof Receipt.Type>;
          } => {
            // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the fault under test: a handler that throws
            throw new Error("broken");
          },
        }),
      },
      lost: () => new NoResponse(),
    });

    const BrokenFake = Layer.effect(
      BankApi,
      Effect.map(Broken, (broken) => BankApi.of({ transfer: broken.transfer })),
    );

    const fault = await Story.app(bankSetup, { id: "fake/broken", fixtures: [BrokenFake] })
      .ensure(account)
      .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
      .run()
      .then(
        () => undefined,
        (e: unknown) => e,
      );

    expect(fault instanceof StoryFailed && fault.problem.includes("handler threw")).toBe(true);
  });
});
