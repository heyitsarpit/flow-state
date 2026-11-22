import { Option, Predicate, Result, Schema } from "effect";
import { walkerOf } from "./core/boundary.ts";
import { nameSchemaOf } from "./core/identity.ts";
import { InternalsId, type Values } from "./core/compiled.ts";
import { definitionInternalsOf } from "./declaration-of.ts";
import type { AnyDefinition, Machine } from "./definition.ts";
import type { BodyTokens, MachineBody } from "./derive.ts";
import { bodyFindings, inDeclarationOrder } from "./config.ts";
import { type Finding, flowErrorOf, invalid, raise, refuse } from "./error.ts";
import { builder, type Callable, door } from "./entry.ts";
import { internalsOf, type KindOf, made, madeOf } from "./made.ts";
import { endingOf, structOf } from "./events.ts";
import { defect } from "./core/defect.ts";
import { eventsOf, fieldOf, mappingOf, memoryCodec, operationOf } from "./compiled-parts.ts";
import type { ActorId } from "./core/world.ts";
import type { Change } from "./tokens.ts";
import { slotReadsOf } from "./flow.ts";
import { type BodyFunction, walkOf } from "./compile-body.ts";
import { indexOf } from "./compile-index.ts";
import type { Compile } from "./compile-names.ts";
import type { MachineInternals } from "./compiled-of.ts";
import { placementFindings, scheduleCodecsOf } from "./compile-schedules.ts";
import { slot } from "./handles.ts";

// A body's keys in the order its findings are reported.
const BODY_KEYS = ["default", "on", "onContext", "states"];

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
type When = (current: unknown, previous: unknown, extra: { readonly memory: Values }) => boolean;

// FLOW_STATE_ALLOW_UNKNOWN: an authored when, which the reaction's findings checked is a function.
// RETURN_TYPE: a type guard states the callback it narrows to.
const isCallback = (x: unknown): x is (...args: ReadonlyArray<never>) => unknown =>
  Predicate.isFunction(x);

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

// A value a body holds whole: a token Flow made, or an Effect value such as a Duration or Schedule.
// FLOW_STATE_ALLOW_UNKNOWN: either brand is matched by its key alone, whatever it holds.
type Opaque = { readonly [KindOf]: unknown } | { readonly pipe: unknown };

type KeysOf<T> = T extends unknown ? keyof T : never;

type RecordOf<T> = T extends Opaque | Callable | ReadonlyArray<unknown>
  ? never
  : // oxlint-disable-next-line lint-bomb/no-object-type -- a slot's record may be an interface, such as Effect's Duration input, which no index-signature type matches
    T extends object
    ? T
    : never;

type At<T, K> = T extends unknown ? (K extends keyof T ? Exclude<T[K], undefined> : never) : never;

type ElementOf<T> = T extends ReadonlyArray<infer E> ? E : never;

type ReturnOf<T> = T extends Callable ? ReturnType<T> : never;

// What a misspelt key meets: an object, so the error lands on that key alone and never collapses
// its siblings to never.
type Unknown<K> = { readonly "unknown key": K };

// A returned record's keys checked against the records the slot may return.
// FLOW_STATE_ALLOW_UNKNOWN: a value with no key to check is held to nothing more.
type KeysOnly<R, T> = [T] extends [never]
  ? unknown
  : R extends ReadonlyArray<unknown> | Callable | Opaque
    ? unknown
    : R extends Values
      ? { readonly [K in keyof R]: K extends KeysOf<RecordOf<T>> ? unknown : Unknown<K> }
      : unknown;

// The body as written, with every key its slot lacks marked, at every depth, in every union member,
// and in the records a callback returns. A return is no fresh literal, so TypeScript's own
// excess-key check never runs on a body function's result.
type Exact<V, T> = unknown extends T
  ? V
  : V extends Opaque
    ? V
    : V extends (...args: infer A) => infer R
      ? (...args: A) => KeysOnly<R, ReturnOf<T>>
      : V extends ReadonlyArray<unknown>
        ? { readonly [I in keyof V]: Exact<V[I], ElementOf<T>> }
        : V extends Values
          ? {
              readonly [K in keyof V]: K extends KeysOf<RecordOf<T>>
                ? Exact<V[K], At<RecordOf<T>, K>>
                : Unknown<K>;
            }
          : V;

