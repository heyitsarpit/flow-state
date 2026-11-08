// Round 11: `fixtures/round8.compiled.ts`, written in the public API. The bare write with `serialize`, so a commit can queue behind a ticket (H1); three doors
// for a value that cannot encode (D100); copies under `.each`, each with a read (D99); a business key beside the Attempt's own (D106).
import { Effect, Schema } from "effect";
import { definition, deny, Flow, machine, resource, trait, transaction } from "../compile/index.ts";
import { call, FakeApi, fixture, unknownWhenLost, write } from "./lab.ts";
import { BareId } from "./round7.ts";

const S = Schema;
const U = S.Unknown;
const bareEvents = { Go: {}, GoBad: {}, IfIdle: {}, Retry: {}, Forget: {}, Note: { text: S.String }, Peek: {}, NoteBad: {}, NoteGetter: {} } as const;
const bareMemory = {
  note: Flow.initial(U, ""),
  noteCopy: Flow.initial(U, ""),
  peeks: Flow.initial(S.Number, 0),
  last: Flow.initial(U, null),
  who: Flow.input(U.pipe(S.withDecodingDefaultKey(Effect.succeed("a")))),
};
// The serial bare machine: Lab/Bare, with `serialize`, a follow-up, a Map in memory, key-less idle, two deadlines, and a mapper that reads its input.
const serialCharge = transaction({ id: "lab/charge", input: { who: U }, key: [], concurrency: "serialize", services: [FakeApi], commit: write("charge") });
const serial = definition({
  id: BareId,
  persist: true,
  states: ["A", "W", "B", "U", "T", "TF"],
  events: { ...bareEvents, Two: {}, NoteMap: {}, IfIdleK: {}, Arm: {}, ArmFar: {} },
  internalEvents: { Ok: { value: U }, No: { why: U, who: U }, Unsure: Flow.uncertain({}), Fired: {} },
  memory: { ...bareMemory, fired: S.optionalKey(S.Number) },
  operations: ({ E }) => ({
    charge: serialCharge.outcomes({
      success: E.Ok.from((v: unknown) => ({ value: v })),
      // Round 9: a mapper a search can make throw. It reads the input, as a real one does.
      failure: { NotSent: E.No.from((v, c) => ({ why: v?.why, who: (c.input as { readonly who?: unknown } | undefined)?.who })) },
      unknown: E.Unsure,
    }),
  }),
});
const serialMachine = machine(serial, ({ S: St, E, O }) => ({
  default: St.A,
  on: {
    Go: { target: St.W, actions: [O.charge.commit(({ memory }) => ({ who: memory.who }))] },
    GoBad: { target: St.W, actions: [O.charge.commit(() => ({ big: 1n }) as never)] },
    IfIdle: [{ guard: [O.charge.idle(() => ({}))], updateMemory: ({ memory }) => ({ peeks: memory.peeks + 1 }) }, {}],
    Retry: { actions: [O.charge.retry(() => ({}))] },
    Forget: { target: St.A, actions: [O.charge.cancel(() => ({}))] },
    Note: { updateMemory: ({ event }) => ({ note: event.text, noteCopy: event.text }) },
    Peek: [{ guard: [({ memory }) => memory.note === memory.noteCopy || deny("Mixed")], updateMemory: ({ memory }) => ({ peeks: memory.peeks + 1 }) }, {}],
    NoteBad: { updateMemory: () => ({ note: 1n }) },
    NoteGetter: {
      updateMemory: () =>
        Object.defineProperty(new (class Odd {})(), "note", {
          enumerable: true,
          get() {
            throw new Error("a getter");
          },
        }) as never,
    },
    Ok: { target: St.B, updateMemory: ({ event }) => ({ last: event.value ?? null }) },
    No: St.A,
    Unsure: St.U,
    // A follow-up: one send, two turns in one drain. A fatal in the second leaves mail and a pending batch (D98). Not public API (D203).
    Two: { updateMemory: () => ({ note: "two", noteCopy: "two" }), labFollowUps: [() => ({ tag: "Note", payload: { text: "after" } })] },
    NoteMap: { updateMemory: () => ({ note: new Map() }) },
    // Key-less idle (rule 21), so a quarantined lane's hold is read with no key (D88).
    IfIdleK: [{ guard: [O.charge.idle], updateMemory: ({ memory }) => ({ peeks: memory.peeks + 1 }) }, {}],
    Arm: St.T,
    ArmFar: St.TF,
    Fired: { target: St.A, updateMemory: ({ memory }) => ({ fired: (memory.fired ?? 0) + 1 }) },
  },
  states: {
    T: { schedules: { t: { schedule: "1 second", send: E.Fired } } },
    TF: { schedules: { f: { schedule: () => 3_000_000_000, send: E.Fired } } },
  },
}));
const serialFx = fixture(serialMachine);
export const serialBareFixture = () => serialFx;

