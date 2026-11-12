import { Data, Option, Predicate, Result, Schema } from "effect";
import type { Machine } from "../../src/index.ts";
import type { Part } from "../../fixtures/part.ts";
import { Answer } from "../world/network.ts";
import { Empty, type Fixture, rowFor } from "../fixtures/fixture.ts";
import type { Folded, Folds, Labels } from "../fixtures/folds.ts";
import type { Alternative, Handlers, Level, Schedule } from "../fixtures/handlers.ts";
import {
  classifyWith,
  type OperationReference,
  type Row,
  type RowMember,
} from "../fixtures/reference.ts";

/**
 * A machine's `Compiled`, as its public `Machine` type carries it.
 */
export type CompiledOf = Machine["compiled"];

type Compiled = CompiledOf;

type CompiledLevel = Compiled["root"];

type CompiledAlternative = NonNullable<ReturnType<CompiledLevel["get"]>>[number];

type CompiledOperation = NonNullable<ReturnType<Compiled["operations"]["get"]>>;

type CompiledWrite = Extract<CompiledOperation, { readonly _tag: "Write" }>;

type Mapping = CompiledWrite["success"];

type Values = Compiled["initialMemory"];

/**
 * One operation of a derived reference: its key's and row's Schemas and what the suite expects of
 * it, all but `classify`, which `Compiled` does not carry.
 */
export type DerivedOperation = {
  // FLOW_STATE_ALLOW_UNKNOWN: a fixture's key and row Schemas are typed per fixture; the suite decodes with them.
  readonly key: Schema.Codec<unknown, unknown>;
  // FLOW_STATE_ALLOW_UNKNOWN: a fixture's key and row Schemas are typed per fixture; the suite decodes with them.
  readonly row: Schema.Codec<unknown, unknown>;
  readonly reference: Omit<OperationReference, "classify">;
};

/**
 * The reference a machine's `Compiled` gives, with no hand-written row (Conformance R15, I46).
 */
export type Derived = Omit<Fixture, "name" | "operations"> & {
  readonly operations: Readonly<Record<string, DerivedOperation>>;
};

const LOST = new Set(["NoResponse", "ServerError"]);

const isJson = Schema.is(Schema.Json);

const noLabels: Labels = {};

const isJsonObject = Schema.is(Schema.Record(Schema.String, Schema.Json));

const levelsOf = (compiled: Compiled) => [
  { leaf: Option.none<string>(), level: compiled.root },
  ...[...compiled.states].map(([leaf, node]) => ({ leaf: Option.some(leaf), level: node.on })),
];

const alternativesOf = (compiled: Compiled) =>
  levelsOf(compiled).flatMap(({ leaf, level }) =>
    [...level].flatMap(([event, list]) =>
      list.map((alternative, position) => ({ leaf, event, alternative, position, list })),
    ),
  );

const isLaneGuard = (guard: CompiledAlternative["guards"][number]) =>
  guard._tag === "Idle" || guard._tag === "Retryable";

const statesIn = (alternative: CompiledAlternative) =>
  alternative.guards.flatMap((g) => (g._tag === "InState" ? g.states : []));

const indexOf = (at: string) => Number(/\[(\d+)\]$/u.exec(at)?.[1] ?? 0);

/**
 * A handler alternative as the selection oracle reads it: guarded (`opaque`) when it holds a
 * check or a lane read, which the part's folds compute ({@link foldsOf}) or the lane oracles
 * judge.
 */
// RETURN_TYPE: the handler table's Alternative, whose `target` widens to a state name.
const handlerOf = (alternative: CompiledAlternative): Alternative => ({
  index: Option.some(indexOf(alternative.at)),
  target: Option.getOrElse(alternative.target, () => "stay"),
  when: statesIn(alternative),
  opaque: alternative.guards.some((g) => g._tag !== "InState"),
  updates: Option.isSome(alternative.update),
  idle: Option.fromUndefinedOr(
    alternative.guards.flatMap((g) => (g._tag === "Idle" ? [g.operation] : []))[0],
  ),
});

