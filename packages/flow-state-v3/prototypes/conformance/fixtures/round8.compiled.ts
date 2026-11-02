// Round 8's small machines. The bare write with `serialize`, so a commit can queue behind a ticket (H1). Three doors for a value that cannot encode (D100). Copies under `.each`, each with a
// read, for what a repeated id would do (D99). A business key beside the Attempt's own, for a wiped origin (D106).
import { Effect } from "effect";
import type { Api } from "../fake-world.ts";
import type { Fixture } from "../harness.ts";
import type { Compiled, Fragment } from "./compiled.ts";
import { fixtureOf, unknownWhenLost } from "./build.ts";
import { bareFixture, BareId } from "./round7.compiled.ts";

const b = fixtureOf(BareId);
const withOn = (m: Compiled, on: Compiled["nodes"][string]["on"]): Compiled => ({
  ...m,
  nodes: { ...m.nodes, root: { ...m.nodes["root"]!, on: { ...m.nodes["root"]!.on, ...on } } },
});
export const serialBareFixture = (): Fixture => ({
  id: BareId,
  make: (api: Api) => {
    const m = withOn(bareFixture().make(api), b.on("", {
      // A follow-up: one send, two turns in one drain. A fatal in the second leaves mail and a pending batch (D98).
      Two: [{ patch: () => ({ note: "two", noteCopy: "two" }), followUps: [() => ({ tag: "Note", payload: { text: "after" } })] }],
      NoteMap: [{ patch: () => ({ note: new Map() }) }],
      // Key-less idle (rule 21), so a quarantined lane's hold is read with no key (D88).
      IfIdleK: [{ tokens: [{ op: "charge", verb: "idle" }], patch: ({ memory }: any) => ({ peeks: memory.peeks + 1 }) }, {}],
      Arm: [{ target: "T" }],
      ArmFar: [{ target: "TF" }],
      Fired: [{ target: "A", patch: ({ memory }: any) => ({ fired: (memory.fired ?? 0) + 1 }) }],
    }));
    return {
      ...m,
      nodes: {
        ...m.nodes,
        T: b.node("T", {}, [{ id: "t", send: "Fired", schedule: { ms: 1000 }, armOn: ["entry"], disarmOn: [] }]),
        TF: b.node("TF", {}, [{ id: "f", send: "Fired", schedule: b.slot("states.TF.schedule", () => 3_000_000_000), armOn: ["entry"], disarmOn: [] }]),
      },
      // Round 9: a mapper a search can make throw. It reads the input, as a real one does.
      ops: {
        charge: {
          ...m.ops["charge"]!,
          concurrency: "serialize",
          outcomes: {
            ...m.ops["charge"]!.outcomes,
            failure: { NotSent: { event: "No", from: b.slot("operations.charge.NotSent", (v: any, c: any) => ({ why: v?.why, who: c.input?.who })) } },
          },
        },
      },
    };
  },
});
// A business key (RESULTS' rule for money): the server recognises the second try whatever the client forgot.
export const businessKeyFixture = (): Fixture => ({
  id: BareId,
  make: (api: Api) => {
    const m = bareFixture().make(api);
    return {
      ...m,
      ops: {
        charge: {
          ...m.ops["charge"]!,
          commit: (input: unknown) =>
            api.call("charge", input, { idempotencyKey: "business:charge:a" }).pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
        },
      },
    };
  },
});

