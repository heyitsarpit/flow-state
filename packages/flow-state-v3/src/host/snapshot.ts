import { Option, Predicate } from "effect";
import { savedScheduleIssues, scheduleIssues } from "../core/schedule-issues.ts";
import { operationsOf } from "../core/schedule-plan.ts";
import { publicMemory } from "../core/compiled.ts";
import type { Compiled, Values } from "../core/compiled.ts";
import { inputOfName } from "../core/identity.ts";
import { actorRecordKey } from "../core/record.ts";
import { create } from "../core/tree.ts";
import { actorLifecycleOf, type Lifecycle, restingLifecycleOf } from "../core/life.ts";
import type { Row } from "../core/rows.ts";
import type { Machines } from "../core/tx.ts";
import type { IssueCode, SavedSchedules, SavedTimer } from "../core/vocabulary.ts";
import {
  type ActorId,
  actorKey,
  byCodeUnits,
  type Incarnation,
  type Issue,
  quarantineText,
  sourceText,
  type World,
} from "../core/world.ts";
import { Arming, timersIn, Timing, type Tracked, valueOf } from "../core/timers.ts";
import type {
  AnyDefinition,
  ContextOf,
  KeyOfDecl,
  ReasonOfDecl,
  LeavesOf,
  Machine,
  MemoryOf,
  Operations,
  OutsideOf,
} from "../definition.ts";
import { type Code, Diagnostic } from "../error.ts";
import type { Driver } from "./driver.ts";
import { compiledOf } from "../compiled-of.ts";

// A definition whose leaves are text is the erased one: its snapshot keeps text and Values.
type Erased<D extends AnyDefinition> =
  LeavesOf<D["states"]> extends infer L ? (string extends L ? true : false) : never;

/**
 * What a handle shows of an identity: its leaf state, its memory and its write lanes'
 * rows.
 *
 * **Details**
 *
 * `Snapshot<D>` types `state` as the definition's leaf paths, `operations` by the definition's
 * operation names and `context` by its slots, each absent while the actor rests. `View` is whose
 * memory it shows: `"inside"`, a Story's `read(ref)`, has every field, `Flow.private` ones
 * included; `"outside"`, a handle's `getSnapshot()`, omits the private ones. `Snapshot` with no
 * definition is erased: `state` is a string and `memory` and `context` are `Values`.
 */
export type Snapshot<
  D extends AnyDefinition = AnyDefinition,
  View extends "inside" | "outside" = "inside",
> = {
  readonly state: Erased<D> extends true ? string : LeavesOf<D["states"]>;
  readonly memory: Erased<D> extends true
    ? Values
    : View extends "outside"
      ? OutsideOf<D["memory"]>
      : MemoryOf<D["memory"]>;
  readonly operations: Erased<D> extends true
    ? Operations
    : ReadonlyMap<keyof D["operations"] & string, ReadonlyMap<string, Row>>;
  readonly lifecycle: Lifecycle;
  readonly context: Erased<D> extends true ? Values : Partial<ContextOf<D["context"]>>;
  readonly issues: ReadonlyArray<Diagnostic>;
  readonly schedules: Erased<D> extends true ? Timers : TimersOf<D>;
};

/**
 * One armed timer as a snapshot shows it: `{ dueAt }` while it runs, `{ left, pausedBy }` while its
 * pause reasons `R` hold it, never both. Times are Runtime Clock milliseconds.
 */
export type TimerView<R extends string = string> =
  | { readonly dueAt: number }
  | { readonly left: number; readonly pausedBy: ReadonlyArray<R> };

/**
 * A snapshot's armed timers typed by the definition's declaration: each declared schedule by name,
 * a keyed one as a list of its declared key with its timer, pausedBy its declared reasons.
 */
export type TimersOf<D extends AnyDefinition> = {
  readonly [N in keyof D["schedules"]]?: [KeyOfDecl<D["schedules"][N]>] extends [undefined]
    ? TimerView<ReasonOfDecl<D["schedules"][N]>>
    : ReadonlyArray<
        { readonly key: KeyOfDecl<D["schedules"][N]> } & TimerView<ReasonOfDecl<D["schedules"][N]>>
      >;
};

/**
 * A snapshot's armed timers by schedule name: a keyed schedule's as a list in key order, each with
 * its key. A schedule with no armed timer is absent.
 */