// RETURN_TYPE: the handler table's Level, a record by event.
const tableOf = (level: CompiledLevel): Level =>
  Object.fromEntries([...level].map(([event, list]) => [event, list.map(handlerOf)]));

// RETURN_TYPE: the handler table's Schedule, its delay an Option of ms.
const scheduleOf = (
  schedule: Compiled["states"] extends ReadonlyMap<string, infer N>
    ? N extends { readonly schedules: ReadonlyArray<infer S> }
      ? S
      : never
    : never,
): Schedule => ({
  id: schedule.name,
  send: schedule.send,
  delayMs: schedule.delay._tag === "Fixed" ? Option.some(schedule.delay.ms) : Option.none(),
  armOn: schedule.armOn,
  entry: schedule.onEntry,
});

const writesOf = (compiled: Compiled) =>
  [...compiled.operations.values()].flatMap((o) => (o._tag === "Write" ? [o] : []));

const memberOf = (compiled: Compiled, action: CompiledAlternative["actions"][number]) => {
  const none: ReadonlyArray<RowMember> = [];

  if (compiled.operations.get(action.operation)?._tag !== "Write" || action._tag === "Lookup")
    return none;

  if (action._tag === "Commit") {
    const commit: RowMember = { operation: action.operation, kind: "commit" };

    return [commit];
  }

  const member: RowMember = {
    operation: action.operation,
    kind: action._tag === "Retry" ? "retry" : "cancel",
    keyed: Option.isSome(action.key),
  };

  return [member];
};

const retryableOf = (alternative: Option.Option<CompiledAlternative>) =>
  Option.fromUndefinedOr(
    Option.match(alternative, { onNone: () => [], onSome: (a) => a.guards }).flatMap((g) =>
      g._tag === "Retryable" ? [{ operation: g.operation, times: g.times }] : [],
    )[0],
  );

type Placed = ReturnType<typeof alternativesOf>[number];

const fromsOf = (placed: Placed) => {
  const tokens = statesIn(placed.alternative);

  return Option.match(placed.leaf, {
    onSome: (leaf) => [leaf],
    onNone: () => (tokens.length > 0 ? tokens : ["any"]),
  });
};

const toOf = (alternative: CompiledAlternative) =>
  Option.getOrElse(alternative.target, () => "same");

const overlaps = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
  a.includes("any") || b.includes("any") || a.some((s) => b.includes(s));

/**
 * The rows of a machine (fixtures/reference.ts {@link Row}): one per alternative that runs write
 * members, per state it starts from.
 *
 * **Details**
 *
 * - A `retryable` guard is the row's computed guard; the alternative right after one in its list
 *   holds it failed (`passes: false`).
 * - `at` names an unguarded row's alternative when a sibling of the same event, an overlapping
 *   start and the same end runs other members.
 */
const rowsOf = (compiled: Compiled) => {
  const placed = alternativesOf(compiled);
  const none: ReadonlyArray<Row> = [];

  return placed.flatMap((p) => {
    const members = p.alternative.actions.flatMap((a) => memberOf(compiled, a));

    if (members.length === 0) return none;

    const own = Option.map(retryableOf(Option.some(p.alternative)), (r) => ({
      ...r,
      passes: true,
    }));

    const guard = Option.orElse(own, () =>
      Option.map(retryableOf(Option.fromUndefinedOr(p.list[p.position - 1])), (r) => ({
        ...r,
        passes: false,
      })),
    );

    const froms = fromsOf(p);
    const to = toOf(p.alternative);

    const shared = placed.some(
      (q) =>
        q.alternative !== p.alternative &&
        q.event === p.event &&
        toOf(q.alternative) === to &&
        overlaps(fromsOf(q), froms),
    );

    const at = Option.isNone(guard) && shared ? Option.some(p.alternative.at) : Option.none();

    return froms.map((from) => ({ event: p.event, from, to, members, guard, at }));
  });
};

