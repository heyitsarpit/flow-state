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
/**
 * Recorded cell pairs no run reaches now, each owed to an open Task that will reach it again:
 * owed, never dropped from the record. A pair here that a run
 * reaches again fails the gate, so the row is removed when its Task reaches it.
 */
export const CELL_PAIR_OWNERS = {
  "A BootSettles·Restoring·always > A BootSettles·Gone·always": {
    task: "@task.V3.T20",
    slice: 3,
    by: "a boot that restores a head and then finds nothing to keep, from T20's restore parts",
    date: "2026-11-15",
    why: "only PART-transfers-varied-3 reached it, through an ending born with no incarnation that was dropped; that ending is now owed and heard at the next start",
  },
} satisfies Readonly<Record<string, Owner & { readonly why: string }>>;

export const PAIR_OWNERS = {
  "du+sr": durability("sign-in: a refused batch in the disposal of an unstoppable write"),
} satisfies Readonly<Record<string, Owner>>;
