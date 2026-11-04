// Round 12, compile prototype: fragments (machine-design 2.1-2.2, 2.9). `trait(declaration, body)` and `subroutine(declaration, body)`: the ports at the top
// level, named by direction (`events`, `hostEvents`, `internalEvents`, `guards`, `callbacks`, `exits`), memory with `Flow` modifiers, children placed in
// the declaration's `traits` (2.3: placement is structure), and `operations` (rule 49). The body fills its children and handles its events.
// Compiles to a `CompiledFragment` and the fragment's operations, which join the host's at placement (rules 49, 51).
import type { CompiledFragment } from "../fixtures/compiled.ts";
import { slotOf, type Fields, type TypeOf } from "./core.ts";
import { tokens, type EventPayloads, type EventsOf } from "./events.ts";
import { compileMemory, type MemoryFields, type MemoryOf } from "./memory.ts";
import { compileOp, handles, type Act, type AnyBound, type HandleOf, type In } from "./operations.ts";
import {
  collect,
  compileNodes,
  parseStates,
  placeable,
  placeToksOf,
  statesOf,
  type Activities,
  type ExitTok,
  type Filling,
  type FragmentValue,
  type NotifyTok,
  type On,
  type PlaceToksOf,
  type Placed,
  type SchedSpec,
  type StateBody,
  type StateList,
  type StatesOf,
  type Traits,
  type TraitsOf,
} from "./body.ts";

type Ports = Readonly<Record<string, { readonly fields: Fields }>>;
type GuardPorts = Readonly<Record<string, { readonly guard: true }>>;
// 2.2.1: ports are values of the `Flow` module, not Schemas.
export const Exit = <F extends Fields>(fields: F) => ({ fields });
export const Callback = <F extends Fields>(fields: F) => ({ fields });
export const Guard = { guard: true } as const;

type Decl<T extends StateList, Ev, Host, In_, X extends Ports, C extends Ports, M extends MemoryFields, Tr extends Traits, G extends GuardPorts, O> = {
  readonly id: string;
  readonly states?: T;
  readonly default?: string;
  readonly events?: Ev;
  readonly hostEvents?: Host;
  readonly internalEvents?: In_;
  readonly exits?: X;
  readonly callbacks?: C;
  readonly guards?: G;
  readonly memory?: M;
  readonly traits?: Tr; // its children, placed here (2.3), filled in the body
  readonly operations?: (t: { readonly E: EventsOf<In_ & {}> }) => O;
};
type Body<T extends StateList, Ev, Host, In_, X extends Ports, C extends Ports, M extends MemoryFields, Tr extends Traits, G extends GuardPorts, O> = (t: {
  readonly S: StatesOf<T>;
  readonly E: EventsOf<Ev & Host & In_ & {}> & PlaceToksOf<Tr & TraitsOf<T>>;
  readonly exits: {
    readonly [K in keyof X]: ExitTok<MemoryOf<M>, unknown> & {
      readonly from: <V>(f: (a: In<MemoryOf<M>, V>) => TypeOf<X[K]["fields"]>) => ExitTok<MemoryOf<M>, V>;
    };
  };
  readonly callbacks: {
    readonly [K in keyof C]: NotifyTok<MemoryOf<M>, unknown> & {
      readonly from: <V>(f: (a: In<MemoryOf<M>, V>) => TypeOf<C[K]["fields"]>) => NotifyTok<MemoryOf<M>, V>;
    };
  };
  readonly guards: { readonly [K in keyof G]: { readonly port: string } };
  readonly O: { readonly [K in keyof O]: HandleOf<O[K], MemoryOf<M>> };
}) => {
  readonly on?: On<MemoryOf<M>, EventPayloads<Ev & Host & In_ & {}>>;
  readonly schedules?: Readonly<Record<string, SchedSpec<string>>>;
  readonly traits?: { readonly [K in keyof Tr]?: Filling<MemoryOf<M>> };
  readonly activities?: Activities<MemoryOf<M>>; // rules 41, 52
  readonly states?: { readonly [K in string]?: StateBody<MemoryOf<M>, EventPayloads<Ev & Host & In_ & {}>> };
  // 2.2: notified when the incarnation ends, except by an exit; a key-less `O.x.cancel` here releases (rule 60)
  readonly whenAbandoned?: ReadonlyArray<NotifyTok<MemoryOf<M>, unknown> | Act>;
};
export type FragmentOf<Ev, Host> = Omit<FragmentValue, "hostEvents" | "events"> & { readonly hostEvents: Host; readonly events: Ev };