export type Timers = Readonly<
  Record<string, TimerView | ReadonlyArray<{ readonly key: Values } & TimerView>>
>;

// What a live timer shows while armed: its deadline, or its time left and the reasons holding it.
const liveViewOf = (tracked: Tracked) =>
  Arming.$is("Armed")(tracked.arming)
    ? Option.some<TimerView>(
        Timing.$match(tracked.arming.run.timing, {
          Due: ({ dueAt }) => ({ dueAt }),
          Held: ({ left }) => ({ left, pausedBy: valueOf(tracked.reasons) }),
        }),
      )
    : Option.none<TimerView>();

// What a saved timer shows while armed.
const savedViewOf = (saved: SavedTimer) => {
  switch (saved.arming._tag) {
    case "Due":
      return Option.some<TimerView>({ dueAt: saved.arming.dueAt });
    case "Held":
      return Option.some<TimerView>({ left: saved.arming.left, pausedBy: saved.reasons ?? [] });
    case "Idle":
    case "Refused":
      return Option.none<TimerView>();
  }
};

type KeyedView = { readonly key: Values } & TimerView;

type Shown = TimerView | ReadonlyArray<KeyedView>;

// The timers that show, by schedule name in code-unit order; a schedule with none is absent.
const shownBy = (entries: ReadonlyArray<readonly [string, Option.Option<Shown>]>) =>
  Object.fromEntries<Shown>(
    entries
      .flatMap(([name, shown]) => Option.toArray(Option.map(shown, (v) => [name, v] as const)))
      .toSorted(([a], [b]) => byCodeUnits(a, b)),
  ) satisfies Timers;

// A keyed list, or none when no timer of it shows.
const listed = (views: ReadonlyArray<KeyedView>) =>
  views.length === 0 ? Option.none<Shown>() : Option.some<Shown>(views);

// The armed timers of a live incarnation, keyed ones in key order.
const liveTimersOf = (incarnation: Incarnation) =>
  shownBy(
    [...incarnation.schedules].map(([name, scheduled]) => {
      if (scheduled._tag === "Single") return [name, liveViewOf(scheduled.timer)] as const;

      const views = timersIn(scheduled).flatMap((tracked) =>
        Option.toArray(
          Option.map(Option.all([tracked.key, liveViewOf(tracked)]), ([key, view]) => ({
            key: key.value,
            ...view,
          })),
        ),
      );

      return [name, listed(views)] as const;
    }),
  );

// FLOW_STATE_ALLOW_UNKNOWN: a saved key is JSON; a snapshot of a resting record shows it as saved.
const keyValuesOf = (key: unknown) =>
  Predicate.isReadonlyObject(key) ? { ...key } : ({} satisfies Values);

const savedShownOf = (entry: SavedTimer | ReadonlyArray<SavedTimer>) => {
  if (!isList(entry)) return savedViewOf(entry);

  return listed(
    entry.flatMap((saved) =>
      Option.toArray(
        Option.map(savedViewOf(saved), (view) => ({ key: keyValuesOf(saved.key), ...view })),
      ),
    ),
  );
};

// FLOW_STATE_ALLOW_UNKNOWN: a saved entry, one timer or a keyed list.
// RETURN_TYPE: a type guard states the type it narrows to.
const isList = (entry: unknown): entry is ReadonlyArray<SavedTimer> => Array.isArray(entry);

// The armed timers of a saved record, keyed ones in key order.
const savedTimersOf = (saved: SavedSchedules) =>
  shownBy(
    Object.values(saved)
      .flatMap((byName) => Object.entries(byName))
      .map(([name, entry]) => [name, savedShownOf(entry)] as const),
  );

// Every open issue of a live incarnation: the stored ones, then each schedule's, read from its
// state.
const issuesOf = (incarnation: Incarnation) => [
  ...incarnation.issues,
  ...[...incarnation.schedules].flatMap(([name, scheduled]) => scheduleIssues(name, scheduled)),
];

const NO_TIMERS: Timers = {};

// The diagnostic code of an issue: a refused turn (a denial code, not a diagnostic) is the
// configuration it was given, a callback that threw is a Defect.
const DIAGNOSTIC_OF = {
  InvalidTurn: "InvalidConfiguration",
  GuardDefect: "GuardDefect",
  Defect: "Defect",
  StorageFailure: "StorageFailure",
  CleanupFailed: "CleanupFailed",
} as const satisfies Record<IssueCode, Code>;

