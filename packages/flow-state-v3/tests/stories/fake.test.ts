import { Effect, Exit, Layer, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { BankApi, Declined, NoResponse, Receipt } from "../../fixtures/transfers/contracts.ts";
import { account, bankSetup } from "../../fixtures/transfers/machine.ts";
import { Bank, BankFake } from "../../fixtures/transfers/server.ts";
import { bankStory } from "../../fixtures/transfers/stories.ts";
import { Fake, Story, StoryFailed, type StoryRun } from "../../src/host/testing/index.ts";

const endings = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : []));

const Truth = Schema.Struct({ limit: Schema.Number });

describe("Fake server", () => {
  it("a control changes truth, and the next call is answered by the handler's rule; endpoints and controls are typed (Stories R8, R9, I9)", async () => {
    const run = await bankStory("fake/control")
      .ensure(account)
      .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
      .checkpoint("first")
      .world(Bank.limit({ cents: 400 }))
      .checkpoint("lowered")
      .send(account, { _tag: "Send", transferId: "t2", cents: 500 })
      .checkpoint("declined")
      .run();

    const { first, lowered, declined } = run.checkpoints;

    expect(first.read(Bank)).toEqual({
      receipts: { [first.read(Bank.transfer)[0]?.input.key ?? ""]: "r1" },
      limit: 1000,
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
    });

    expect(typed.transfer.hold()._tag).toBe("wire");
    // @ts-expect-error a control the server does not declare
    expect(Bank.raise).toBeUndefined();
    // @ts-expect-error a control input of the wrong shape
    Bank.limit({ cents: "high" });
    // @ts-expect-error a truth start that is not a value of the truth Schema
    const bad = Fake.server("Bad", { truth: Truth, initial: { limit: "x" }, endpoints: {} });

    expect(bad["~server"].name).toBe("Bad");
  });

  it("truth lasts across reloads and starts at initial in every run (Stories R4, R8)", async () => {
    const story = bankStory("fake/lasting")
      .ensure(account)
      .world(Bank.limit({ cents: 10 }))
      .reload()
      .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
      .checkpoint("reloaded");

    const first = await story.run();
    const fresh = await bankStory("fake/fresh").checkpoint("start").run();

    expect(first.checkpoints.reloaded.read(Bank).limit).toBe(10);
    expect(endings(first)).toEqual(["failure Declined"]);
    expect(fresh.checkpoints.start.read(Bank)).toEqual({ receipts: {}, limit: 1000 });
  });

  it("the world option applies its words before the first page boots (Stories R1)", async () => {
    const run = await Story.app(bankSetup, {
      id: "fake/world",
      fixtures: [BankFake],
      world: [Bank.limit({ cents: 100 })],
    })
      .ensure(account)
      .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
      .run();

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
    });

    const BrokenFake = Layer.effect(
      BankApi,
      Effect.map(Broken, (broken) =>
        BankApi.of({
          transfer: (input) =>
            broken
              .transfer(input)
              .pipe(Effect.catchTag("FakeLost", () => Effect.fail(new NoResponse()))),
        }),
      ),
    );

    const fault = await Story.app(bankSetup, { id: "fake/broken", fixtures: [BrokenFake] })
      .ensure(account)
      .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
      .run()
      .then(
        () => undefined,
        (e: unknown) => e,
      );

    expect(fault instanceof StoryFailed && fault.problem.includes("handler threw")).toBe(true);
  });
});