export const DoorsId = "Lab/Doors";
const d = fixtureOf(DoorsId);
const badKey = ({ event }: any) => ({ k: event.v });
export const doorsFixture: Fixture = {
  id: DoorsId,
  make: (api: Api) => ({
    id: DoorsId,
    root: "root",
    default: "A",
    nodes: {
      root: d.node("root", {
        Go: [{ target: "W", members: d.commit("charge", () => ({})) }],
        // A success's alternatives: the first asks about a key the server's value cannot make.
        Done: [
          { target: "B", tokens: [{ op: "other", verb: "idle", key: d.slot("on.Done[0].guard[0]", badKey) }] },
          { target: "C" },
        ],
        OnlyKeyed: [{ target: "B", tokens: [{ op: "other", verb: "idle", key: d.slot("on.OnlyKeyed[0].guard[0]", badKey) }] }],
        Failed: [{ target: "A" }],
        Unsure: [{ target: "A" }],
        Look: [{ patch: () => ({ looked: true }), members: d.lookup("read", ({ event }: any) => ({ v: event.v })) }],
        LookKeyBad: [{ members: d.lookup("readKey", () => ({ v: "fine" })) }],
        Looked: [{ patch: ({ event }: any) => ({ last: event.value ?? "ok" }) }],
        LookFailed: [{ patch: () => ({ last: "failed" }) }],
        CancelBad: [{ patch: () => ({ cancels: 1 }), members: d.member("other", "cancel", badKey) }],
        RetryBad: [{ patch: () => ({ retries: 1 }), members: d.member("other", "retry", badKey) }],
        GoOther: [{ members: d.commit("other", ({ event }: any) => ({ k: event.v })) }],
        // A success whose handler throws on this value: the turn refuses, twice. The server did it.
        GoBoom: [{ target: "W", members: d.commit("boom", () => ({})) }],
        BoomDone: [{ target: "B", patch: ({ event }: any) => { if (event.v === "boom" && !(globalThis as any).__healed) throw new Error("this value"); return { last: "delivered" }; } }],
        BoomNo: [{ target: "A" }],
        BoomUnsure: [{ target: "A" }],
        ReadBoom: [{ members: d.lookup("readBoom", () => ({ v: "x" })) }],
        ReadBoomed: [{ patch: () => { throw new Error("this value"); } }],
        ReadBoomFailed: [{}],
        // The spin: a failure with no I/O, and a handler that asks again.
        LoopLook: [{ members: d.lookup("readLoop", () => ({ v: 1n })) }],
        LoopFailed: [{ patch: ({ memory }: any) => ({ loops: (memory.loops ?? 0) + 1 }), members: d.lookup("readLoop", () => ({ v: 1n })) }],
        Looped: [{}],
        // And a good lookup after it, for what the budget lets through later.
        LoopGood: [{ members: d.lookup("readLoop", () => ({ v: "fine" })) }],
        OtherOk: [{}],
        OtherNo: [{}],
        OtherUnsure: [{}],
      }),
      A: d.node("A", {}),
      W: d.node("W", {}),
      B: d.node("B", {}),
      C: d.node("C", {}),
    },
    memory: d.memory(() => ({ looked: false, last: null, cancels: 0, retries: 0 })),
    ops: {
      charge: {
        id: "charge",
        contract: "lab/charge",
        kind: "write",
        key: d.key("charge", () => ({})),
        concurrency: "reject",
        commit: (input, { attempt }) => api.call("charge", input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
        outcomes: {
          success: { event: "Done", from: d.slot("operations.charge.success", (v: any) => ({ v: v?.v })) },
          failure: { NotSent: { event: "Failed" } },
          unknown: { event: "Unsure" },
        },
      },
      other: {
        id: "other",
        contract: "lab/other",
        kind: "write",
        key: d.key("other", (i: any) => i),
        concurrency: "reject",
        commit: (input, { attempt }) => api.call("other", input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
        outcomes: { success: { event: "OtherOk" }, failure: { NotSent: { event: "OtherNo" } }, unknown: { event: "OtherUnsure" } },
      },
      read: {
        id: "read",
        contract: "lab/read",
        kind: "read",
        key: d.key("read", () => ({})),
        concurrency: "reject",
        commit: (i) => api.call("read", i) as Effect.Effect<unknown, unknown>,
        outcomes: {
          success: { event: "Looked", from: d.slot("operations.read.success", (v: any) => ({ value: v })) },
          failure: { NoResponse: { event: "LookFailed" }, Defect: { event: "LookFailed" }, Interrupted: { event: "LookFailed" } },
        },
      },
      boom: {
        id: "boom",
        contract: "lab/boom",
        kind: "write",
        key: d.key("boom", () => ({})),
        concurrency: "reject",
        commit: (input, { attempt }) => api.call("boom", input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
        outcomes: {
          success: { event: "BoomDone", from: d.slot("operations.boom.success", (v: any) => ({ v: v?.v })) },
          failure: { NotSent: { event: "BoomNo" } },
          unknown: { event: "BoomUnsure" },
        },
      },
      readBoom: {
        id: "readBoom",
        contract: "lab/readBoom",
        kind: "read",
        key: d.key("readBoom", () => ({})),
        concurrency: "reject",
        commit: (i) => api.call("readBoom", i) as Effect.Effect<unknown, unknown>,
        outcomes: {
          success: { event: "ReadBoomed" },
          failure: { NoResponse: { event: "ReadBoomFailed" }, Defect: { event: "ReadBoomFailed" }, Interrupted: { event: "ReadBoomFailed" } },
        },
      },
      readLoop: {
        id: "readLoop",
        contract: "lab/readLoop",
        kind: "read",
        key: d.key("readLoop", () => ({})),
        concurrency: "reject",
        commit: (i) => api.call("readLoop", i) as Effect.Effect<unknown, unknown>,
        outcomes: {
          success: { event: "Looped" },
          failure: { NoResponse: { event: "LoopFailed" }, Defect: { event: "LoopFailed" }, Interrupted: { event: "LoopFailed" } },
        },
      },
      readKey: {
        id: "readKey",
        contract: "lab/readKey",
        kind: "read",
        key: d.key("readKey", () => new Set()),
        concurrency: "reject",
        commit: (i) => api.call("readKey", i) as Effect.Effect<unknown, unknown>,
        outcomes: {
          success: { event: "Looked" },
          failure: { NoResponse: { event: "LookFailed" }, Defect: { event: "LookFailed" }, Interrupted: { event: "LookFailed" } },
        },
      },
    },
    persisted: true,
    uses: [],
  }),
};

// Copies under `.each`: a read's ending finds its copy by id (`admitRead`, `pathOfId`), so a repeated id reaches the wrong one (M3).
export const CopiesId = "Lab/Copies";
const cs = fixtureOf(CopiesId);
const cp = fixtureOf("IdCopy");
const IdCopy: Fragment = {
  id: "IdCopy",
  root: "root",
  default: "root",
  nodes: {
    root: cp.node("root", {
      Load: [{ members: cp.lookup("load", ({ event }: any) => ({ tag: event.tag })) }],
      Loaded: [{ patch: ({ event }: any) => ({ got: event.value }) }],
      LoadFailed: [{}],
      Set: [{ patch: () => ({ got: "raised" }) }],
    }),
  },
  memory: { initial: cp.slot("memory.initial", () => ({ got: null })) },
};
export const copiesFixture: Fixture = {
  id: CopiesId,
  make: (api: Api) => ({
    id: CopiesId,
    root: "root",
    default: "root",
    fragments: { IdCopy },
    nodes: {
      root: {
        ...cs.node("root", {
          Add: [{ patch: ({ memory, event }: any) => ({ ids: [...memory.ids, event.id] }) }],
          Note: [{ patch: ({ event }: any) => ({ note: event.text }) }],
          BadReset: [{ patch: () => ({ bad: new Set() }) }],
          RaiseTwice: [{ raises: [{ to: "c", key: cs.slot("on.RaiseTwice.raises[0]", () => "x"), event: "Set" }, { to: "c", key: cs.slot("on.RaiseTwice.raises[1]", () => "x"), event: "Set" }] }],
        }),
        placements: [
          { name: "c", fragment: "IdCopy", each: { of: "ids", max: 16 } },
          { name: "r", fragment: "IdCopy", resetOn: cs.slot("traits.r.resetOn", ({ memory }: any) => memory.bad ?? "same") },
        ],
      },
    },
    memory: cs.memory(() => ({ ids: ["x"], note: "" })),
    ops: {
      load: {
        id: "load",
        contract: "lab/load",
        kind: "read",
        fragment: "IdCopy",
        key: cs.key("load", () => ({})),
        concurrency: "reject",
        commit: (i) => api.call("load", i) as Effect.Effect<unknown, unknown>,
        outcomes: {
          success: { event: "Loaded", from: cs.slot("operations.load.success", (v: any) => ({ value: v })) },
          failure: { NoResponse: { event: "LoadFailed" }, Defect: { event: "LoadFailed" }, Interrupted: { event: "LoadFailed" } },
        },
      },
    },
    persisted: true,
    uses: [],
  }),
};

// A commit that fails with no I/O, and a handler that commits again: `Rejected`, behind its own hold, for ever (review M5).
export const LoopId = "Lab/Loop";
const lp = fixtureOf(LoopId);
export const loopFixture: Fixture = {
  id: LoopId,
  make: () => ({
    id: LoopId,
    root: "root",
    default: "A",
    nodes: {
      root: lp.node("root", {
        Go: [{ members: lp.commit("w", () => ({})) }],
        Ok: [{}],
        No: [{ patch: ({ memory }: any) => ({ loops: memory.loops + 1 }), members: lp.commit("w", () => ({})) }],
        Unsure: [{ members: lp.commit("w", () => ({})) }],
      }),
      A: lp.node("A", {}),
    },
    memory: lp.memory(() => ({ loops: 0 })),
    ops: {
      w: {
        id: "w",
        contract: "lab/w",
        kind: "write",
        key: lp.key("w", () => ({})),
        concurrency: "reject",
        commit: () => {
          throw new Error("at once");
        },
        outcomes: { success: { event: "Ok" }, failure: { NotSent: { event: "No" } }, unknown: { event: "Unsure" } },
      },
    },
    persisted: false,
    uses: [],
  }),
};
