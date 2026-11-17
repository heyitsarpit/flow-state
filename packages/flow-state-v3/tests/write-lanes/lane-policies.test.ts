import { expect, it } from "vite-plus/test";
import { cellsCheckout } from "../../fixtures/cells/app.ts";
import { Shop } from "../../fixtures/services/shop/server/shop.ts";
import { cellsStory } from "../../fixtures/cells/stories/usual.ts";
import { Fake } from "../../src/host/testing/index.ts";
import { endings, laneFacts, row, START, state, VISA } from "../checkout.ts";
import { played } from "../rules/played.ts";

const ABORT = { _tag: "AbortPay" } as const;

it("LANE-08: a cancel before the acknowledgement lands ends the charge NotSent Cancelled, never sent (WriteLanes R14)", async () => {
  const run = await played(
    cellsStory("LANE-08")
      .ensure(cellsCheckout)
      .send(cellsCheckout, START)
      .world(Fake.storage.hold())
      .send(cellsCheckout, VISA)
      .send(cellsCheckout, ABORT)
      .world(Fake.storage.release())
      .checkpoint("aborted"),
  );

  expect(run.checkpoints.aborted.read(Shop.confirm)).toHaveLength(0);
  expect(endings(run.evidence, "pay")).toEqual([{ channel: "notSent", reason: "Cancelled" }]);
});

it("LANE-09: a cancel of a Held head releases the hold and leaves the lane Idle (WriteLanes R14, R8)", async () => {
  const run = await played(
    cellsStory("LANE-09")
      .ensure(cellsCheckout)
      .send(cellsCheckout, START)
      .world(Shop.confirm.drop())
      .send(cellsCheckout, VISA)
      .checkpoint("unsure")
      .send(cellsCheckout, ABORT)
      .checkpoint("aborted"),
  );

  expect(state(run.checkpoints.unsure, cellsCheckout)).toBe("UNSURE");
  expect(laneFacts(run.evidence, "Released")).toBe(1);
  expect(row(run.checkpoints.aborted, cellsCheckout)).toBeUndefined();
});
