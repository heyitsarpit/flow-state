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

const RM = "Lab/RowMove";
const rm = fixtureOf(RM);
// Stage J (re-check 10i S1): a row moves while its write is out. Each state handles the write's unknown its own way, so a restored ending
// that takes the handler of the state its owner sent from, or of any state the row is not in, is seen.
export const rowMoveFixture: Fixture = {
  id: RM,
  make: (api: Api) => ({
    id: RM,
    root: "root",
    default: "EDITING",
    nodes: {
      root: rm.node("root", { Ok: [{}], No: [{}] }),
      EDITING: rm.node("EDITING", {
        Go: [{ members: rm.commit("put", () => ({})), target: "SAVING" }],
        Unsure: [{ patch: ({ memory }: any) => ({ inEditing: memory.inEditing + 1 }) }],
      }),
      SAVING: rm.node("SAVING", {
        Review: [{ target: "REVIEW" }],
        Unsure: [{ patch: ({ memory }: any) => ({ inSaving: memory.inSaving + 1 }), target: "EDITING" }],
      }),
      REVIEW: rm.node("REVIEW", {
        Unsure: [{ patch: ({ memory }: any) => ({ inReview: memory.inReview + 1 }) }],
      }),
    },
    memory: rm.memory(() => ({ inEditing: 0, inSaving: 0, inReview: 0 })),
    ops: {
      put: {
        id: "put",
        contract: "lab/put",
        kind: "write",
        key: rm.key("put", () => ({})),
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

// D81's check: a machine on a sync engine, through the same fixture shapes. The feed carries pokes; the write's response says nothing.
const E = "Lab/Engine";
const e = fixtureOf(E);
export const engineRef = (id: string) => `Ticket|${id}`;
export const engineFixture: Fixture = {
  id: E,
  make: (api: Api) => ({
    id: E,
    root: "root",
    default: "ON",
    nodes: {
      root: e.node("root", {
        Rename: [
          {
            members: e.commit("rename", ({ event }: any) => ({ id: event.id, title: event.title })),
          },
        ],
        Done: [{}],
        No: [{}],
        Unsure: [{}],
      }),
      ON: {
        ...e.node("ON"),
        activities: [{ op: "changes", input: e.slot("states.ON.activities[0]", () => ({})) }],
      },
    },
    memory: e.memory(() => ({})),
    ops: {
      rename: {
        id: "rename",
        contract: "lab/rename",
        kind: "write",
        key: e.key("rename", (i: any) => ({ id: i.id, n: i.title })),
        concurrency: "reject",
        commit: (input, { attempt }) =>
          api
            .call("rename", input, { idempotencyKey: attempt.id })
            .pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
        outcomes: {
          success: { event: "Done" },
          failure: { NotSent: { event: "No" } },
          unknown: { event: "Unsure" },
        },
      },
    },
    streams: {
      changes: {
        id: "changes",
        listen: true,
        key: () => ({}),
        reconnect: true,
        idleMs: Infinity,
        healthyMs: 60_000,
        backoff: (n) => Math.min(30_000, 1000 * 2 ** n),
        subscribe: (i, { from }) => api.socket("changes", i, from),
        value: { event: "Done" },
        missed: { event: "Done" },
        failure: { event: "No" },
      },
    },
    persisted: false,
    uses: ["engine", "sessions"],
    domain: {
      writes: {
        rename: {
          predicts: e.slot("domain.rename.predicts", (i: any) => [
            { ref: engineRef(i.id), patch: { title: i.title } },
          ]),
        },
      },
      reads: {},
      repair: (ref) => api.call("pull", { ref }) as Effect.Effect<any, any, never>,
    },
  }),
};
