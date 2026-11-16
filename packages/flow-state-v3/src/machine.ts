import { Option, Schema } from "effect";
import type { Values } from "./core/compiled.ts";
import { leafOf } from "./core/tree.ts";
import {
  type AnyDefinition,
  codecOf,
  type ChildrenOf,
  type Definition,
  type Machine,
  type ScheduleConfig,
  type MemoryOf,
  type NamesOf,
  type On,
  type PathsOf,
  type StateConfig,
  type StateToken,
  treeOfDefinition,
  type WritableOf,
} from "./definition.ts";
import { flowError } from "./error.ts";
import { eventsOf, fieldOf, memoryCodec, operationOf } from "./compiled-parts.ts";
import { type Compile, nodesOf, tokenMaps } from "./compile-body.ts";

type Parts<D> =
  D extends Definition<infer States, infer Ev, infer In, infer M, infer _O>
    ? {
        readonly Tree: States;
        readonly S: PathsOf<States>;
        readonly Events: Ev & In;
        readonly Memory: MemoryOf<M>;
        readonly Writable: WritableOf<M>;
      }
    : never;

type Handlers<D> = On<Parts<D>["Memory"], Parts<D>["Events"], Parts<D>["S"], Parts<D>["Writable"]>;

type LeafBody<D> = StateConfig<
  Parts<D>["Memory"],
  Parts<D>["Events"],
  Parts<D>["S"],
  Parts<D>["Writable"]
>;

type StatesBody<D, L, P extends string> = {
  readonly [N in NamesOf<L>]?: NodeBody<D, ChildrenOf<L, N>, `${P}${N}.`>;
};

type NodeBody<D, C, P extends string> = [C] extends [never] ? LeafBody<D> : CompoundBody<D, C, P>;

type CompoundBody<D, L, P extends string> = {
  readonly on?: Handlers<D>;
  readonly schedules?: LeafBody<D>["schedules"];
  readonly default: StateToken<`${P}${NamesOf<L>}`>;
  readonly states?: StatesBody<D, L, P>;
};

/**
 * What a machine body returns: the root's default child and handlers, and each state's body,
 * mirroring the definition's tree: a compound has a default direct child and its children's
 * bodies; a leaf has neither.
 */
export type MachineBody<D extends AnyDefinition> = {
  readonly on?: Handlers<D>;
  readonly default: StateToken<`${NamesOf<Parts<D>["Tree"]>}`>;
  readonly states?: StatesBody<D, Parts<D>["Tree"], "">;
};

/**
 * A machine body as the compiler walks it, its literal types erased.
 */
export type AnyBody = {
  // FLOW_STATE_ALLOW_UNKNOWN: an authored or compiled value, checked here before it is trusted.
  readonly default?: unknown;
  readonly on?: Values;
  readonly schedules?: Readonly<Record<string, ScheduleConfig<Values, Values>>>;
  readonly states?: Readonly<Partial<Record<string, AnyBody>>>;
};

const erasedBody = <B>(body: B) =>
  // SAFETY: MachineBody's records are On records and bodies over the definition's own events and states.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the definition's event and memory types are erased in Compiled
  body as AnyBody;

/**
 * Compiles a definition and its handlers into a Machine.
 *
 * **When to use**
 *
 * In a `*.machine.ts` file. The body runs exactly once with `{ S, E, O }` and returns static
 * configuration that mirrors the definition's tree: the root's and each compound's default direct
 * child, and each state's handlers and schedules.
 *
 * **Details**
 *
 * The active leaf's handlers are tried first, then each ancestor's, then the root's. A compound
 * target enters its default leaf; `S.X.history` enters X's last active child, else its default.
 *
 * **Gotchas**
 *
 * - An invalid body throws one FlowError listing every violation found, in walk order, each
 *   with its path.
 */
// RETURN_TYPE: the exported Machine keeps the definition's literal types.
export const machine = <D extends AnyDefinition>(
  definition: D,
  body: (tokens: { readonly S: D["S"]; readonly E: D["E"]; readonly O: D["O"] }) => MachineBody<D>,
): Machine<D> => {
  const config = erasedBody(body({ S: definition.S, E: definition.E, O: definition.O }));
  const tree = treeOfDefinition(definition);
  const { tokens, histories } = tokenMaps(definition, tree.nodes);

  const compile: Compile = {
    definition,
    nodes: new Map(tree.nodes.map((n) => [n.path, n])),
    tokens,
    histories,
    events: new Set([...Object.keys(definition.events), ...Object.keys(definition.internalEvents)]),
    sends: new Set(Object.values(definition.E)),
    findings: [],
    scheduleNames: new Map(),
  };

  const compiledTree = nodesOf(compile, config, Option.none(), "");
  const [first, ...rest] = compile.findings;

  if (first !== undefined)
    // oxlint-disable-next-line lint-bomb/no-throw-in-core -- an invalid machine throws one FlowError before any work
    throw flowError([first, ...rest]);

  const fields = Object.entries(definition.memory).map(([name, raw]) => fieldOf(name, raw));
  const memory = memoryCodec(fields);
  const states = new Map(compiledTree.nodes.map((n) => [n.path, n]));

  const compiled = {
    id: definition.id,
    persist: definition.persist,
    initial: "",
    states,
    root: compiledTree.root,
    events: eventsOf(definition),
    fields,
    memory,
    memoryJson: codecOf<Values>(Schema.toCodecJson(memory)),
    sameMemory: Schema.toEquivalence(memory),
    operations: new Map(
      Object.entries(definition.operations).map(([name, bound]) => [
        name,
        operationOf(name, bound),
      ]),
    ),
  };

  return {
    definition,
    compiled: { ...compiled, initial: leafOf(compiled, compiledTree.initial) },
  };
};
