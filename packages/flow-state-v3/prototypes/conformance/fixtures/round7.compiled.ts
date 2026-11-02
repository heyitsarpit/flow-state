// Round 7's small machine, for the persistence edge. `A -Go-> B`, one reject write, and no reconcile: an unknown moves to `U`, and only
// `Retry` or `Forget` owns it. Pay reconciles; this does not, so a regressed record cannot heal itself (review M1). `Note` is plain memory.
import { Effect } from "effect";
import type { Api } from "../fake-world.ts";
import type { Fixture } from "../harness.ts";
import { deny } from "./compiled.ts";
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
          GoBad: [{ target: "W", members: b.commit("charge", () => ({ big: 1n })) }],
          Retry: [{ members: b.member("charge", "retry", () => ({})) }],
          Forget: [{ target: "A", members: b.member("charge", "cancel", () => ({})) }],
          Note: [{ patch: ({ event }: any) => ({ note: event.text, noteCopy: event.text }) }],
          // Oracle (d) of SEARCH-FLUSH: `note` and `noteCopy` change only together, so a guard that sees them differ saw two turns.
          Peek: [
            {
              guards: [({ memory }: any) => memory.note === memory.noteCopy || deny("Mixed")],
              patch: ({ memory }: any) => ({ peeks: memory.peeks + 1 }),
            },
            {},
          ],
          NoteBad: [{ patch: () => ({ note: 1n }) }],
          // Review M11: a class instance with a throwing own getter, from a patch.
          NoteGetter: [
            {
              patch: () =>
                Object.defineProperty(new (class Odd {})(), "note", {
                  enumerable: true,
                  get() {
                    throw new Error("a getter");
                  },
                }),
            },
          ],
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
    memory: b.memory(() => ({ note: "", noteCopy: "", peeks: 0, last: null })),
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

// The same for a fragment: a trait with a write and a pair, resumable, on a persisted host that can leave it.
export const FragPairId = "Lab/FragPair";
const h = fixtureOf(FragPairId);
const t = fixtureOf("PairTrait");
export const fragPairFixture: Fixture = {
  id: FragPairId,
  make: (api: Api) => ({
    id: FragPairId,
    root: "root",
    default: "TAB",
    fragments: {
      PairTrait: {
        id: "PairTrait",
        root: "root",
        default: "root",
        nodes: {
          root: t.node("root", {
            Set: [{ patch: ({ event }: any) => ({ a: event.n, b: event.n }) }],
            Peek: [
              {
                guards: [({ memory }: any) => memory.a === memory.b || deny("Mixed")],
                patch: ({ memory }: any) => ({ peeks: memory.peeks + 1 }),
              },
              {},
            ],
            Go: [{ members: t.commit("put", () => ({})) }],
            Retry: [{ members: t.member("put", "retry", () => ({})) }],
            Forget: [{ members: t.member("put", "cancel", () => ({})) }],
            Ok: [{}],
            No: [{}],
            Unsure: [{}],
          }),
        },
        memory: t.memory(() => ({ a: 0, b: 0, peeks: 0 })),
      },
    },
    nodes: {
      root: h.node("root", { Away: [{ target: "AWAY" }], Back: [{ target: "TAB" }] }),
      TAB: { ...h.node("TAB"), placements: [{ name: "t", fragment: "PairTrait", resumable: true }] },
      AWAY: h.node("AWAY"),
    },
    memory: h.memory(() => ({})),
    ops: {
      put: {
        id: "put",
        contract: "lab/put",
        kind: "write",
        fragment: "PairTrait",
        key: t.key("put", () => ({})),
        concurrency: "reject",
        commit: (input, { attempt }) =>
          api
            .call("put", input, { idempotencyKey: attempt.id })
            .pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
        outcomes: {
          success: { event: "Ok" },
          failure: { NotSent: { event: "No" } },
          unknown: { event: "Unsure" },
        },
      },
    },
    persisted: true,
    uses: [],
  }),
};
