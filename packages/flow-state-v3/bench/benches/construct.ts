import { isDeepStrictEqual } from "node:util";
import { Option } from "effect";
import type { Manifest } from "../../fixtures/index.ts";
import { compiledOf, dataView, rebuilt } from "../../src/host/inspect.ts";
import type { Machine } from "../../src/index.ts";

// A machine's extent: its states, and its deepest state's depth.
const extentOf = (machine: Machine) => {
  const states = [...compiledOf(machine).states.values()];

  return { states: states.length, depth: Math.max(0, ...states.map((s) => s.depth)) };
};

const byId = (a: Machine, b: Machine) => compiledOf(a).id.localeCompare(compiledOf(b).id);

/**
 * The fixture machines the construction benches build, by shape: the one with the fewest states,
 * the one with the most, and the deepest (ties to the one with more states, then by id).
 */
export const constructed = (manifests: ReadonlyArray<Manifest>) => {
  const machines = [
    ...new Set(
      manifests.flatMap((m) =>
        Object.values(m.app.machines).map((entry) => ("machine" in entry ? entry.machine : entry)),
      ),
    ),
  ].toSorted(byId);

  const pick = (order: (a: Machine, b: Machine) => number) =>
    Option.fromUndefinedOr(machines.toSorted((a, b) => order(a, b) || byId(a, b))[0]);

  return [
    ["small", pick((a, b) => extentOf(a).states - extentOf(b).states)],
    ["wide", pick((a, b) => extentOf(b).states - extentOf(a).states)],
    [
      "deep",
      pick(
        (a, b) => extentOf(b).depth - extentOf(a).depth || extentOf(b).states - extentOf(a).states,
      ),
    ],
  ] as const;
};

/**
 * One construction of a fixture machine, from the definition and body it was built from: the
 * build alone is timed, and the proof checks it equals the fixture's own machine.
 */
export const constructSubject = async (machine: Machine) => ({
  op: async () => {
    const start = performance.now();
    rebuilt(machine);
    const ms = performance.now() - start;

    return { units: 1, counters: { builds: 1 }, sample: Option.some(ms) };
  },
  proof: async () =>
    isDeepStrictEqual(dataView(compiledOf(rebuilt(machine))), dataView(compiledOf(machine)))
      ? Option.none()
      : Option.some("a rebuilt machine's Compiled differs from its first build"),
  shape: async () => extentOf(machine),
});
