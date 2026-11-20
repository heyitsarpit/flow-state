import { Duration, Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import {
  generate,
  type Generated,
  print,
  profileTables,
  type Step,
} from "../../src/host/testing/index.ts";
import { samples as pay } from "../../fixtures/shop/stories/usual.ts";
import { samples } from "./fixtures.ts";

const SEEDS = Array.from({ length: 20 }, (_, n) => n + 1);

const millisOf = (step: Step) =>
  step._tag === "advance" ? Duration.toMillis(Duration.fromInputUnsafe(step.duration)) : 0;

// The virtual time at which a step began: every advance before it.
const timeAt = (steps: ReadonlyArray<Step>, at: number) =>
  steps.slice(0, Math.max(0, at)).reduce((t, s) => t + millisOf(s), 0);

// The lengths of runs of one sample step sent again and again.
const burstsOf = (steps: ReadonlyArray<Step>) => {
  const runs: Array<number> = [];

  for (const [n, s] of steps.entries())
    runs.push(s._tag === "send" && steps[n - 1] === s ? (runs.pop() ?? 0) + 1 : 1);

  return runs;
};

const band = (value: number, lo: number, hi: number) => value >= lo && value <= hi;

// The stress mixes, in percent, keyed as the run's tally names them.
const ANSWER_MIX = Object.fromEntries(profileTables.answers.stress);

const WRITE_MIX = Object.fromEntries(
  profileTables.writes.stress.map(([w, p]) => [`write ${w}`, p]),
);

const wordsOf = (run: Generated) => run.steps.flatMap((s) => (s._tag === "world" ? s.words : []));

const share = (part: number, whole: number) => (whole === 0 ? 0 : part / whole);

// The runs a profile's tests read, each of which must have run the app: a run with no evidence makes
// every mix below hold trivially, so it fails the whole file.
const runsOf = (profile: "usual" | "stress") => {
  const runs = samples.flatMap((sampled) =>
    SEEDS.map((seed) => generate(sampled, { drawing: profile, seed })),
  );

  expect(runs.filter((r) => r.run.evidence.length === 0).map((r) => r.run.trace.storyId)).toEqual(
    [],
  );

  return runs;
};

describe("generated runs: seeds (Testing O6)", () => {
  it("the same seed gives the same steps and the same printed Story; another seed gives others", () => {
    const one = generate(pay, { drawing: "stress", seed: 3 });
    const again = generate(pay, { drawing: "stress", seed: 3 });
    const other = generate(pay, { drawing: "stress", seed: 4 });

    expect(again.steps).toEqual(one.steps);
    expect(print(pay, "x", again.steps)).toBe(print(pay, "x", one.steps));
    expect(other.steps).not.toEqual(one.steps);
    expect(one.run.evidence.filter((e) => e._tag === "Turn").length).toBeGreaterThan(10);
  });
});

describe("generated runs: the usual profile", () => {
  const runs = runsOf("usual");
  const steps = runs.flatMap((r) => r.steps);
  const words = runs.flatMap(wordsOf);
  const calls = runs.flatMap((r) => r.run.end.calls);

  it("takes no reload, no disposal, and no lost or refused answer or write", () => {
    expect(
      steps.filter(
        (s) => s._tag === "reload" || s._tag === "disposeRuntime" || s._tag === "dispose",
      ),
    ).toEqual([]);
    expect(
      words.filter(
        (w) =>
          w._tag === "storage" || (w._tag === "wire" && (w.word === "drop" || w.word === "lose")),
      ),
    ).toEqual([]);
    expect(calls.filter((c) => c.status.startsWith("dropped"))).toEqual([]);
  });

  it("moves time by think times of 80 ms to 20 s, cut at answers, and the quiet phase's 2 minutes", () => {
    expect(steps.filter((s) => millisOf(s) > 20_000 && millisOf(s) !== 120_000)).toEqual([]);
    expect(steps.some((s) => millisOf(s) >= 80)).toBe(true);
  });

  it("holds each answer for a latency and draws at most 5% domain failures", () => {
    const failing = new Set(samples.flatMap((s) => s.failures));

    const failures = words.filter((w) => failing.has(w)).length;

    expect(
      share(calls.filter((c) => c.status === "answered" && c.step >= 0).length, calls.length),
    ).toBeGreaterThan(0.5);
    expect(0.05).toBeGreaterThanOrEqual(share(failures, calls.length));
  });
});

describe("generated runs: the stress profile", () => {
  const runs = runsOf("stress");
  const calls = runs.flatMap((r) => r.run.end.calls);
  const batches = runs.flatMap((r) => r.run.end.records.batches);

  it("has exactly one offline span of 5 to 120 s per run, in which every answer is lost or never comes", () => {
    const spans = runs.flatMap((r) => Option.toArray(r.offline));

    const late = runs.flatMap((r) =>
      Option.match(r.offline, {
        onNone: () => [],
        onSome: (o) =>
          r.run.end.calls.filter(
            (c) =>
              c.step >= o.fromStep && c.step < o.untilStep && c.status !== "dropped at request",
          ),
      }),
    );

    expect(spans).toHaveLength(runs.length);
    expect(spans.filter((o) => !(o.fromStep < o.untilStep && o.untilStep < Infinity))).toEqual([]);
    expect(spans.filter((o, n) => timeAt(runs[n]?.run.steps ?? [], o.untilStep) < o.until)).toEqual(
      [],
    );
    expect(spans.filter((o) => o.until - o.from < 5000 || o.until - o.from > 120_000)).toEqual([]);
    expect(late).toEqual([]);
  });

  it("reloads, disposes, and bursts 50 to 2,000 sends", () => {
    const steps = runs.flatMap((r) => r.steps);
    const bursts = runs.flatMap((r) => burstsOf(r.steps)).filter((n) => n >= 50);

    expect(steps.some((s) => s._tag === "reload")).toBe(true);
    expect(steps.some((s) => s._tag === "disposeRuntime")).toBe(true);
    expect(bursts.length).toBeGreaterThan(0);
    expect(bursts.filter((n) => n > 2000)).toEqual([]);
  });

  // Each distinct draw once: Arbitrary favours the ends of its range, so runs repeat a draw's digit,
  // and a repeated draw is one sample, not many.
  const draws = new Map(runs.flatMap((r) => [...r.tally]));
  const drawn = (kind: string) => [...draws.values()].filter((k) => k === kind).length;

  // The shares drawn that fall outside three standard errors of their mix, in percent.
  const offMix = (mix: Readonly<Record<string, number>>) => {
    const total = Object.keys(mix).reduce((n, k) => n + drawn(k), 0);

    return Object.entries(mix).flatMap(([k, p]) => {
      const got = (100 * drawn(k)) / total;
      const tolerance = 300 * Math.sqrt(((p / 100) * (1 - p / 100)) / total);

      return band(got, p - tolerance, p + tolerance) ? [] : [`${k}: ${got} not ${p} of ${total}`];
    });
  };

  it("draws each answer outside the offline span from its mix, within three standard errors", () => {
    expect(offMix(ANSWER_MIX)).toEqual([]);
  });

  it("draws each write from its mix, within three standard errors", () => {
    expect(offMix(WRITE_MIX)).toEqual([]);
    expect(
      share(batches.filter((b) => b.status === "refused").length, batches.length),
    ).toBeGreaterThan(0.05);
    expect(calls.filter((c) => c.status === "dropped at request").length).toBeGreaterThan(0);
  });
});
