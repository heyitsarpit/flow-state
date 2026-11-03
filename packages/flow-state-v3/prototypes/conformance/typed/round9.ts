// Round 11: `fixtures/round9.compiled.ts`, written in the public API. A bulk write, one lane per row (review H1); `.each` rows that ask once at entry; a write
// whose mapper reads its input (M1); a deadline whose handler can throw, a raise with no name (M2); a queue over a local source; keys that are bigints (M5).
import { Effect, Schema } from "effect";
import { definition, deny, Flow, fragment, machine, resource, transaction } from "./flow.ts";
import { call, fixture, write } from "./lab.ts";

const S = Schema;
const U = S.Unknown;
export const BulkId = "Lab/Bulk";
const rowRead = resource({ id: "lab/rowRead", input: { id: U }, key: [], commit: (i) => call<unknown, "NoResponse">("rowRead")(i) });
const Row = fragment(
  {
    id: "Row",
    states: { L: {}, D: {} },
    default: "L",
    events: {},
    internalEvents: { Ask: {}, Got: {}, GotNo: {} },
    operations: ({ E }) => ({ rowRead: rowRead.outcomes({ success: E.Got, failure: { NoResponse: E.GotNo, Defect: E.GotNo, Interrupted: E.GotNo } }) }),
  },
  ({ S: St, E, O }) => ({
    on: { Ask: { actions: [O.rowRead.lookup(({ key }) => ({ id: key }))] }, Got: St.D, GotNo: St.D },
    states: { L: { schedules: { ask: { schedule: "0 millis", send: E.Ask } } } },
  }),
);
const del = transaction({ id: "lab/del", input: { id: U }, key: ["id"], concurrency: "reject", commit: write("del") });
const local = transaction({ id: "lab/local", input: {}, key: [], concurrency: "reject", commit: () => Effect.succeed({}) });
const localRead = resource({ id: "lab/localRead", input: {}, key: [], commit: () => Effect.succeed({}) });
const bulk = definition({
  id: BulkId,
  states: { A: {} },
  events: { Del: { id: S.String }, Rows: { ids: S.Array(S.String) }, Next: { queue: S.Number }, Drain: { queue: S.Number } },
  internalEvents: { DelOk: { id: S.String }, DelNo: { id: S.String }, DelUnsure: {}, LocalOk: {}, LocalNo: {}, LocalUnsure: {}, Drained: {}, DrainNo: {} },
  memory: {
    deleting: Flow.initial(S.Array(S.String), []), done: Flow.initial(S.Number, 0), ids: Flow.initial(S.Array(S.String), []),
    queue: Flow.initial(S.Number, 0), ran: Flow.initial(S.Number, 0),
  },
  persisted: false,
  operations: ({ E }) => ({
    del: del.outcomes({
      success: E.DelOk.from((_v, c) => ({ id: (c.input as { readonly id: string }).id })),
      failure: { NotSent: E.DelNo.from((_v, c) => ({ id: (c.input as { readonly id: string }).id })) },
      unknown: E.DelUnsure,
    }),
    local: local.outcomes({ success: E.LocalOk, failure: { NotSent: E.LocalNo }, unknown: E.LocalUnsure }),
    localRead: localRead.outcomes({ success: E.Drained, failure: { NoResponse: E.DrainNo, Defect: E.DrainNo, Interrupted: E.DrainNo } as never }),
  }),
});
export const bulkFixture = fixture(
  machine(bulk, ({ S: St, O }) => ({
    default: St.A,
    on: {
      Del: { updateMemory: ({ memory, event }) => ({ deleting: [...memory.deleting, event.id] }), actions: [O.del.commit(({ event }) => ({ id: event.id }))] },
      DelOk: { updateMemory: ({ memory, event }) => ({ deleting: memory.deleting.filter((x) => x !== event.id), done: memory.done + 1 }) },
      DelNo: { updateMemory: ({ memory, event }) => ({ deleting: memory.deleting.filter((x) => x !== event.id) }) },
      DelUnsure: {},
      Rows: { updateMemory: ({ event }) => ({ ids: event.ids }) },
      Next: { updateMemory: ({ event }) => ({ queue: event.queue }), actions: [O.local.commit(() => ({}))] },
      LocalOk: { updateMemory: ({ memory }) => ({ queue: memory.queue - 1, ran: memory.ran + 1 }) },
      LocalNo: {},
      LocalUnsure: {},
      // A queue that asks from its own ending, over a source with no I/O.
      Drain: { updateMemory: ({ memory, event }) => ({ queue: event.queue, ran: memory.ran }), actions: [O.localRead.lookup(() => ({}))] },
      Drained: [
        { guard: [({ memory }) => memory.queue <= 1 || deny("more")], updateMemory: ({ memory }) => ({ queue: 0, ran: memory.ran + 1 }) },
        { updateMemory: ({ memory }) => ({ queue: memory.queue - 1, ran: memory.ran + 1 }), actions: [O.localRead.lookup(() => ({}))] },
      ],
      DrainNo: {},
    },
    traits: { row: { fragment: Row, each: { of: "ids", max: 2000 } } },
  })),
);

