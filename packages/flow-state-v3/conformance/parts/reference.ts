import { Data, Option, Schema } from "effect";
import type { Part } from "../../fixtures/part.ts";
import { Empty, type Fixture, rowFor } from "../fixtures/fixture.ts";
import type { Alternative, Handlers, Level, Schedule } from "../fixtures/handlers.ts";
import {
  classifyWith,
  type OperationReference,
  type Row,
  type RowMember,
} from "../fixtures/reference.ts";
import {
  alternativesOf,
  type CompiledAlternative,
  type CompiledLevel,
  type CompiledOf,
  type CompiledWrite,
  statesIn,
  writesOf,
} from "./compiled.ts";
import { type Classify, foldsOf } from "./derived-folds.ts";

export type { CompiledOf } from "./compiled.ts";

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

const indexOf = (at: string) => Number(/\[(\d+)\]$/u.exec(at)?.[1] ?? 0);

/**
 * A handler alternative as the selection oracle reads it: guarded (`opaque`) when it holds a
 * check or a lane read, which the part's folds compute or the lane oracles judge.
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
  schedule: CompiledOf["states"] extends ReadonlyMap<string, infer N>
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

const memberOf = (compiled: CompiledOf, action: CompiledAlternative["actions"][number]) => {
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
const rowsOf = (compiled: CompiledOf) => {
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

const derive = (compiled: CompiledOf, classify: (operation: string) => Option.Option<Classify>) => {
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
