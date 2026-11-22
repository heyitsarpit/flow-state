import { Timing } from "../core/world.ts";
import { Option } from "effect";
import { operationOf } from "../core/compiled.ts";
import { Evidence } from "../core/evidence.ts";
import { laneKeyText } from "../core/lane-moves.ts";
import { type Life, lifecycleOf } from "../core/life.ts";
import type { Delivery } from "../core/ledger.ts";
import type { Channel } from "../core/vocabulary.ts";
import {
  type ActorKey,
  actorKey,
  type AttemptId,
  type Phase,
  Timer,
  type Use,
} from "../core/world.ts";
import { isInFlight } from "../core/tx.ts";
import type { Driver } from "./driver.ts";
import { entry } from "../entry.ts";
import type { AnyDefinition } from "../definition.ts";
import {
  type App,
  type DefsOf,
  internalsOf,
  type Runtime,
  type Snapshot,
  snapshotOf,
} from "./runtime.ts";

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
export const attachInspector = entry(
  "attachInspector",
  (runtime: Runtime, callback: (evidence: Evidence) => void) => ({
    dispose: internalsOf(runtime).attach(callback),
  }),
);

export { Evidence };

export type { EvidenceOf, LaneFact, ReportCode } from "../core/evidence.ts";

export type { ActorKey, AttemptId, Use } from "../core/world.ts";

export type { Channel } from "../core/vocabulary.ts";

/**
 * A write lane head's phase, as the cut's `phase` names it.
 */
export type PhaseTag = Phase["_tag"];

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
 * `dueAt` is known for a schedule only. `lifecycle` is the Runtime's life: Inert, Booting, Open, Failed, Disposing, Disposed or
 * Stopped.
 * `Ds` is the Runtime's app's definitions: snapshots and operation names are theirs.
 */
export type RuntimeCut<Ds extends AnyDefinition = AnyDefinition> = {
  readonly actors: ReadonlyArray<{ readonly actor: ActorKey; readonly snapshot: SnapshotOf<Ds> }>;
  readonly lanes: ReadonlyArray<{
    readonly actor: ActorKey;
    readonly operation: OperationOf<Ds>;
    readonly contract: string;
    readonly state: "InFlight" | "Held";
    readonly key: Option.Option<string>;
    readonly attempt: AttemptId;
    readonly phase: Phase["_tag"];
    readonly retryCount: number;
  }>;
  readonly owed: ReadonlyArray<{
    readonly actor: ActorKey;
    readonly operation: OperationOf<Ds>;
    readonly attempt: Option.Option<AttemptId>;
    readonly channel: Channel;
    readonly reason: string;
    readonly delivery: Delivery["_tag"];
  }>;
  readonly timers: ReadonlyArray<{
    readonly kind: Timer["_tag"];
    readonly actor: Option.Option<ActorKey>;
    readonly dueAt: Option.Option<number>;
  }>;
  readonly uses: ReadonlyArray<{ readonly actor: ActorKey; readonly uses: ReadonlyArray<Use> }>;
  readonly lifecycle: Life["_tag"];
};

// One snapshot of any of the app's definitions.
type SnapshotOf<Ds extends AnyDefinition> = Ds extends AnyDefinition ? Snapshot<Ds> : never;

/**
 * An operation name of any of the app's definitions.
 */
export type OperationOf<Ds extends AnyDefinition> = Ds extends AnyDefinition
  ? keyof Ds["operations"] & string
  : never;

const contractOf = (driver: Driver, machine: string, operation: string) =>
  Option.match(operationOf(driver.machines, machine, operation), {
    onNone: () => operation,
    onSome: (op) => op.contract,
  });

// RETURN_TYPE: the exported RuntimeCut contract.
const cutOf = (driver: Driver): RuntimeCut => {
  const world = driver.world();

  const dueOf = (timer: Timer) =>
    Timer.$match(timer, {
      Schedule: ({ actor, incarnation, track, arming }) =>
        Option.flatMap(Option.fromUndefinedOr(world.incarnations.get(actorKey(actor))), (live) =>
          Option.flatMap(Option.fromUndefinedOr(live.schedules.get(track)), (tracked) =>
            Option.flatMap(tracked.run, (run) =>
              live.id === incarnation && run.arming === arming && Timing.$is("Running")(run.timing)
                ? Option.some(run.timing.dueAt)
                : Option.none(),
            ),
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
      Silent: () => Option.none<ActorKey>(),
      Bound: () => Option.none<ActorKey>(),
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
export const inspect: <R, A extends App>(runtime: Runtime<R, A>) => RuntimeCut<DefsOf<A>> = entry(
  "inspect",
  (runtime: Runtime) => cutOf(internalsOf(runtime).driver),
);

export { dataView } from "../core/data-view.ts";

export { InternalsId } from "../core/compiled.ts";

export { compiledOf } from "../compiled-of.ts";
