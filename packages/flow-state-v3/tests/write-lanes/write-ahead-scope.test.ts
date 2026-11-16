import { describe, expect, it } from "vite-plus/test";
import { account, savings } from "../../fixtures/transfers/machine.ts";
import { bankStory } from "../../fixtures/transfers/stories.ts";
import { Fake } from "../../src/host/testing/index.ts";

describe("one batch out per scope (WriteAhead R12, I23)", () => {
  it("WriteAhead I23: while one batch is held, another actor's dirty records wait for the next batch of the scope, not a batch of their own", async () => {
    const run = await bankStory("WRITE-AHEAD/one-batch-out")
      .ensure(account)
      .ensure(savings)
      .checkpoint("before")
      .world(Fake.storage.hold())
      .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
      .send(savings, { _tag: "Send", transferId: "t1", cents: 300 })
      .checkpoint("both")
      .world(Fake.storage.release())
      .run();

    const issued =
      run.checkpoints.both.records.batches.length - run.checkpoints.before.records.batches.length;

    expect(issued).toBe(1);
    expect(run.end.records.batches.at(-1)?.keys.some((k) => k.includes("acct-2"))).toBe(true);
  });

  it("WriteAhead I23: one step that touches two identities writes both in one batch", async () => {
    const run = await bankStory("WRITE-AHEAD/one-step-two-identities")
      .ensure(account)
      .ensure(savings)
      .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
      .send(savings, { _tag: "Send", transferId: "t1", cents: 300 })
      .advance("10 seconds")
      .checkpoint("quiet")
      .disposeRuntime()
      .advance("5 seconds")
      .run();

    const after = run.end.records.batches.slice(run.checkpoints.quiet.records.batches.length);
    const actors = after.flatMap((b) => b.keys.filter((k) => k.startsWith("actor/")));

    expect(after).toHaveLength(1);
    expect(actors).toHaveLength(2);
  });
});
