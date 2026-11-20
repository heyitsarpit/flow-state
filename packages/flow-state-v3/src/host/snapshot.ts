import { Option } from "effect";
import { publicMemory } from "../core/compiled.ts";
import type { Compiled, Values } from "../core/compiled.ts";
import { inputOfName } from "../core/identity.ts";
import { actorRecordKey } from "../core/record.ts";
import { create } from "../core/tree.ts";
import { laneKeyText } from "../core/lane-moves.ts";
import { actorLifecycleOf, type Lifecycle, restingLifecycleOf } from "../core/life.ts";
import { rowOf, type Row } from "../core/rows.ts";
import type { Machines } from "../core/tx.ts";
import type { IssueCode } from "../core/vocabulary.ts";
import {
  type ActorId,
  actorKey,
  byCodeUnits,
  type Issue,
  quarantineText,
  sourceText,
  type World,
} from "../core/world.ts";
import type {
  AnyDefinition,
  ContextOf,
  LeavesOf,
  Machine,
  MemoryOf,
  Operations,
  OutsideOf,
} from "../definition.ts";
import { type Code, Diagnostic } from "../error.ts";
import type { Driver } from "./driver.ts";

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
  readonly schedules: ReadonlyArray<{ readonly key: string; readonly dueAt: number }>;
};

// A keyed list in key order, as every list of a snapshot is.
const keyed = <A extends { readonly key: string }>(entries: ReadonlyArray<A>) =>
  entries.toSorted((a, b) => byCodeUnits(a.key, b.key));

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

// RETURN_TYPE: the snapshot's Operations shape.
const operationsOf = (world: World, machines: Machines, actor: ActorId): Operations => {
  const rows = new Map<string, Map<string, Row>>();

  for (const id of world.lanesOfActor.get(actorKey(actor)) ?? [])
    for (const lane of Option.toArray(Option.fromUndefinedOr(world.lanes.get(id))))
      Option.match(laneKeyText(machines, lane), {
        onNone: () => undefined,
        onSome: (keyText) => {
          const byKey = rows.get(lane.operation) ?? new Map<string, Row>();
          byKey.set(keyText, rowOf(lane));
          rows.set(lane.operation, byKey);
        },
      });

  return rows;
};

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
      issues: live.issues.map((issue) => issueOf(actor, issue)),
      schedules: keyed(
        [...live.schedules].map(([name, armed]) => ({ key: name, dueAt: armed.dueAt })),
      ),
    });

  if (record !== undefined)
    return Option.some({
      state: record.state,
      memory: record.memory,
      operations,
      lifecycle: restingLifecycleOf(world.life, "active"),
      context: {},
      issues: [],
      schedules: keyed(record.schedules.map((s) => ({ key: s.name, dueAt: s.dueAt }))),
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
      schedules: [],
    });

  return Option.map(Option.fromUndefinedOr(ended), (x) => ({
    state: x.state,
    memory: x.memory,
    operations,
    lifecycle: restingLifecycleOf(world.life, "disposed"),
    context: {},
    issues: [],
    schedules: [],
  }));
};

// An outside snapshot omits the machine's Flow.private fields; Stories and Inspection see them.
export const outside = <D extends AnyDefinition>(machine: Machine<D>, snapshot: Snapshot) => {
  const memory = publicMemory(machine.compiled, snapshot.memory);

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
