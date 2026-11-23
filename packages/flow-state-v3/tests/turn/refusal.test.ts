import { describe, expect, it } from "vite-plus/test";
import { checkout } from "../../fixtures/shop/app.ts";
import { Shop } from "../../fixtures/services/shop/server/shop.ts";
import { Pay } from "../../fixtures/services/shop/machines/pay.ts";
import { shopStory } from "../../fixtures/shop/stories/usual.ts";
import { busyKeptAnHour } from "../../fixtures/shop/stories/edges.ts";
import { before, issues, memory, onWire, START, state } from "../checkout.ts";
import { played } from "../rules/played.ts";

// The shop turns the held charge away as busy with the given retry delay.
const busy = (id: string, retryAfterMs: number) =>
  onWire(id, Shop.confirm.hold())
    .checkpoint("before")
    .world(Shop.busy({ retryAfterMs }), Shop.confirm.release())
    .checkpoint("refused");

describe("TURN-01 (Turn R8, R10, I14; WriteLanes R10)", () => {
  it("TURN-01/schedule-refused: a busy answer whose retry delay is past 2^31 - 1 ms commits, as an operation's outcome does (Schedules R11): Pay waits with its retry refused and that issue, delivered once", async () => {
    const run = await played(busy("TURN-01/schedule-refused", 2 ** 31));
    const { refused } = run.checkpoints;

    expect(state(refused)).toBe("WAITING");
    expect(memory(refused)).toEqual(expect.objectContaining({ busyTries: 1, retryInMs: 2 ** 31 }));
    expect(issues(run.evidence)).toEqual(["InvalidTurn"]);
    expect(refused.read(Shop.confirm)).toHaveLength(1);
  });

  it("TURN-01/mapper-refused: a busy answer with a retry hint the client cannot read refuses the turn, again on its one redelivery, and leaves Pay as it was", async () => {
    const run = await played(busy("TURN-01/mapper-refused", -1));
    const { refused } = run.checkpoints;

    expect(state(refused)).toBe("PAYING");
    expect(memory(refused)).toEqual(memory(run.checkpoints.before));
    expect(issues(run.evidence)).toEqual(["InvalidTurn", "InvalidTurn"]);
  });

  it("Actors R15, I24: the refused ending is redelivered once, then kept: an hour on it is not tried again and the shop sees one charge", async () => {
    const run = await played(busyKeptAnHour);

    const { refused, later } = run.checkpoints;

    expect(issues(before(run, "refused"))).toEqual(["InvalidTurn", "InvalidTurn"]);
    expect(issues(run.evidence)).toEqual(["InvalidTurn", "InvalidTurn"]);
    expect(refused.inspection.owed.map((o) => o.delivery)).toEqual(["Kept"]);
    expect(later.inspection.owed.map((o) => o.delivery)).toEqual(["Kept"]);
    expect(later.read(Shop.confirm)).toHaveLength(1);
  });

  it("Schedules R11: an outcome's retry delay past 2^31 - 1 ms is a refused start with one issue, and one of exactly 2^31 - 1 ms is armed", async () => {
    const past = await played(busy("Turn I14 out of range", 2_147_483_648));
    const edge = await played(busy("Turn I14 at the bound", 2_147_483_647));

    expect(issues(past.evidence)).toEqual(["InvalidTurn"]);
    expect(state(past.checkpoints.refused)).toBe("WAITING");
    expect(issues(edge.evidence)).toEqual([]);
  });
});

it("TURN-02: an event the state does not handle changes nothing and is no issue (Turn R2, R9, I17)", async () => {
  const run = await played(
    shopStory("TURN-02")
      .ensure(checkout)
      .send(checkout, START)
      .checkpoint("card")
      .send(checkout, Pay.E.Done())
      .checkpoint("done"),
  );

  const { card, done } = run.checkpoints;

  expect(state(card)).toBe("CARD");
  expect(state(done)).toBe("CARD");
  expect(memory(done)).toEqual(memory(card));
  expect(issues(run.evidence)).toEqual([]);
  expect(memory(done)?.["cartId"]).toBe("c1");
});
