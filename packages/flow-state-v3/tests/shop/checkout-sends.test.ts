import { describe, expect, it } from "vite-plus/test";
import { checkout, mainFlow } from "../../fixtures/shop/app.ts";
import { checkoutSends } from "../../fixtures/shop/stories/sends.ts";
import { turnsOf, readerOf } from "../actors/sends.ts";
import { played } from "../rules/played.ts";
import { storeStory } from "../../fixtures/shop/stories/usual.ts";

const { is } = readerOf(storeStory("ids"));

describe("the checkout flow pays through the checkout's Pay (Actors R16; Runtime O4's send table)", () => {
  it.fails("Actors R16 live, several sends keep their order: paying from the flow tells Pay the card, then to pay, and the paid Pay ends the flow", async () => {
    const run = await played(checkoutSends);
    const paid = run.checkpoints.paid;

    expect(
      turnsOf(run, is(checkout)).filter((e) => e === "CardChosen" || e === "PayRequested"),
    ).toEqual(["CardChosen", "PayRequested"]);
    expect(paid.read(checkout)?.memory["paymentMethodId"]).toBe("visa");
    expect(paid.read(checkout)?.state).toBe("PAID");
    expect(paid.read(mainFlow)?.state).toBe("DONE");
  });
});
