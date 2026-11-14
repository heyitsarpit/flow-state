import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildReport, parseReview, renderText } from "./review-yield.ts";

const fixture = (name: string): string =>
  readFileSync(join(import.meta.dir, "fixtures", name), "utf8");

const reviews = [
  parseReview("review-table-a.md", fixture("review-table-a.md")),
  parseReview("review-table-b.md", fixture("review-table-b.md")),
];
const report = buildReport(reviews, fixture("log-snippet.task"));

const angle = (name: string) => report.angles.find((a) => a.angle === name);

test("table A (Sidecar | Item | Result) sums per angle", () => {
  expect(reviews[0]?.tables).toBe(1);
  expect(angle("blind")?.counts).toEqual({
    items: 3,
    accepted: 1,
    changed: 1,
    rejected: 1,
    other: 0,
  });
  expect(angle("blind")?.used).toBeCloseTo(2 / 3);
  expect(angle("standing")?.counts.other).toBe(1);
});

test("table B (Angle | Finding | Outcome) and a table with no angle column", () => {
  expect(reviews[1]?.tables).toBe(2);
  expect(angle("folds")?.counts).toEqual({
    items: 2,
    accepted: 1,
    changed: 0,
    rejected: 1,
    other: 0,
  });
  expect(angle("standing")?.counts).toEqual({
    items: 4,
    accepted: 1,
    changed: 1,
    rejected: 1,
    other: 1,
  });
  expect(angle("(no angle column)")?.counts).toEqual({
    items: 1,
    accepted: 1,
    changed: 0,
    rejected: 0,
    other: 0,
  });
});

test("unparsed results and angle-less files are reported", () => {
  expect(report.unparsed.unknownResults).toEqual([
    { angle: "standing", result: "noted", count: 1 },
  ]);
  expect(report.unparsed.noAngleFiles).toEqual(["review-table-b.md"]);
  const prose = parseReview("prose.md", "## Sidecar log\n\n- accepted: 1, 2\n");
  expect(prose.tables).toBe(0);
  expect(buildReport([prose], "").unparsed.noTableFiles).toEqual(["prose.md"]);
});

test("miss tally counts causes across the three miss notes and flags 3 or more", () => {
  expect(report.misses.sentences).toBe(3);
  const cause = (name: string) => report.misses.causes.find((c) => c.cause === name);
  expect(cause("weak check")).toEqual({
    cause: "weak check",
    count: 3,
    dates: ["2026-11-10", "2026-11-11", "2026-11-12"],
    flagged: true,
  });
  expect(cause("gathering")).toMatchObject({ count: 1, dates: ["2026-11-10"], flagged: false });
  expect(cause("rule gap")).toMatchObject({ count: 1, dates: ["2026-11-12"], flagged: false });
  expect(report.misses.causes.some((c) => c.cause === "orchestrator")).toBe(false);
  expect(report.misses.noCause).toEqual([]);
});

test("a short separator row still starts a table, and the By column names the sidecar", () => {
  const text =
    "## Sidecar log\n\n| By | Finding | Result |\n| -- | -- | -- |\n| S1 | 1 x | rejected: no |\n| S2 | 2 y | changed |\n";
  const parsed = parseReview("short.md", text);
  expect(parsed.tables).toBe(1);
  expect(parsed.rows.map((r) => [r.angle, r.verdict])).toEqual([
    ["s1", "rejected"],
    ["s2", "changed"],
  ]);
});

test("a one-letter sidecar label before the angle is dropped", () => {
  const text =
    "## Sidecar log\n\n| Sidecar | Finding | Result |\n| --- | --- | --- |\n| A blind | 1 x | accepted |\n";
  expect(parseReview("labels.md", text).rows[0]?.angle).toBe("blind");
});

test("'Missed by own checks' counts, and 'Missed by the builder's gathering' counts as gathering", () => {
  const log = [
    "log V3",
    "note 2026-11-12T09:00:00Z",
    "    Sent to its lead. Missed by own checks: the builder proved with throwaway files (weak check).",
    "note 2026-11-13T09:00:00Z",
    "    Ruled. Missed by the builder's gathering: requirements scoped to disposal only.",
  ].join("\n");
  const misses = buildReport([], log).misses;
  expect(misses.sentences).toBe(2);
  expect(misses.causes.map((c) => [c.cause, c.count])).toEqual([
    ["gathering", 1],
    ["weak check", 1],
  ]);
  expect(misses.noCause).toEqual([]);
});

test("text output renders both tables", () => {
  const text = renderText(report);
  expect(text).toContain("Table 1: review yield by sidecar angle");
  expect(text).toMatch(/weak check\s+3\s+FLAG\s+2026-11-10, 2026-11-11, 2026-11-12/);
});
