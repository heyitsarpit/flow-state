// Phase 1 area H (round 13's M2, `unstamped-*`): a hand key closure (no fields to stamp, a seam), whose release 2 moves one lane onto a name another
// lane keeps. Release 1 keys `{ k }` when no region is given and `{ k, region }` otherwise; release 2 keys `{ k, region }`, `eu` by default.
import { Effect } from "effect";
import type { Api } from "../fake-world.ts";
import type { Fixture } from "../harness.ts";
import { fixtureOf, unknownWhenLost } from "./build.ts";
import type { Release } from "./round6.compiled.ts";

export const KeyCollideId = "Lab/KeyCollide";
const k = fixtureOf(KeyCollideId);
export const keyCollideFixture = (rel: Release): Fixture => ({
  id: KeyCollideId,
  make: (api: Api) => ({
    id: KeyCollideId,
    root: "root",
    default: "root",
    nodes: {
      root: k.node("root", {
        Go: [{ members: k.commit("charge", ({ event }: any) => ({ k: event.k, ...(event.region === undefined ? {} : { region: event.region }) })) }],
        Ok: [{}],
        No: [{}],
        Unsure: [{ patch: ({ memory }: any) => ({ unsure: memory.unsure + 1 }) }],
      }),
    },
    memory: k.memory(() => ({ unsure: 0 })),
    ops: {
      charge: {
        id: "charge",
        contract: "lab/collide",
        kind: "write",
        key: k.key("charge", (i: any) => (rel.v === 1 ? (i.region === undefined ? { k: i.k } : { k: i.k, region: i.region }) : { k: i.k, region: i.region ?? "eu" })),
        concurrency: "reject",
        commit: (input, { attempt }) => api.call("charge", input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
        outcomes: { success: { event: "Ok" }, failure: { NotSent: { event: "No" } }, unknown: { event: "Unsure" } },
      },
    },
    persisted: true,
    uses: [],
  }),
});
