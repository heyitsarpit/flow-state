// Round 12, compile prototype: machines (machine-design 2.3, 2.7.3). Two calls, as the design has them: `definition` holds structure (states as an ordered
// list, events, memory, placement of traits and subroutines, operations), so `S`, `E` and `O` are known before the body; `machine(Definition, body)` fills
// every placement at its node and writes the handlers. Compiles to `CompiledOutput`, with every placed fragment and its operations hoisted (rules 49, 51).
import type { CompiledOutput, DomainSpec, Mapped, StreamSpec } from "../fixtures/compiled.ts";
import { slotOf, type Fields } from "./core.ts";
import { payloadsOf, tokens, type EventPayloads, type EventsOf } from "./events.ts";
import { compileMemory, type MemoryFields, type MemoryOf } from "./memory.ts";
import type { ReqsOf } from "./fragment.ts";
import { compileOp, handles, type AnyBound, type HandleOf, type RequirementsOf, type Typed } from "./operations.ts";
import {
  collect,
  compileNodes,
  parseStates,
  placeToksOf,
  statesOf,
  type Activities,
  type Filling,
  type FragmentValue,
  type On,
  type PlaceToksOf,
  type SchedSpec,
  type StateBody,
  type StateList,
  type StateTok,
  type StatesOf,
  type Traits,
  type TraitsOf,
} from "./body.ts";

// ── SEAM (D209): the entity and session modules' data, in `Compiled`'s own shape, with plain closures made Slots under their own paths. NOT the design's
// entity API (2.8) or stream contract (2.11): those compile prototypes are the entity round's (HANDOFF plan cut, step 4).
type Fn = (...a: never[]) => unknown;
export type DomainIn = {
  readonly writes: Readonly<Record<string, { readonly predicts: Fn; readonly confirms?: Fn }>>;
  readonly reads?: Readonly<Record<string, Fn>>;
  readonly listens?: Readonly<Record<string, Fn>>;
  readonly repair: Fn;
  readonly version?: Fn;
  readonly versionOrder?: "lexical" | Fn;
};
const compileDomain = (id: string, d: DomainIn): DomainSpec =>
  ({
    writes: Object.fromEntries(
      Object.entries(d.writes).map(([op, w]) => [op, { predicts: slotOf(id, `domain.writes.${op}.predicts`, w.predicts), ...(w.confirms ? { confirms: slotOf(id, `domain.writes.${op}.confirms`, w.confirms) } : {}) }]),
    ),
    reads: Object.fromEntries(Object.entries(d.reads ?? {}).map(([op, f]) => [op, slotOf(id, `domain.reads.${op}`, f)])),
    ...(d.listens ? { listens: Object.fromEntries(Object.entries(d.listens).map(([op, f]) => [op, slotOf(id, `domain.listens.${op}`, f)])) } : {}),
    repair: slotOf(id, "domain.repair", d.repair),
    ...(d.version ? { version: slotOf(id, "domain.version", d.version) } : {}),
    ...(d.versionOrder === undefined ? {} : { versionOrder: d.versionOrder === "lexical" ? "lexical" : slotOf(id, "domain.versionOrder", d.versionOrder) }),
  }) as unknown as DomainSpec;
type MappedIn = { readonly tag: string; readonly fromFn?: unknown };
export type StreamIn = Omit<StreamSpec, "key" | "backoff" | "subscribe" | "reconnectWhile" | "pageRetryWhile" | "catchUp" | "value" | "missed" | "failure" | "failureBy" | "pages"> & {
  readonly key: Fn;
  readonly backoff: Fn;
  readonly subscribe: Fn;
  readonly reconnectWhile?: Fn;
  readonly pageRetryWhile?: Fn;
  readonly catchUp?: Fn;
  readonly value: MappedIn;
  readonly missed: MappedIn;
  readonly failure: MappedIn;
  readonly failureBy?: Readonly<Record<string, MappedIn>>;
  readonly pages?: MappedIn;
};
const streamMapped = (id: string, op: string, name: string, t: MappedIn): Mapped => ({ event: t.tag, ...(t.fromFn ? { from: slotOf(id, `streams.${op}.${name}`, t.fromFn) } : {}) });
const compileStreams = (id: string, s: Readonly<Record<string, StreamIn>>): Readonly<Record<string, StreamSpec>> =>
  Object.fromEntries(
    Object.entries(s).map(([op, x]) => {
      const sl = (n: string, f: Fn | undefined) => (f ? { [n]: slotOf(id, `streams.${op}.${n === "reconnectWhile" ? "reconnect.while" : n === "pageRetryWhile" ? "page.while" : n}`, f) } : {});
      const { key, backoff, subscribe, reconnectWhile, pageRetryWhile, catchUp, value, missed, failure, failureBy, pages, ...data } = x;
      return [
        op,
        {
          ...data,
          ...sl("key", key),
          ...sl("backoff", backoff),
          ...sl("subscribe", subscribe),
          ...sl("reconnectWhile", reconnectWhile),
          ...sl("pageRetryWhile", pageRetryWhile),
          ...sl("catchUp", catchUp),
          value: streamMapped(id, op, "value", value),
          missed: streamMapped(id, op, "missed", missed),
          failure: streamMapped(id, op, "failure", failure),
          ...(failureBy ? { failureBy: Object.fromEntries(Object.entries(failureBy).map(([k, t]) => [k, streamMapped(id, op, `failureBy.${k}`, t)])) } : {}),
          ...(pages ? { pages: streamMapped(id, op, "pages", pages) } : {}),
        } as unknown as StreamSpec,
      ];
    }),
  );

