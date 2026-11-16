import { Option } from "effect";
import type { Values } from "../core/compiled.ts";
import { laneKeyText } from "../core/lane-moves.ts";
import { actorLifecycleOf } from "../core/life.ts";
import { rowOf, type Row } from "../core/rows.ts";
import type { Machines } from "../core/tx.ts";
import type { IssueCode } from "../core/vocabulary.ts";
import { type ActorId, actorKey, type Issue, type World } from "../core/world.ts";
import type { Machine, Operations } from "../definition.ts";
import { type Code, Diagnostic } from "../error.ts";
import type { Driver } from "./driver.ts";

/**
 * What a handle shows of an identity: its leaf state, its memory and its write lanes'
 * rows.
 */
export type Snapshot = {
  readonly state: string;
  readonly memory: Values;
  readonly operations: Operations;
  readonly lifecycle: "active" | "disposing" | "disposed";
  readonly context: Values;
  readonly issues: ReadonlyArray<Diagnostic>;
  readonly schedules: ReadonlyArray<{ readonly key: string; readonly dueAt: number }>;
};

// A keyed list in key order, as every list of a snapshot is.
const keyed = <A extends { readonly key: string }>(entries: ReadonlyArray<A>) =>
  entries.toSorted((a, b) => Number(a.key > b.key) - Number(a.key < b.key));

// The diagnostic code of an issue: a refused turn (a denial code, not a diagnostic) is the
// configuration it was given, a callback that threw is a Defect.
const DIAGNOSTIC_OF = {
  InvalidTurn: "InvalidConfiguration",
  CallbackDefect: "Defect",
  GuardDefect: "GuardDefect",
  Defect: "Defect",
  StorageFailure: "StorageFailure",
} as const satisfies Record<IssueCode, Code>;

// An open issue as the Diagnostic a snapshot shows: its identity and source in the path, the
// refusal and the callback slot that failed in details.
const issueOf = (actor: ActorId, issue: Issue) =>
  new Diagnostic({
    classification:
      issue.code === "InvalidTurn" || issue.code === "StorageFailure" ? "Failure" : "Defect",
    code: DIAGNOSTIC_OF[issue.code],
    path: [actor.machine, actor.name, issue.source],
    details: { refused: issue.code, slot: Option.getOrNull(issue.slot) },
    summary: `${issue.source} raised ${issue.code}`,
    help: "Fix the callback the slot names; the issue clears when this source next succeeds.",
  });

// RETURN_TYPE: the snapshot's Operations shape.
const operationsOf = (world: World, machines: Machines, actor: ActorId): Operations => {
  const rows = new Map<string, Map<string, Row>>();

  for (const lane of world.lanes.values())
    if (actorKey(lane.actor) === actorKey(actor))
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
      context: Object.fromEntries(live.context),
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
      lifecycle: "active",
      context: {},
      issues: [],
      schedules: keyed(record.schedules.map((s) => ({ key: s.name, dueAt: s.dueAt }))),
    });

  return Option.map(Option.fromUndefinedOr(ended), (x) => ({
    state: x.state,
    memory: x.memory,
    operations,
    lifecycle: "disposed",
    context: {},
    issues: [],
    schedules: [],
  }));
};

// An outside snapshot omits the machine's Flow.private fields; Stories and Inspection see them.
export const outside = (machine: Machine, snapshot: Snapshot) => {
  const hidden = machine.compiled.fields.filter((f) => f.private).map((f) => f.name);

  return hidden.length === 0
    ? snapshot
    : {
        ...snapshot,
        memory: Object.fromEntries(
          Object.entries(snapshot.memory).filter(([name]) => !hidden.includes(name)),
        ),
      };
};

// RETURN_TYPE: an Option of the snapshot: none when the identity has no incarnation and no record.
export const snapshotOf = (driver: Driver, actor: ActorId): Option.Option<Snapshot> =>
  snapshotIn(driver.world(), driver.machines, actor);
