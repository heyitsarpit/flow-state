import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import type { Scenario } from "../dsl/case.ts";
import { scenarios } from "../suite.ts";
import { frozenCount, RULINGS, uncitedNew } from "./frozen.ts";

const planted: Scenario = { id: "NEW-01", cites: [], fixtures: [], run: () => undefined };

describe("frozen hand cases (Q24: Conformance R15, I50, T33)", () => {
  it("every hand case today is frozen or cites its ruling", () => {
    assert.deepEqual(uncitedNew(scenarios), []);
  });

  it("freezes R15's 99 hand cases; each later one cites a record (a prototype key is no ruling)", () => {
    assert.equal(frozenCount, 99);
    assert.ok(Object.values(RULINGS).every((r) => r.startsWith("code:wiki/tasks/V3/")));
    assert.deepEqual(uncitedNew([{ ...planted, id: "constructor" }]), ["constructor"]);
  });

  it("refuses a new hand case that cites no ruling", () => {
    assert.deepEqual(uncitedNew([...scenarios, planted]), ["NEW-01"]);
  });

  it("keeps every case of the five files whose rows only case expectations judge", () => {
    const missing = (cases: ReadonlyArray<Scenario>) =>
      CASE_ONLY.filter((id) => !cases.some((s) => s.id === id));

    assert.deepEqual(missing(scenarios), []);
    assert.deepEqual(missing(scenarios.filter((s) => s.id !== "LANE-14")), ["LANE-14"]);
  });
});

/**
 * The cases of the five scenario files that hold rows only case expectations judge (schedules,
 * lane keys, payment retry, parts, refusal): they stay until an oracle or the model judges them.
 */
const CASE_ONLY: ReadonlyArray<string> = [
  "TURN-03/unused",
  "TURN-03/exited",
  "TURN-03/on-time",
  "TURN-03/re-entered",
  "LANE-13",
  "LANE-14",
  "LANE-15",
  "LANE-16",
  "PAY-16/restore-keeps-mayHaveApplied",
  "PAY-16/timeout-per-send",
  "PAY-16/resend-refused-capture",
  "PAY-16/retry-count-persists",
  "PAY-16/stale-send-fenced",
  "PAY-16/schedule-reads-after-memory",
  "PAY-16/read-defect-issue",
  "PAY-16/superseded-read",
  "TURN-05/child-refusal",
  "TURN-05/removed-copy-ends-once",
  "TURN-05/a-part-writing-the-key-is-a-pending-reset",
  "TURN-01/schedule-refused",
  "TURN-01/schedule-out-of-range",
  "TURN-01/mapper-refused",
  "TURN-02",
];
