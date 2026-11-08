// Round 11: `fixtures/round6.compiled.ts`, written in the public API: MemoryRelease, RowMove, Getter. A box stands for a release: a scenario flips it between
// a kill and a boot, so the closures read it when they run, as the hand ones do. KeyRelease's release 2 renames its key by a closure (`{ key: i.k }`), which
// no field list makes (finding F2), and Engine carries a `domain` and streams (finding F5): both re-exported hand.
import { Effect, Schema } from "effect";
import { definition, Flow, machine, transaction } from "../compile/index.ts";
import { FakeApi, fixture, write } from "./lab.ts";

export { engineRef, keyReleaseFixture, type Release } from "../fixtures/round6.compiled.ts";
import { engineRef, type Release } from "../fixtures/round6.compiled.ts";
import type { Api } from "../fake-world.ts";

const S = Schema;
const M = "Lab/MemoryRelease";
const put = transaction({ id: "lab/put", input: {}, key: [], concurrency: "reject", services: [FakeApi], commit: write("put") });
// M8: release 2's `Ok` reads a field release 1 never stored. `decode`: the field's Schema has a decoding default, so a restore fills it (D82, now a Schema).
const memoryRelease = (rel: Release, decode: boolean) => {
  const Extra = S.Struct({ n: S.Number });
  const d = definition({
    id: M,
    states: [],
    events: { Go: {} },
    internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
    memory: {
      oks: Flow.initial(S.Number, 0),
      extra: decode ? Extra.pipe(S.withDecodingDefaultKey(Effect.succeed({ n: 0 }))) : S.optionalKey(Extra),
    },
    operations: ({ E }) => ({ put: put.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
  });
  return machine(d, ({ O }) => ({
    default: { node: "root" },
    on: {
      Go: { actions: [O.put.commit(() => ({}))] },
      Ok: { updateMemory: ({ memory }) => (rel.v === 1 ? { oks: memory.oks + 1 } : { oks: (memory.extra as { readonly n: number }).n + memory.oks + 1 }) },
      No: {},
      Unsure: { updateMemory: ({ memory }) => (rel.v === 1 ? { oks: memory.oks } : { oks: (memory.extra as { readonly n: number }).n + memory.oks + 100 }) },
    },
  }));
};
export const memoryReleaseFixture = (rel: Release, decode: boolean) => fixture(memoryRelease(rel, decode));

// Round 12 (review M5, D215): KeyRelease's production path on a typed machine. A release changes the contract's `key`, a field list (rule 39), and the
// harness compiles again at the boot after a release. Release 1 keys by `k`; release 2 by `id`; release 3 by `k` and `region`, a field the stored input
// lacks. Round 13 (D221): each is a new version of the op, so a release-1 hold is an old-version hold under either, never renamed.
const keyRelease = (rel: Release) => {
  const keys = rel.v === 1 ? (["k"] as const) : rel.v === 2 ? (["id"] as const) : (["k", "region"] as const);
  // Round 13 (D221): a key field is required, so release 3's `region` is required where it is a key field.
  const charge = transaction({ id: "lab/charge", input: { k: S.Unknown, id: S.Unknown, region: rel.v === 3 ? S.Unknown : S.optionalKey(S.Unknown) }, key: keys, concurrency: "reject", services: [FakeApi], commit: write("charge") });
  const d = definition({
    id: "Lab/KeyReleaseTyped",
    states: [],
    events: { Go: {} },
    internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
    memory: { unsure: Flow.initial(S.Number, 0) },
    operations: ({ E }) => ({ charge: charge.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
  });
  return machine(d, ({ O }) => ({
    default: { node: "root" },
    on: {
      // Release 3's commits supply the new field (mid review M2); the stored input of release 1 lacks it.
      Go: { actions: [O.charge.commit(() => (rel.v === 3 ? { k: "a", id: "x", region: "eu" } : { k: "a", id: "x" }) as never)] }, // the input's type is per release
      Ok: {},
      No: {},
      Unsure: { updateMemory: ({ memory }) => ({ unsure: memory.unsure + 1 }) },
    },
  }));
};
export const keyReleaseTypedFixture = (rel: Release) => fixture(() => keyRelease(rel));

// Round 12 (review Q1): a reload of values whose JSON form is not their decoded form, in a scenario, so a restore with no decode or an encode with no codec is
// red in the suite and not only in `typed/date-check.ts`. A Date, a NaN and a bigint.
const dateD = definition({
  id: "Lab/Dates",
  states: [],
  events: { Touch: {} },
  internalEvents: {},
  memory: { at: Flow.initial(S.Date, new Date(0)), n: Flow.initial(S.Number, 0), big: Flow.initial(S.BigInt, 1n) },
  operations: () => ({}),
});
export const datesFixture = fixture(machine(dateD, () => ({ default: { node: "root" }, on: { Touch: { updateMemory: () => ({ at: new Date(86_400_000), n: Number.NaN, big: 2n }) } } })));

// Round 12 (mid review M3, D214): memory's doors through the Runtime. Release 1 has `n`; release 2 adds a computed field, `twice`, made from the restored
// fields once (D214); release 3 adds a required `Flow.input` with no default, which no stored record can supply, so the record is refused (D214, D46).
const memRelease = (rel: Release) => {
  const memory = {
    n: Flow.initial(S.Number, 0),
    ...(rel.v >= 2 ? { twice: Flow.initial(S.Number, ({ n }: Readonly<Record<string, unknown>>) => (n as number) * 2) } : {}),
    ...(rel.v >= 3 ? { who: Flow.input(S.String) } : {}),
  };
  const d = definition({ id: "Lab/MemDoors", states: [], events: { Bump: {} }, internalEvents: {}, memory: memory as { readonly n: ReturnType<typeof Flow.initial<typeof S.Number>> }, operations: () => ({}) });
  return machine(d, () => ({ default: { node: "root" }, on: { Bump: { updateMemory: ({ memory: m }) => ({ n: m.n + 3 }) } } }));
};
export const memReleaseFixture = (rel: Release) => fixture(() => memRelease(rel));
// A required input, for creation's door (2.2.2: "decode the input with the derived `Input` schema").
const inputD = definition({ id: "Lab/Input", states: [], events: {}, internalEvents: {}, memory: { who: Flow.input(S.String) }, operations: () => ({}) });
export const inputFixture = fixture(machine(inputD, () => ({ default: { node: "root" } })));

// Round 12 (review H1): a commit that dies says what died. Before, the `Defect` issue named the operation only.
const dies = transaction({ id: "lab/dies", input: {}, key: [], concurrency: "reject", commit: () => Effect.die(new Error("the cause of the death")) });
const diesD = definition({
  id: "Lab/Dies",
  states: [],
  events: { Go: {} },
  internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
  memory: {},
  persist: false,
  operations: ({ E }) => ({ dies: dies.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
});
export const diesFixture = fixture(machine(diesD, ({ O }) => ({ default: { node: "root" }, on: { Go: { actions: [O.dies.commit(() => ({}))] }, Ok: {}, No: {}, Unsure: { actions: [O.dies.cancel] } } })));

const RM = "Lab/RowMove";
// Stage J (re-check 10i S1): a row moves while its write is out. Each state handles the write's unknown its own way.
const rowMove = definition({
  id: RM,
  states: ["EDITING", "SAVING", "REVIEW"],
  events: { Go: {}, Review: {} },
  internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
  memory: { inEditing: Flow.initial(S.Number, 0), inSaving: Flow.initial(S.Number, 0), inReview: Flow.initial(S.Number, 0) },
  operations: ({ E }) => ({ put: put.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
});
export const rowMoveFixture = fixture(
  machine(rowMove, ({ S: St, O }) => ({
    default: St.EDITING,
    on: { Ok: {}, No: {} },
    states: {
      EDITING: { on: { Go: { actions: [O.put.commit(() => ({}))], target: St.SAVING }, Unsure: { updateMemory: ({ memory }) => ({ inEditing: memory.inEditing + 1 }) } } },
      SAVING: { on: { Review: St.REVIEW, Unsure: { updateMemory: ({ memory }) => ({ inSaving: memory.inSaving + 1 }), target: St.EDITING } } },
      REVIEW: { on: { Unsure: { updateMemory: ({ memory }) => ({ inReview: memory.inReview + 1 }) } } },
    },
  })),
);

// D81's check: a machine on a sync engine. The feed carries pokes; the write's response says nothing. Domain and stream in `Compiled`'s shape (D209).
// Finding F2: the hand key renamed a field (`{ id, n: i.title }`); a key is the contract's fields (rule 39), so here it is `{ id, title }`.
// `idleMs: Infinity`, as the hand fixture has it: in-process (D194) it is a number like any other; the data view names it a loss (`codec/codec.ts`).
const rename = transaction({ id: "lab/rename", input: { id: S.Unknown, title: S.Unknown }, key: ["id", "title"], concurrency: "reject", services: [FakeApi], commit: write("rename") });
const engine = (api: Api) =>
  machine(
    definition({
      id: "Lab/Engine",
      states: ["ON"],
      events: { Rename: { id: S.Unknown, title: S.Unknown } },
      internalEvents: { Done: {}, No: {}, Unsure: Flow.uncertain({}) },
      memory: {},
      persist: false,
      uses: ["engine", "sessions"],
      domain: {
        writes: { rename: { predicts: (i: { readonly id: string; readonly title: unknown }) => [{ ref: engineRef(i.id), patch: { title: i.title } }] } },
        repair: (ref: string) => api.call("pull", { ref }) as Effect.Effect<unknown, unknown, never>,
      },
      streams: ({ E }) => ({
        changes: {
          id: "changes",
          listen: true,
          key: () => ({}),
          reconnect: true,
          idleMs: Infinity,
          healthyMs: 60_000,
          backoff: (n: number) => Math.min(30_000, 1000 * 2 ** n),
          subscribe: (i: unknown, { from }: { readonly from: unknown }) => api.socket("changes", i, from),
          value: E.Done,
          missed: E.Done,
          failure: E.No,
        },
      }),
      operations: ({ E }) => ({ rename: rename.outcomes({ success: E.Done, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
    }),
    ({ S: St, O }) => ({
      default: St.ON,
      on: { Rename: { actions: [O.rename.commit(({ event }) => ({ id: event.id, title: event.title }))] }, Done: {}, No: {}, Unsure: {} },
      states: { ON: { activities: [{ op: "changes", input: () => ({}) }] } },
    }),
  );
export const engineFixture = fixture(engine);

const G = "Lab/Getter";
// M11: a patch with a throwing getter: a lazy class instance, a Proxy. Not a memory value any Schema decodes, so only a cast writes it (finding F1).
const getter = definition({ id: G, states: [], events: { Trap: {} }, internalEvents: {}, memory: { x: Flow.initial(S.Number, 0) }, operations: () => ({}) });
export const getterFixture = fixture(
  machine(getter, () => ({
    default: { node: "root" },
    on: {
      Trap: {
        updateMemory: () =>
          Object.defineProperty({}, "x", {
            enumerable: true,
            get() {
              throw new Error("lazy");
            },
          }) as never,
      },
    },
  })),
);
