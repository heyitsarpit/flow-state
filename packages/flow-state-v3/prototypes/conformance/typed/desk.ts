// Round 11: `fixtures/desk.compiled.ts`, written in the public API where it has no `domain`: TraitWrite, EachWrite, LateFill, EachReset. Desk/Tickets and
// TraitStore carry a `domain` (and Tickets streams) and wait for the entity step (finding F5): re-exported hand.
import { Schema } from "effect";
import type { Op } from "../fixtures/compiled.ts";
import { definition, Flow, fragment, machine, transaction } from "./flow.ts";
import { call, fixture, write } from "./lab.ts";

export {
  ticketRef,
  deskServer,
  deskFixture,
  deskNoVersionFixture,
  deskListenFixture,
  deskListenNoVersionFixture,
  deskListenLexicalFixture,
  deskTwoFeedsFixture,
  deskTwoFeedsNoVersionFixture,
  thingRef,
  traitStoreFixture,
  type StoreShape,
} from "../fixtures/desk.compiled.ts";

const S = Schema;
const U = S.Unknown;
const Strs = S.Array(S.String);

// ── A persisted trait with a write. `.resumable()` on its tab. For rebind and reload (review H5, H6).
const TW = "Lab/TraitWrite";
const traitWrite = (policy: Op["concurrency"], persisted: boolean) => {
  const put = transaction({ id: "lab/put", input: { k: U }, key: ["k"], concurrency: policy, commit: write<unknown, "Refused">("put") });
  const Trait = fragment(
    {
      id: "TW",
      events: { Go: { k: U }, Resend: {} },
      internalEvents: { Ok: { k: U }, No: { k: U, why: U }, Unsure: { k: U, why: U } },
      memory: { got: Flow.initial(Strs, []) },
      operations: ({ E }) => ({
        put: put.outcomes({
          success: E.Ok.from((_v, c) => ({ k: (c.key as { readonly k: unknown }).k })),
          failure: {
            Refused: E.No.from((_v, c) => ({ k: (c.key as { readonly k: unknown }).k, why: "Refused" })),
            NotSent: E.No.from((v, c) => ({ k: (c.key as { readonly k: unknown }).k, why: v.why })),
          },
          unknown: E.Unsure.from((_v, c) => ({ k: (c.key as { readonly k: unknown }).k, why: c.reason })),
        }),
      }),
    },
    ({ O }) => ({
      on: {
        Go: { actions: [O.put.commit(({ event }) => ({ k: event.k ?? "a" }))] },
        Resend: { actions: [O.put.retry.key(() => ({ k: "a" }))] },
        Ok: { updateMemory: ({ memory, event }) => ({ got: [...memory.got, `ok:${String(event.k)}`] }) },
        No: { updateMemory: ({ memory, event }) => ({ got: [...memory.got, `no:${String(event.k)}:${String(event.why)}`] }) },
        Unsure: { updateMemory: ({ memory, event }) => ({ got: [...memory.got, `unsure:${String(event.k)}:${String(event.why)}`] }) },
      },
    }),
  );
  const d = definition({ id: TW, states: { TAB: {}, AWAY: {} }, events: { Away: {}, Back: {} }, internalEvents: {}, memory: {}, persisted, places: { t: Trait }, operations: () => ({}) });
  return machine(d, ({ S: St }) => ({ default: St.TAB, on: { Away: St.AWAY, Back: St.TAB }, states: { TAB: { traits: { t: { resumable: true } } } } }));
};
export const traitWriteFixture = fixture(traitWrite("serialize", true));

