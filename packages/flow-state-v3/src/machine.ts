import { Option, Predicate, Result, Schema } from "effect";
import { walkerOf } from "./core/boundary.ts";
import { nameSchemaOf } from "./core/identity.ts";
import { InternalsId, type Level, type Node, type Values } from "./core/compiled.ts";
import { leafOf } from "./core/tree.ts";
import {
  type AnyDefinition,
  type ChildrenOf,
  type ContextOf,
  type Definition,
  type LeavesOf,
  type Machine,
  type MemoryOf,
  type NamesOf,
  type On,
  type PathsOf,
  type StateConfig,
  type StateToken,
  treeOfDefinition,
  type WritableOf,
} from "./definition.ts";
import { bodyFindings, inDeclarationOrder } from "./config.ts";

// A body's keys in the order its findings are reported.
const BODY_KEYS = ["default", "on", "onContext", "states"];

import { type Finding, flowErrorOf, invalid, raise, refuse } from "./error.ts";
import { builder, entry } from "./entry.ts";
import { internalsOf, type KindOf, made, madeOf } from "./made.ts";
import { codecOf, endingOf } from "./events.ts";
import { defect } from "./core/defect.ts";
import { eventsOf, fieldOf, mappingOf, memoryCodec, operationOf } from "./compiled-parts.ts";
import type { ActorId } from "./core/world.ts";
import type { Change, ContextTokens, ErasedEntry } from "./tokens.ts";
import { slotReadsOf } from "./flow.ts";
import { nodesOf, tokenMaps } from "./compile-body.ts";
import type { Compile } from "./compile-names.ts";

type Parts<D> =
  D extends Definition<infer States, infer Ev, infer In, infer M, infer _O, infer Cx, infer Id>
    ? {
        readonly Context: Partial<ContextOf<Cx>>;
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
  Parts<D>["Leaves"],
  Parts<D>["Context"]
>;

type LeafBody<D> = StateConfig<
  Parts<D>["Memory"],
  Parts<D>["Events"],
  Parts<D>["S"],
  Parts<D>["Writable"],
  Parts<D>["Id"],
  Parts<D>["Leaves"],
  Parts<D>["Context"]
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
  readonly schedules?: Readonly<Record<string, ErasedEntry>>;
  readonly states?: Readonly<Partial<Record<string, AnyBody>>>;
};

// The body function. A conditional type, so a call that infers D instantiates it before checking
// the body: the returned literal is then checked against the definition's own tree at every depth.
type BodyOf<D> = [D] extends [AnyDefinition]
  ? (tokens: {
      readonly S: D["S"];
      readonly E: D["E"];
      readonly O: D["O"];
      readonly C: ContextTokens<D["context"], Parts<D>["Memory"], Parts<D>["Id"]>;
    }) => MachineBody<D>
  : never;

/**
 * What a reaction keeps for the core: when a change counts, and the event it sends.
 */
export type ChangeInternals = {
  // FLOW_STATE_ALLOW_UNKNOWN: the authored when, decoded by the machine that receives it.
  readonly when: Option.Option<unknown>;
  // FLOW_STATE_ALLOW_UNKNOWN: the authored event, decoded by the machine that receives it.
  readonly event: unknown;
};

// FLOW_STATE_ALLOW_UNKNOWN: a reaction's values, typed by its slot.
const erasedWhen = (when: unknown) =>
  // SAFETY: the reaction's findings checked when is a function written for its slot's values; the runtime passes exactly those.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a slot's value type is erased in Compiled
  when as (current: unknown, previous: unknown, extra: { readonly memory: Values }) => boolean;

// The `C` tokens of a definition's slots, one per slot with `.change`, each reaction owned by this
// machine's own owner, so a body's reaction is known to be this machine's.
const changeTokens = (slots: ReadonlyArray<string>, owner: symbol) =>
  Object.fromEntries(
    slots.map((slot) => [
      slot,
      {
        // FLOW_STATE_ALLOW_UNKNOWN: the authored spec, read by its fields and decoded with the body.
        change: builder("C.change", (spec: unknown) =>
          made("change", owner, { slot }, {
            when: Option.fromUndefinedOr(
              Predicate.hasProperty(spec, "when") ? spec.when : undefined,
            ),
            event: Predicate.hasProperty(spec, "event") ? spec.event : undefined,
          } satisfies ChangeInternals),
        ),
      },
    ]),
  );

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

