import { Option, Predicate, Result, Schema } from "effect";
import { walkerOf } from "./core/boundary.ts";
import { nameSchemaOf } from "./core/identity.ts";
import type { Level, Node, Values } from "./core/compiled.ts";
import { leafOf } from "./core/tree.ts";
import {
  type AnyDefinition,
  type ChildrenOf,
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
import { builder, entry, inert } from "./entry.ts";
import { eventsOf, fieldOf, mappingOf, memoryCodec, operationOf } from "./compiled-parts.ts";
import type { ErasedEnding } from "./contract.ts";
import type { ActorId } from "./core/world.ts";
import type { Change, ContextTokens } from "./tokens.ts";
import { slotReadsOf } from "./flow.ts";
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
 * What a machine body returns: the root's default child, handlers and reactions, and each state's
 * body, mirroring the definition's tree: a compound has a default direct child and its children's
 * bodies; a leaf has neither. `onContext` holds the `C.slot.change` reactions, live in every state.
 */
export type MachineBody<D extends AnyDefinition> = {
  readonly on?: Handlers<D>;
  readonly onContext?: ReadonlyArray<Change>;
  readonly default: StateToken<`${NamesOf<Parts<D>["Tree"]>}`, Parts<D>["Id"]>;
  readonly states?: StatesBody<D, Parts<D>["Tree"], "">;
};

/**
 * A machine body as the compiler walks it, its literal types erased.
 */
export type AnyBody = {
  readonly default?: StateToken;
  readonly on?: Values;
  readonly onContext?: ReadonlyArray<Change>;
  readonly schedules?: Readonly<Record<string, ScheduleConfig<Values, Values>>>;
  readonly states?: Readonly<Partial<Record<string, AnyBody>>>;
};

// A reaction as the body's decode checked it.
type Decoded = {
  readonly when: Option.Option<
    (current: never, previous: never, extra: { readonly memory: Values }) => boolean
  >;
  readonly event: ErasedEnding;
};

const decodedOf = (change: Change) =>
  // SAFETY: the body's decode checked every reaction's when is an Option of a function and its event an ending.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a decoded reaction, its slot's value type erased
  change as Decoded;

// FLOW_STATE_ALLOW_UNKNOWN: a reaction's values, typed by its slot.
const erasedWhen = (when: Option.Option.Value<Decoded["when"]>) =>
  // SAFETY: when is written for its slot's values; the runtime passes exactly those.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a slot's value type is erased in Compiled
  when as (current: unknown, previous: unknown, extra: { readonly memory: Values }) => boolean;

// The event token an ending names: E.X itself, or the token E.X.from(f) was made from.
const tokenOf = (ending: ErasedEnding) =>
  // oxlint-disable-next-line flow-state/no-mark-probe -- construction still recognises its own tokens by mark until its decode checks them by identity
  Predicate.hasProperty(ending, "~token") ? ending["~token"] : ending;

// The `C` tokens of a definition's slots, one per slot with `.change`, and the reactions they made,
// so a body's reaction is known to be this machine's by identity.
const changeTokens = (slots: ReadonlyArray<string>) => {
  const made = new WeakSet<Change>();

  const tokens = Object.fromEntries(
    slots.map((slot) => [
      slot,
      {
        // FLOW_STATE_ALLOW_UNKNOWN: the authored spec, read by its fields and decoded with the body.
        change: builder("C.change", (spec: unknown) => {
          const change: Change = {
            "~flow": "change",
            slot,
            when: Option.fromUndefinedOr(
              Predicate.hasProperty(spec, "when") ? spec.when : undefined,
            ),
            event: Predicate.hasProperty(spec, "event") ? spec.event : undefined,
          };

          made.add(change);

          return change;
        }),
      },
    ]),
  );

  return { tokens, made };
};

const trustedTokens = <T>(tokens: Values) =>
  // SAFETY: one change token per declared slot, as ContextTokens types them.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the slots' value types are erased in the runtime tokens
  tokens as T;

const erasedBody = <B>(body: B) =>
  // SAFETY: MachineBody's records are On records and bodies over the definition's own events and states.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the definition's event and memory types are erased in Compiled
  body as AnyBody;

// Whether some state, or the root, has a handler for an event.
const handled = (root: Level, nodes: ReadonlyArray<Node>, tag: string) =>
  root.has(tag) || nodes.some((n) => n.on.has(tag));

/**
 * Compiles a definition and its handlers into a Machine.
 *
 * **When to use**
 *
 * In a `*.machine.ts` file. The body runs exactly once with `{ S, E, O, C }` and returns static
 * configuration that mirrors the definition's tree: the root's and each compound's default direct
 * child, and each state's handlers, schedules and `onContext` reactions.
 *
 * **Details**
 *
 * The active leaf's handlers are tried first, then each ancestor's, then the root's. A compound
 * target enters its default leaf; `S.X.history` enters X's last active child, else its default.
 *
 * `C.slot.change({ when, event })` turns a change of a context slot's value into one of the
 * machine's events, `E.X` or `E.X.from((value) => payload)`; `when(current, previous, { memory })`
 * may decline it. Guards, targets and memory updates stay in that event's `on` handler.
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
      readonly C: ContextTokens<D["context"], Parts<D>["Memory"], Parts<D>["Id"]>;
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

    const changes = changeTokens(Object.keys(definition.context));

    const handed = {
      S: definition.S,
      E: definition.E,
      O: definition.O,
      C: trustedTokens<ContextTokens<D["context"], Parts<D>["Memory"], Parts<D>["Id"]>>(
        changes.tokens,
      ),
    };

    const written = Result.try({
      try: () => body(handed),
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

    const reactions = (config.onContext ?? []).map((change, i) => ({
      change,
      at: ["onContext", i],
    }));

    for (const { change, at } of reactions) {
      const { event } = decodedOf(change);
      const tag = event.ending.event;

      if (!changes.made.has(change))
        compile.findings.push(
          invalid(
            at,
            "ForeignToken",
            "the reaction was not made by this machine's C tokens",
            "Write reactions with the C the machine body receives: C.slot.change({ when, event }).",
          ),
        );
      else if (!compile.sends.has(tokenOf(event)))
        compile.findings.push(
          invalid(
            [...at, "event"],
            "ForeignToken",
            "the reaction's event is not this definition's",
            "Use the tokens the machine body receives: S, E and O of this definition.",
          ),
        );
      else if (!handled(compiledTree.root, compiledTree.nodes, tag))
        compile.findings.push(
          invalid(
            [...at, "event"],
            "UnhandledEvent",
            `no state handles ${tag}, the reaction's event`,
            "Handle the event in an on block of the root or of a state.",
          ),
        );
    }

    refuse(compile.findings);

    // The definition refused every slot that does not read; each slot here reads one provider.
    const context = Object.entries(definition.context).flatMap(([slot, declared]) =>
      Result.match(slotReadsOf(slot, declared), {
        onFailure: () => [],
        onSuccess: ({ provider, reads, select }) => {
          const json = Schema.toCodecJson(declared.schema);

          return [
            [
              slot,
              {
                provider: provider.provider,
                reads: reads.map(({ name, reader }) => ({ name, ...reader.read })),
                json,
                walk: walkerOf(json),
                select: { slot: `context.${slot}`, run: select },
              },
            ] as const,
          ];
        },
      }),
    );

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
      context: new Map(context),
      reactions: reactions.map(({ change, at }) => {
        const { when, event } = decodedOf(change);
        const place = at.join(".");

        return {
          slot: change.slot,
          when: Option.map(when, (w) => ({
            slot: `${place}.when`,
            run: erasedWhen(w),
          })),
          event: mappingOf(event, `${place}.event`),
        };
      }),
      wiring: new Map<string, ActorId>(),
    };

    return {
      definition,
      compiled: inert({ ...compiled, initial: leafOf(compiled, compiledTree.initial) }),
    };
  },
);
