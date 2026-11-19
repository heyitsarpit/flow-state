import { describe, expect, it } from "vite-plus/test";
import { account } from "../../fixtures/transfers/app.ts";
import { Transfers } from "../../fixtures/transfers/machines/transfers.ts";
import { bankStory } from "../../fixtures/transfers/stories/usual.ts";
import { Fake, type Story } from "../../src/host/testing/index.ts";
import { inHoldWindow } from "./sweep.ts";

const send = Transfers.E.Send({ transferId: "t1", cents: 500 });

// The reload positions of a Story inside a hold window, from its own run's writes.
const heldAt = async (story: Story<string>) => {
  const run = await story.run();
  const held = inHoldWindow(story, run.end.records.batches);

  return Array.from({ length: story.steps.length + 1 }, (_, at) => at).filter(held);
};

describe("a storage hold's window across a reload", () => {
  it("a hold still unused at a reload stays open past it, to the release that answers its write", async () => {
    const story = bankStory("windows/unused-across-reload")
      .ensure(account)
      .world(Fake.storage.hold())
      .reload()
      .send(account, send)
      .world(Fake.storage.release())
      .checkpoint("end");

    expect(await heldAt(story)).toEqual([2, 3, 4]);
  });

  it("a hold whose write is held at a reload ends there: the reload lands or aborts the write", async () => {
    const story = bankStory("windows/used-before-reload")
      .ensure(account)
      .world(Fake.storage.hold())
      .send(account, send)
      .reload({ heldWrites: "land" })
      .checkpoint("end");

    expect(await heldAt(story)).toEqual([2, 3]);
  });
});
