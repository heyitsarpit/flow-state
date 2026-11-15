import { Option } from "effect";
import { Evidence } from "../core/evidence.ts";
import { laneKeyText } from "../core/lane-moves.ts";
import { actorKey, Timer } from "../core/world.ts";
import type { Driver } from "./driver.ts";
import { InspectorId, type Runtime, type Snapshot, snapshotOf } from "./runtime.ts";

/**
 * Attaches a callback to a Runtime's evidence.
 *
 * **When to use**
 *
 * In development tools and tests, to watch every Runtime decision in order.
 *
 * **Details**
 *
 * Each record is passed after the publication it describes. A callback that throws detaches
 * itself. `dispose` detaches the callback.
 *
 * **Gotchas**
 *
 * - This build delivers records synchronously at the end of each step, not on a later task.
 */
export const attachInspector = (runtime: Runtime, callback: (evidence: Evidence) => void) => ({
  dispose: runtime[InspectorId](callback),
});

export { Evidence };

/**
 * One read of a Runtime's state, as plain data: every live actor's snapshot, each write lane,
 * each owed ending, each armed timer, the uses of each identity and the disposal phase.
 *
 * **Details**
 *
 * Actors are named by their stored key (machine, then name). A lane's `phase` is its head's phase
 * tag, `key` its key text (none for an unkeyed operation) and `retryCount` its head's re-sends.
 * A lane's row is a view of these, read through the actor's snapshot. An owed row's `delivery` is its
 * delivery tag. A timer's `dueAt` is known for a schedule only.
 */
export type RuntimeCut = {
  readonly actors: ReadonlyArray<{ readonly actor: string; readonly snapshot: Snapshot }>;
  readonly lanes: ReadonlyArray<{
    readonly actor: string;
    readonly operation: string;
    readonly key: Option.Option<string>;
    readonly attempt: string;
    readonly phase: string;
    readonly retryCount: number;
  }>;
  readonly owed: ReadonlyArray<{
    readonly actor: string;
    readonly operation: string;
    readonly attempt: Option.Option<string>;
    readonly channel: string;
    readonly reason: string;
    readonly delivery: string;
  }>;
  readonly timers: ReadonlyArray<{
    readonly kind: string;
    readonly actor: Option.Option<string>;
    readonly dueAt: Option.Option<number>;
  }>;
  readonly uses: ReadonlyArray<{ readonly actor: string; readonly uses: ReadonlyArray<string> }>;
  readonly disposal: string;
};

/**
 * Reads a Runtime's driver as a {@link RuntimeCut}.
 *
 * **When to use**
 *
 * In Flow's own test tooling, to read what no public snapshot shows: lane phases, owed rows,
 * timers and uses.
 *
 * **Details**
 *
 * It reads the driver's current world and changes nothing; equal worlds give equal cuts.
 *
 * **Gotchas**
 *
 * - A batch out is the persistence edge's, not the world's, so the cut does not show it.
 */
// RETURN_TYPE: the exported RuntimeCut contract.
export const cutOf = (driver: Driver): RuntimeCut => {
  const world = driver.world();

  const dueOf = (timer: Timer) =>
    Timer.$match(timer, {
      Schedule: ({ actor, incarnation, schedule, arming }) =>
        Option.flatMap(Option.fromUndefinedOr(world.incarnations.get(actorKey(actor))), (live) =>
          Option.flatMap(Option.fromUndefinedOr(live.schedules.get(schedule)), (armed) =>
            live.id === incarnation && armed.arming === arming
              ? Option.some(armed.dueAt)
              : Option.none(),
          ),
        ),
      Grace: () => Option.none<number>(),
      Silent: () => Option.none<number>(),
      Bound: () => Option.none<number>(),
    });

  const actorOf = (timer: Timer) =>
    Timer.$match(timer, {
      Schedule: ({ actor }) => Option.some(actorKey(actor)),
      Grace: ({ actor }) => Option.some(actorKey(actor)),
      Silent: () => Option.none<string>(),
      Bound: () => Option.none<string>(),
    });

  return {
    actors: [...world.incarnations.values()].flatMap((live) =>
      Option.toArray(
        Option.map(snapshotOf(driver, live.actor), (snapshot) => ({
          actor: actorKey(live.actor),
          snapshot,
        })),
      ),
    ),
    lanes: [...world.lanes.values()].map((lane) => ({
      actor: actorKey(lane.actor),
      operation: lane.operation,
      key: laneKeyText(driver.machines, lane),
      attempt: lane.head.id,
      phase: lane.head.phase._tag,
      retryCount: lane.head.retryCount,
    })),
    owed: [...world.owed.values()].flat().map((row) => ({
      actor: actorKey(row.actor),
      operation: row.operation,
      attempt: row.attempt,
      channel: row.channel,
      reason: row.reason,
      delivery: row.delivery._tag,
    })),
    timers: [...world.timers.values()].map((timer) => ({
      kind: timer._tag,
      actor: actorOf(timer),
      dueAt: dueOf(timer),
    })),
    uses: [...world.uses].map(([actor, uses]) => ({ actor, uses })),
    disposal: world.disposal._tag,
  };
};
