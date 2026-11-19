import { describe, expect, it } from "vite-plus/test";
import { renewalPay, subscription } from "../../fixtures/shop/app.ts";
import {
  renewalBusyPay,
  renewalDamagedPay,
  renewalDisposingDamagedPay,
  renewalDisposingPay,
  renewalEndedPay,
  renewalEndingPay,
  renewalForgottenPay,
  renewalStory,
  renewalUnopenedPay,
  renewalUnsurePay,
} from "../../fixtures/shop/stories/sends.ts";
import type { Cut } from "../../src/host/testing/index.ts";
import { droppedSends, endsOf, incarnationsOf, readerOf, turnsOf } from "../actors/sends.ts";
import { before } from "../checkout.ts";
import { played } from "../rules/played.ts";

const { idOf, is } = readerOf(renewalStory("ids"));

const confirms = (cut: Cut) =>
  cut.calls.filter((c) => c.server === "Shop" && c.endpoint === "confirm");

const dropped = (reason: string) => [
  { actor: idOf(renewalPay), event: "CardChosen", reason, sender: idOf(subscription) },
  { actor: idOf(renewalPay), event: "PayRequested", reason, sender: idOf(subscription) },
];

const isRenewal = (event: string) => event === "CardChosen" || event === "PayRequested";

describe("the weekly subscription renews through its Pay (Actors R16; Runtime O4's send table)", () => {
  it("Actors R16 live, kept by work in flight, R7: a closed Pay with a confirm on the wire gets both sends in the same incarnation", async () => {
    const run = await played(renewalBusyPay);

    expect(incarnationsOf(run, is(renewalPay))).toBe(1);
    expect(turnsOf(run, is(renewalPay)).filter(isRenewal)).toEqual([
      "PayRequested",
      "CardChosen",
      "PayRequested",
    ]);
    expect(run.checkpoints.landed.read(renewalPay)?.memory["paymentMethodId"]).toBe("visa");
  });

  it("Actors R16 ended with a record that decodes, R7, R8: the Pay is restored with its started intent, stays while its confirm is on the wire, and ends after the grace", async () => {
    const run = await played(renewalEndedPay);
    const renewed = run.checkpoints.renewed.read(renewalPay);

    expect(renewed?.memory["intentId"]).toBe("pi-weekly");
    expect(renewed?.memory["paymentMethodId"]).toBe("visa");
    expect(renewed?.state).toBe("PAYING");
    expect(confirms(run.checkpoints["held past the grace"])).toHaveLength(1);
    expect(run.checkpoints["held past the grace"].read(renewalPay)?.lifecycle).toBe("active");
    expect(incarnationsOf(run, is(renewalPay))).toBe(2);
    expect(endsOf(run, is(renewalPay))).toBe(2);
    expect(turnsOf(run, is(renewalPay)).filter(isRenewal)).toEqual([
      "CardChosen",
      "PayRequested",
      "PayRequested",
    ]);
  });

  it("Actors R16 restored and delivered last, I14: the restored Pay hears its held charge's unknown Restored before the sends", async () => {
    const run = await played(renewalUnsurePay);
    const turns = turnsOf(run, is(renewalPay));

    expect(turns.filter((e) => e === "PayUnsure")).toHaveLength(2);
    expect(turns.indexOf("CardChosen")).toBeGreaterThan(turns.lastIndexOf("PayUnsure"));
  });

  it("Actors R16 no record (never created), I25: both sends are dropped NoRecord on the subscription, in order, and no Pay is created", async () => {
    const run = await played(renewalUnopenedPay);

    expect(droppedSends(run)).toEqual(dropped("NoRecord"));
    expect(incarnationsOf(run, is(renewalPay))).toBe(0);
    expect(turnsOf(run, is(subscription))).toEqual(["Subscribe", "Due"]);
  });

  it("Actors R16 no record (forgotten), R21: both sends to a forgotten Pay are dropped NoRecord and never bring it back", async () => {
    const run = await played(renewalForgottenPay);

    expect(droppedSends(run)).toEqual(dropped("NoRecord"));
    expect(incarnationsOf(run, is(renewalPay))).toBe(1);
  });

  it("Actors R16 a record that does not decode: a handle's send and both of the subscription's are dropped RecordUndecodable and create no Pay", async () => {
    const run = await played(renewalDamagedPay);

    const asked = {
      actor: idOf(renewalPay),
      event: "PayRequested",
      reason: "RecordUndecodable",
      sender: undefined,
    };

    expect(droppedSends(run)).toEqual([asked, ...dropped("RecordUndecodable")]);
    expect(incarnationsOf(run, is(renewalPay))).toBe(0);
  });

  it("Actors R16 ending and persisted: sends to a Pay that ended with its last write unacknowledged reach its next incarnation, which holds that unwritten change", async () => {
    const run = await played(renewalEndingPay);
    const renewed = run.checkpoints.renewed.read(renewalPay);

    expect(run.checkpoints.saved.read(renewalPay)?.memory["intentId"]).toBe("pi-weekly");
    expect(incarnationsOf(run, is(renewalPay))).toBe(2);
    expect(droppedSends(run)).toEqual([]);
    expect(renewed?.memory["intentId"]).toBe("pi-week-2");
    expect(renewed?.memory["paymentMethodId"]).toBe("visa");
  });

  it("Actors R20, R16: with a batch out, a send to a disposed Pay whose record did not decode drops NoRecord, and opening it starts it fresh with no report", async () => {
    const run = await played(renewalDisposingDamagedPay);
    const { disposed, opened } = run.checkpoints;

    const reported = run.evidence
      .slice(before(run, "disposed").length, before(run, "opened").length)
      .filter((e) => e._tag === "Reported" && e.code === "RecordUndecodable");

    expect(disposed.records.batches.map((b) => b.status)).toContain("held");
    expect(droppedSends(run)).toEqual([
      { actor: idOf(renewalPay), event: "PayRequested", reason: "NoRecord", sender: undefined },
    ]);
    expect(reported).toEqual([]);
    expect(opened.read(renewalPay)?.memory["intentId"]).toBe("");
  });

  it("Actors R16 being disposed: sends to a Pay whose removal the store has not acknowledged are dropped NoRecord and never restore it", async () => {
    const run = await played(renewalDisposingPay);

    expect(droppedSends(run)).toEqual(dropped("NoRecord"));
    expect(incarnationsOf(run, is(renewalPay))).toBe(1);
  });
});
