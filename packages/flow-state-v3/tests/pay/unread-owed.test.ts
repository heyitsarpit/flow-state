import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { checkoutOwed, unreadOwed } from "../../fixtures/pay/stories/usual.ts";
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

describe("an owed record the boot cannot read (Restore R5, I10)", () => {
  it("Restore R5: it is reported RecordUndecodable at each boot and its bytes stay while nothing is owed", async () => {
    const run = checked(await unreadOwed.run());

    expect(reports(run, 2)).toEqual([`RecordUndecodable ${checkoutOwed}`]);
    expect(reports(run, 3)).toEqual([`RecordUndecodable ${checkoutOwed}`]);
    expect(run.checkpoints["second boot"].records.stored.get(checkoutOwed)).toContain('"format":4');
  });
});