// Everything a turn can be unable to accept, in one machine.
export const KeptId = "Lab/Kept";
const heal = () => (globalThis as { __healed?: boolean }).__healed === true;
const kidSave = transaction({ id: "lab/kidSave", input: { id: U, at: U }, key: ["id"], concurrency: "reject", commit: write("kidSave") });
const Kid = fragment(
  {
    id: "Kid",
    events: { Save: {} },
    hostEvents: { Set: { v: U } },
    internalEvents: { KidNo: { why: U }, KidOk: {}, KidUnsure: {} },
    memory: { heard: Flow.initial(U, null), got: Flow.initial(U, null) },
    operations: ({ E }) => ({
      kidSave: kidSave.outcomes({ success: E.KidOk, failure: { NotSent: E.KidNo.from((v) => ({ why: v?.why })) }, unknown: E.KidUnsure }),
    }),
  },
  ({ O }) => ({
    on: {
      // A value the door refuses, on purpose (finding F1).
      Save: { actions: [O.kidSave.commit(() => ({ id: "k", at: new Set() }))] },
      KidNo: { updateMemory: ({ event }) => ({ heard: event.why }) },
      KidOk: {},
      KidUnsure: {},
      Set: { updateMemory: ({ event }) => ({ got: event.v ?? "set" }) },
    },
  }),
);
// A resumable life with a read that fails at once, and a handler that asks again.
const spinRead = resource({ id: "lab/spinRead", input: { v: U }, key: [], commit: () => Effect.void as Effect.Effect<unknown, { readonly _tag: "NoResponse" }> });
const Spinny = fragment(
  {
    id: "Spinny",
    events: { Spin: {} },
    internalEvents: { SpinNo: {}, SpinOk: {}, SpinStop: {} },
    memory: { n: Flow.initial(S.Number, 0), stopped: Flow.initial(S.Boolean, false) },
    operations: ({ E }) => ({ spinRead: spinRead.outcomes({ success: E.SpinOk, failure: { NoResponse: E.SpinNo, Defect: E.SpinNo, Interrupted: E.SpinStop } }) }),
  },
  ({ O }) => ({
    on: {
      Spin: { actions: [O.spinRead.lookup(() => ({ v: new Set() }))] },
      SpinNo: { updateMemory: ({ memory }) => ({ n: memory.n + 1 }), actions: [O.spinRead.lookup(() => ({ v: new Set() }))] },
      SpinOk: {},
      SpinStop: { updateMemory: () => ({ stopped: true }) },
    },
  }),
);
const save = transaction({ id: "lab/save", input: { id: U, at: U }, key: ["id"], concurrency: "reject", commit: write<{ readonly v?: unknown }, never>("save") });
// Finding F2: the hand keys were `() => new Set()` and `BigInt(i.o)`, keys that are not a projection of the input; here they are fields (rule 39).
const oddKey = transaction({ id: "lab/oddKey", input: { id: U }, key: [], concurrency: "reject", commit: () => Effect.void });
const look = resource({ id: "lab/look", input: {}, key: [], commit: (i) => call<unknown, "NoResponse">("look")(i) });
const keyed = transaction({ id: "lab/keyed", input: { o: U }, key: ["o"], concurrency: "reject", commit: write("keyed") });
const kept = (persisted: boolean) => {
  const d = definition({
    id: KeptId,
    states: { A: {}, W: {}, B: {}, P: {}, T: {} },
    events: {
      ToP: {}, GoOddKey: {}, Go: { id: U, at: U }, IfIdle: {}, Forget: {}, Arm: {}, Leave: {}, Note: { text: U }, RaiseBad: { v: U }, LookBoom: {},
      GoKey: { o: U }, IfKeyIdle: { o: U }, Who: { who: U }, WhoOdd: { n: U },
    },
    internalEvents: {
      OddOk: {}, OddNo: { id: U }, OddUnsure: {}, Saved: { v: U }, SaveNo: { id: U, why: U }, SaveUnsure: {}, GiveUp: {}, Looked: {}, LookNo: {},
      KeyedOk: {}, KeyedNo: {}, KeyedUnsure: {},
    },
    memory: {
      presses: Flow.initial(S.Number, 0), ids: Flow.initial(S.Array(S.String), ["x"]), who: Flow.initial(U, "1"),
      last: Flow.absent(U), gaveUp: Flow.absent(U), note: Flow.absent(U), raised: Flow.absent(U), whoOdd: Flow.absent(U),
    },
    persisted,
    places: { c: Kid, s: Kid, z: Kid },
    operations: ({ E }) => ({
      save: save.outcomes({
        success: E.Saved.from((v) => ({ v: v?.v })),
        failure: { NotSent: E.SaveNo.from((v, c) => ({ id: (c.input as { readonly id: unknown }).id, why: v?.why })) },
        unknown: E.SaveUnsure.from(() => ({})),
      }),
      oddKey: oddKey.outcomes({ success: E.OddOk, failure: { NotSent: E.OddNo.from((_v, c) => ({ id: (c.input as { readonly id: unknown }).id })) }, unknown: E.OddUnsure }),
      look: look.outcomes({ success: E.Looked, failure: { NoResponse: E.LookNo, Defect: E.LookNo, Interrupted: E.LookNo } }),
      keyed: keyed.outcomes({ success: E.KeyedOk, failure: { NotSent: E.KeyedNo }, unknown: E.KeyedUnsure }),
    }),
  });
  return machine(d, ({ S: St, E, O }) => ({
    default: St.A,
    on: {
      ToP: St.P,
      GoOddKey: { actions: [O.oddKey.commit(() => ({ id: "kept" }))] },
      OddOk: {},
      OddNo: { updateMemory: ({ event }) => ({ last: `odd:${String(event.id)}` }) },
      OddUnsure: {},
      // M1: a commit whose input has no carried form, and a mapper that reads it.
      Go: { target: St.W, actions: [O.save.commit(({ event }) => ({ id: event.id ?? "a", at: event.at ?? "fine" }))] },
      Saved: {
        target: St.B,
        updateMemory: ({ event }) => {
          if (event.v === "boom" && !heal()) throw new Error("this value");
          return { last: "delivered" };
        },
      },
      SaveNo: { target: St.A, updateMemory: ({ event }) => ({ last: `no:${String(event.id)}:${String(event.why)}` }) },
      SaveUnsure: St.A,
      IfIdle: [{ guard: [O.save.idle(() => ({ id: "a" }))], updateMemory: ({ memory }) => ({ presses: memory.presses + 1 }) }, {}],
      Forget: { actions: [O.save.cancel.key(() => ({ id: "a" }))] },
      // M2: a deadline, and its handler can throw.
      Arm: St.T,
      GiveUp: {
        target: St.A,
        updateMemory: () => {
          if (!heal()) throw new Error("this deadline");
          return { gaveUp: true };
        },
      },
      Leave: St.A,
      Note: { updateMemory: ({ event }) => ({ note: event.text }) },
      // M2: a raise with no name.
      RaiseBad: { updateMemory: () => ({ raised: true }), raise: [E.c.Set.key(({ event }) => (event as { readonly v: string }).v)] },
      // A refused turn takes its commands with it.
      LookBoom: {
        actions: [O.look.lookup(() => ({}))],
        labFollowUps: [
          () => {
            throw new Error("after the member");
          },
        ],
      },
      Looked: {},
      LookNo: {},
      // Names (D119).
      GoKey: { actions: [O.keyed.commit(({ event }) => ({ o: event.o }))] },
      KeyedOk: {},
      KeyedNo: {},
      KeyedUnsure: {},
      IfKeyIdle: [{ guard: [O.keyed.idle(({ event }) => ({ o: BigInt(event.o as string) }))], updateMemory: ({ memory }) => ({ presses: memory.presses + 1 }) }, {}],
      Who: { updateMemory: ({ event }) => ({ who: event.who }) },
      WhoOdd: { updateMemory: ({ event }) => ({ whoOdd: event.n }) },
    },
    traits: {
      c: { each: { of: "ids", max: 4 } },
      s: { resetOn: ({ memory }) => BigInt(memory.who as string) },
      z: { resetOn: ({ memory }) => (memory.whoOdd === undefined ? "same" : new Set([memory.whoOdd])) },
    },
    states: {
      P: { traits: { rz: { fragment: Spinny, resumable: true } } },
      T: { schedules: { t: { schedule: "1 second", send: E.GiveUp } } },
    },
  }));
};
const kepts = new Map<boolean, ReturnType<typeof fixture>>();
export const keptFixture = (o: { persisted?: boolean } = {}) => {
  const p = o.persisted ?? true;
  return kepts.get(p) ?? kepts.set(p, fixture(kept(p))).get(p)!;
};
