import type { Owner } from "./pairs.ts";

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
  "A BootSettles·Restoring·queued > A BootSettles·Gone·always": {
    task: "@task.V3.T20",
    slice: 3,
    by: "a boot that restores a head and then finds nothing to keep, from T20's restore parts",
    date: "2026-11-15",
    why: "only PART-transfers-varied-3 reached it, through an ending born with no incarnation that was dropped; that ending is now owed and heard at the next start",
  },
  "C Parked·Owed·always > C Opens·Parked·always": {
    task: "@task.V3.T20",
    slice: 3,
    by: "an ending in the mail at disposeActor, then an adopting ensure, from T20's restore parts",
    date: "2026-11-15",
    why: "gate scripts reached it only through a boot that parked its restores; a boot parks nothing now (Actors I40), and no gate script parks a row at disposeActor before an adoption",
  },
} satisfies Readonly<Record<string, Owner & { readonly why: string }>>;

export const PAIR_OWNERS = {} satisfies Readonly<Record<string, Owner>>;
