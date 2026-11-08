// Round 11: `fixtures/round9b.compiled.ts`, written in the public API. A queue over any source, one ask per ending (review M1); a spin that only a press ends;
// a machine for every edge of what a turn cannot take (D123).
import { Schema } from "effect";
import { definition, deny, Flow, labHostOp, machine, resource, trait, transaction } from "../compile/index.ts";
import { call, FakeApi, fixture, write } from "./lab.ts";

const S = Schema;
const U = S.Unknown;
export const ChainId = "Lab/Chain";
type ChainM = { readonly i: number; readonly n: number; readonly stopped: boolean; readonly spun: number } & Readonly<Record<"ok" | "dup", number>>;
const last = ({ memory }: { readonly memory: ChainM }) => memory.i + 1 >= memory.n || deny("more");
const moved = (field: "ok" | "dup") => ({ memory }: { readonly memory: ChainM }) => ({ i: memory.i + 1, [field]: memory[field] + 1 });
const done = (field: "ok" | "dup") => ({ memory }: { readonly memory: ChainM }) => ({ [field]: memory[field] + 1 });
const stopped = ({ memory }: { readonly memory: ChainM }) => memory.stopped || deny("go on");
const row = resource({ id: "lab/row", input: { i: U }, key: [], services: [FakeApi], lookup: (i) => call<unknown, "Duplicate" | "NoResponse">("row")(i) });
// Not `unknownWhenLost`: the hand fixture's `save` and `pw` answer a lost call as a failure, and so does this.
const save = transaction({ id: "lab/chainSave", input: { i: U }, key: ["i"], concurrency: "reject", services: [FakeApi], commit: (i, { attempt }) => call<unknown, "Duplicate">("save")(i, attempt.id) });
const spin = resource({ id: "lab/spin", input: { same: U }, key: [], services: [FakeApi], lookup: (i) => call<unknown, "Whatever" | "NoResponse">("spin")(i) });
const spinIn = resource({ id: "lab/spinIn", input: { i: U }, key: [], services: [FakeApi], lookup: (i) => call<unknown, "Whatever" | "NoResponse">("spinIn")(i) });
const pw = transaction({ id: "lab/pw", input: { id: U }, key: ["id"], concurrency: "reject", services: [FakeApi], commit: (i, { attempt }) => call("pw")(i, attempt.id) });
const chain = (persisted: boolean, local: boolean) => {
  const d = definition({
    id: ChainId,
    states: ["A"],
    events: { Rows: { n: S.Number }, Writes: { n: S.Number }, Spin: {}, SpinInput: {}, Stop: {}, Press: {}, Pw: {} },
    internalEvents: {
      RowOk: {}, RowDup: {}, RowLost: {}, SaveOk: {}, SaveDup: {}, SaveUnsure: Flow.uncertain({}), SpinAgain: {}, SpinInAgain: {}, PwOk: {}, PwNo: {}, PwUnsure: Flow.uncertain({}),
    },
    memory: {
      n: Flow.initial(S.Number, 0), i: Flow.initial(S.Number, 0), ok: Flow.initial(S.Number, 0), dup: Flow.initial(S.Number, 0),
      spun: Flow.initial(S.Number, 0), stopped: Flow.initial(S.Boolean, false), presses: Flow.initial(S.Number, 0), heard: Flow.initial(S.Boolean, false),
    },
    persist: persisted,
    ...(local ? { local: true as const } : {}),
    operations: ({ E }) => ({
      row: row.outcomes({ success: E.RowOk, failure: { Duplicate: E.RowDup, NoResponse: E.RowLost, Defect: E.RowLost, Interrupted: E.RowLost } }),
      save: save.outcomes({ success: E.SaveOk, failure: { Duplicate: E.SaveDup, NotSent: E.SaveDup }, unknown: E.SaveUnsure }),
      spin: spin.outcomes({ success: E.SpinAgain, failure: { Whatever: E.SpinAgain, NoResponse: E.SpinAgain, Defect: E.SpinAgain, Interrupted: E.SpinAgain } }),
      spinIn: spinIn.outcomes({ success: E.SpinInAgain, failure: { Whatever: E.SpinInAgain, NoResponse: E.SpinInAgain, Defect: E.SpinInAgain, Interrupted: E.SpinInAgain } }),
      pw: pw.outcomes({ success: E.PwOk, failure: { NotSent: E.PwNo }, unknown: E.PwUnsure }),
    }),
  });
  return machine(d, ({ S: St, O }) => {
    const rowAsk = O.row.lookup(({ memory }) => ({ i: memory.i }));
    const saveAsk = O.save.commit(({ memory }) => ({ i: memory.i }));
    return {
      default: St.A,
      on: {
        Rows: { updateMemory: ({ event }) => ({ n: event.n, i: 0 }), actions: [rowAsk] },
        RowOk: [{ guard: [last], updateMemory: done("ok") }, { updateMemory: moved("ok"), actions: [rowAsk] }],
        RowDup: [{ guard: [last], updateMemory: done("dup") }, { updateMemory: moved("dup"), actions: [rowAsk] }],
        RowLost: {},
        Writes: { updateMemory: ({ event }) => ({ n: event.n, i: 0 }), actions: [saveAsk] },
        SaveOk: [{ guard: [last], updateMemory: done("ok") }, { updateMemory: moved("ok"), actions: [saveAsk] }],
        SaveDup: [{ guard: [last], updateMemory: done("dup") }, { updateMemory: moved("dup"), actions: [saveAsk] }],
        SaveUnsure: {},
        Spin: { actions: [O.spin.lookup(() => ({ same: true }))] },
        SpinAgain: [{ guard: [stopped] }, { updateMemory: ({ memory }) => ({ spun: memory.spun + 1 }), actions: [O.spin.lookup(() => ({ same: true }))] }],
        SpinInput: { actions: [O.spinIn.lookup(() => ({ i: 0 }))] },
        SpinInAgain: [{ guard: [stopped] }, { updateMemory: ({ memory }) => ({ spun: memory.spun + 1 }), actions: [O.spinIn.lookup(({ memory }) => ({ i: memory.spun }))] }],
        Stop: { updateMemory: () => ({ stopped: true }) },
        Press: { updateMemory: ({ memory }) => ({ presses: memory.presses + 1 }) },
        Pw: { actions: [O.pw.commit(() => ({ id: "p" }))] },
        PwOk: { updateMemory: () => ({ heard: true }) },
        PwNo: {},
        PwUnsure: {},
      },
    };
  });
};
const chains = new Map<string, ReturnType<typeof fixture>>();
export const chainFixture = (o: { persisted?: boolean; local?: boolean } = {}) => {
  const k = `${o.persisted ?? false}/${o.local ?? false}`;
  return chains.get(k) ?? chains.set(k, fixture(chain(o.persisted ?? false, o.local ?? false))).get(k)!;
};

