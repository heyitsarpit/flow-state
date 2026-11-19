import { describe, expect, it } from "vite-plus/test";
import { buyNow, checkout } from "../../fixtures/shop/app.ts";
import {
  buyBusyCheckout,
  buyDamagedCheckout,
  buyDisposingCheckout,
  buyEndedCheckout,
  buyEndingCheckout,
  buyForgottenCheckout,
  buyUnopenedCheckout,
  buyUnsureCheckout,
  expressStory,
} from "../../fixtures/shop/stories/sends.ts";
import type { Cut } from "../../src/host/testing/index.ts";
import { droppedSends, endsOf, incarnationsOf, readerOf, turnsOf } from "../actors/sends.ts";
import { played } from "../rules/played.ts";

const { idOf, is } = readerOf(expressStory("ids"));

const confirms = (cut: Cut) =>
  cut.calls.filter((c) => c.server === "Shop" && c.endpoint === "confirm");

const dropped = (reason: string) => [
  { actor: idOf(checkout), event: "CardChosen", reason, sender: idOf(buyNow) },
  { actor: idOf(checkout), event: "PayRequested", reason, sender: idOf(buyNow) },
];

describe("the buy button drives the checkout's Pay (Actors R16; Runtime O4's send table)", () => {
  it.fails("Actors R16 live, kept by work in flight, R7: a closed checkout with a confirm on the wire gets both sends in the same incarnation", async () => {
    const run = await played(buyBusyCheckout);

    expect(incarnationsOf(run, is(checkout))).toBe(1);
    expect(turnsOf(run, is(checkout)).filter((e) => e === "CardChosen")).toEqual(["CardChosen"]);
    expect(run.checkpoints.landed.read(checkout)?.memory["paymentMethodId"]).toBe("visa");
  });

  it.fails("Actors R16 ended with a record that decodes, R7, R8: the checkout is restored with its started intent, stays while its confirm is on the wire, and ends after the grace", async () => {
    const run = await played(buyEndedCheckout);
    const clicked = run.checkpoints.clicked.read(checkout);

    expect(clicked?.memory["intentId"]).toBe("pi-main");
    expect(clicked?.memory["paymentMethodId"]).toBe("visa");
    expect(clicked?.state).toBe("PAYING");
    expect(confirms(run.checkpoints["held past the grace"])).toHaveLength(1);
    expect(incarnationsOf(run, is(checkout))).toBe(2);
    expect(endsOf(run, is(checkout))).toBe(2);
  });

  it.fails("Actors R16 restored and delivered last, I14: the restored checkout hears its held charge's unknown Restored before the sends", async () => {
    const run = await played(buyUnsureCheckout);
    const turns = turnsOf(run, is(checkout));

    expect(turns.filter((e) => e === "PayUnsure")).toHaveLength(2);
    expect(turns.indexOf("CardChosen")).toBeGreaterThan(turns.lastIndexOf("PayUnsure"));
  });

  it.fails("Actors R16 no record (never created), I25: both sends are dropped NoRecord on the buy button, in order, and no checkout is created", async () => {
    const run = await played(buyUnopenedCheckout);

    expect(droppedSends(run)).toEqual(dropped("NoRecord"));
    expect(incarnationsOf(run, is(checkout))).toBe(0);
    expect(turnsOf(run, is(buyNow))).toEqual(["Buy"]);
  });

  it.fails("Actors R16 no record (forgotten), R21: both sends to a forgotten checkout are dropped NoRecord and never bring it back", async () => {
    const run = await played(buyForgottenCheckout);

    expect(droppedSends(run)).toEqual(dropped("NoRecord"));
    expect(incarnationsOf(run, is(checkout))).toBe(1);
  });

  it.fails("Actors R16 a record that does not decode: both sends are dropped RecordUndecodable and create no checkout", async () => {
    const run = await played(buyDamagedCheckout);

    expect(droppedSends(run)).toEqual(dropped("RecordUndecodable"));
    expect(incarnationsOf(run, is(checkout))).toBe(0);
  });

  it.fails("Actors R16 ending and persisted: sends to a checkout that ended with its last write unacknowledged reach its next incarnation, restored with its intent", async () => {
    const run = await played(buyEndingCheckout);

    expect(incarnationsOf(run, is(checkout))).toBe(2);
    expect(droppedSends(run)).toEqual([]);
    expect(run.checkpoints.clicked.read(checkout)?.memory["intentId"]).toBe("pi-main");
    expect(run.checkpoints.clicked.read(checkout)?.memory["paymentMethodId"]).toBe("visa");
  });

  it.fails("Actors R16 being disposed: sends to a checkout whose removal the store has not acknowledged are dropped NoRecord and never restore it", async () => {
    const run = await played(buyDisposingCheckout);

    expect(droppedSends(run)).toEqual(dropped("NoRecord"));
    expect(incarnationsOf(run, is(checkout))).toBe(1);
  });
});
