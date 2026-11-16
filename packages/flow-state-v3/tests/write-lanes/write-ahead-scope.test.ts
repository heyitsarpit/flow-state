import { describe, expect, it } from "vite-plus/test";
import { account, savings } from "../../fixtures/transfers/machine.ts";
import { bankStory } from "../../fixtures/transfers/stories.ts";
import { Fake } from "../../src/host/testing/index.ts";

describe("one batch out per scope (WriteAhead R12, I23)", () => {
  it.fails("WriteAhead I23: while one batch is held, another actor's dirty records wait for the next batch of the scope, not a batch of their own", async () => {
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
  });
});
