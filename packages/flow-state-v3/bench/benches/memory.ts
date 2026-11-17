import { Effect, Formatter, Option, Predicate } from "effect";
import type { Manifest } from "../../fixtures/index.ts";
import type { Runtime } from "../../src/index.ts";

type Setup = Manifest["setup"];

// A full collection: `global.gc` under Node's `--expose-gc`; none otherwise, and the proof fails.
const collector = () => {
  if (Predicate.hasProperty(globalThis, "gc") && Predicate.isFunction(globalThis.gc)) {
    const gc = globalThis.gc;

    return Option.some(() => gc());
  }

  return Option.none<() => void>();
};

const heapAfterCollect = (collect: () => void) => {
  collect();
  collect();

  return process.memoryUsage().heapUsed;
};

const COUNT = 1000;
const CYCLES = 10_000;

// The cycles between the two heap readings: the first tenth only warms the Runtime up.
const MEASURED = CYCLES - CYCLES / 10;

type Measure = "per-actor" | "after-dispose-actor" | "after-dispose-runtime" | "leak-per-cycle";

type Probe = Manifest["bench"]["probe"];

const boot = (setup: Setup) => {
  const runtime = setup.construct();
  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the bench is a host boundary: it boots a Runtime synchronously to measure its heap
  Effect.runSync(runtime.ready());

  return runtime;
};

// Ensures the probe's actors `from` to `from + count`, each its own identity, and returns their refs.
const fields = (runtime: Runtime, probe: Probe, from: number, count: number) =>
  Array.from({ length: count }, (_, n) => {
    const ref = probe(from + n);
    runtime.ensureActor(ref);

    return ref;
  });

// A Runtime filled with fields, each disposed, then the Runtime disposed: nothing of it is
// returned, so after this resolves only what the runtime itself keeps alive is reachable.
const fillAndDispose = (setup: Setup, probe: Probe) => {
  const runtime = boot(setup);
  const refs = fields(runtime, probe, 0, COUNT);

  for (const ref of refs) runtime.disposeActor(ref);
  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- as above
  Effect.runSync(runtime.dispose());
};

// Create and dispose one field at a time in one live Runtime; the heap's growth per cycle after a
// first tenth that warms it up.
const perCycle = (setup: Setup, probe: Probe, collect: () => void) => {
  const runtime = boot(setup);

  const cycle = (from: number, count: number) => {
    for (let n = 0; n < count; n += 1) {
      const [ref] = fields(runtime, probe, from + n, 1);

      if (ref !== undefined) runtime.disposeActor(ref);
    }
  };

  cycle(0, CYCLES - MEASURED);
  const early = heapAfterCollect(collect);
  cycle(CYCLES - MEASURED, MEASURED);
  const late = heapAfterCollect(collect);
  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- as above
  Effect.runSync(runtime.dispose());

  return { bytes: (late - early) / MEASURED, units: MEASURED };
};

// One heap measurement in bytes per unit, each taken between full collections.
// One heap measurement of a kind, in bytes per actor or per cycle, between full collections.
const measure = (setup: Setup, probe: Probe, kind: Measure, collect: () => void) => {
  if (kind === "leak-per-cycle") return perCycle(setup, probe, collect);

  if (kind === "after-dispose-runtime") {
    const empty = heapAfterCollect(collect);
    fillAndDispose(setup, probe);

    return { bytes: (heapAfterCollect(collect) - empty) / COUNT, units: COUNT };
  }

  const runtime = boot(setup);
  const before = heapAfterCollect(collect);
  const refs = fields(runtime, probe, 0, COUNT);
  const live = heapAfterCollect(collect);

  for (const ref of refs) runtime.disposeActor(ref);
  const after = heapAfterCollect(collect);
  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- as above
  Effect.runSync(runtime.dispose());

  return { bytes: ((kind === "per-actor" ? live : after) - before) / COUNT, units: COUNT };
};

/**
 * What a `memory` bench measures, in bytes per actor or per cycle: the heap a live actor holds,
 * what stays after its disposal, what stays after the Runtime's, and the heap's growth per create
 * and dispose cycle.
 */
export const MEASURES = [
  { kind: "per-actor", metric: "per-actor-bytes" },
  { kind: "after-dispose-actor", metric: "retained-per-actor-bytes" },
  { kind: "after-dispose-runtime", metric: "retained-after-runtime-bytes" },
  { kind: "leak-per-cycle", metric: "retained-per-cycle-bytes" },
] as const;

/**
 * A retained heap above this many bytes per create and dispose cycle is flagged as a leak.
 */
export const LEAK_BYTES = 64;

/**
 * The size a measure is taken over: `COUNT` actors, or the cycles after the warm-up tenth.
 */
export const measureSize = (kind: Measure) =>
  kind === "leak-per-cycle" ? { n: MEASURED, unit: "cycles" } : { n: COUNT, unit: "actors" };

/**
 * One heap measurement of a kind over the actors a manifest's probe names, in a Runtime of its
 * own setup; an operation fails with no collector.
 */
export const memorySubject = async (setup: Setup, probe: Probe, kind: Measure) => {
  const collect = collector();

  return {
    op: async () => {
      const gc = Option.getOrThrowWith(
        collect,
        () => new Error("no collector: run under --expose-gc"),
      );

      const done = measure(setup, probe, kind, gc);

      return { units: 1, counters: { actors: done.units }, sample: Option.some(done.bytes) };
    },
    // The probe names distinct actors, each lives once ensured and is gone once disposed.
    proof: async () => {
      const runtime = boot(setup);
      const refs = fields(runtime, probe, 0, 10);
      const live = refs.filter((ref) => Option.isSome(runtime.ensureActor(ref).getSnapshot()));
      const keys = new Set(refs.map((ref) => Formatter.format(ref.value)));

      for (const ref of refs) runtime.disposeActor(ref);
      // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- as above
      Effect.runSync(runtime.dispose());

      return keys.size === 10 && live.length === 10
        ? Option.none()
        : Option.some(`the probe named ${keys.size} distinct actors, ${live.length} of 10 live`);
    },
    shape: async () => ({ actors: measureSize(kind).n }),
  };
};