// ── Copies under `.each` with one key across them: rule 51 under `serialize`, where the lane's own decline cannot hide it.
const EW = "Lab/EachWrite";
// Not `unknownWhenLost`: the hand fixture's commit answers a lost call as a failure.
const ewPut = transaction({ id: "lab/put", input: { k: U }, key: ["k"], concurrency: "serialize", commit: (i, { attempt }) => call("put")(i, attempt.id) });
const Copy = fragment(
  {
    id: "Copy",
    events: { Go: {} },
    internalEvents: { Ok: {}, No: { why: U }, Unsure: {} },
    memory: { got: Flow.initial(Strs, []) },
    operations: ({ E }) => ({ put: ewPut.outcomes({ success: E.Ok, failure: { NotSent: E.No.from((v) => ({ why: v.why })) }, unknown: E.Unsure }) }),
  },
  ({ O }) => ({
    on: {
      Go: { actions: [O.put.commit(() => ({ k: "shared" }))] },
      Ok: { updateMemory: ({ memory }) => ({ got: [...memory.got, "ok"] }) },
      No: { updateMemory: ({ memory, event }) => ({ got: [...memory.got, `no:${String(event.why)}`] }) },
      Unsure: {},
    },
  }),
);
const eachWrite = definition({ id: EW, states: {}, events: {}, internalEvents: {}, memory: { ids: Flow.initial(Strs, ["x", "y"]) }, persisted: false, places: { c: Copy }, operations: () => ({}) });
export const eachWriteFixture = fixture(machine(eachWrite, () => ({ default: { node: "root" }, traits: { c: { each: { of: "ids", max: 8 } } } })));

// ── Rule 15 in step 3: a late ending's filling may not leave what the host's state still owns.
const LF = "Lab/LateFill";
const plain = (id: string) => transaction({ id: `lab/${id}`, input: {}, key: [], concurrency: "reject", commit: (i, { attempt }) => call(id)(i, attempt.id) });
const kidPut = plain("kidPut");
const hostPut = plain("hostPut");
const Kid = fragment(
  {
    id: "Kid",
    states: { A: {}, B: {} },
    default: "A",
    events: { Go: {}, Move: {} },
    internalEvents: { Done: {}, Failed: {}, Unsure: {} },
    exits: { Finished: Flow.Exit({}) },
    operations: ({ E }) => ({ kidPut: kidPut.outcomes({ success: E.Done, failure: { NotSent: E.Failed }, unknown: E.Unsure }) }),
  },
  ({ S: St, O, exits }) => ({
    on: { Done: exits.Finished, Failed: {}, Unsure: {} },
    states: { A: { on: { Go: { actions: [O.kidPut.commit(() => ({}))] }, Move: St.B } } },
  }),
);
const lateFill = definition({
  id: LF,
  states: { HOST: {}, OTHER: {} },
  events: { HostGo: {} },
  internalEvents: { Failed: {}, Unsure: {}, HostDone: {} },
  memory: {},
  persisted: false,
  places: { kid: Kid },
  operations: ({ E }) => ({ hostPut: hostPut.outcomes({ success: E.HostDone, failure: { NotSent: E.Failed }, unknown: E.Unsure }) }),
});
export const lateFillFixture = fixture(
  machine(lateFill, ({ S: St, O }) => ({
    default: St.HOST,
    on: { Failed: {}, Unsure: {}, HostDone: {} },
    states: { HOST: { on: { HostGo: { actions: [O.hostPut.commit(() => ({}))] } }, traits: { kid: { exits: { Finished: St.OTHER } } } } },
  })),
);

// ── Review M2: a callback's patch moves an `.each` placement's reset value, so the reset is a pending one.
const ER = "Lab/EachReset";
const Item = fragment({ id: "Item", events: { Bump: {} }, callbacks: { Bumped: Flow.Callback({}) }, memory: { fresh: Flow.initial(S.Boolean, true) } }, ({ callbacks }) => ({
  on: { Bump: { notify: [callbacks.Bumped] } },
}));
const eachReset = definition({ id: ER, states: {}, events: {}, internalEvents: {}, memory: { ids: Flow.initial(Strs, ["x", "y"]), v: Flow.initial(S.Number, 0) }, persisted: false, places: { c: Item }, operations: () => ({}) });
export const eachResetFixture = fixture(
  machine(eachReset, () => ({
    default: { node: "root" },
    traits: { c: { each: { of: "ids", max: 8 }, resetOn: ({ memory }) => memory.v, callbacks: { Bumped: { updateMemory: ({ memory }) => ({ v: memory.v + 1 }) } } } },
  })),
);
