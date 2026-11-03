// Round 9, part two. A queue over any source, one ask per ending, where a row can fail and the handler moves on (review M1). A spin, which only a press ends. A machine for every edge of what a turn cannot take (D123).
import { Effect } from "effect";
import type { Api } from "../fake-world.ts";
import type { Fixture } from "../harness.ts";
import type { Fragment } from "./compiled.ts";
import { fixtureOf, unknownWhenLost } from "./build.ts";

export const ChainId = "Lab/Chain";
const c = fixtureOf(ChainId);
const rowAsk = c.lookup("row", ({ memory }: any) => ({ i: memory.i }));
const saveAsk = c.commit("save", ({ memory }: any) => ({ i: memory.i }));
const last = ({ memory }: any) => memory.i + 1 >= memory.n || { deny: "more" };
const moved = (field: string) => ({ memory }: any) => ({ i: memory.i + 1, [field]: memory[field] + 1 });
const done = (field: string) => ({ memory }: any) => ({ [field]: memory[field] + 1 });
const spinAgain = ({ memory }: any) => ({ spun: memory.spun + 1 });
const stopped = ({ memory }: any) => memory.stopped || { deny: "go on" };
export const chainFixture = (o: { persisted?: boolean; local?: boolean } = {}): Fixture => ({
  id: ChainId,
  make: (api: Api) => ({
    id: ChainId,
    root: "root",
    default: "A",
    nodes: {
      root: c.node("root", {
        Rows: [{ patch: ({ event }: any) => ({ n: event.n, i: 0 }), members: rowAsk }],
        RowOk: [{ guards: [last], patch: done("ok") }, { patch: moved("ok"), members: rowAsk }],
        RowDup: [{ guards: [last], patch: done("dup") }, { patch: moved("dup"), members: rowAsk }],
        RowLost: [{}],
        Writes: [{ patch: ({ event }: any) => ({ n: event.n, i: 0 }), members: saveAsk }],
        SaveOk: [{ guards: [last], patch: done("ok") }, { patch: moved("ok"), members: saveAsk }],
        SaveDup: [{ guards: [last], patch: done("dup") }, { patch: moved("dup"), members: saveAsk }],
        SaveUnsure: [{}],
        Spin: [{ members: c.lookup("spin", () => ({ same: true })) }],
        SpinAgain: [{ guards: [stopped] }, { patch: spinAgain, members: c.lookup("spin", () => ({ same: true })) }],
        SpinInput: [{ members: c.lookup("spinIn", () => ({ i: 0 })) }],
        SpinInAgain: [{ guards: [stopped] }, { patch: spinAgain, members: c.lookup("spinIn", ({ memory }: any) => ({ i: memory.spun })) }],
        Stop: [{ patch: () => ({ stopped: true }) }],
        Press: [{ patch: ({ memory }: any) => ({ presses: memory.presses + 1 }) }],
        Pw: [{ members: c.commit("pw", () => ({ id: "p" })) }],
        PwOk: [{ patch: () => ({ heard: true }) }],
        PwNo: [{}],
        PwUnsure: [{}],
      }),
      A: c.node("A", {}),
    },
    memory: c.memory(() => ({ n: 0, i: 0, ok: 0, dup: 0, spun: 0, stopped: false, presses: 0, heard: false })),
    ops: {
      row: {
        id: "row",
        contract: "lab/row",
        kind: "read",
        key: c.key("row", () => ({})),
        concurrency: "reject",
        commit: (i) => api.call("row", i) as Effect.Effect<unknown, unknown>,
        outcomes: { success: { event: "RowOk" }, failure: { Duplicate: { event: "RowDup" }, NoResponse: { event: "RowLost" }, Defect: { event: "RowLost" }, Interrupted: { event: "RowLost" } } },
      },
      save: {
        id: "save",
        contract: "lab/chainSave",
        kind: "write",
        key: c.key("save", (i: any) => ({ i: i.i })),
        concurrency: "reject",
        commit: (input, { attempt }) => api.call("save", input, { idempotencyKey: attempt.id }) as Effect.Effect<unknown, unknown>,
        outcomes: { success: { event: "SaveOk" }, failure: { Duplicate: { event: "SaveDup" }, NotSent: { event: "SaveDup" } }, unknown: { event: "SaveUnsure" } },
      },
      spin: {
        id: "spin",
        contract: "lab/spin",
        kind: "read",
        key: c.key("spin", () => ({})),
        concurrency: "reject",
        commit: (i) => api.call("spin", i) as Effect.Effect<unknown, unknown>,
        outcomes: { success: { event: "SpinAgain" }, failure: { Whatever: { event: "SpinAgain" }, NoResponse: { event: "SpinAgain" }, Defect: { event: "SpinAgain" }, Interrupted: { event: "SpinAgain" } } },
      },
      spinIn: {
        id: "spinIn",
        contract: "lab/spinIn",
        kind: "read",
        key: c.key("spinIn", () => ({})),
        concurrency: "reject",
        commit: (i) => api.call("spinIn", i) as Effect.Effect<unknown, unknown>,
        outcomes: { success: { event: "SpinInAgain" }, failure: { Whatever: { event: "SpinInAgain" }, NoResponse: { event: "SpinInAgain" }, Defect: { event: "SpinInAgain" }, Interrupted: { event: "SpinInAgain" } } },
      },
      pw: {
        id: "pw",
        contract: "lab/pw",
        kind: "write",
        key: c.key("pw", (i: any) => ({ id: i.id })),
        concurrency: "reject",
        commit: (input, { attempt }) => api.call("pw", input, { idempotencyKey: attempt.id }) as Effect.Effect<unknown, unknown>,
        outcomes: { success: { event: "PwOk" }, failure: { NotSent: { event: "PwNo" } }, unknown: { event: "PwUnsure" } },
      },
    },
    persisted: o.persisted ?? false,
    ...(o.local ? { local: true as const } : {}),
    uses: [],
  }),
});

