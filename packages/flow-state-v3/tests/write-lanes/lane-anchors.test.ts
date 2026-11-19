import { expect, it } from "vite-plus/test";
import { checkout, secondCheckout } from "../../fixtures/shop/app.ts";
import { Shop } from "../../fixtures/services/shop/server/shop.ts";
import { Pay } from "../../fixtures/services/shop/machines/pay.ts";
import { shopStory } from "../../fixtures/shop/stories/usual.ts";
import { Fake } from "../../src/host/testing/index.ts";
import { before, laneFacts, memory, onWire, row, START, state, VISA } from "../checkout.ts";
import { played } from "../rules/played.ts";

const VOID_GAVE_UP =
  "We couldn't confirm the hold was released. Your bank releases it within 7 days.";

it("PAY-21: two shoppers' held charges are anchored to their own keys; one's release leaves the other held (WriteLanes R9, R14, I10, I12)", async () => {
  const run = await played(
    shopStory("PAY-21")
      .ensure(checkout)
      .send(checkout, START)
      .world(Shop.confirm.drop({ at: "response" }))
      .send(checkout, VISA)
      .advance("1 second")
      .ensure(secondCheckout)
      .send(secondCheckout, Pay.E.Start({ cartId: "c2", intentId: "pi2" }))
      .world(Shop.confirm.drop({ at: "response" }))
      .send(secondCheckout, VISA)
      .checkpoint("held")
      .world(Shop.placeOrder.hold())
      .advance("2 seconds")
      .checkpoint("one read"),
  );

  const { held } = run.checkpoints;
  const read = run.checkpoints["one read"];

  expect(held.read(Shop.confirm)).toHaveLength(2);
  expect(state(held, checkout)).toBe("UNSURE");
  expect(state(held, secondCheckout)).toBe("UNSURE");
  expect(row(held, checkout)?.uncertain).toBe(true);
  expect(row(held, secondCheckout, "pay", "pi2")?.uncertain).toBe(true);
  expect(state(read, checkout)).toBe("PLACING");
  expect(state(read, secondCheckout)).toBe("UNSURE");
  expect(row(read, checkout)).toBeUndefined();
  expect(row(read, secondCheckout, "pay", "pi2")?.uncertain).toBe(true);
  expect(laneFacts(before(run, "one read"), "Released")).toBe(1);
  expect(read.read(Shop.confirm)).toHaveLength(2);
});

// One void lost and re-sent: the held capture lands, the void is dropped, and the next re-send's
// capture is held.
const lostVoid = [
  Shop.voidAuthorization.drop(),
  Fake.storage.hold(),
  Fake.storage.release(),
] as const;

// The void of a left charge, lost twice and re-sent each time once its capture lands; the capture
// of the second re-send is held at the end.
const voidTwice = (id: string) =>
  onWire(id, Shop.confirm.hold())
    .send(checkout, Pay.E.Leave())
    .checkpoint("left")
    .world(Fake.storage.hold(), Shop.confirm.release())
    .checkpoint("confirmed")
    .world(...lostVoid)
    .checkpoint("try 1")
    .world(...lostVoid)
    .checkpoint("try 2");

it("PAY-22: a lost void is re-sent three times on its lane, then let go with one release (WriteLanes R9, R14, I12)", async () => {
  const run = await played(
    voidTwice("PAY-22")
      .world(...lostVoid)
      .checkpoint("try 3")
      .world(Shop.voidAuthorization.drop(), Fake.storage.release())
      .checkpoint("gave up"),
  );

  const done = run.checkpoints["gave up"];

  expect(state(run.checkpoints.left)).toBe("LEFT");
  expect(state(run.checkpoints.confirmed)).toBe("LEFT");

  for (const [n, name] of (["try 1", "try 2", "try 3"] as const).entries()) {
    const cut = run.checkpoints[name];

    expect(cut.read(Shop.voidAuthorization)).toHaveLength(n + 1);
    expect(row(cut, checkout, "void")).toBeDefined();
    expect(laneFacts(before(run, name), "Released")).toBe(0);
  }

  expect(done.read(Shop.voidAuthorization)).toHaveLength(4);
  expect(state(done)).toBe("LEFT");
  expect(row(done, checkout, "void")).toBeUndefined();
  expect(laneFacts(run.evidence, "Released")).toBe(1);
  expect(memory(done)?.["notice"]).toBe(VOID_GAVE_UP);
});

it("WriteLanes I7: retryCount equals the invoked re-sends of its Attempt, after a reload that aborts a raised count's capture", async () => {
  const run = await voidTwice("WriteLanes I7 across a reload")
    .world(Shop.voidAuthorization.hold())
    .reload()
    .checkpoint("booted")
    .run();

  const { booted } = run.checkpoints;
  const calls = booted.read(Shop.voidAuthorization);
  const lane = row(booted, checkout, "void");

  expect(new Set(calls.map((c) => c.input.key)).size).toBe(1);
  expect(lane).toBeDefined();
  expect(lane?.retryCount).toBe(calls.length - 1);
});