const make =
  (kind: "trait" | "subroutine") =>
  <
    const T extends StateList = [],
    Ev extends Readonly<Record<string, Fields>> = {},
    Host extends Readonly<Record<string, Fields>> = {},
    In_ extends Readonly<Record<string, Fields>> = {},
    X extends Ports = {},
    C extends Ports = {},
    M extends MemoryFields = {},
    const Tr extends Traits = {},
    G extends GuardPorts = {},
    O extends Readonly<Record<string, AnyBound>> = {},
  >(
    d: Decl<T, Ev, Host, In_, X, C, M, Tr, G, O>,
    body: Body<T, Ev, Host, In_, X, C, M, Tr, G, O>,
  ): Placed<FragmentOf<Ev, Host>> => {
    const tree = parseStates(d.states, d.traits ?? {});
    const exitToks = Object.fromEntries(Object.keys(d.exits ?? {}).map((name) => [name, { exit: { name }, from: (f: unknown) => ({ exit: { name, f } }) }]));
    const cb = Object.fromEntries(Object.keys(d.callbacks ?? {}).map((name) => [name, { name, from: (f: unknown) => ({ name, f }) }]));
    const gp = Object.fromEntries(Object.keys(d.guards ?? {}).map((name) => [name, { port: name }]));
    const ops = d.operations ? d.operations({ E: tokens((d.internalEvents ?? {}) as In_) as never }) : ({} as O);
    const b = body({
      S: statesOf<T>(tree),
      E: { ...tokens({ ...d.events, ...d.hostEvents, ...d.internalEvents } as Readonly<Record<string, Fields>>), ...placeToksOf(tree) } as never,
      exits: exitToks as never,
      callbacks: cb as never,
      guards: gp as never,
      O: handles<O, MemoryOf<M>>(ops),
    });
    const placed: FragmentValue[] = [];
    const abandon = b.whenAbandoned ?? [];
    // `O.x.cancel` is a function too (it takes a key), so a member is told by `member`, not by `name`.
    const isAct = (x: unknown): x is Act => (typeof x === "object" || typeof x === "function") && x !== null && "member" in x;
    const notify = abandon.filter((x): x is NotifyTok<MemoryOf<M>, unknown> => !isAct(x));
    const release = abandon.filter(isAct).map((a) => a.op);
    const compiled: CompiledFragment = {
      id: d.id,
      root: "root",
      default: d.default ?? "root",
      nodes: compileNodes(d.id, tree, b as never, placed),
      memory: compileMemory(d.id, (d.memory ?? {}) as M),
      ...(abandon.length
        ? {
            whenAbandoned: {
              ...(notify.length ? { notify: notify.map((n, i) => ({ name: n.name, ...(n.f ? { from: slotOf(d.id, `whenAbandoned[${i}]`, n.f) } : {}) })) } : {}),
              ...(release.length ? { release } : {}),
            },
          }
        : {}),
    };
    const events = { ...d.events, ...d.hostEvents, ...d.internalEvents } as Readonly<Record<string, Fields>>;
    return placeable({
      id: d.id,
      kind,
      compiled,
      ops: Object.fromEntries(Object.entries(ops).map(([k, x]) => [k, compileOp(d.id, k, x, events, d.id)])),
      places: collect(placed),
      hostEvents: (d.hostEvents ?? {}) as Host,
      events: (d.events ?? {}) as Ev,
    });
  };
export const trait = make("trait");
export const subroutine = make("subroutine");
