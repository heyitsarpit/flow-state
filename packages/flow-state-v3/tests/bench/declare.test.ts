import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Option, Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { benches } from "../../bench/benches/index.ts";
import { CONCERNS } from "../../bench/declare.ts";
import { selectBenches } from "../../bench/select.ts";
import { appendRows, type Row, readRows } from "../../bench/history.ts";
import { changeOf, madOf, slopeOf, spreadOf, verdictOf } from "../../bench/stats.ts";
import { manifests } from "../../fixtures/index.ts";

describe("bench declarations", () => {
  it("every bench has one unique id, a declared concern and at most two headline numbers", () => {
    const ids = benches.map((b) => b.id);

    expect(new Set(ids).size).toBe(ids.length);

    for (const b of benches) {
      expect(CONCERNS).toContain(b.concern);
      expect(b.id.startsWith(`${b.concern}.`)).toBe(true);
      expect(/-(ms|bytes)$/u.test(b.id)).toBe(true);
      expect(b.headline.length <= 2).toBe(true);
      expect(b.size.n >= 0).toBe(true);
    }
  });

  it("every manifest's long and marked Stories have a turn bench, and each sized Story a scale bench, none built", () => {
    const ids = new Set(benches.map((b) => b.id));
    const turnOf = (id: string) => `turn.${id.replace("/", ".")}.per-turn-ms`;

    for (const m of manifests) {
      for (const story of Option.toArray(m.long)) expect(ids.has(turnOf(story.id))).toBe(true);

      for (const b of m.bench.stories) {
        const id = Option.match(b.size, {
          onNone: () => turnOf(b.story().id),
          onSome: (size) => `scale.${m.name}.${size.series}-${size.n}.per-turn-ms`,
        });

        expect(ids.has(id)).toBe(true);
      }
    }
  });
});

describe("bench tiers", () => {
  const select = (tier: "quick" | "stress" | "full") =>
    selectBenches(benches, { tier, concerns: [], only: Option.none(), maxN: Option.none() });

  it("the quick selection has no stress point, and --stress selects only stress points", () => {
    const stress = benches.filter((b) => b.stress);

    expect(stress.length > 0).toBe(true);
    expect(select("quick").some((b) => b.stress)).toBe(false);
    expect(select("stress").length).toBe(stress.length);
    expect(select("stress").every((b) => b.stress)).toBe(true);
    expect(select("full").length).toBe(benches.filter((b) => b.concern !== "tooling").length);
  });

  it("every series keeps two or more non-stress points, and the quick tier runs its ends", () => {
    const series = new Map<string, Array<{ n: number; stress: boolean }>>();

    for (const b of benches)
      for (const s of Option.toArray(b.series))
        series.set(s.name, [...(series.get(s.name) ?? []), { n: b.size.n, stress: b.stress }]);

    const quick = select("quick");

    for (const [name, points] of series) {
      const kept = points.filter((p) => !p.stress);

      if (points.length < 2) continue;

      expect([name, kept.length >= 2]).toEqual([name, true]);

      const ran = quick.filter((b) => Option.exists(b.series, (s) => s.name === name));

      expect([name, ran.length >= 2]).toEqual([name, true]);
    }
  });
});

describe("bench subjects", () => {
  it("an app has a persist bench exactly when one of its machines persists, on the Story it names", () => {
    const ids = new Set(benches.map((b) => b.id));

    for (const m of manifests) {
      const persists = Object.values(m.app.machines).some(
        (entry) => ("machine" in entry ? entry.machine : entry).compiled.persist,
      );

      expect({ app: m.name, named: Option.isSome(m.bench.persist) }).toEqual({
        app: m.name,
        named: persists,
      });
      expect(ids.has(`persist.${m.name}.story-per-batch-ms`)).toBe(persists);
    }
  });
});

describe("bench statistics", () => {
  it("the scaled MAD of 1..5 is 1.4826 and the median absolute deviation ignores one outlier", () => {
    expect(Math.abs(madOf([1, 2, 3, 4, 5]) - 1.4826) < 1e-4).toBe(true);
    expect(Math.abs(madOf([1, 2, 3, 4, 1000]) - 1.4826) < 1e-4).toBe(true);
  });

  it("p99 needs 1,000 samples; below that it is NaN and min and max stand", () => {
    expect(Number.isNaN(spreadOf([3, 1, 2]).p99)).toBe(true);
    expect(spreadOf([3, 1, 2])).toMatchObject({ median: 2, min: 1, max: 3 });
    expect(spreadOf(Array.from({ length: 1000 }, (_, n) => n + 1)).p99).toBe(990);
  });

  it("a doubling across five processes is slower; equal processes are the same", () => {
    const before = [1, 2, 3, 4, 5].map((p) => [1, 1.01, 0.99].map((v) => v + p / 100));
    const after = before.map((samples) => samples.map((v) => v * 2));

    expect(verdictOf(changeOf(before, after))).toBe("slower");
    expect(verdictOf(changeOf(after, before))).toBe("faster");
    expect(verdictOf(changeOf(before, before))).toBe("same");
  });

  it("a change inside the minimum effect is the same, however tight its interval", () => {
    const before = [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ];

    const after = before.map((s) => s.map((v) => v * 1.02));

    expect(verdictOf(changeOf(before, after))).toBe("same");
  });

  it("a linear series has slope 1 and a flat one slope 0, each with R² 1", () => {
    expect(
      slopeOf([
        { n: 10, value: 1 },
        { n: 100, value: 10 },
        { n: 1000, value: 100 },
      ]),
    ).toEqual({ slope: 1, r2: 1 });
    expect(
      slopeOf([
        { n: 10, value: 3 },
        { n: 1000, value: 3 },
      ]).slope,
    ).toBe(0);
  });
});

describe("bench history", () => {
  it("a row with commas and quotes reads back as written, and the header is written once", () => {
    const root = mkdtempSync(join(tmpdir(), "bench-history-"));

    const row: Row = {
      commit: "abc12345",
      tree: "clean",
      date: "2026-11-17T00:00:00.000Z",
      runtime: "node",
      version: "24.21.0",
      flags: "--expose-gc",
      machine: "m-00000000",
      cpu: 'Chip "X", 12 cores',
      cores: 12,
      power: "ac",
      load: 1.5,
      confidence: "recorded",
      tier: "full",
      concern: "turn",
      bench: "turn.a.b.per-turn-ms",
      size: 1,
      unit: "run",
      workers: 5,
      samples_n: 100,
      warmup: 12,
      batch: 1,
      median: 0.05,
      min: 0.04,
      max: 0.09,
      p99: "",
      mad: 0.002,
      spread: 0.01,
      shape: "deadbeef",
      counters: "turns=108;sent=45",
      samples: "samples/turn/abc12345.json.gz",
      budget: "16",
      budget_state: "ok",
    };

    try {
      appendRows(root, [row]);
      appendRows(root, [{ ...row, commit: "def67890" }]);

      expect(readRows("turn", root)).toEqual([row, { ...row, commit: "def67890" }]);
      expect(
        Result.isFailure(Result.try(() => appendRows(root, [{ ...row, median: Number.NaN }]))),
      ).toBe(true);
      expect(readRows("turn", root).length).toBe(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