// RETURN_TYPE: a DerivedOperation, whose Schemas widen to any key's and row's.
const operationOf = (write: CompiledWrite): DerivedOperation => ({
  key:
    write.keyFields.length === 0
      ? Empty
      : Schema.Struct(Object.fromEntries(write.keyFields.map((f) => [f, Schema.Json]))),
  row: rowFor(write.concurrency),
  reference: {
    concurrency: write.concurrency,
    releasesOnLeave: [],
    success: write.success.event,
    failure: Object.fromEntries([...write.failure].map(([tag, m]) => [tag, m.event])),
    unknown: { event: write.unknown.event },
    keyFields: write.keyFields,
  },
});

/**
 * What a value read through {@link reading} read that it did not hold.
 */
const reading = (values: Values) => {
  const missing: Array<string> = [];

  const view = new Proxy(values, {
    get: (target, key) => {
      if (Predicate.isString(key) && !Object.hasOwn(target, key)) missing.push(key);

      return Predicate.isString(key) ? target[key] : undefined;
    },
  });

  return { view, missing };
};

/**
 * Runs a part's closure over labels and folded fields: its result when it read only values the
 * suite knows, `None` when it read a missing one or threw.
 */
const computed = <A>(
  compiled: Compiled,
  labels: Labels,
  fields: Folded,
  run: (input: { readonly memory: Values; readonly event: Values }) => A,
) =>
  Option.flatMap(Schema.decodeUnknownOption(compiled.memoryJson)(fields), (decoded) => {
    const memory = reading(decoded);
    const event = reading(labels);

    const result = Result.try({
      try: () => run({ memory: memory.view, event: event.view }),
      catch: () => "threw",
    });

    return Result.isSuccess(result) && memory.missing.length === 0 && event.missing.length === 0
      ? Option.some(result.success)
      : Option.none();
  });

// RETURN_TYPE: Labels, which `Object.fromEntries` would widen to any values.
const jsonEntries = (values: Values): Labels =>
  Object.fromEntries(Object.entries(values).flatMap(([k, v]) => (isJson(v) ? [[k, v]] : [])));

// FLOW_STATE_ALLOW_UNKNOWN: an ending's value is the call's own, which the mapper is written for.
const mapped = (mapping: Option.Option<Mapping>, value: unknown) =>
  Option.match(
    Option.flatMap(mapping, (m) => m.from),
    {
      onNone: () => noLabels,
      onSome: (from) =>
        Result.match(Result.try({ try: () => from.run(value), catch: () => "threw" }), {
          onSuccess: jsonEntries,
          onFailure: () => noLabels,
        }),
    },
  );

/**
 * The labels of an answer the suite's server gave `operation`: the payload its commit's ending
 * maps to, as the part's `classify` sends it.
 *
 * **Gotchas**
 *
 * - A failure `classify` turns into a success only when an earlier send may have applied has no
 *   labels: which channel it takes is the Attempt's, not the answer's.
 */
const answerLabelsOf = (operation: CompiledOperation, classify: Option.Option<Classify>) => {
  const unknown = operation._tag === "Write" ? Option.some(operation.unknown) : Option.none();

  const failed = (tag: string, fields: Schema.JsonObject) => {
    if (LOST.has(tag)) return mapped(unknown, { _tag: tag });

    const succeeds = Option.map(classify, (c) => [c(tag, fields, false), c(tag, fields, true)]);
    const [never, always] = Option.getOrElse(succeeds, () => [false, false]);

    if (never !== always) return {};

    return always
      ? mapped(Option.some(operation.success), fields)
      : mapped(
          Option.fromUndefinedOr(operation.failure.get(tag)),
          Object.fromEntries([["_tag", tag], ...Object.entries(fields)]),
        );
  };

  return (answer: Answer) =>
    Answer.$match(answer, {
      Ok: ({ value }) => mapped(Option.some(operation.success), value),
      Fail: ({ tag, fields }) => failed(tag, fields),
      FailButLanded: ({ tag, fields }) => failed(tag, fields),
      Lost: () => mapped(unknown, { _tag: "NoResponse" }),
      LostButLanded: () => mapped(unknown, { _tag: "NoResponse" }),
      Never: () => noLabels,
      Die: () => noLabels,
    });
};

