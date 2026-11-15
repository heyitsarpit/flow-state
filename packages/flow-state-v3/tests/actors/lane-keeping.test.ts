import { expect, it } from "vite-plus/test";
import { checkout } from "../../fixtures/pay/machine.ts";
import { Shop } from "../../fixtures/pay/server.ts";
import { shopStory } from "../../fixtures/pay/stories.ts";
import { CHECK, memory, onWire, row, START, state } from "../checkout.ts";
import { played } from "../rules/played.ts";

// The charge's answer was lost before it landed: the head is Held and the shopper unsure.
const held = (id: string) => onWire(id, Shop.confirm.drop()).checkpoint("held");

it("DISP-01: a free actor's Held head outlives its grace (WriteLanes R8, I12; Actors R22, I29)", async () => {
  const run = await played(
    held("DISP-01").detach(checkout).advance("1 second").checkpoint("later"),
  );

  expect(state(run.checkpoints.held)).toBe("UNSURE");
  expect(row(run.checkpoints.later)?.uncertain).toBe(true);
});

it("DISP-02: an adopting actor keeps the Held lane and sends nothing again (Actors R20, I29; Restore I6)", async () => {
  const run = await played(
    held("DISP-02").dispose(checkout).ensure(checkout).checkpoint("adopted"),
  );

  const { adopted } = run.checkpoints;

  expect(row(adopted)?.uncertain).toBe(true);
  expect(adopted.read(Shop.confirm)).toHaveLength(1);
});

it("DISP-04: a read open when the disposal begins is the last one (Actors R22, I30)", async () => {
  const run = await played(
    held("DISP-04")
      .world(Shop.intent.hold(), Shop.orderFor.hold())
      .advance(CHECK)
      .checkpoint("reading")
      .disposeRuntime()
      .checkpoint("disposing"),
  );

  expect(run.checkpoints.reading.read(Shop.orderFor)).toHaveLength(1);
  expect(run.checkpoints.disposing.read(Shop.orderFor)).toHaveLength(1);
});

it("DISP-05: a forgotten actor's Held lane is adopted after a reload and not sent again (Actors R21, I32; Restore I6)", async () => {
  const run = await played(
    held("DISP-05")
      .dispose(checkout, { how: "forget" })
      .reload()
      .ensure(checkout)
      .checkpoint("adopted"),
  );

  const { adopted } = run.checkpoints;

  expect(row(adopted)?.uncertain).toBe(true);
  expect(adopted.read(Shop.confirm)).toHaveLength(1);
});

it("DISP-06: a success that lands after its actor was disposed is parked and reaches the adopting actor (Actors R20; WriteLanes R10, I15)", async () => {
  const run = await played(
    onWire("DISP-06", Shop.confirm.hold())
      .dispose(checkout)
      .world(Shop.placeOrder.hold(), Shop.confirm.release())
      .ensure(checkout)
      .checkpoint("adopted"),
  );

  expect(memory(run.checkpoints.adopted)?.["authorized"]).toBe(true);
});

it("DISP-07: a started cart is restored after a reload (Restore R1, I1)", async () => {
  const run = await played(
    shopStory("DISP-07")
      .ensure(checkout)
      .send(checkout, START)
      .checkpoint("card")
      .reload()
      .ensure(checkout)
      .checkpoint("reloaded"),
  );

  expect(state(run.checkpoints.card)).toBe("CARD");
  expect(state(run.checkpoints.reloaded)).toBe("CARD");
});
