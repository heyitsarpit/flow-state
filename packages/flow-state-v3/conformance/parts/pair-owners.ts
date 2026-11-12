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
  "rt+sr": durability("transfers: a refused batch holding a retried write's record"),
  "un+sr": durability("transfers: a refused batch while a write's ending is unknown"),
  "lk+sr": durability("sync: a refused batch while a remote-head lookup is open"),
  "du+sr": durability("sign-in: a refused batch in the disposal of an unstoppable write"),
  "du+wa": durability("sign-in: an unstoppable write's record held by write-ahead"),
  "du+rl": durability("sign-in: a reload during the disposal of an unstoppable write"),
  "du+ma": {
    task: "@task.V3.T9",
    slice: 4,
    by: "sign-in with two actors, one disposed with an unstoppable write",
    date: "2026-11-12",
  },
} satisfies Readonly<Record<string, Owner>>;