type Classify = Part["server"][string]["classify"];

const guardFoldOf = (compiled: Compiled, alternative: CompiledAlternative) => {
  const checks = alternative.guards.flatMap((g) => (g._tag === "Check" ? [g.check] : []));
  const lane = alternative.guards.some(isLaneGuard);

  return (labels: Labels, fields: Folded) =>
    Option.flatMap(
      computed(compiled, labels, fields, ({ memory, event }) =>
        checks.every((check) => check.run({ state: "", memory, event }) === true),
      ),
      (passes) => (passes && lane ? Option.none() : Option.some(passes)),
    );
};

const updateFoldOf =
  (compiled: Compiled, update: NonNullable<Option.Option.Value<CompiledAlternative["update"]>>) =>
  (labels: Labels, fields: Folded) =>
    Option.getOrElse(
      Option.flatMap(
        computed(compiled, labels, fields, ({ memory, event }) => ({
          memory,
          patch: update.run({ memory, event, now: 0 }),
        })),
        ({ memory, patch }) =>
          Option.map(
            Schema.encodeUnknownOption(compiled.memoryJson)({ ...memory, ...patch }),
            (encoded) =>
              Object.fromEntries(
                Object.keys(patch).flatMap((k) => {
                  const v = isJsonObject(encoded) ? encoded[k] : undefined;

                  return v === undefined ? [] : [[k, v]];
                }),
              ),
          ),
      ),
      () => ({}),
    );

const keyFoldOf = (compiled: Compiled, write: CompiledWrite) => {
  const select = alternativesOf(compiled)
    .flatMap(({ alternative }) => alternative.actions)
    .flatMap((a) => (a._tag === "Commit" && a.operation === write.name ? [a.select] : []))[0];

  return (labels: Labels, fields: Folded) =>
    Option.getOrElse(
      Option.flatMap(Option.fromUndefinedOr(select), (s) =>
        computed(compiled, labels, fields, ({ memory, event }) => {
          const input = s.run({ memory, event });

          return Object.fromEntries(
            write.keyFields.map((f) => {
              const v = input[f];

              return [f, isJson(v) ? v : null];
            }),
          );
        }),
      ),
      () => null,
    );
};

/**
 * A machine's folds, computed from its own Slots (F3): every guard, update, key and delay runs the
 * part's closure over the labels of a suite-made value and the folded memory.
 *
 * **Details**
 *
 * - The fields are the whole memory in JSON; a closure that reads a value the suite does not know
 *   (a missing label) computes nothing: a guard stays opaque, an update sets nothing.
 * - An alternative with a lane guard (`idle`, `retryable`) is decided only when a check fails: the
 *   lane oracles judge the rest.
 */