// An open issue as the Diagnostic a snapshot shows: its identity and source in the path, the
// refusal and the callback slot that failed in details.
const issueOf = (actor: ActorId, issue: Issue) =>
  new Diagnostic({
    classification:
      issue.code === "InvalidTurn" || issue.code === "StorageFailure" ? "Failure" : "Defect",
    code: DIAGNOSTIC_OF[issue.code],
    path: [actor.machine, actor.name, sourceText(issue.source)],
    details: { refused: issue.code, slot: Option.getOrNull(issue.slot) },
    summary: `${sourceText(issue.source)} raised ${issue.code}${Option.match(issue.slot, { onNone: () => "", onSome: (slot) => ` at ${slot}` })}`,
    help: "Fix the callback the slot names; the issue clears when this source next succeeds.",
  });

// The memory an ensure would start an identity with: what a quarantined record's snapshot shows.
const freshStart = (compiled: Compiled, actor: ActorId) =>
  create(compiled, inputOfName(compiled, actor.name));

// RETURN_TYPE: an Option of the snapshot: none when the identity has no incarnation and no record.
export const snapshotIn = (
  world: World,
  machines: Machines,
  actor: ActorId,
): Option.Option<Snapshot> => {
  const key = actorKey(actor);
  const live = world.incarnations.get(key);
  const record = world.records.get(key);
  const ended = world.ended.get(key);
  const operations = operationsOf(world, machines, actor);

  if (live !== undefined)
    return Option.some({
      state: live.state,
      memory: live.memory,
      operations,
      lifecycle: actorLifecycleOf(world.life),
      context: Object.fromEntries([...live.context].map(([slot, s]) => [slot, s.value])),
      issues: issuesOf(live).map((issue) => issueOf(actor, issue)),
      schedules: liveTimersOf(live),
    });

  if (record !== undefined)
    return Option.some({
      state: record.state,
      memory: record.memory,
      operations,
      lifecycle: restingLifecycleOf(world.life, "active"),
      context: {},
      issues: savedScheduleIssues(machines, record).map((issue) => issueOf(actor, issue)),
      schedules: savedTimersOf(record.schedules),
    });

  const compiled = machines.get(actor.machine);
  const quarantined = world.quarantined.get(actorRecordKey(key));

  // A record the boot could not read shows the fresh start an ensure would make, with its issue.
  if (quarantined !== undefined && compiled !== undefined)
    return Option.some({
      state: compiled.initial,
      memory: freshStart(compiled, actor),
      operations,
      lifecycle: restingLifecycleOf(world.life, "quarantined"),
      context: {},
      issues: [
        new Diagnostic({
          classification: "Failure",
          code: "RecordUndecodable",
          path: [actor.machine, actor.name],
          details: { reason: quarantineText(quarantined) },
          summary: `the saved record of ${actor.name} could not be read`,
          help: "Ensure the actor to start it fresh; its first save replaces the record.",
        }),
      ],
      schedules: NO_TIMERS,
    });

  return Option.map(Option.fromUndefinedOr(ended), (x) => ({
    state: x.state,
    memory: x.memory,
    operations,
    lifecycle: restingLifecycleOf(world.life, "disposed"),
    context: {},
    issues: [],
    schedules: NO_TIMERS,
  }));
};

// An outside snapshot omits the machine's Flow.private fields; Stories and Inspection see them.
export const outside = <D extends AnyDefinition>(machine: Machine<D>, snapshot: Snapshot) => {
  const memory = publicMemory(compiledOf(machine), snapshot.memory);

  return asOutside<D>(memory === snapshot.memory ? snapshot : { ...snapshot, memory });
};

// A snapshot of a machine's actor as its definition's outside view.
const asOutside = <D extends AnyDefinition>(snapshot: Snapshot) =>
  // SAFETY: the snapshot is of an actor of Machine<D>, whose Compiled holds D's leaves, operations and slots, and publicMemory has dropped its private fields.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the definition's types are erased in Compiled and restored here, at the one handle boundary
  snapshot as Snapshot<D, "outside">;

// RETURN_TYPE: an Option of the snapshot: none when the identity has no incarnation and no record.
export const snapshotOf = (driver: Driver, actor: ActorId): Option.Option<Snapshot> =>
  snapshotIn(driver.world(), driver.machines, actor);