// A business key (RESULTS' rule for money): the server recognises the second try whatever the client forgot.
const businessCharge = transaction({
  id: "lab/charge",
  input: { who: U },
  key: [],
  concurrency: "reject",
  services: [FakeApi],
  commit: (input) => unknownWhenLost(call<unknown, "NoResponse" | "ServerError">("charge")(input, "business:charge:a")),
});
const business = definition({
  id: BareId,
  persist: true,
  states: ["A", "W", "B", "U"],
  events: bareEvents,
  internalEvents: { Ok: { value: U }, No: {}, Unsure: Flow.uncertain({}) },
  memory: bareMemory,
  operations: ({ E }) => ({ charge: businessCharge.outcomes({ success: E.Ok.from((v: unknown) => ({ value: v })), failure: { NotSent: E.No }, unknown: E.Unsure }) }),
});
const businessFx = fixture(
  machine(business, ({ S: St, O }) => ({
    default: St.A,
    on: {
      Go: { target: St.W, actions: [O.charge.commit(({ memory }) => ({ who: memory.who }))] },
      GoBad: { target: St.W, actions: [O.charge.commit(() => ({ big: 1n }) as never)] },
      IfIdle: [{ guard: [O.charge.idle(() => ({}))], updateMemory: ({ memory }) => ({ peeks: memory.peeks + 1 }) }, {}],
      Retry: { actions: [O.charge.retry(() => ({}))] },
      Forget: { target: St.A, actions: [O.charge.cancel(() => ({}))] },
      Note: { updateMemory: ({ event }) => ({ note: event.text, noteCopy: event.text }) },
      Peek: [{ guard: [({ memory }) => memory.note === memory.noteCopy || deny("Mixed")], updateMemory: ({ memory }) => ({ peeks: memory.peeks + 1 }) }, {}],
      NoteBad: { updateMemory: () => ({ note: 1n }) },
      NoteGetter: {
        updateMemory: () =>
          Object.defineProperty(new (class Odd {})(), "note", {
            enumerable: true,
            get() {
              throw new Error("a getter");
            },
          }) as never,
      },
      Ok: { target: St.B, updateMemory: ({ event }) => ({ last: event.value ?? null }) },
      No: St.A,
      Unsure: St.U,
    },
  })),
);
export const businessKeyFixture = () => businessFx;

