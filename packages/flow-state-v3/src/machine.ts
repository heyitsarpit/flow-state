import { Option, Predicate, Result, Schema } from "effect";
import { walkerOf } from "./core/boundary.ts";
import { nameSchemaOf } from "./core/identity.ts";
import type { Values } from "./core/compiled.ts";
import { leafOf } from "./core/tree.ts";
import {
  type AnyDefinition,
  type ChildrenOf,
  type ContextOf,
  type Definition,
  type LeavesOf,
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
import { bodyFindings } from "./config.ts";
import { codecOf } from "./events.ts";
import { flowErrorOf, invalid, raise, refuse } from "./error.ts";
import { entry, inert } from "./entry.ts";
import { eventsOf, fieldOf, mappingOf, memoryCodec, operationOf } from "./compiled-parts.ts";
import type { Ending, ErasedEnding } from "./contract.ts";
import type { ActorId } from "./core/world.ts";
import { type Compile, nodesOf, tokenMaps } from "./compile-body.ts";

type Parts<D> =
  D extends Definition<infer States, infer Ev, infer In, infer M, infer _O, infer _Cx, infer Id>
    ? {
        readonly Tree: States;
        readonly S: PathsOf<States>;
        readonly Leaves: LeavesOf<States>;
        readonly Events: Ev & In;
        readonly Memory: MemoryOf<M>;
        readonly Writable: WritableOf<M>;
        readonly Id: Id;
      }
    : never;

type Handlers<D> = On<
  Parts<D>["Memory"],
  Parts<D>["Events"],
  Parts<D>["S"],
  Parts<D>["Writable"],
  Parts<D>["Id"],
  Parts<D>["Leaves"]
>;

type LeafBody<D> = StateConfig<
  Parts<D>["Memory"],
  Parts<D>["Events"],
  Parts<D>["S"],
  Parts<D>["Writable"],
  Parts<D>["Id"],
  Parts<D>["Leaves"]
>;

type StatesBody<D, L, P extends string> = {
  readonly [N in NamesOf<L>]?: NodeBody<D, ChildrenOf<L, N>, `${P}${N}.`>;
};

type NodeBody<D, C, P extends string> = [C] extends [never] ? LeafBody<D> : CompoundBody<D, C, P>;

type CompoundBody<D, L, P extends string> = {
  readonly on?: Handlers<D>;
  readonly schedules?: LeafBody<D>["schedules"];
  readonly default: StateToken<`${P}${NamesOf<L>}`, Parts<D>["Id"]>;
  readonly states?: StatesBody<D, L, P>;
};

/**
 * What a machine body returns: the root's default child and handlers, and each state's body,
 * mirroring the definition's tree: a compound has a default direct child and its children's
 * bodies; a leaf has neither.
 */
/**
 * An `onContext` reaction: `select` reads the context and memory when a context wave reaches the
 * actor; a changed selection becomes the baseline and, unless `when(current, previous)` declines,
 * enqueues `event` (`E.X`, or `E.X.from((current) => payload)`).
 */
export type Reaction<D extends AnyDefinition> = {
  readonly select: (input: {
    readonly context: ContextOf<D["context"]>;
    readonly memory: Parts<D>["Memory"];
  }) => unknown;
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the Plan's public word: with no when, every changed selection enqueues the event
  readonly when?: (current: never, previous: never) => boolean;
  readonly event: Ending<never, Parts<D>["Id"]>;
};

export type MachineBody<D extends AnyDefinition> = {
  readonly on?: Handlers<D>;
  readonly onContext?: ReadonlyArray<Reaction<D>>;
  readonly default: StateToken<`${NamesOf<Parts<D>["Tree"]>}`, Parts<D>["Id"]>;
  readonly states?: StatesBody<D, Parts<D>["Tree"], "">;
};

/**
 * A machine body as the compiler walks it, its literal types erased.
 */
export type AnyBody = {
  readonly default?: StateToken;
  readonly on?: Values;
  readonly onContext?: ReadonlyArray<{
    readonly select: (input: { readonly context: Values; readonly memory: Values }) => unknown;
    readonly when?: (current: never, previous: never) => boolean;
    readonly event: ErasedEnding;
  }>;
  readonly schedules?: Readonly<Record<string, ScheduleConfig<Values, Values>>>;
  readonly states?: Readonly<Partial<Record<string, AnyBody>>>;
};

// FLOW_STATE_ALLOW_UNKNOWN: a provider's snapshot as the runtime reads it, typed at the definition.
const erasedSelect = (select: (snapshot: never) => unknown) =>
  // SAFETY: a selector written for its provider's outside snapshot; the runtime passes exactly that.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the provider's state and memory types are erased in Compiled and restored by the binding
  select as (snapshot: { readonly state: string; readonly memory: Values }) => unknown;

// FLOW_STATE_ALLOW_UNKNOWN: a reaction's selections, typed by its select.
const erasedWhen = (when: (current: never, previous: never) => boolean) =>
  // SAFETY: when is written for the values its select returns; the runtime passes exactly those.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a reaction's selection type is erased in Compiled
  when as (current: unknown, previous: unknown) => boolean;

// The event token an ending names: E.X itself, or the token E.X.from(f) was made from.
const tokenOf = (ending: ErasedEnding) =>
  // oxlint-disable-next-line flow-state/no-mark-probe -- construction still recognises its own tokens by mark until its decode checks them by identity
  Predicate.hasProperty(ending, "~token") ? ending["~token"] : ending;

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
export const machine = entry(
  "machine",
  // RETURN_TYPE: the exported Machine keeps the definition's literal types.
  <D extends AnyDefinition>(
    definition: D,
    body: (tokens: {
      readonly S: D["S"];
      readonly E: D["E"];
      readonly O: D["O"];
    }) => MachineBody<D>,
  ): Machine<D> => {
    // oxlint-disable-next-line flow-state/no-mark-probe -- construction still recognises its own definitions by mark until its decode checks them by identity
    if (!Predicate.hasProperty(definition, "~owner"))
      refuse([
        invalid(
          ["definition"],
          "WrongKind",
          "machine was given no definition",
          "Pass machine the value definition({ ... }) returned.",
        ),
      ]);

    if (!Predicate.isFunction(body))
      refuse([
        invalid(
          ["body"],
          "WrongKind",
          "machine was given no body function",
          "Pass machine a body: ({ S, E, O }) => ({ default, on, states }).",
        ),
      ]);

    const written = Result.try({
      try: () => body({ S: definition.S, E: definition.E, O: definition.O }),
      // FLOW_STATE_ALLOW_UNKNOWN: what an author's callback threw, kept whole as the cause.
      catch: (cause: unknown) => cause,
    });

    if (Result.isFailure(written))
      return raise(
        flowErrorOf(
          [
            {
              code: "Defect",
              path: ["body"],
              summary: "the machine body threw",
              help: "Fix the machine body; what it threw is this error's cause.",
            },
          ],
          written.failure,
        ),
      );

    const config = erasedBody(written.success);

    refuse(bodyFindings(config));

    const tree = treeOfDefinition(definition);
    const { tokens, histories } = tokenMaps(definition, tree.nodes);

    const compile: Compile = {
      definition,
      nodes: new Map(tree.nodes.map((n) => [n.path, n])),
      tokens,
      histories,
      events: new Set(Object.keys(definition.E)),
      sends: new Set(Object.values(definition.E)),
      findings: [],
      scheduleNames: new Map(),
    };

    const compiledTree = nodesOf(compile, config, Option.none(), []);

    for (const [at, reaction] of (config.onContext ?? []).entries())
      if (!compile.sends.has(tokenOf(reaction.event)))
        compile.findings.push(
          invalid(
            ["onContext", at, "event"],
            "ForeignToken",
            "the reaction's event is not this definition's",
            "Use the tokens the machine body receives: S, E and O of this definition.",
          ),
        );

    refuse(compile.findings);

    const fields = Object.entries(definition.memory).map(([name, raw]) => fieldOf(name, raw));
    const memory = memoryCodec(fields);
    const memoryJson = codecOf<Values>(Schema.toCodecJson(memory));
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
      memoryJson,
      walk: walkerOf(memoryJson),
      identity: walkerOf(codecOf<Values>(nameSchemaOf(fields))),
      operations: new Map(
        Object.entries(definition.operations).map(([name, bound]) => [
          name,
          operationOf(name, bound),
        ]),
      ),
      context: new Map(
        Object.entries(definition.context).map(([slot, declared]) => [
          slot,
          {
            provider: declared.provider,
            json: Schema.toCodecJson(declared.schema),
            walk: walkerOf(Schema.toCodecJson(declared.schema)),
            select: { slot: `context.${slot}`, run: erasedSelect(declared.select) },
          },
        ]),
      ),
      reactions: (config.onContext ?? []).map((reaction, at) => ({
        select: { slot: `onContext.${at}.select`, run: reaction.select },
        when: Option.map(Option.fromUndefinedOr(reaction.when), (when) => ({
          slot: `onContext.${at}.when`,
          run: erasedWhen(when),
        })),
        event: mappingOf(reaction.event, `onContext.${at}.event`),
      })),
      wiring: new Map<string, ActorId>(),
    };

    return {
      definition,
      compiled: inert({ ...compiled, initial: leafOf(compiled, compiledTree.initial) }),
    };
  },
);
