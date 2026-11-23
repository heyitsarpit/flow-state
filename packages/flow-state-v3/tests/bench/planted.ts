import { spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { Option } from "effect";
import { bench } from "../../bench/declare.ts";

// Planted benches for the bench's own limits: two healthy ones around a hang and a spinner, each
// with a two-second timeout, one that starts a tree of children and hangs, and a hang that only
// a signal or the cap can stop. The children are
// `sleep` with marker durations, so a test finds any that outlive the run.

const healthy = (name: string) =>
  bench({
    id: `turn.planted.${name}.per-turn-ms`,
    concern: "turn",
    tags: ["planted"],
    size: { n: 1, unit: "run" },
    quick: true,
    timeoutMs: Option.some(2000),
    load: async () => ({
      op: async () => ({ units: 1, counters: { runs: 1 }, sample: Option.none() }),
      proof: async () => Option.none(),
      shape: async () => ({}),
    }),
  });

const stuck = (name: string, op: () => Promise<never>, timeoutMs = 2000) =>
  bench({
    id: `turn.${name}.per-turn-ms`,
    concern: "turn",
    tags: ["planted"],
    size: { n: 1, unit: "run" },
    quick: true,
    timeoutMs: Option.some(timeoutMs),
    load: async () => ({ op, proof: async () => Option.none(), shape: async () => ({}) }),
  });

// Waits for an event nothing emits: never settles.
const forever = async () => {
  await once(new EventEmitter(), "never");

  throw new Error("unreachable");
};

// Never settles; its child keeps the process alive.
const hang = (marker: string) => () => {
  spawn("sleep", [marker], { stdio: "ignore" });

  return forever();
};

// Never yields the thread.
const spin = async () => {
  for (;;);
};

// A shell with two children of its own, then a hang.
const tree = () => {
  spawn("sh", ["-c", "sleep 3972.37 & sleep 3972.37 & wait"], { stdio: "ignore" });

  return forever();
};

/**
 * The planted benches, in the order one shared worker runs them.
 */
export const benches = [
  healthy("first"),
  stuck("planted.hang", hang("3971.37")),
  stuck("planted.spin", spin),
  healthy("last"),
  stuck("planted.tree", tree),
  stuck("held.signal", hang("3973.37"), 60_000),
];