export const DoorsId = "Lab/Doors";
const heal = () => (globalThis as { __healed?: boolean }).__healed === true;
const dCharge = transaction({ id: "lab/charge", input: {}, key: [], concurrency: "reject", services: [FakeApi], commit: write<{ readonly v?: unknown }, never>("charge") });
// `other` keys by its whole input, `k`: the hand key was `i => i`, which is this field list for this input.
const other = transaction({ id: "lab/other", input: { k: U }, key: ["k"], concurrency: "reject", services: [FakeApi], commit: write("other") });
const read = resource({ id: "lab/read", input: { v: U }, key: [], services: [FakeApi], lookup: (i) => call<unknown, "NoResponse">("read")(i) });
const boomOp = transaction({ id: "lab/boom", input: {}, key: [], concurrency: "reject", services: [FakeApi], commit: write<{ readonly v?: unknown }, never>("boom") });
const readBoom = resource({ id: "lab/readBoom", input: { v: U }, key: [], services: [FakeApi], lookup: (i) => call<unknown, "NoResponse">("readBoom")(i) });
const readLoop = resource({ id: "lab/readLoop", input: { v: U }, key: [], services: [FakeApi], lookup: (i) => call<unknown, "NoResponse">("readLoop")(i) });
// Finding F2: the hand key was `() => new Set()`, which no field list makes.
const readKey = resource({ id: "lab/readKey", input: { v: U }, key: [], services: [FakeApi], lookup: (i) => call<unknown, "NoResponse">("readKey")(i) });
const doors = definition({
  id: DoorsId,
  persist: true,
  states: ["A", "W", "B", "C"],
  events: {
    Go: {}, OnlyKeyed: { v: U }, Look: { v: U }, LookKeyBad: {}, CancelBad: { v: U }, RetryBad: { v: U }, GoOther: { v: U }, GoBoom: {}, ReadBoom: {},
    LoopLook: {}, LoopGood: {},
  },
  internalEvents: {
    Done: { v: U }, Failed: {}, Unsure: Flow.uncertain({}), Looked: { value: U }, LookFailed: {}, BoomDone: { v: U }, BoomNo: {}, BoomUnsure: Flow.uncertain({}), ReadBoomed: {}, ReadBoomFailed: {},
    LoopFailed: {}, Looped: {}, OtherOk: {}, OtherNo: {}, OtherUnsure: Flow.uncertain({}),
  },
  memory: { looked: Flow.initial(S.Boolean, false), last: Flow.initial(U, null), cancels: Flow.initial(S.Number, 0), retries: Flow.initial(S.Number, 0), loops: S.optionalKey(S.Number) },
  operations: ({ E }) => ({
    charge: dCharge.outcomes({ success: E.Done.from((v) => ({ v: v?.v })), failure: { NotSent: E.Failed }, unknown: E.Unsure }),
    other: other.outcomes({ success: E.OtherOk, failure: { NotSent: E.OtherNo }, unknown: E.OtherUnsure }),
    read: read.outcomes({ success: E.Looked.from((v: unknown) => ({ value: v })), failure: { NoResponse: E.LookFailed, Defect: E.LookFailed, Interrupted: E.LookFailed } }),
    boom: boomOp.outcomes({ success: E.BoomDone.from((v) => ({ v: v?.v })), failure: { NotSent: E.BoomNo }, unknown: E.BoomUnsure }),
    readBoom: readBoom.outcomes({ success: E.ReadBoomed, failure: { NoResponse: E.ReadBoomFailed, Defect: E.ReadBoomFailed, Interrupted: E.ReadBoomFailed } }),
    readLoop: readLoop.outcomes({ success: E.Looped, failure: { NoResponse: E.LoopFailed, Defect: E.LoopFailed, Interrupted: E.LoopFailed } }),
    readKey: readKey.outcomes({ success: E.Looked as never, failure: { NoResponse: E.LookFailed, Defect: E.LookFailed, Interrupted: E.LookFailed } }),
  }),
});
export const doorsFixture = fixture(
  machine(doors, ({ S: St, O }) => {
    const badKey = ({ event }: { readonly event: { readonly v?: unknown } }) => ({ k: event.v });
    return {
      default: St.A,
      on: {
        Go: { target: St.W, actions: [O.charge.commit(() => ({}))] },
        // A success's alternatives: the first asks about a key the server's value cannot make.
        Done: [{ target: St.B, guard: [O.other.idle(badKey)] }, { target: St.C }],
        OnlyKeyed: { target: St.B, guard: [O.other.idle(badKey)] },
        Failed: St.A,
        Unsure: St.A,
        Look: { updateMemory: () => ({ looked: true }), actions: [O.read.lookup(({ event }) => ({ v: event.v }))] },
        LookKeyBad: { actions: [O.readKey.lookup(() => ({ v: "fine" }))] },
        Looked: { updateMemory: ({ event }) => ({ last: event.value ?? "ok" }) },
        LookFailed: { updateMemory: () => ({ last: "failed" }) },
        CancelBad: { updateMemory: () => ({ cancels: 1 }), actions: [O.other.cancel(badKey)] },
        RetryBad: { updateMemory: () => ({ retries: 1 }), actions: [O.other.retry(badKey)] },
        GoOther: { actions: [O.other.commit(({ event }) => ({ k: event.v }))] },
        // A success whose handler throws on this value: the turn refuses, twice. The server did it.
        GoBoom: { target: St.W, actions: [O.boom.commit(() => ({}))] },
        BoomDone: {
          target: St.B,
          updateMemory: ({ event }) => {
            if (event.v === "boom" && !heal()) throw new Error("this value");
            return { last: "delivered" };
          },
        },
        BoomNo: St.A,
        BoomUnsure: St.A,
        ReadBoom: { actions: [O.readBoom.lookup(() => ({ v: "x" }))] },
        ReadBoomed: {
          updateMemory: () => {
            throw new Error("this value");
          },
        },
        ReadBoomFailed: {},
        // The spin: a failure with no I/O, and a handler that asks again.
        LoopLook: { actions: [O.readLoop.lookup(() => ({ v: 1n }))] },
        LoopFailed: { updateMemory: ({ memory }) => ({ loops: (memory.loops ?? 0) + 1 }), actions: [O.readLoop.lookup(() => ({ v: 1n }))] },
        Looped: {},
        // And a good lookup after it, for what the budget lets through later.
        LoopGood: { actions: [O.readLoop.lookup(() => ({ v: "fine" }))] },
        OtherOk: {},
        OtherNo: {},
        OtherUnsure: {},
      },
    };
  }),
);

