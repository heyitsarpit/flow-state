import { Effect, Option, Predicate } from "effect";
import { actorRef, type Runtime } from "../../src/index.ts";
import { bench } from "../declare.ts";

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

type Probe = "per-actor" | "after-dispose-actor" | "after-dispose-runtime" | "leak-per-cycle";

const boot = async () => {
  const { numberSetup } = await import("../../fixtures/number-input/app.ts");
  const runtime = numberSetup.construct();
  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the bench is a host boundary: it boots a Runtime synchronously to measure its heap
  Effect.runSync(runtime.ready());

  return runtime;
};

const fields = async (runtime: Runtime, from: number, count: number) => {
  const { StepperMachine } = await import("../../fixtures/number-input/machines/stepper.ts");

  return Array.from({ length: count }, (_, n) => {
    const ref = actorRef(StepperMachine, `field-${from + n}`);
    const actor = runtime.ensureActor(ref);
    actor.send({ _tag: "Set", value: n });

    return ref;
  });
};

// A Runtime filled with fields, each disposed, then the Runtime disposed: nothing of it is
// returned, so after this resolves only what the runtime itself keeps alive is reachable.
const fillAndDispose = async () => {
  const runtime = await boot();
  const refs = await fields(runtime, 0, COUNT);

  for (const ref of refs) runtime.disposeActor(ref);
  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- as above
  Effect.runSync(runtime.dispose());
};

// Create and dispose one field at a time in one live Runtime; the heap's growth per cycle after a
// first tenth that warms it up.
const perCycle = async (collect: () => void) => {
  const runtime = await boot();

  const cycle = async (from: number, count: number) => {
    for (let n = 0; n < count; n += 1) {
      const [ref] = await fields(runtime, from + n, 1);

      if (ref !== undefined) runtime.disposeActor(ref);
    }
  };

  await cycle(0, CYCLES - MEASURED);
  const early = heapAfterCollect(collect);
  await cycle(CYCLES - MEASURED, MEASURED);
  const late = heapAfterCollect(collect);
  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- as above
  Effect.runSync(runtime.dispose());

  return { bytes: (late - early) / MEASURED, units: MEASURED };
};

// One heap measurement in bytes per unit, each taken between full collections.
const measure = async (probe: Probe, collect: () => void) => {
  if (probe === "leak-per-cycle") return perCycle(collect);

  if (probe === "after-dispose-runtime") {
    const empty = heapAfterCollect(collect);
    await fillAndDispose();

    return { bytes: (heapAfterCollect(collect) - empty) / COUNT, units: COUNT };
  }

  const runtime = await boot();
  const before = heapAfterCollect(collect);
  const refs = await fields(runtime, 0, COUNT);
  const live = heapAfterCollect(collect);

  for (const ref of refs) runtime.disposeActor(ref);
  const after = heapAfterCollect(collect);
  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- as above
  Effect.runSync(runtime.dispose());

  return { bytes: ((probe === "per-actor" ? live : after) - before) / COUNT, units: COUNT };
};

const memorySubject = async (probe: Probe) => {
  const collect = collector();

  return {
    op: async () => {
      const done = await measure(
        probe,
        Option.getOrElse(collect, () => () => undefined),
      );

      return { units: 1, counters: { actors: done.units }, sample: Option.some(done.bytes) };
    },
    proof: async () =>
      Option.isNone(collect)
        ? Option.some("no collector: run under --expose-gc or on Bun")
        : Option.none(),
    shape: { actors: probe === "leak-per-cycle" ? CYCLES : COUNT },
  };
};

// A retained heap above this many bytes per create and dispose cycle is flagged as a leak.
const LEAK_BYTES = 64;

/**
 * Every `memory` bench, in bytes and each run alone under a full collector: the heap one field
 * actor holds, what stays after its disposal and after the Runtime's, and the heap's growth per
 * create and dispose cycle over 10,000 cycles, flagged over 64 bytes a cycle.
 */
export const memoryBenches = (
  [
    ["per-actor", "per-actor-bytes", Option.none()],
    ["after-dispose-actor", "retained-per-actor-bytes", Option.none()],
    ["after-dispose-runtime", "retained-after-runtime-bytes", Option.none()],
    ["leak-per-cycle", "retained-per-cycle-bytes", Option.some(LEAK_BYTES)],
  ] as const
).map(([probe, metric, budget]) =>
  bench({
    id: `memory.number-input.${metric}`,
    concern: "memory",
    tags: ["heap", probe],
    size:
      probe === "leak-per-cycle" ? { n: MEASURED, unit: "cycles" } : { n: COUNT, unit: "actors" },
    measure: "bytes",
    headline: ["median"],
    budget,
    gc: true,
    workers: 3,
    runs: probe === "leak-per-cycle" ? 3 : 10,
    load: () => memorySubject(probe),
  }),
);