type DefIn<T extends StateList, Ev, In_, M extends MemoryFields, O, Tr extends Traits> = {
  readonly id: string;
  readonly states: T;
  readonly events: Ev;
  readonly internalEvents: In_;
  readonly memory: M;
  readonly traits?: Tr; // the root node's traits (2.3); a node's are on `Flow.state(..., { traits })`
  readonly persisted?: boolean;
  readonly local?: true; // a local identity (D21), whose lanes are never adopted
  readonly uses?: readonly string[]; // the modules its operations import, by name (D44)
  readonly operations: (t: { readonly E: EventsOf<In_ & {}> }) => O;
  readonly domain?: DomainIn; // SEAM (D209)
  readonly streams?: (t: { readonly E: EventsOf<In_ & {}> }) => Readonly<Record<string, StreamIn>>; // SEAM (D209)
};
export const definition = <
  const T extends StateList,
  Ev extends Readonly<Record<string, Fields>>,
  In_ extends Readonly<Record<string, Fields>>,
  M extends MemoryFields,
  O extends Readonly<Record<string, AnyBound>>,
  const Tr extends Traits = {},
>(
  d: DefIn<T, Ev, In_, M, O, Tr>,
) => ({ ...d, ops: d.operations({ E: tokens(d.internalEvents) as never }), tree: parseStates(d.states, d.traits ?? {}) });
type Def<T extends StateList, Ev, In_, M extends MemoryFields, O, Tr extends Traits> = DefIn<T, Ev, In_, M, O, Tr> & {
  readonly ops: O;
  readonly tree: ReturnType<typeof parseStates>;
};
type All<Ev, In_> = EventPayloads<Ev & In_ & {}>;
export const machine = <
  const T extends StateList,
  Ev extends Readonly<Record<string, Fields>>,
  In_ extends Readonly<Record<string, Fields>>,
  M extends MemoryFields,
  O extends Readonly<Record<string, AnyBound>>,
  const Tr extends Traits = {},
>(
  d: Def<T, Ev, In_, M, O, Tr>,
  body: (t: {
    readonly S: StatesOf<T>;
    readonly E: EventsOf<Ev & In_ & {}> & PlaceToksOf<Tr & TraitsOf<T>>;
    readonly O: { readonly [K in keyof O]: HandleOf<O[K], MemoryOf<M>> };
  }) => {
    readonly default: StateTok;
    readonly on?: On<MemoryOf<M>, All<Ev, In_>>;
    readonly traits?: { readonly [K in keyof Tr]?: Filling<MemoryOf<M>> };
    readonly schedules?: Readonly<Record<string, SchedSpec<string>>>;
    readonly activities?: Activities<MemoryOf<M>>;
    readonly states?: { readonly [K in keyof StatesOf<T> & string]?: StateBody<MemoryOf<M>, All<Ev, In_>> };
  },
): Typed<RequirementsOf<O> | ReqsOf<Tr & TraitsOf<T>>> => {
  const tree = d.tree;
  const b = body({ S: statesOf<T>(tree), E: { ...tokens({ ...d.events, ...d.internalEvents }), ...placeToksOf(tree) } as never, O: handles<O, MemoryOf<M>>(d.ops) });
  const placed: FragmentValue[] = [];
  const nodes = compileNodes(d.id, tree, b as never, placed);
  const frags = collect(placed);
  const fragOps = Object.fromEntries(frags.flatMap((f) => Object.entries(f.ops)));
  for (const k of Object.keys(fragOps))
    if (k in d.ops || frags.filter((f) => k in f.ops).length > 1) throw new Error(`DuplicateOperation: ${d.id} has two operations named ${k} (rule 51)`);
  const events = { ...d.events, ...d.internalEvents } as Readonly<Record<string, Fields>>;
  const streams = d.streams ? compileStreams(d.id, d.streams({ E: tokens(d.internalEvents) as never })) : {};
  const compiled: CompiledOutput = {
    id: d.id,
    nodes,
    root: "root",
    default: b.default.node,
    memory: compileMemory(d.id, d.memory),
    ops: { ...Object.fromEntries(Object.entries(d.ops).map(([k, x]) => [k, compileOp(d.id, k, x, events)])), ...fragOps },
    ...(frags.length ? { fragments: Object.fromEntries(frags.map((f) => [f.id, f.compiled])) } : {}),
    persisted: d.persisted ?? true,
    ...(d.local ? { local: true as const } : {}),
    uses: d.uses ?? [],
    ...(d.domain ? { domain: compileDomain(d.id, d.domain) } : {}),
    ...(Object.keys(streams).length ? { streams } : {}),
    events: { external: Object.keys(d.events), internal: Object.keys(d.internalEvents), payloads: payloadsOf(events) }, // round 13 (M3): with payload Schemas
  };
  return { compiled };
};
