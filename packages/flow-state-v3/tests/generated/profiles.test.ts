import { Predicate } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { generate, print, type Generated, type Step } from "../../src/host/testing/index.ts";
import { samples } from "./fixtures.ts";

const SEEDS = Array.from({ length: 20 }, (_, n) => n + 1);

const millisOf = (step: Step) =>
  step._tag === "advance" && Predicate.isString(step.duration)
    ? Number.parseInt(step.duration, 10)
    : 0;

const wordsOf = (run: Generated) => run.steps.flatMap((s) => (s._tag === "world" ? s.words : []));

const share = (part: number, whole: number) => (whole === 0 ? 0 : part / whole);

// The runs a profile's tests read, each of which must have run the app: a run with no evidence makes
// every mix below hold trivially, so it fails the whole file.
const runsOf = (profile: "usual" | "stress") => {
  const runs = [samples.pay, samples["command-palette"], samples.transfers].flatMap((sampled) =>
    SEEDS.map((seed) => generate(sampled, { drawing: profile, seed })),
  );

  expect(runs.filter((r) => r.run.evidence.length === 0).map((r) => r.run.trace.storyId)).toEqual(
    [],
  );

  return runs;
};

describe("generated runs: seeds (Testing O6)", () => {
  it("the same seed gives the same steps and the same printed Story; another seed gives others", () => {
    const one = generate(samples.pay, { drawing: "stress", seed: 3 });
    const again = generate(samples.pay, { drawing: "stress", seed: 3 });
    const other = generate(samples.pay, { drawing: "stress", seed: 4 });

    expect(again.steps).toEqual(one.steps);
    expect(print(samples.pay, "x", again.steps)).toBe(print(samples.pay, "x", one.steps));
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
    const failing = new Set(
      [samples.pay, samples["command-palette"], samples.transfers].flatMap((s) => s.failures),
    );

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

  it("has exactly one offline span per run, and gaps of 0 to 20 ms otherwise", () => {
    for (const run of runs) {
      const long = run.steps.filter((s) => millisOf(s) > 20 && millisOf(s) !== 120_000);

      expect(120_000).toBeGreaterThanOrEqual(long.reduce((sum, s) => sum + millisOf(s), 0));
    }

    expect(
      runs.filter((r) => r.steps.some((s) => millisOf(s) >= 5000 && millisOf(s) !== 120_000))
        .length,
    ).toBeGreaterThan(runs.length / 2);
  });

  it("reloads, disposes and bursts", () => {
    const steps = runs.flatMap((r) => r.steps);

    expect(steps.some((s) => s._tag === "reload")).toBe(true);
    expect(steps.some((s) => s._tag === "disposeRuntime")).toBe(true);
    expect(
      runs.some((r) =>
        r.steps.some((s, n) => s._tag === "send" && r.steps[n + 1] === s && r.steps[n + 2] === s),
      ),
    ).toBe(true);
  });

  it("draws answers per request near the catalogue's mix: about a third answered at once, lost and held ones in between", () => {
    const status = (prefix: string) =>
      share(calls.filter((c) => c.status.startsWith(prefix)).length, calls.length);

    expect(status("dropped at request")).toBeGreaterThan(0.05);
    expect(0.3).toBeGreaterThan(status("dropped at request"));
    expect(status("dropped at response")).toBeGreaterThan(0.05);
    expect(0.3).toBeGreaterThan(status("dropped at response"));
  });

  it("draws writes per batch near the catalogue's mix: most land, about one in seven is refused", () => {
    const refused = share(batches.filter((b) => b.status === "refused").length, batches.length);

    expect(refused).toBeGreaterThan(0.05);
    expect(0.3).toBeGreaterThan(refused);
    expect(
      share(batches.filter((b) => b.status === "landed").length, batches.length),
    ).toBeGreaterThan(0.5);
  });
});