// Every edge of D123. `Saved`'s handler throws on `boom`, as a real bug would, until `__healed`.
export const EdgeId = "Lab/Edge";
const heal = () => (globalThis as { __healed?: boolean }).__healed === true;
const boom = (message: string) => () => {
  if (!heal()) throw new Error(message);
  return {};
};
const rowRead = resource({ id: "lab/edgeRowRead", input: { id: U }, key: [], services: [FakeApi], lookup: (i) => call<unknown, "NoResponse">("rowRead")(i) });
const rowSave = transaction({ id: "lab/edgeRowSave", input: { id: U, row: U }, key: ["id"], concurrency: "reject", services: [FakeApi], commit: write("rowSave") });
const EdgeRow = trait(
  {
    id: "EdgeRow",
    states: ["L", "D"],
    default: "L",
    events: { Ask: {}, DoRow: {}, ForgetRow: {} },
    internalEvents: { RowGot: {}, RowNo: {}, RowSaved: {}, RowSaveNo: {}, RowSaveUnsure: Flow.uncertain({}) },
    operations: ({ E }) => ({
      rowRead: rowRead.outcomes({ success: E.RowGot, failure: { NoResponse: E.RowNo, Defect: E.RowNo, Interrupted: E.RowNo } }),
      rowSave: rowSave.outcomes({ success: E.RowSaved, failure: { NotSent: E.RowSaveNo }, unknown: E.RowSaveUnsure }),
    }),
  },
  ({ S: St, O }) => ({
    on: {
      Ask: { actions: [O.rowRead.lookup(({ key }) => ({ id: key }))] },
      RowGot: { target: St.D, updateMemory: boom("this row") },
      RowNo: {},
      DoRow: { actions: [O.rowSave.commit(({ key }) => ({ id: "same", row: key }))] },
      RowSaved: { updateMemory: boom("this row's save") },
      RowSaveNo: {},
      RowSaveUnsure: {},
      ForgetRow: { actions: [O.rowSave.cancel] },
    },
  }),
);
const job = transaction({ id: "lab/edgeJob", input: { id: U }, key: ["id"], concurrency: "reject", services: [FakeApi], commit: write("job") });
const EdgeJob = trait(
  {
    id: "EdgeJob",
    events: { Do: {}, DoBad: {}, Boom: {} },
    internalEvents: { JobOk: {}, JobNo: {}, JobUnsure: Flow.uncertain({}) },
    operations: ({ E }) => ({ job: job.outcomes({ success: E.JobOk, failure: { NotSent: E.JobNo }, unknown: E.JobUnsure }) }),
  },
  ({ O }) => ({
    on: {
      Do: { actions: [O.job.commit(({ key }) => ({ id: key }))] },
      // A value the door refuses, on purpose (finding F1).
      DoBad: { actions: [O.job.commit(() => ({ id: "k", at: new Set() }) as never)] },
      JobOk: {},
      JobNo: {},
      JobUnsure: {},
      Boom: { updateMemory: boom("this job") },
    },
  }),
);
// Its life's end lets go of its writes (rule 60): what is kept goes with it.
const rel = transaction({ id: "lab/edgeRel", input: { id: U }, key: ["id"], concurrency: "reject", services: [FakeApi], commit: write("rel") });
const EdgeRel = trait(
  {
    id: "EdgeRel",
    events: { Do: {} },
    internalEvents: { RelOk: {}, RelNo: {}, RelUnsure: Flow.uncertain({}) },
    operations: ({ E }) => ({ rel: rel.outcomes({ success: E.RelOk, failure: { NotSent: E.RelNo }, unknown: E.RelUnsure }) }),
  },
  ({ O }) => ({
    on: { Do: { actions: [O.rel.commit(() => ({ id: "k" }))] }, RelOk: { updateMemory: boom("this release") }, RelNo: {}, RelUnsure: {} },
    whenAbandoned: [O.rel.cancel],
  }),
);
const edgeSave = transaction({ id: "lab/edgeSave", input: { id: U, at: U }, key: ["id"], concurrency: "reject", services: [FakeApi], commit: write<{ readonly v?: unknown }, never>("save") });
const q = transaction({ id: "lab/edgeQ", input: { id: U }, key: ["id"], concurrency: "serialize", services: [FakeApi], commit: write<{ readonly v?: unknown }, never>("q") });
// Finding F2: the hand key was `BigInt(i.o)`, a key that is not a projection of the input. Rule 39 makes a key the contract's fields, so here it is `o` itself.
const big = transaction({ id: "lab/edgeBig", input: { o: U }, key: ["o"], concurrency: "reject", services: [FakeApi], commit: write("big") });
const look = resource({ id: "lab/edgeLook", input: { id: U, at: U }, key: ["id"], services: [FakeApi], lookup: (i) => call<unknown, "NoResponse">("look")(i) });
const edge = (persisted: boolean, local: boolean) => {
  const d = definition({
    id: EdgeId,
    states: ["A", "W", "B", { J: Flow.state({ traits: { j: EdgeJob } }) }, { R: Flow.state({ traits: { rel: EdgeRel } }) }],
    traits: { r: EdgeRow.each({ of: "ids", max: 8 }) },
    events: {
      Go: { id: U, at: U }, IfAny: {}, IfA: {}, IfJob: {}, ForgetAny: {}, ForgetA: {}, Q: {}, ForgetQ: {}, Look: { at: U }, Set: { ids: S.Array(S.String) },
      ToRel: {}, GoBig: {}, ForgetBig: {}, IfBig1: {}, ToJob: {}, Out: {},
    },
    internalEvents: {
      Saved: { v: U }, SaveNo: { id: U, why: U, boom: U }, SaveUnsure: Flow.uncertain({}), QOk: { v: U }, QNo: {}, QUnsure: Flow.uncertain({}), Looked: {}, LookNo: { id: U, k: U },
      BigOk: {}, BigNo: {}, BigUnsure: Flow.uncertain({}),
    },
    memory: { presses: Flow.initial(S.Number, 0), ids: Flow.initial(S.Array(S.String), []), last: Flow.initial(U, null), qd: S.optionalKey(S.Boolean) },
    persist: persisted,
    ...(local ? { local: true as const } : {}),
    operations: ({ E }) => ({
      save: edgeSave.outcomes({
        success: E.Saved.from((v) => ({ v: v?.v })),
        failure: {
          NotSent: E.SaveNo.from((v, x) => {
            const input = x.input as { readonly id?: unknown; readonly boom?: unknown } | undefined;
            return { id: input?.id, why: v?.why, boom: input?.boom };
          }),
        },
        unknown: E.SaveUnsure,
      }),
      q: q.outcomes({ success: E.QOk.from((v) => ({ v: v?.v })), failure: { NotSent: E.QNo }, unknown: E.QUnsure }),
      big: big.outcomes({ success: E.BigOk, failure: { NotSent: E.BigNo }, unknown: E.BigUnsure }),
      look: look.outcomes({
        success: E.Looked,
        failure: {
          Defect: E.LookNo.from((_v, x) => ({ id: (x.input as { readonly id: unknown }).id, k: (x.key as { readonly id?: unknown } | undefined)?.id })),
          NoResponse: E.LookNo.from((_v, x) => ({ id: (x.input as { readonly id: unknown }).id, k: undefined })),
          Interrupted: E.LookNo.from((_v, x) => ({ id: (x.input as { readonly id: unknown }).id, k: undefined })),
        },
      }),
    }),
  });
  const idle = ({ memory }: { readonly memory: { readonly presses: number } }) => ({ presses: memory.presses + 1 });
  return machine(d, ({ S: St, O }) => ({
    default: St.A,
    on: {
      Go: { target: St.W, actions: [O.save.commit(({ event }) => ({ id: event.id ?? "a", at: event.at ?? "fine" }))] },
      Saved: {
        target: St.B,
        updateMemory: ({ event }) => {
          if (event.v === "boom" && !heal()) throw new Error("this value");
          return { last: "delivered" };
        },
      },
      SaveNo: {
        target: St.A,
        updateMemory: ({ event }) => {
          if (event.boom && !heal()) throw new Error("this decline");
          return { last: `no:${String(event.id)}:${String(event.why)}` };
        },
      },
      SaveUnsure: St.A,
      IfAny: [{ guard: [O.save.idle], updateMemory: idle }, {}],
      IfA: [{ guard: [O.save.idle(() => ({ id: "a" }))], updateMemory: idle }, {}],
      IfJob: [{ guard: [labHostOp("job").idle], updateMemory: idle }, {}], // a fragment's op, asked by the host: rule 50 forbids it, a named seam (D212, F3)
      ForgetAny: { actions: [O.save.cancel] },
      ForgetA: { actions: [O.save.cancel(() => ({ id: "a" }))] },
      // A queue on one key, so a kept ending can sit beside a head.
      Q: { actions: [O.q.commit(() => ({ id: "a" }))] },
      QOk: {
        updateMemory: ({ event }) => {
          if (event.v === "boom" && !heal()) throw new Error("this queue");
          return { qd: true };
        },
      },
      QNo: {},
      QUnsure: {},
      ForgetQ: { actions: [O.q.cancel(() => ({ id: "a" }))] },
      // A read whose failure mapper reads its input.
      Look: { actions: [O.look.lookup(({ event }) => ({ id: "x", at: event.at }))] },
      Looked: {},
      LookNo: { updateMemory: ({ event }) => ({ last: `look:${String(event.id)}:${String(event.k)}` }) },
      Set: { updateMemory: ({ event }) => ({ ids: event.ids }) },
      ToRel: St.R,
      // D119, by another door: a member's key is a name. `1n` and "1" are two lanes.
      GoBig: { actions: [O.big.commit(() => ({ o: "1" }))] },
      BigOk: {},
      BigNo: {},
      BigUnsure: {},
      ForgetBig: { actions: [O.big.cancel(() => ({ o: 1n }))] },
      IfBig1: [{ guard: [O.big.idle(() => ({ o: "1" }))], updateMemory: idle }, {}],
      ToJob: St.J,
      Out: St.A,
    },
  }));
};
const edges = new Map<string, ReturnType<typeof fixture>>();
export const edgeFixture = (o: { persisted?: boolean; local?: boolean } = {}) => {
  const k = `${o.persisted ?? true}/${o.local ?? false}`;
  return edges.get(k) ?? edges.set(k, fixture(edge(o.persisted ?? true, o.local ?? false))).get(k)!;
};
