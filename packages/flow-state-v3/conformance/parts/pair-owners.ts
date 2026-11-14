import type { Owner } from "./pairs.ts";

const durability = (by: string) =>
  ({
    task: "@task.V3.T19",
    slice: 2,
    by,
    date: "2026-11-12",
  }) satisfies Owner;

/**
 * The dated owners of interacting pairs no gate script reaches yet (Conformance R18): an open
 * Task of a slice not yet past and the part, operation or pair sweep that will reach the pair.
 * Decided (the orchestrator's ruling, 2026-11-12): the storage pairs go to slice 2, which builds
 * `wa`, `sr` and `rl` in full; the disposal with several actors to slice 4's actor identity.
 */
export const PAIR_OWNERS = {
  "du+sr": durability("sign-in: a refused batch in the disposal of an unstoppable write"),
} satisfies Readonly<Record<string, Owner>>;
