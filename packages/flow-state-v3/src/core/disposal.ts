import { Duration, Option } from "effect";
import { Cue } from "./cells.ts";
import { Act } from "./evidence-of.ts";
import type { LedgerSteps } from "./ledger.ts";
import { Life } from "./life.ts";
import { RuntimeDefaults } from "./defaults.ts";
import type { Tx } from "./tx.ts";
import {
  type ActorId,
  actorKey,
  Command,
  byStart,
  type TicketId,
  Timer,
  type World,
} from "./world.ts";
import type { Persistence } from "./persist.ts";
import { onWire } from "./lane-moves.ts";
import type { LaneSteps } from "./lanes.ts";

// The timers a disposal disarms: schedules and graces start no more work; a storage silence still
// fires, and the bound is the disposal's own.
const DISARMED_AT_DISPOSAL = {
  Schedule: true,
  Grace: true,
  Silent: false,
  Bound: false,
} as const satisfies Record<Timer["_tag"], boolean>;

/**
 * Runtime disposal: admission closes, queued endings wait, nothing new is invoked, no lane
 * drops, and calls on the wire and the disposal's writes are waited for up to the bound.
 */
export const makeDisposal = (
  tx: Tx,
  persistence: Persistence,
  lanes: LaneSteps,
  ledger: LedgerSteps,
) => {
  const { armTimer, disarmWhere } = tx;
  const { saveActor } = persistence;

  const awaiting = () =>
    Life.$match(tx.world().life, {
      Disposing: (d) => d.awaiting,
      Inert: () => Option.none<TicketId>(),
      Booting: () => Option.none<TicketId>(),
      Open: () => Option.none<TicketId>(),
      Failed: () => Option.none<TicketId>(),
      Disposed: () => Option.none<TicketId>(),
      Stopped: () => Option.none<TicketId>(),
    });

  const end = () => {
    disarmWhere((t) => Timer.$is("Bound")(t));

    for (const actor of consumersFirst(tx.world())) tx.act(Act.Finished({ actor }));
    tx.setLife(Life.Disposed());
    tx.act(Act.RuntimeEnded());
  };

  const started = () => {
    tx.setLife(Life.Disposing({ awaiting: Option.none() }));
    tx.clearMail();

    // Each identity can no longer hear: its queued rows wait for its next start.
    for (const [first] of tx.world().owed.values())
      if (first !== undefined) ledger.suspend(first.actor, false);

    lanes.everyLane(Cue.DisposalStarts());

    tx.command(
      Command.EndWork({
        owners: consumersFirst(tx.world()).flatMap((actor) =>
          Option.toArray(
            Option.map(
              Option.fromUndefinedOr(tx.world().incarnations.get(actorKey(actor))),
              (i) => i.id,
            ),
          ),
        ),
        reportTo: "runtime",
      }),
    );
    tx.replace("reads", new Map());
    disarmWhere((t) => DISARMED_AT_DISPOSAL[t._tag]);

    for (const incarnation of tx.world().incarnations.values()) saveActor(incarnation.actor);
    armTimer(Timer.Bound(), tx.env.now + Duration.toMillis(RuntimeDefaults.disposalBound));
  };

  /**
   * Starts the disposal of an open Runtime; one that never opened has nothing to wait for and
   * ends at once.
   */
  const disposeRuntime = () => (Life.$is("Open")(tx.world().life) ? started() : end());

  /**
   * At the bound, each Attempt still on the wire ends unknown Disposed and the disposal ends: a
   * write still unanswered reports StorageFailure, and the bound's own changes are not written.
   */
  const boundPassed = () => {
    lanes.everyLane(Cue.BoundPassed());

    if (Option.isSome(awaiting())) tx.act(Act.WriteFailed());
    end();
  };

  /**
   * The store answered a batch: the disposal stops waiting for its write when that batch was its
   * last, and a refused one reports StorageFailure and ends the disposal.
   */
  const answered = (ticket: TicketId, landed: boolean) => {
    if (!Option.contains(awaiting(), ticket)) return;

    if (landed) tx.setLife(Life.Disposing({ awaiting: Option.none() }));
    else {
      tx.act(Act.WriteFailed());
      end();
    }
  };

  /**
   * Captures what a disposing step changed, the disposal's first step included, as one batch the
   * disposal waits for; every record still marked goes with it.
   */
  const write = (first: boolean) => {
    if (!tx.world().persistence || (!first && !persistence.marked())) return;

    const ticket = tx.mint("ticket");
    persistence.close([{ id: ticket, purpose: "flush" }]);
    tx.setLife(Life.Disposing({ awaiting: Option.some(ticket) }));
  };

  /**
   * The disposal ends once nothing is on the wire and its last write has landed.
   */
  const disposalEnds = () => {
    if (!Life.$is("Disposing")(tx.world().life) || Option.isSome(awaiting())) return;

    if ([...tx.world().lanes.values()].some(onWire) || tx.world().displaced.size > 0) return;

    end();
  };

  return { disposeRuntime, boundPassed, answered, write, disposalEnds };
};

// The live identities, each after every live consumer bound to it, the oldest ready one first
// otherwise: the order the Runtime's terminal evidence takes. `ready` is kept newest first, so the
// next identity is its last.
const consumersFirst = (world: World) => {
  const live = [...world.incarnations.values()].toSorted(byStart);

  const consumersLeft = new Map(
    live.map((i) => [
      actorKey(i.actor),
      [...(world.consumersOf.get(actorKey(i.actor)) ?? [])].filter((k) => world.incarnations.has(k))
        .length,
    ]),
  );

  const ready = live.filter((i) => consumersLeft.get(actorKey(i.actor)) === 0).toReversed();
  const order: Array<ActorId> = [];

  for (let next = ready.pop(); next !== undefined; next = ready.pop()) {
    order.push(next.actor);

    for (const key of new Set([...next.bound.values()].map(actorKey))) {
      const left = (consumersLeft.get(key) ?? 0) - 1;
      consumersLeft.set(key, left);
      const provider = world.incarnations.get(key);

      if (left === 0 && provider !== undefined)
        ready.splice(ready.findLastIndex((i) => byStart(i, provider) > 0) + 1, 0, provider);
    }
  }

  return order;
};
