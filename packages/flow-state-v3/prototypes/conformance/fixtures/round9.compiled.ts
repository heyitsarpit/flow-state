// Round 9's small machines. A bulk write, one lane per row (review's H1). `.each` rows that each ask once at entry. A write whose mapper reads its input (M1). A deadline whose handler can throw, a raise with no name (M2). A queue over a local source: an ending-driven chain that is a correct program. Keys that are bigints (M5).
import { Effect } from "effect";
import type { Api } from "../fake-world.ts";
import type { Fixture } from "../harness.ts";
import type { Fragment } from "./compiled.ts";
import { fixtureOf, unknownWhenLost } from "./build.ts";

export const BulkId = "Lab/Bulk";
const b = fixtureOf(BulkId);
const r = fixtureOf("Row");
const Row: Fragment = {
  id: "Row",
  root: "root",
  default: "L",
  nodes: {
    root: r.node("root", {
      Ask: [{ members: r.lookup("rowRead", ({ key }: any) => ({ id: key })) }],
      Got: [{ target: "D" }],
      GotNo: [{ target: "D" }],
    }),
    L: r.node("L", {}, [{ id: "ask", send: "Ask", schedule: { ms: 0 }, armOn: ["entry"], disarmOn: [] }]),
    D: r.node("D", {}),
  },
  memory: { initial: r.slot("memory.initial", () => ({})) },
};
export const bulkFixture: Fixture = {
  id: BulkId,
  make: (api: Api) => ({
    id: BulkId,
    root: "root",
    default: "A",
    fragments: { Row },
    nodes: {
      root: {
        ...b.node("root", {
          Del: [{ patch: ({ memory, event }: any) => ({ deleting: [...memory.deleting, event.id] }), members: b.commit("del", ({ event }: any) => ({ id: event.id })) }],
          DelOk: [{ patch: ({ memory, event }: any) => ({ deleting: memory.deleting.filter((x: string) => x !== event.id), done: memory.done + 1 }) }],
          DelNo: [{ patch: ({ memory, event }: any) => ({ deleting: memory.deleting.filter((x: string) => x !== event.id) }) }],
          DelUnsure: [{}],
          Rows: [{ patch: ({ event }: any) => ({ ids: event.ids }) }],
          Next: [{ patch: ({ event }: any) => ({ queue: event.queue }), members: b.commit("local", () => ({})) }],
          LocalOk: [{ patch: ({ memory }: any) => ({ queue: memory.queue - 1, ran: memory.ran + 1 }) }, ],
          LocalNo: [{}],
          LocalUnsure: [{}],
          // A queue that asks from its own ending, over a source with no I/O.
          Drain: [{ patch: ({ memory, event }: any) => ({ queue: event.queue, ran: memory.ran }), members: b.lookup("localRead", () => ({})) }],
          Drained: [
            { guards: [({ memory }: any) => memory.queue <= 1 || ({ deny: "more" })], patch: ({ memory }: any) => ({ queue: 0, ran: memory.ran + 1 }) },
            { patch: ({ memory }: any) => ({ queue: memory.queue - 1, ran: memory.ran + 1 }), members: b.lookup("localRead", () => ({})) },
          ],
          DrainNo: [{}],
        }),
        placements: [{ name: "row", fragment: "Row", each: { of: "ids", max: 2000 } }],
      },
      A: b.node("A", {}),
    },
    memory: b.memory(() => ({ deleting: [], done: 0, ids: [], queue: 0, ran: 0 })),
    ops: {
      del: {
        id: "del",
        contract: "lab/del",
        kind: "write",
        key: b.key("del", (i: any) => ({ id: i.id })),
        concurrency: "reject",
        commit: (input, { attempt }) => api.call("del", input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
        outcomes: {
          success: { event: "DelOk", from: b.slot("operations.del.success", (_v: any, c: any) => ({ id: c.input.id })) },
          failure: { NotSent: { event: "DelNo", from: b.slot("operations.del.NotSent", (_v: any, c: any) => ({ id: c.input.id })) } },
          unknown: { event: "DelUnsure" },
        },
      },
      local: {
        id: "local",
        contract: "lab/local",
        kind: "write",
        key: b.key("local", () => ({})),
        concurrency: "reject",
        commit: () => Effect.succeed({}),
        outcomes: { success: { event: "LocalOk" }, failure: { NotSent: { event: "LocalNo" } }, unknown: { event: "LocalUnsure" } },
      },
      localRead: {
        id: "localRead",
        contract: "lab/localRead",
        kind: "read",
        key: b.key("localRead", () => ({})),
        concurrency: "reject",
        commit: () => Effect.succeed({}),
        outcomes: { success: { event: "Drained" }, failure: { NoResponse: { event: "DrainNo" }, Defect: { event: "DrainNo" }, Interrupted: { event: "DrainNo" } } },
      },
      rowRead: {
        id: "rowRead",
        contract: "lab/rowRead",
        fragment: "Row",
        kind: "read",
        key: b.key("rowRead", () => ({})),
        concurrency: "reject",
        commit: (i) => api.call("rowRead", i) as Effect.Effect<unknown, unknown>,
        outcomes: { success: { event: "Got" }, failure: { NoResponse: { event: "GotNo" }, Defect: { event: "GotNo" }, Interrupted: { event: "GotNo" } } },
      },
    },
    persisted: false,
    uses: [],
  }),
};

// Everything a turn can be unable to accept, in one machine.
export const KeptId = "Lab/Kept";
const k = fixtureOf(KeptId);
const heal = () => (globalThis as any).__healed === true;
const kid = fixtureOf("Kid");
const Kid: Fragment = {
  id: "Kid",
  root: "root",
  default: "root",
  nodes: {
    root: kid.node("root", {
      Save: [{ members: kid.commit("kidSave", () => ({ id: "k", at: new Set() })) }],
      KidNo: [{ patch: ({ event }: any) => ({ heard: event.why }) }],
      KidOk: [{}],
      KidUnsure: [{}],
      Set: [{ patch: ({ event }: any) => ({ got: event.v ?? "set" }) }],
    }),
  },
  memory: { initial: kid.slot("memory.initial", () => ({ heard: null, got: null })) },
};
export const keptFixture = (o: { persisted?: boolean } = {}): Fixture => ({
  id: KeptId,
  make: (api: Api) => ({
    id: KeptId,
    root: "root",
    default: "A",
    fragments: { Kid },
    nodes: {
      root: {
        ...k.node("root", {
          // M1: a commit whose input has no carried form, and a mapper that reads it.
          Go: [{ target: "W", members: k.commit("save", ({ event }: any) => ({ id: event.id ?? "a", at: event.at ?? "fine" })) }],
          Saved: [{ target: "B", patch: ({ event }: any) => { if (event.v === "boom" && !heal()) throw new Error("this value"); return { last: "delivered" }; } }],
          SaveNo: [{ target: "A", patch: ({ event }: any) => ({ last: `no:${event.id}:${event.why}` }) }],
          SaveUnsure: [{ target: "A" }],
          IfIdle: [{ tokens: [{ op: "save", verb: "idle", key: k.slot("on.IfIdle[0].guard[0]", () => ({ id: "a" })) }], patch: ({ memory }: any) => ({ presses: memory.presses + 1 }) }, {}],
          Forget: [{ members: k.member("save", "cancel", () => ({ id: "a" })) }],
          // M2: a deadline, and its handler can throw.
          Arm: [{ target: "T" }],
          GiveUp: [{ target: "A", patch: () => { if (!heal()) throw new Error("this deadline"); return { gaveUp: true }; } }],
          Leave: [{ target: "A" }],
          Note: [{ patch: ({ event }: any) => ({ note: event.text }) }],
          // M2: a raise with no name.
          RaiseBad: [{ patch: () => ({ raised: true }), raises: [{ to: "c", key: k.slot("on.RaiseBad.raises[0]", ({ event }: any) => event.v), event: "Set" }] }],
          // A refused turn takes its commands with it.
          LookBoom: [{ members: k.lookup("look", () => ({})), followUps: [() => { throw new Error("after the member"); }] }],
          Looked: [{}],
          LookNo: [{}],
          // Names (D119).
          GoKey: [{ members: k.commit("keyed", ({ event }: any) => ({ o: event.o })) }],
          KeyedOk: [{}],
          KeyedNo: [{}],
          KeyedUnsure: [{}],
          IfKeyIdle: [{ tokens: [{ op: "keyed", verb: "idle", key: k.slot("on.IfKeyIdle[0].guard[0]", ({ event }: any) => ({ o: BigInt(event.o) })) }], patch: ({ memory }: any) => ({ presses: memory.presses + 1 }) }, {}],
          Who: [{ patch: ({ event }: any) => ({ who: event.who }) }],
          WhoOdd: [{ patch: ({ event }: any) => ({ whoOdd: event.n }) }],
        }),
        placements: [
          { name: "c", fragment: "Kid", each: { of: "ids", max: 4 } },
          { name: "s", fragment: "Kid", resetOn: k.slot("traits.s.resetOn", ({ memory }: any) => BigInt(memory.who)) },
          { name: "z", fragment: "Kid", resetOn: k.slot("traits.z.resetOn", ({ memory }: any) => (memory.whoOdd === undefined ? "same" : new Set([memory.whoOdd]))) },
        ],
      },
      A: k.node("A", {}),
      W: k.node("W", {}),
      B: k.node("B", {}),
      T: k.node("T", {}, [{ id: "t", send: "GiveUp", schedule: { ms: 1000 }, armOn: ["entry"], disarmOn: [] }]),
    },
    memory: k.memory(() => ({ presses: 0, ids: ["x"], who: "1" })),
    ops: {
      save: {
        id: "save",
        contract: "lab/save",
        kind: "write",
        key: k.key("save", (i: any) => ({ id: i.id })),
        concurrency: "reject",
        commit: (input, { attempt }) => api.call("save", input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
        outcomes: {
          success: { event: "Saved", from: k.slot("operations.save.success", (v: any) => ({ v: v?.v })) },
          failure: { NotSent: { event: "SaveNo", from: k.slot("operations.save.NotSent", (v: any, c: any) => ({ id: c.input.id, why: v?.why })) } },
          unknown: { event: "SaveUnsure" },
        },
      },
      look: {
        id: "look",
        contract: "lab/look",
        kind: "read",
        key: k.key("look", () => ({})),
        concurrency: "reject",
        commit: (i) => api.call("look", i) as Effect.Effect<unknown, unknown>,
        outcomes: { success: { event: "Looked" }, failure: { NoResponse: { event: "LookNo" }, Defect: { event: "LookNo" }, Interrupted: { event: "LookNo" } } },
      },
      keyed: {
        id: "keyed",
        contract: "lab/keyed",
        kind: "write",
        key: k.key("keyed", (i: any) => ({ o: BigInt(i.o) })),
        concurrency: "reject",
        commit: (input, { attempt }) => api.call("keyed", input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
        outcomes: { success: { event: "KeyedOk" }, failure: { NotSent: { event: "KeyedNo" } }, unknown: { event: "KeyedUnsure" } },
      },
      kidSave: {
        id: "kidSave",
        contract: "lab/kidSave",
        fragment: "Kid",
        kind: "write",
        key: k.key("kidSave", (i: any) => ({ id: i.id })),
        concurrency: "reject",
        commit: (input, { attempt }) => api.call("kidSave", input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
        outcomes: {
          success: { event: "KidOk" },
          failure: { NotSent: { event: "KidNo", from: k.slot("operations.kidSave.NotSent", (v: any) => ({ why: v?.why })) } },
          unknown: { event: "KidUnsure" },
        },
      },
    },
    persisted: o.persisted ?? true,
    uses: [],
  }),
});