// Every edge of D123. `Saved`'s handler throws on `boom`, as a real bug would, until `__healed`.
export const EdgeId = "Lab/Edge";
const e = fixtureOf(EdgeId);
const heal = () => (globalThis as any).__healed === true;
const boom = (message: string, patch: object) => () => {
  if (!heal()) throw new Error(message);
  return patch;
};
const row = fixtureOf("EdgeRow");
const EdgeRow: Fragment = {
  id: "EdgeRow",
  root: "root",
  default: "L",
  nodes: {
    root: row.node("root", {
      Ask: [{ members: row.lookup("rowRead", ({ key }: any) => ({ id: key })) }],
      RowGot: [{ target: "D", patch: boom("this row", {}) }],
      RowNo: [{}],
      DoRow: [{ members: row.commit("rowSave", ({ key }: any) => ({ id: "same" , row: key })) }],
      RowSaved: [{ patch: boom("this row's save", {}) }],
      RowSaveNo: [{}],
      RowSaveUnsure: [{}],
      ForgetRow: [{ members: row.member("rowSave", "cancel") }],
    }),
    L: row.node("L", {}),
    D: row.node("D", {}),
  },
  memory: { initial: row.slot("memory.initial", () => ({})) },
};
const job = fixtureOf("EdgeJob");
const EdgeJob: Fragment = {
  id: "EdgeJob",
  root: "root",
  default: "root",
  nodes: {
    root: job.node("root", {
      Do: [{ members: job.commit("job", ({ key }: any) => ({ id: key })) }],
      DoBad: [{ members: job.commit("job", () => ({ id: "k", at: new Set() })) }],
      JobOk: [{}],
      JobNo: [{}],
      JobUnsure: [{}],
      Boom: [{ patch: boom("this job", {}) }],
    }),
  },
  memory: { initial: job.slot("memory.initial", () => ({})) },
};
// Its life's end lets go of its writes (rule 60): what is kept goes with it.
const rel = fixtureOf("EdgeRel");
const EdgeRel: Fragment = {
  id: "EdgeRel",
  root: "root",
  default: "root",
  nodes: {
    root: rel.node("root", {
      Do: [{ members: rel.commit("rel", () => ({ id: "k" })) }],
      RelOk: [{ patch: boom("this release", {}) }],
      RelNo: [{}],
      RelUnsure: [{}],
    }),
  },
  memory: { initial: rel.slot("memory.initial", () => ({})) },
  whenAbandoned: { release: ["rel"] },
};
export const edgeFixture = (o: { persisted?: boolean; local?: boolean } = {}): Fixture => ({
  id: EdgeId,
  make: (api: Api) => ({
    id: EdgeId,
    root: "root",
    default: "A",
    fragments: { EdgeRow, EdgeJob, EdgeRel },
    nodes: {
      root: {
        ...e.node("root", {
          Go: [{ target: "W", members: e.commit("save", ({ event }: any) => ({ id: event.id ?? "a", at: event.at ?? "fine" })) }],
          Saved: [{ target: "B", patch: ({ event }: any) => { if (event.v === "boom" && !heal()) throw new Error("this value"); return { last: "delivered" }; } }],
          SaveNo: [{ target: "A", patch: ({ event }: any) => { if (event.boom && !heal()) throw new Error("this decline"); return { last: `no:${event.id}:${event.why}` }; } }],
          SaveUnsure: [{ target: "A" }],
          IfAny: [{ tokens: [{ op: "save", verb: "idle" }], patch: ({ memory }: any) => ({ presses: memory.presses + 1 }) }, {}],
          IfA: [{ tokens: [{ op: "save", verb: "idle", key: e.slot("on.IfA[0].guard[0]", () => ({ id: "a" })) }], patch: ({ memory }: any) => ({ presses: memory.presses + 1 }) }, {}],
          IfJob: [{ tokens: [{ op: "job", verb: "idle" }], patch: ({ memory }: any) => ({ presses: memory.presses + 1 }) }, {}],
          ForgetAny: [{ members: e.member("save", "cancel") }],
          ForgetA: [{ members: e.member("save", "cancel", () => ({ id: "a" })) }],
          // A queue on one key, so a kept ending can sit beside a head.
          Q: [{ members: e.commit("q", () => ({ id: "a" })) }],
          QOk: [{ patch: ({ event }: any) => { if (event.v === "boom" && !heal()) throw new Error("this queue"); return { qd: true }; } }],
          QNo: [{}],
          QUnsure: [{}],
          ForgetQ: [{ members: e.member("q", "cancel", () => ({ id: "a" })) }],
          // A read whose failure mapper reads its input.
          Look: [{ members: e.lookup("look", ({ event }: any) => ({ id: "x", at: event.at })) }],
          Looked: [{}],
          LookNo: [{ patch: ({ event }: any) => ({ last: `look:${event.id}:${event.k}` }) }],
          Set: [{ patch: ({ event }: any) => ({ ids: event.ids }) }],
          ToRel: [{ target: "R" }],
          // D119, by another door: a member's key is a name. `1n` and "1" are two lanes.
          GoBig: [{ members: e.commit("big", () => ({ o: "1" })) }],
          BigOk: [{}],
          BigNo: [{}],
          BigUnsure: [{}],
          ForgetBig: [{ members: e.member("big", "cancel", () => ({ o: 1n })) }],
          IfBig1: [{ tokens: [{ op: "big", verb: "idle", key: e.slot("on.IfBig1[0].guard[0]", () => ({ o: "1" })) }], patch: ({ memory }: any) => ({ presses: memory.presses + 1 }) }, {}],
          ToJob: [{ target: "J" }],
          Out: [{ target: "A" }],
        }),
        placements: [{ name: "r", fragment: "EdgeRow", each: { of: "ids", max: 8 } }],
      },
      A: e.node("A", {}),
      W: e.node("W", {}),
      B: e.node("B", {}),
      J: { ...e.node("J", {}), placements: [{ name: "j", fragment: "EdgeJob" }] },
      R: { ...e.node("R", {}), placements: [{ name: "rel", fragment: "EdgeRel" }] },
    },
    memory: e.memory(() => ({ presses: 0, ids: [], last: null })),
    ops: {
      save: {
        id: "save",
        contract: "lab/edgeSave",
        kind: "write",
        key: e.key("save", (i: any) => ({ id: i.id })),
        concurrency: "reject",
        commit: (input, { attempt }) => api.call("save", input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
        outcomes: {
          success: { event: "Saved", from: e.slot("operations.save.success", (v: any) => ({ v: v?.v })) },
          failure: { NotSent: { event: "SaveNo", from: e.slot("operations.save.NotSent", (v: any, x: any) => ({ id: x.input?.id, why: v?.why, boom: x.input?.boom })) } },
          unknown: { event: "SaveUnsure" },
        },
      },
      q: {
        id: "q",
        contract: "lab/edgeQ",
        kind: "write",
        key: e.key("q", (i: any) => ({ id: i.id })),
        concurrency: "serialize",
        commit: (input, { attempt }) => api.call("q", input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
        outcomes: { success: { event: "QOk", from: e.slot("operations.q.success", (v: any) => ({ v: v?.v })) }, failure: { NotSent: { event: "QNo" } }, unknown: { event: "QUnsure" } },
      },
      big: {
        id: "big",
        contract: "lab/edgeBig",
        kind: "write",
        key: e.key("big", (i: any) => ({ o: BigInt(i.o) })),
        concurrency: "reject",
        commit: (input, { attempt }) => api.call("big", input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
        outcomes: { success: { event: "BigOk" }, failure: { NotSent: { event: "BigNo" } }, unknown: { event: "BigUnsure" } },
      },
      rel: {
        id: "rel",
        contract: "lab/edgeRel",
        fragment: "EdgeRel",
        kind: "write",
        key: e.key("rel", (i: any) => ({ id: i.id })),
        concurrency: "reject",
        commit: (input, { attempt }) => api.call("rel", input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
        outcomes: { success: { event: "RelOk" }, failure: { NotSent: { event: "RelNo" } }, unknown: { event: "RelUnsure" } },
      },
      look: {
        id: "look",
        contract: "lab/edgeLook",
        kind: "read",
        key: e.key("look", (i: any) => ({ id: i.id })),
        concurrency: "reject",
        commit: (i) => api.call("look", i) as Effect.Effect<unknown, unknown>,
        outcomes: { success: { event: "Looked" }, failure: { Defect: { event: "LookNo", from: e.slot("operations.look.Defect", (_v: any, x: any) => ({ id: x.input.id, k: x.key?.id })) }, NoResponse: { event: "LookNo", from: e.slot("operations.look.NoResponse", (_v: any, x: any) => ({ id: x.input.id })) }, Interrupted: { event: "LookNo", from: e.slot("operations.look.Interrupted", (_v: any, x: any) => ({ id: x.input.id })) } } },
      },
      rowRead: {
        id: "rowRead",
        contract: "lab/edgeRowRead",
        fragment: "EdgeRow",
        kind: "read",
        key: e.key("rowRead", () => ({})),
        concurrency: "reject",
        commit: (i) => api.call("rowRead", i) as Effect.Effect<unknown, unknown>,
        outcomes: { success: { event: "RowGot" }, failure: { NoResponse: { event: "RowNo" }, Defect: { event: "RowNo" }, Interrupted: { event: "RowNo" } } },
      },
      rowSave: {
        id: "rowSave",
        contract: "lab/edgeRowSave",
        fragment: "EdgeRow",
        kind: "write",
        key: e.key("rowSave", (i: any) => ({ id: i.id })),
        concurrency: "reject",
        commit: (input, { attempt }) => api.call("rowSave", input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
        outcomes: { success: { event: "RowSaved" }, failure: { NotSent: { event: "RowSaveNo" } }, unknown: { event: "RowSaveUnsure" } },
      },
      job: {
        id: "job",
        contract: "lab/edgeJob",
        fragment: "EdgeJob",
        kind: "write",
        key: e.key("job", (i: any) => ({ id: i.id })),
        concurrency: "reject",
        commit: (input, { attempt }) => api.call("job", input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
        outcomes: { success: { event: "JobOk" }, failure: { NotSent: { event: "JobNo" } }, unknown: { event: "JobUnsure" } },
      },
    },
    persisted: o.persisted ?? true,
    ...(o.local ? { local: true as const } : {}),
    uses: [],
  }),
});
