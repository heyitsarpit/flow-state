// Round 6's small machines. A box stands for a release: a scenario flips it between a kill and a boot, so the code that reads the
// disk is not the code that wrote it. Review H5, M8, M11.
import { Effect } from "effect";
import type { Api } from "../fake-world.ts";
import type { Fixture } from "../harness.ts";
import { fixtureOf, unknownWhenLost } from "./build.ts";

export type Release = { v: number };
const K = "Lab/KeyRelease";
const k = fixtureOf(K);
// H5: `charge`'s key is `{ k }` in release 1 and `{ key }` in release 2, as an innocent rename of a field would make it.
export const keyReleaseFixture = (rel: Release): Fixture => ({
  id: K,
  make: (api: Api) => ({
    id: K,
    root: "root",
    default: "root",
    nodes: {
      root: k.node("root", {
        Go: [{ members: k.commit("charge", ({ event }: any) => ({ k: event.k ?? "a" })) }],
        Idle: [
          {
            tokens: [{ op: "charge", verb: "idle", key: k.slot("Idle.key", () => ({ k: "a" })) }],
            patch: ({ memory }: any) => ({ idles: memory.idles + 1 }),
          },
        ],
        Ok: [{}],
        No: [{}],
        Unsure: [{ patch: ({ memory }: any) => ({ unsure: memory.unsure + 1 }) }],
      }),
    },
    memory: k.memory(() => ({ unsure: 0, idles: 0 })),
    ops: {
      charge: {
        id: "charge",
        contract: "lab/charge",
        kind: "write",
        key: k.key("charge", (i: any) => (rel.v === 1 ? { k: i.k } : { key: i.k })),
        concurrency: "reject",
        commit: (input, { attempt }) =>
          api
            .call("charge", input, { idempotencyKey: attempt.id })
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
});

const M = "Lab/MemoryRelease";
const m = fixtureOf(M);
// M8: release 2's `Ok` reads a field release 1 never stored. `decode`: what a Schema with a default would do.
export const memoryReleaseFixture = (rel: Release, decode: boolean): Fixture => ({
  id: M,
  make: (api: Api) => ({
    id: M,
    root: "root",
    default: "root",
    nodes: {
      root: m.node("root", {
        Go: [{ members: m.commit("put", () => ({})) }],
        Ok: [
          {
            patch: ({ memory }: any) =>
              rel.v === 1 ? { oks: memory.oks + 1 } : { oks: memory.extra.n + memory.oks + 1 },
          },
        ],
        No: [{}],
        Unsure: [
          {
            patch: ({ memory }: any) =>
              rel.v === 1 ? { oks: memory.oks } : { oks: memory.extra.n + memory.oks + 100 },
          },
        ],
      }),
    },
    memory: {
      initial: m.slot("memory.initial", () => ({ oks: 0 })),
      ...(decode
        ? {
            restore: m.slot("memory.restore", (s: any) => ({ extra: { n: 0 }, ...s })),
          }
        : {}),
    },
    ops: {
      put: {
        id: "put",
        contract: "lab/put",
        kind: "write",
        key: m.key("put", () => ({})),
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
});

const G = "Lab/Getter";
const g = fixtureOf(G);
// M11: a patch with a throwing getter: a lazy class instance, a Proxy.
export const getterFixture: Fixture = {
  id: G,
  make: () => ({
    id: G,
    root: "root",
    default: "root",
    nodes: {
      root: g.node("root", {
        Trap: [
          {
            patch: () =>
              Object.defineProperty({}, "x", {
                enumerable: true,
                get() {
                  throw new Error("lazy");
                },
              }),
          },
        ],
      }),
    },
    memory: g.memory(() => ({ x: 0 })),
    ops: {},
    persisted: true,
    uses: [],
  }),
};