// The body function, its result captured as B. A conditional type, so a call that infers D
// instantiates it before checking the body: the returned literal is checked against the
// definition's own tree at every depth, and B against the same tree for keys it lacks.
type BodyOf<D, B> = [D] extends [AnyDefinition]
  ? (tokens: BodyTokens<D>) => [MachineBody<D>] extends [B] ? B : B & Exact<B, MachineBody<D>>
  : never;

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

// The erased construction a machine's door and a rebuild share.
const build = (definition: AnyDefinition, body: BodyFunction) => {
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

  const { declaration, tree, tokens, histories } = definitionInternalsOf(definition);
  const reactor = Symbol(`${definition.id}/C`);

  const handed: Parameters<BodyFunction>[0] = {
    S: definition.S,
    E: definition.E,
    O: definition.O,
    C: changeTokens(Object.keys(declaration.context), reactor),
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

  const config = written.success;

  refuse(
    inDeclarationOrder(BODY_KEYS, [
      ...bodyFindings(config),
      ...reactionKinds(Array.isArray(config.onContext) ? config.onContext : [], reactor),
      ...placementFindings(declaration.schedules, config),
    ]),
  );

  const compile: Compile = {
    declaration,
    owner,
    top: tree.top,
    nodes: new Map(tree.nodes.map((n) => [n.path, n])),
    tokens,
    histories,
    events: new Set(Object.keys(definition.E)),
    sends: new Set(Object.values(definition.E)),
    findings: [],
  };

  const walked = walkOf(compile, config);
  const index = indexOf(walked);

  const reactions = (config.onContext ?? []).map((change, i) => ({
    change,
    at: ["onContext", i],
  }));

  compile.findings.push(
    ...reactionFindings(compile, reactions, reactor, (tag) => index.handledTags.has(tag)),
  );

  refuse(compile.findings);

  // The definition refused every slot that does not read; each slot here reads one provider.
  const context = Object.entries(declaration.context).flatMap(([name, declared]) =>
    Result.match(slotReadsOf(name, declared), {
      onFailure: () => [],
      onSuccess: ({ provider, reads, select }) => {
        const json = Schema.toCodecJson(declared.schema);

        return [
          [
            name,
            {
              provider: provider.provider,
              reads: reads.map(({ name: read, reader }) => ({ name: read, ...reader.read })),
              json,
              walk: walkerOf(json),
              select: slot<(reads: Values) => unknown>(`context.${name}`, select),
            },
          ] as const,
        ];
      },
    }),
  );

  const fields = Object.entries(declaration.memory).map(([name, raw]) => fieldOf(name, raw));
  const memory = memoryCodec(fields);
  const memoryJson = structOf(Object.fromEntries(fields.map((f) => [f.name, f.json])));

  const compiled = {
    id: definition.id,
    persist: definition.persist,
    initial: index.initial,
    states: index.states,
    root: walked.root,
    handledTags: index.handledTags,
    events: eventsOf(definition),
    memory,
    memoryJson,
    operations: new Map(
      Object.entries(declaration.operations).map(([name, bound]) => [
        name,
        operationOf(name, bound),
      ]),
    ),
    context: new Map(context),
    schedules: scheduleCodecsOf(declaration.schedules),
    wiring: new Map<string, ActorId>(),
    [InternalsId]: {
      fields,
      walk: walkerOf(memoryJson),
      identity: walkerOf(nameSchemaOf(fields)),
      reactions: reactions.map(({ change, at }) => {
        const { when, event } = internalsOf<ChangeInternals>("change", change);
        const place = at.join(".");

        return {
          slot: change.slot,
          when: Option.map(Option.filter(when, isCallback), (w) => slot<When>(`${place}.when`, w)),
          event: mappingOf(event, `${place}.event`),
        };
      }),
    },
  };

  return made("machine", owner, { definition }, { compiled, body } satisfies MachineInternals);
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
export const machine = door<
  // RETURN_TYPE: the exported Machine keeps the definition's literal types.
  <D extends AnyDefinition, B extends MachineBody<D> = MachineBody<D>>(
    definition: D,
    body: BodyOf<NoInfer<D>, B>,
  ) => Machine<D>
>("machine", build);

/**
 * A machine built again from the definition and body it was built from: what timing a
 * construction, or comparing two constructions of one source, calls.
 */
export const rebuilt = (built: Machine) =>
  build(built.definition, internalsOf<MachineInternals>("machine", built).body);
