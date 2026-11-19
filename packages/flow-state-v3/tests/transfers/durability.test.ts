import { Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { account } from "../../fixtures/transfers/app.ts";
import {
  acct1Record,
  forgetRefused,
  forgotten,
  garbledReceipt,
  largeReceipts,
  quarantined,
  refusedLoad,
  t1Lane,
} from "../../fixtures/transfers/stories/usual.ts";
import type { Cut, StoryRun } from "../../src/host/testing/index.ts";
import { TraceRecord } from "../../src/host/trace.ts";
import { checked } from "../rules/rules.ts";
import { switchedOn } from "../switches.ts";

const OWED = "owed/Bank/Transfers/acct-1";

// The evidence of one open of the tab, in order.
const inOpen = (run: StoryRun, open: number) =>
  run.trace.events.flatMap((e) =>
    e.tab.open === open && TraceRecord.$is("Runtime")(e.record) ? [e.record.evidence] : [],
  );

const reports = (run: StoryRun, open: number) =>
  inOpen(run, open).flatMap((e) =>
    e._tag === "Reported" ? [`${e.code} ${Option.getOrElse(e.record, () => "-")}`] : [],
  );

const OwedRows = Schema.fromJsonString(
  Schema.Struct({
    rows: Schema.Array(
      Schema.Struct({
        channel: Schema.String,
        value: Schema.optionalKey(Schema.Struct({ receipt: Schema.String })),
      }),
    ),
  }),
);

// The owed record's parts, in key order, and every row's receipt across them.
const owedParts = (cut: Cut) => [...cut.records.stored.keys()].filter((k) => k.startsWith(OWED));

const receipts = (cut: Cut) =>
  owedParts(cut).flatMap((key) =>
    Schema.decodeUnknownSync(OwedRows)(cut.records.stored.get(key)).rows.map((r) =>
      r.value === undefined ? r.channel : r.value.receipt.length,
    ),
  );

// The Attempts whose ending the account was handed in one open, each once.
const heardDone = (run: StoryRun, open: number) =>
  new Set(
    inOpen(run, open).flatMap((e) =>
      e._tag === "Delivered" && e.operation === "transfer" ? Option.toArray(e.attempt) : [],
    ),
  ).size;

const refused = (run: StoryRun, open: number) =>
  inOpen(run, open).filter((e) => e._tag === "Issue" && e.code === "InvalidTurn").length;

describe("large owed values (Codec R1, R5; WriteAhead I21)", () => {
  it("Codec R1, R5: every receipt is saved whole, 2.9 MB in one owed record, nothing is reported, and the account hears all fourteen after a reload with no refused turn", async () => {
    const run = checked(await largeReceipts.run());
    const { owed } = run.checkpoints;

    expect(receipts(owed)).toEqual([
      262_144,
      ...Array.from({ length: 5 }, () => 200_000),
      262_145,
      ...Array.from({ length: 6 }, () => 200_000),
      3,
    ]);
    expect(reports(run, 1)).toEqual([]);
    expect(heardDone(run, 2)).toBe(14);
    expect(refused(run, 2)).toBe(0);
  });

  // The same Story's own run of the refused-turn check, now asserted by the test above; it
  // runs again on its own with FLOW_TWIN_RUNS=true.
  it.skipIf(!switchedOn("FLOW_TWIN_RUNS"))(
    "Codec R5: large endings are heard with no refused turn",
    async () => {
      const run = checked(await largeReceipts.run());

      expect(refused(run, 2)).toBe(0);
    },
  );
});

describe("an owed ending with no saved form (Codec R4, R5; WriteAhead R4)", () => {
  it("Codec R4, R5: a receipt with a broken character is saved as its Attempt's unknown Restored, reported, and the account hears both endings after a reload with no refused turn", async () => {
    const run = checked(await garbledReceipt.run());

    expect(receipts(run.checkpoints.owed)).toEqual(["unknown", 2]);
    expect(reports(run, 1)).toContain(`UnencodableValue ${OWED}`);
    expect(heardDone(run, 2)).toBe(2);
    expect(refused(run, 2)).toBe(0);
  });
});

describe("records the boot cannot read (Restore R5, I10, I11)", () => {
  it("Restore R5: the unread lane holds its key until abandoned; the unread account reads quarantined, starts fresh and saves over its bytes", async () => {
    const run = checked(await quarantined.run());
    const { quarantined: read, fresh, declined, cleared } = run.checkpoints;

    expect(read.read(account)?.lifecycle).toBe("quarantined");
    expect(reports(run, 2).toSorted()).toEqual(
      [`RecordUndecodable ${acct1Record}`, `RecordUndecodable ${t1Lane}`].toSorted(),
    );
    expect(fresh.read(account)?.lifecycle).toBe("active");
    expect(declined.read(account)?.memory).toEqual({ notice: "not sent Rejected" });
    expect(cleared.records.stored.has(t1Lane)).toBe(false);
    expect(reports(run, 3)).toEqual([]);
  });
});

describe("a store that fails to load (Restore R9, I16, I17; WriteAhead R16)", () => {
  it("Restore R9: StorageFailure is reported, the tab runs on, and nothing is written in that open", async () => {
    const run = checked(await refusedLoad.run());

    expect(reports(run, 2)).toEqual(["StorageFailure -"]);
    // Persistence is off for that Runtime, so a persisted identity's commit is never sent.
    expect(run.checkpoints.sent.read(account)?.memory).toEqual({
      notice: "not sent NoPersistence",
    });
    expect(run.end.records.batches.filter((b) => b.tab.open === 2)).toEqual([]);
    // The unread scope was never overwritten: a healthy reload restores the lost transfer's lane.
    expect(run.checkpoints.healed.inspection.lanes).toEqual([
      expect.objectContaining({ state: "Held" }),
    ]);
  });
});

describe("forgetting a scope (Restore R10, I18)", () => {
  it("Restore R10: dispose with forget deletes every record, and the next open restores nothing: the account starts fresh", async () => {
    const run = checked(await forgotten.run());

    expect([...run.checkpoints.held.records.stored.keys()].length).toBeGreaterThan(0);
    expect([...run.checkpoints.forgotten.records.stored.keys()]).toEqual([]);
    expect(run.checkpoints.fresh.read(account)?.memory).toEqual({ notice: "" });
    expect(run.checkpoints.fresh.inspection.lanes).toEqual([]);
  });

  // The refusal is the dispose Effect's StorageFailure, which a Story does not surface; the store
  // shows it.
  it("Restore R10: a refused deletion keeps every record", async () => {
    const run = checked(await forgetRefused.run());

    expect([...run.checkpoints.kept.records.stored.keys()]).toEqual([
      ...run.checkpoints.sent.records.stored.keys(),
    ]);
  });
});
