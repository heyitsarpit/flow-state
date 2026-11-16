import { describe, expect, it } from "vite-plus/test";
import { pendingOwners } from "./serve.ts";
import { type Lane, Phase } from "./world.ts";

const actor = { machine: "Test/Shelf", name: "s" };

// RETURN_TYPE: a non-Idle lane as the World holds it.
const lane = (phase: Phase, owner: number, queued: ReadonlyArray<number>): Lane => ({
  actor,
  operation: "save",
  head: { id: "att-1", input: {}, retryCount: 0, owner, phase },
  queue: queued.map((q) => ({ input: {}, owner: q })),
});

describe("pending work a late turn may not leave (Turn R21, I27)", () => {
  it("Turn R21: an InFlight head and every queued commit, behind a Held head too, own pending work; a Held head does not", () => {
    const lanes = [lane(Phase.Unsent(), 3, [4]), lane(Phase.Held(), 5, [6, 7])];

    expect([...pendingOwners(lanes, actor)].toSorted((a, b) => a - b)).toEqual([3, 4, 6, 7]);
    expect([...pendingOwners(lanes, { ...actor, name: "other" })]).toEqual([]);
  });
});
