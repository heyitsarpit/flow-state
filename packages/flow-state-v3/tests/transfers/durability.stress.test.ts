import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { manyReceipts } from "../../fixtures/transfers/stories.ts";
import type { Cut, StoryRun } from "../../src/host/testing/index.ts";
import { TraceRecord } from "../../src/host/trace.ts";
import { checked } from "../rules/rules.ts";

const OWED = "owed/Bank/Transfers/acct-1";

const RUN_MS = 60_000;

const OwedRows = Schema.fromJsonString(Schema.Struct({ rows: Schema.Array(Schema.Unknown) }));

const owedParts = (cut: Cut) => [...cut.records.stored.keys()].filter((k) => k.startsWith(OWED));

const rows = (cut: Cut) =>
  owedParts(cut).flatMap(
    (key) => Schema.decodeUnknownSync(OwedRows)(cut.records.stored.get(key)).rows,
  );

const inOpen = (run: StoryRun, open: number) =>
  run.trace.events.flatMap((e) =>
    e.tab.open === open && TraceRecord.$is("Runtime")(e.record) ? [e.record.evidence] : [],
  );

describe("many owed rows (Codec R1, R5; WriteAhead I21)", () => {
  it(
    "Codec R1, WriteAhead I21: 1,300 owed rows pass a record's node bound and are saved in parts, none withheld, and all are heard after a reload",
    async () => {
      const run = checked(await manyReceipts().run());
      const { owed } = run.checkpoints;

      expect(owedParts(owed).length).toBeGreaterThan(1);
      expect(rows(owed)).toHaveLength(1300);
      expect(inOpen(run, 1).filter((e) => e._tag === "Reported")).toEqual([]);
      expect(
        inOpen(run, 2).filter((e) => e._tag === "Delivered" && e.operation === "transfer"),
      ).toHaveLength(1300);
    },
    RUN_MS,
  );
});