// RETURN_TYPE: the Folds contract the suite's prediction reads.
const foldsOf = (
  compiled: Compiled,
  classify: (operation: string) => Option.Option<Classify>,
): Folds => {
  const placed = alternativesOf(compiled).map((p) => p.alternative);
  const initial = Schema.encodeUnknownOption(compiled.memoryJson)(compiled.initialMemory);

  return {
    initial: Option.getOrElse(Option.filter(initial, isJsonObject), () => ({})),
    driven: Object.fromEntries(
      [...compiled.external.keys()].map((event) => [
        event,
        (payload: Schema.Json) => (isJsonObject(payload) ? payload : {}),
      ]),
    ),
    answers: Object.fromEntries(
      [...compiled.operations].map(([name, o]) => [name, answerLabelsOf(o, classify(name))]),
    ),
    updates: Object.fromEntries(
      placed.flatMap((a) =>
        Option.match(a.update, {
          onNone: () => [],
          onSome: (update) => [[a.at, updateFoldOf(compiled, update)]],
        }),
      ),
    ),
    guards: Object.fromEntries(
      placed.flatMap((a) =>
        a.guards.some((g) => g._tag !== "InState") ? [[a.at, guardFoldOf(compiled, a)]] : [],
      ),
    ),
    keys: Object.fromEntries(writesOf(compiled).map((w) => [w.name, keyFoldOf(compiled, w)])),
    delays: Object.fromEntries(
      [...compiled.states.values()].flatMap((node) =>
        node.schedules.flatMap((s) =>
          s.delay._tag === "Computed"
            ? [
                [
                  s.name,
                  (fields: Folded) =>
                    Option.getOrElse(
                      computed(compiled, {}, fields, ({ memory }) =>
                        s.delay._tag === "Computed" ? s.delay.ms.run({ memory }) : 0,
                      ),
                      () => 0,
                    ),
                ],
              ]
            : [],
        ),
      ),
    ),
  };
};

const derive = (compiled: Compiled, classify: (operation: string) => Option.Option<Classify>) => {
  const handlers: Handlers = {
    folds: foldsOf(compiled, classify),
    initial: compiled.initial,
    persist: compiled.persist,
    root: tableOf(compiled.root),
    states: Object.fromEntries(
      [...compiled.states].flatMap(([leaf, node]) =>
        node.on.size > 0 ? [[leaf, tableOf(node.on)]] : [],
      ),
    ),
    schedules: Object.fromEntries(
      [...compiled.states].flatMap(([leaf, node]) =>
        node.schedules.length > 0 ? [[leaf, node.schedules.map(scheduleOf)]] : [],
      ),
    ),
    parts: {},
  };

  return {
    machine: compiled.id,
    events: Object.fromEntries(compiled.external),
    memory: compiled.memory,
    input: Empty,
    states: [...compiled.states.keys()],
    operations: Object.fromEntries(writesOf(compiled).map((w) => [w.name, operationOf(w)])),
    rows: rowsOf(compiled),
    handlers,
  };
};

/**
 * Derives a fixture's reference from `compiled`: events, states, handlers, schedules, rows, and
 * each operation's concurrency, key fields and endings (Conformance R15, I46).
 *
 * **Gotchas**
 *
 * - `Compiled` carries no `classify`: answer labels here read every failure as a failure. A part's
 *   fixture ({@link partFixture}) takes its `classify` from the part.
 */
// RETURN_TYPE: the Derived contract the reference checks compare with a hand fixture.
export const referenceOf = (compiled: CompiledOf): Derived => derive(compiled, () => Option.none());

/**
 * A part declares no server model, and so no `classify`, for one of its operations: a defect in
 * the part, never filled in by the suite.
 */
export class NoClassify extends Data.TaggedError("NoClassify")<{
  readonly part: string;
  readonly operation: string;
}> {}

/**
 * The fixture of a part: its derived reference with the part's `classify` on each operation.
 */
// RETURN_TYPE: a Fixture, which the suite's oracles take.
export const partFixture = (part: Part): Fixture => {
  const classify = (operation: string) =>
    Option.map(Option.fromUndefinedOr(part.server[operation]), (s) => s.classify);

  const derived = derive(part.machine.compiled, classify);

  return {
    name: part.name,
    ...derived,
    operations: Object.fromEntries(
      Object.entries(derived.operations).map(([name, o]) => [
        name,
        {
          ...o,
          reference: {
            ...o.reference,
            classify: classifyWith(
              Option.getOrThrowWith(
                classify(name),
                () => new NoClassify({ part: part.name, operation: name }),
              ),
            ),
          },
        },
      ]),
    ),
  };
};
