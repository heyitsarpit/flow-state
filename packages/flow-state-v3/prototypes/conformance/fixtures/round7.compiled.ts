// Round 7's small machine, for the persistence edge. `A -Go-> B`, one reject write, and no reconcile: an unknown moves to `U`, and only
// `Retry` or `Forget` owns it. Pay reconciles; this does not, so a regressed record cannot heal itself (review M1). `Note` is plain memory.
import { Effect } from "effect";
import type { Api } from "../fake-world.ts";
import type { Fixture } from "../harness.ts";
import { fixtureOf, unknownWhenLost } from "./build.ts";

export const BareId = "Lab/Bare";
const b = fixtureOf(BareId);
export const bareFixture = (o: { persisted?: boolean } = {}): Fixture => ({
  id: BareId,
  make: (api: Api) => ({
    id: BareId,
    root: "root",
    default: "A",
    nodes: {
      root: {
        ...b.node("root", {
          Go: [{ target: "W", members: b.commit("charge", () => ({})) }],
          Retry: [{ members: b.member("charge", "retry", () => ({})) }],
          Forget: [{ target: "A", members: b.member("charge", "cancel", () => ({})) }],
          Note: [{ patch: ({ event }: any) => ({ note: event.text }) }],
          NoteBad: [{ patch: () => ({ note: 1n }) }],
          Ok: [{ target: "B", patch: ({ event }: any) => ({ last: event.value ?? null }) }],
          No: [{ target: "A" }],
          Unsure: [{ target: "U" }],
        }),
        default: "A",
      },
      A: b.node("A", {}),
      W: b.node("W", {}),
      B: b.node("B", {}),
      U: b.node("U", {}),
    },
    memory: b.memory(() => ({ note: "", last: null })),
    ops: {
      charge: {
        id: "charge",
        contract: "lab/charge",
        kind: "write",
        key: b.key("charge", () => ({})),
        concurrency: "reject",
        commit: (input, { attempt }) =>
          api
            .call("charge", input, { idempotencyKey: attempt.id })
            .pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
        outcomes: {
          success: {
            event: "Ok",
            from: b.slot("operations.charge.success", (v: any) => ({ value: v })),
          },
          failure: { NotSent: { event: "No" } },
          unknown: { event: "Unsure" },
        },
      },
    },
    persisted: o.persisted ?? true,
    uses: [],
  }),
});
