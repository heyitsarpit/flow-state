import { Option } from "effect";
import { CONCERNS, type Concern } from "./declare.ts";
import { readRows, readSamples } from "./history.ts";
import type { environmentOf } from "./machine.ts";
import { budgetState, type Result } from "./result.ts";
import { changeOf, slopeOf, verdictOf } from "./stats.ts";

type Environment = ReturnType<typeof environmentOf>;

/**
 * How far a comparison can be trusted: both sides measured now, interleaved, or the other side read
 * from stored rows of another day.
 */
export type Confidence = "interleaved" | "stored";

const MARKS = { same: "", slower: "  SLOWER", faster: "  FASTER" } as const;

/**
 * A result against the other side's samples: the ratio, its 95% interval, and a mark when the change
 * is beyond the noise band.
 */
export const changeText = (
  before: ReadonlyArray<ReadonlyArray<number>>,
  now: Result,
  confidence: Confidence,
) => {
  const change = changeOf(before, now.processes);
  const low = confidence === "stored" ? " (stored, low confidence)" : "";

  return `  x${change.ratio.toFixed(3)} [${change.low.toFixed(3)}, ${change.high.toFixed(3)}]${MARKS[verdictOf(change)]}${low}`;
};

/**
 * Names where a bench's fixture changed: the first recorded commit with the current shape, or the
 * commit compared against.
 */
export const fixtureChange = (
  root: string,
  concern: Concern,
  bench: string,
  fixture: string,
  since: string,
) =>
  Option.match(
    Option.fromUndefinedOr(
      readRows(concern, root).find((r) => r.bench === bench && r.shape === fixture),
    ),
    {
      onNone: () => `  fixture changed since ${since}`,
      onSome: (r) => `  fixture changed at ${r.commit}`,
    },
  );

/**
 * A result against the last stored row of a commit on this runtime and machine, marked low
 * confidence; a changed fixture is named instead of compared.
 */
export const storedComparison = (
  root: string,
  commit: string,
  result: Result,
  env: Environment,
) => {
  const row = readRows(result.bench.concern, root)
    .filter(
      (r) =>
        (r.commit.startsWith(commit) || commit.startsWith(r.commit)) &&
        r.runtime === env.runtime &&
        r.machine === env.machine &&
        r.bench === result.bench.id,
    )
    .at(-1);

  if (row === undefined) return "  (no stored row)";

  if (row.shape !== result.fixture)
    return fixtureChange(root, result.bench.concern, result.bench.id, result.fixture, commit);

  const before = readSamples(row.samples, root)[result.bench.id] ?? [[row.median]];

  return changeText(before, result, "stored");
};

/**
 * Each series' growth: the log-log slope of its medians over size, its R², the growth per 10x of
 * size, and a mark when the slope passes the series' bound.
 */
export const seriesLines = (results: ReadonlyArray<Result>) => {
  const named = new Map<string, Array<Result>>();

  for (const r of results)
    for (const s of Option.toArray(r.bench.series))
      named.set(s.name, [...(named.get(s.name) ?? []), r]);

  return [...named.entries()].flatMap(([name, members]) => {
    const points = members.map((m) => ({ n: m.bench.size.n, value: m.median }));

    if (new Set(points.map((p) => p.n)).size < 2) return [];
    const fit = slopeOf(points);

    const bound = Option.match(members[0]?.bench.series ?? Option.none(), {
      onNone: () => Number.POSITIVE_INFINITY,
      onSome: (s) => s.maxSlope,
    });

    const breach = fit.slope > bound ? `  OVER BOUND ${bound}` : "";

    return [
      `series ${name}: slope ${fit.slope.toFixed(2)} (R² ${fit.r2.toFixed(2)}), x${(10 ** fit.slope).toFixed(2)} per 10x of size, bound ${bound}${breach}`,
    ];
  });
};

// Each headline bench against its last recorded row with the same fixture on this runtime and machine.
const againstLast = (
  root: string,
  results: ReadonlyArray<Result>,
  concern: Concern,
  env: Environment,
) => {
  // Backfilled rows are appended after newer commits' rows, so only rows recorded on their own tree
  // stand for "last".
  const rows = readRows(concern, root).filter(
    (r) => r.confidence === "recorded" && r.runtime === env.runtime && r.machine === env.machine,
  );

  return results.flatMap((r) =>
    Option.toArray(
      Option.fromUndefinedOr(
        rows.filter((row) => row.bench === r.bench.id && row.shape === r.fixture).at(-1),
      ),
    ).map((last) => ({
      ratio: r.median / last.median,
      verdict: verdictOf(
        changeOf(readSamples(last.samples, root)[r.bench.id] ?? [[last.median]], r.processes),
      ),
      commit: last.commit,
    })),
  );
};

/**
 * One line per concern: its headline benches now against their last recorded rows, as a geometric
 * mean ratio, with how many changed beyond noise and how many are over budget.
 */
export const summaryLines = (root: string, results: ReadonlyArray<Result>, env: Environment) =>
  CONCERNS.flatMap((concern) => {
    const mine = results.filter((r) => r.bench.concern === concern && r.bench.headline.length > 0);

    if (mine.length === 0) return [];
    const compared = againstLast(root, mine, concern, env);

    const geo = Math.exp(
      compared.reduce((s, c) => s + Math.log(c.ratio), 0) / Math.max(1, compared.length),
    );

    const slower = compared.filter((c) => c.verdict === "slower").length;
    const faster = compared.filter((c) => c.verdict === "faster").length;
    const over = mine.filter((r) => budgetState(r) === "over").length;

    const against =
      compared.length === 0
        ? "nothing recorded to compare"
        : `x${geo.toFixed(3)} against last recorded (${compared.at(-1)?.commit ?? ""}), ${slower} slower and ${faster} faster beyond noise`;

    return [
      `${concern.padEnd(8)} ${mine.length} benches; ${against}${over > 0 ? `; ${over} over budget` : ""}`,
    ];
  });
