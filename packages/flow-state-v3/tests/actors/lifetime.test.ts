import { expect, it } from "vite-plus/test";
import { checkout } from "../../fixtures/pay/machine.ts";
import { shopStory } from "../../fixtures/pay/stories.ts";
import { before, coalescedStory, type Records, START, state } from "../checkout.ts";
import { played } from "../rules/played.ts";

const finished = (records: Records) => records.filter((e) => e._tag === "Finished").length;

it("ACT-01/free-actor-ends: an actor with a use does not end; a free one ends by its grace's end (Actors R8, I10, I37)", async () => {
  const run = await played(
    shopStory("ACT-01/free-actor-ends")
      .ensure(checkout)
      .send(checkout, START)
      .advance("1 second")
      .checkpoint("used")
      .detach(checkout)
      .advance("1 second")
      .checkpoint("free")
      .ensure(checkout)
      .checkpoint("back"),
  );

  expect(finished(before(run, "used"))).toBe(0);
  expect(finished(before(run, "free"))).toBe(1);
  expect(state(run.checkpoints.back)).toBe("CARD");
});

it("ACT-02/dirty-record-written-at-end: a free actor with an unwritten change ends by its grace's end (Actors R8, I12, I37)", async () => {
  const run = await played(
    coalescedStory("ACT-02/dirty-record-written-at-end")
      .ensure(checkout)
      .send(checkout, START)
      .send(checkout, { _tag: "CardChosen", paymentMethodId: "visa" })
      .detach(checkout)
      .advance("1 second")
      .checkpoint("free"),
  );

  expect(finished(before(run, "free"))).toBe(1);
});

it("ACT-03/no-end-before-the-grace: a free actor does not end at 50 ms and has ended by 110 ms (Actors R8, I10, I37)", async () => {
  const run = await played(
    coalescedStory("ACT-03/no-end-before-the-grace")
      .ensure(checkout)
      .send(checkout, START)
      .detach(checkout)
      .advance("50 millis")
      .checkpoint("50")
      .advance("60 millis")
      .checkpoint("110"),
  );

  expect(finished(before(run, "50"))).toBe(0);
  expect(finished(before(run, "110"))).toBe(1);
});