// Copies under `.each`: a read's ending finds its copy by id (`admitRead`, `pathOfId`), so a repeated id reaches the wrong one (M3).
export const CopiesId = "Lab/Copies";
const load = resource({ id: "lab/load", input: { tag: U }, key: [], services: [FakeApi], lookup: (i) => call<unknown, "NoResponse">("load")(i) });
const IdCopy = trait(
  {
    id: "IdCopy",
    events: { Load: { tag: U } },
    hostEvents: { Set: {} },
    internalEvents: { Loaded: { value: U }, LoadFailed: {} },
    memory: { got: Flow.initial(U, null) },
    operations: ({ E }) => ({
      load: load.outcomes({ success: E.Loaded.from((v: unknown) => ({ value: v })), failure: { NoResponse: E.LoadFailed, Defect: E.LoadFailed, Interrupted: E.LoadFailed } }),
    }),
  },
  ({ O }) => ({
    on: {
      Load: { actions: [O.load.lookup(({ event }) => ({ tag: event.tag }))] },
      Loaded: { updateMemory: ({ event }) => ({ got: event.value }) },
      LoadFailed: {},
      Set: { updateMemory: () => ({ got: "raised" }) },
    },
  }),
);
const copies = definition({
  id: CopiesId,
  persist: true,
  states: [],
  events: { Add: { id: S.String }, Note: { text: U }, BadReset: {}, RaiseTwice: {} },
  internalEvents: {},
  memory: { ids: Flow.initial(S.Array(S.String), ["x"]), note: Flow.initial(U, ""), bad: S.optionalKey(U) },
  traits: { c: IdCopy.each({ of: "ids", max: 16 }), r: IdCopy },
  operations: () => ({}),
});
export const copiesFixture = fixture(
  machine(copies, ({ E }) => ({
    default: { node: "root" },
    on: {
      Add: { updateMemory: ({ memory, event }) => ({ ids: [...memory.ids, event.id] }) },
      Note: { updateMemory: ({ event }) => ({ note: event.text }) },
      BadReset: { updateMemory: () => ({ bad: new Set() }) },
      RaiseTwice: { raise: [E.c.Set.key(() => "x"), E.c.Set.key(() => "x")] },
    },
    traits: { r: { resetOn: ({ memory }) => memory.bad ?? "same" } },
  })),
);

// A commit that fails with no I/O, and a handler that commits again: `Rejected`, behind its own hold, for ever (review M5).
export const LoopId = "Lab/Loop";
const w = transaction({
  id: "lab/w",
  input: {},
  key: [],
  concurrency: "reject",
  commit: (): Effect.Effect<unknown> => {
    throw new Error("at once");
  },
});
const loop = definition({
  id: LoopId,
  states: ["A"],
  events: { Go: {} },
  internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
  memory: { loops: Flow.initial(S.Number, 0) },
  persist: false,
  operations: ({ E }) => ({ w: w.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
});
export const loopFixture = fixture(
  machine(loop, ({ S: St, O }) => ({
    default: St.A,
    on: {
      Go: { actions: [O.w.commit(() => ({}))] },
      Ok: {},
      No: { updateMemory: ({ memory }) => ({ loops: memory.loops + 1 }), actions: [O.w.commit(() => ({}))] },
      Unsure: { actions: [O.w.commit(() => ({}))] },
    },
  })),
);
