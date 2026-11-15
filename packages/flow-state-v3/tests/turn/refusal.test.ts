import { describe, expect, it } from "vite-plus/test";
import { checkout } from "../../fixtures/pay/machine.ts";
import { Shop } from "../../fixtures/pay/server.ts";
import { shopStory } from "../../fixtures/pay/stories.ts";
import { issues, memory, onWire, START, state } from "../checkout.ts";
import { played } from "../rules/played.ts";

// The shop turns the held charge away as busy with the given retry delay.
const busy = (id: string, retryAfterMs: number) =>
  onWire(id, Shop.confirm.hold())
    .checkpoint("before")
    .world(Shop.busy({ retryAfterMs }), Shop.confirm.release())
    .checkpoint("refused");

describe("TURN-01 (Turn R8, R10, I14; WriteLanes R10)", () => {
  it("TURN-01/schedule-refused: a negative delay refuses the turn, again on its one redelivery, and leaves Pay as it was", async () => {
    const run = await played(busy("TURN-01/schedule-refused", -1));
    const { refused } = run.checkpoints;

    expect(state(refused)).toBe("PAYING");
    expect(memory(refused)).toEqual(memory(run.checkpoints.before));
    expect(issues(run.evidence)).toEqual(["InvalidTurn", "InvalidTurn"]);
    expect(refused.read(Shop.confirm)).toHaveLength(1);
  });

  it.fails("Turn I14: a delay past 2^31 - 1 ms is refused, again on its one redelivery", async () => {
    const run = await busy("Turn I14 out of range", 2_147_483_648).run();

    expect(issues(run.evidence)).toEqual(["InvalidTurn", "InvalidTurn"]);
  });
});

it("TURN-02: an event the state does not handle changes nothing and is no issue (Turn R2, R9, I17)", async () => {
  const run = await played(
    shopStory("TURN-02")
      .ensure(checkout)
      .send(checkout, START)
      .checkpoint("card")
      .send(checkout, { _tag: "Done" })
      .checkpoint("done"),
  );

  const { card, done } = run.checkpoints;

  expect(state(card)).toBe("CARD");
  expect(state(done)).toBe("CARD");
  expect(memory(done)).toEqual(memory(card));
  expect(issues(run.evidence)).toEqual([]);
  expect(memory(done)?.["cartId"]).toBe("c1");
});
