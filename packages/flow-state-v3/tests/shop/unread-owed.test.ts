import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { checkoutOwed, unreadOwed } from "../../fixtures/shop/stories/usual.ts";
import type { StoryRun } from "../../src/host/testing/index.ts";
import { TraceRecord } from "../../src/host/trace.ts";
import { checked } from "../rules/rules.ts";

const reports = (run: StoryRun, open: number) =>
  run.trace.events.flatMap((e) =>
    e.tab.open === open &&
    TraceRecord.$is("Runtime")(e.record) &&
    e.record.evidence._tag === "Reported"
      ? [`${e.record.evidence.code} ${Option.getOrElse(e.record.evidence.record, () => "-")}`]
      : [],
  );

describe("an owed record the boot cannot read (Records Stage 1 row 4)", () => {
  it("Records Stage 1 row 4: a newer owed record keeps its whole identity unread, reported at each boot, and its bytes stay", async () => {
    const run = checked(await unreadOwed.run());

    const kept = [
      "RecordUndecodable actor/Checkout/Pay/checkout-1",
      `RecordUndecodable ${checkoutOwed}`,
    ];

    expect(reports(run, 2)).toEqual(kept);
    expect(reports(run, 3)).toEqual(kept);
    expect(run.checkpoints["second boot"].records.stored.get(checkoutOwed)).toContain('"format":7');
  });
});