// The kinds of a reaction this machine's C made: a when that is no function and an event that is
// no event token, judged with the body's kinds.
const reactionKinds = (reactions: ReadonlyArray<Change>, owner: symbol) =>
  reactions.flatMap((change, i) =>
    Result.match(madeOf<ChangeInternals>("change", Option.some(owner))(change, ["onContext", i]), {
      onFailure: () => [],
      onSuccess: ({ internals: { when, event } }) => {
        const found: Array<Finding> = [];

        if (Option.exists(when, (w) => !Predicate.isFunction(w)))
          found.push(
            invalid(
              ["onContext", i, "when"],
              "WrongKind",
              "the reaction's when is not a function",
              "Write a reaction as C.slot.change({ when, event }).",
            ),
          );

        if (Option.isNone(endingOf(event)))
          found.push(
            invalid(
              ["onContext", i, "event"],
              "WrongKind",
              "the reaction's event is not an event token",
              "Map to this definition's event: E.X, or E.X.from(f).",
            ),
          );

        return found;
      },
    }),
  );

// Each reaction's refusal: one this machine's C did not make, an event of another definition or
// one no state handles, and a second reaction of one slot sending one event, since a reaction is
// named by its slot and event and its saved baseline finds it by them.
const reactionFindings = (
  compile: Compile,
  reactions: ReadonlyArray<{
    readonly change: Change;
    readonly at: ReadonlyArray<string | number>;
  }>,
  owner: symbol,
  handles: (tag: string) => boolean,
) => {
  const named = new Set<string>();

  return reactions.flatMap(({ change, at }) => {
    const card = madeOf<ChangeInternals>("change", Option.some(owner))(change, at);

    if (Result.isFailure(card))
      return [
        invalid(
          at,
          "ForeignToken",
          "the reaction was not made by this machine's C tokens",
          "Write reactions with the C the machine body receives: C.slot.change({ when, event }).",
        ),
      ];

    const ending = endingOf(card.success.internals.event);

    if (Option.isNone(ending)) return [];

    const tag = ending.value.event;
    const name = `${change.slot}.${tag}`;
    const twice = named.has(name);

    named.add(name);

    if (!compile.sends.has(ending.value.token))
      return [
        invalid(
          [...at, "event"],
          "ForeignToken",
          "the reaction's event is not this definition's",
          "Use the tokens the machine body receives: S, E and O of this definition.",
        ),
      ];

    if (!handles(tag))
      return [
        invalid(
          [...at, "event"],
          "UnhandledEvent",
          `no state handles ${tag}, the reaction's event`,
          "Handle the event in an on block of the root or of a state.",
        ),
      ];

    if (twice)
      return [
        invalid(
          at,
          "DuplicateReaction",
          `two reactions of slot ${change.slot} send ${tag}`,
          "Write one reaction per slot and event: join their whens into one.",
        ),
      ];

    return [];
  });
};

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
  <D extends AnyDefinition>(definition: D, body: BodyOf<NoInfer<D>>): Machine<D> => {
    const read = madeOf("definition")(definition, ["definition"]);

    const wrong: Array<Finding> = Result.match(read, {
      onFailure: (finding) => [finding],
      onSuccess: () => [],
    });

    if (!Predicate.isFunction(body))
      wrong.push(
        invalid(
          ["body"],
          "WrongKind",
          "machine was given no body function",
          "Pass machine a body: ({ S, E, O }) => ({ default, on, states }).",
        ),
      );

    refuse(wrong);

    const owner = Result.getOrElse(
      Result.map(read, (card) => card.owner),
      () => defect("a refused definition"),
    );

    const reactor = Symbol(`${definition.id}/C`);

    const handed = {
      S: definition.S,
      E: definition.E,
      O: definition.O,
      C: trustedTokens<ContextTokens<D["context"], Parts<D>["Memory"], Parts<D>["Id"]>>(
        changeTokens(Object.keys(definition.context), reactor),
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

    refuse(
      inDeclarationOrder(BODY_KEYS, [
        ...bodyFindings(config),
        ...reactionKinds(Array.isArray(config.onContext) ? config.onContext : [], reactor),
      ]),
    );

    const tree = treeOfDefinition(definition);
    const { tokens, histories } = tokenMaps(definition, tree.nodes);

    const compile: Compile = {
      definition,
      owner,
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

    compile.findings.push(
      ...reactionFindings(compile, reactions, reactor, (tag) =>
        handled(compiledTree.root, compiledTree.nodes, tag),
      ),
    );

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
      memory,
      memoryJson,
      operations: new Map(
        Object.entries(definition.operations).map(([name, bound]) => [
          name,
          operationOf(name, bound),
        ]),
      ),
      context: new Map(context),
      wiring: new Map<string, ActorId>(),
      [InternalsId]: {
        fields,
        walk: walkerOf(memoryJson),
        identity: walkerOf(codecOf<Values>(nameSchemaOf(fields))),
        reactions: reactions.map(({ change, at }) => {
          const { when, event } = internalsOf<ChangeInternals>("change", change);
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
      },
    };

    const face: Omit<Machine<D>, typeof KindOf> = {
      definition,
      compiled: { ...compiled, initial: leafOf(compiled, compiledTree.initial) },
    };

    // SAFETY: the face is every field of the machine but its kind, a phantom key the brand carries.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the kind brand is a phantom key no value holds
    return made("machine", owner, face, {}) as Machine<D>;
  },
);
