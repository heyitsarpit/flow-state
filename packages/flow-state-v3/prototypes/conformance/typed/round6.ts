// Round 11: `fixtures/round6.compiled.ts`, written in the public API: MemoryRelease, RowMove, Getter. A box stands for a release: a scenario flips it between
// a kill and a boot, so the closures read it when they run, as the hand ones do. KeyRelease's release 2 renames its key by a closure (`{ key: i.k }`), which
// no field list makes (finding F2), and Engine carries a `domain` and streams (finding F5): both re-exported hand.
import { Effect, Schema } from "effect";
import { definition, Flow, machine, transaction } from "./flow.ts";
import { fixture, write } from "./lab.ts";

export { engineRef, keyReleaseFixture, type Release } from "../fixtures/round6.compiled.ts";
import { engineRef, type Release } from "../fixtures/round6.compiled.ts";
import type { Api } from "../fake-world.ts";

const S = Schema;
const M = "Lab/MemoryRelease";
const put = transaction({ id: "lab/put", input: {}, key: [], concurrency: "reject", commit: write("put") });
// M8: release 2's `Ok` reads a field release 1 never stored. `decode`: the field's Schema has a decoding default, so a restore fills it (D82, now a Schema).
const memoryRelease = (rel: Release, decode: boolean) => {
  const Extra = S.Struct({ n: S.Number });
  const d = definition({
    id: M,
    states: {},
    events: { Go: {} },
    internalEvents: { Ok: {}, No: {}, Unsure: {} },
    memory: {
      oks: Flow.initial(S.Number, 0),
      extra: Flow.absent(decode ? Extra.pipe(S.withDecodingDefaultKey(Effect.succeed({ n: 0 }))) : Extra),
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

const RM = "Lab/RowMove";
// Stage J (re-check 10i S1): a row moves while its write is out. Each state handles the write's unknown its own way.
const rowMove = definition({
  id: RM,
  states: { EDITING: {}, SAVING: {}, REVIEW: {} },
  events: { Go: {}, Review: {} },
  internalEvents: { Ok: {}, No: {}, Unsure: {} },
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
const rename = transaction({ id: "lab/rename", input: { id: S.Unknown, title: S.Unknown }, key: ["id", "title"], concurrency: "reject", commit: write("rename") });
const engine = (api: Api) =>
  machine(
    definition({
      id: "Lab/Engine",
      states: { ON: {} },
      events: { Rename: { id: S.Unknown, title: S.Unknown } },
      internalEvents: { Done: {}, No: {}, Unsure: {} },
      memory: {},
      persisted: false,
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
const getter = definition({ id: G, states: {}, events: { Trap: {} }, internalEvents: {}, memory: { x: Flow.initial(S.Number, 0) }, operations: () => ({}) });
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
