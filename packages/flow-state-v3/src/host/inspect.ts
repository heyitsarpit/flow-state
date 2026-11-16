import { Option } from "effect";
import { Evidence } from "../core/evidence.ts";
import { laneKeyText } from "../core/lane-moves.ts";
import { type Life, lifecycleOf } from "../core/life.ts";
import { actorKey, Timer } from "../core/world.ts";
import { isInFlight } from "../core/tx.ts";
import type { Driver } from "./driver.ts";
import { DriverId, InspectorId, type Runtime, type Snapshot, snapshotOf } from "./runtime.ts";

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
 * each owed ending, each armed timer, the uses of each identity and the lifecycle.
 *
 * **Details**
 *
 * Actors are named by their stored key (machine, then name). A lane's `operation` is the
 * definition's operation name, `contract` its contract's id, `state` InFlight or Held (an Idle lane
 * is not listed), `phase` its head's phase tag, `key` its key text (none for an unkeyed operation)
 * and `retryCount` its head's re-sends. An owed row's `delivery` is its delivery tag. A timer's
 * `dueAt` is known for a schedule only. `lifecycle` is the Runtime's life: Inert, Booting, Open, Failed, Disposing or Disposed.
 */
export type RuntimeCut = {
  readonly actors: ReadonlyArray<{ readonly actor: string; readonly snapshot: Snapshot }>;
  readonly lanes: ReadonlyArray<{
    readonly actor: string;
    readonly operation: string;
    readonly contract: string;
    readonly state: "InFlight" | "Held";
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
  readonly lifecycle: Life["_tag"];
};

const contractOf = (driver: Driver, machine: string, operation: string) =>
  driver.machines.get(machine)?.operations.get(operation)?.contract ?? operation;

// RETURN_TYPE: the exported RuntimeCut contract.
const cutOf = (driver: Driver): RuntimeCut => {
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
      contract: contractOf(driver, lane.actor.machine, lane.operation),
      state: isInFlight(lane) ? "InFlight" : "Held",
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
    lifecycle: lifecycleOf(world.life),
  };
};

/**
 * Reads a Runtime's state as a {@link RuntimeCut}.
 *
 * **When to use**
 *
 * In development tools and tests, to read what no public snapshot shows: lane states, owed rows,
 * timers, uses and the lifecycle.
 *
 * **Details**
 *
 * Synchronous and passive: it reads the last committed state, starts no work, touches no storage
 * and emits no evidence; two reads at one point are equal. It works on a constructed, ready,
 * disposing or disposed Runtime.
 *
 * **Gotchas**
 *
 * - A batch out is the persistence edge's, not the Runtime's state, so the cut does not show it.
 * - This first slice covers actors, lanes, owed endings, timers, uses and the lifecycle only.
 */
export const inspect = (runtime: Runtime) => cutOf(runtime[DriverId]);
