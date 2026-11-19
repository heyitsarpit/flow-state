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
  startOrder,
  type TicketId,
  Timer,
  type World,
} from "./world.ts";
import type { Persistence } from "./persist.ts";
import { onWire } from "./lane-moves.ts";
import type { LaneSteps } from "./lanes.ts";

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

    for (const call of tx.world().reads.keys()) tx.command(Command.Interrupt({ call }));
    tx.replace("reads", new Map());
    disarmWhere((t) => Timer.$is("Schedule")(t) || Timer.$is("Grace")(t));

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

  /**
   * The host closed the Runtime's Scope after the disposal: each cleanup that failed there is an
   * Issue CleanupFailed.
   */
  const closed = (failures: number) => {
    for (let n = 0; n < failures; n += 1) tx.act(Act.CleanupFailed());
  };

  return { disposeRuntime, boundPassed, answered, write, disposalEnds, closed };
};

// The live identities, each after every live consumer bound to it, in start order otherwise: the
// order the Runtime's terminal evidence takes.
const consumersFirst = (world: World) => {
  const live = [...world.incarnations.values()].toSorted((a, b) => startOrder(a) - startOrder(b));

  const consumersLeft = new Map(
    live.map((i) => [
      actorKey(i.actor),
      [...(world.consumersOf.get(actorKey(i.actor)) ?? [])].filter((k) => world.incarnations.has(k))
        .length,
    ]),
  );

  const ready = live.filter((i) => consumersLeft.get(actorKey(i.actor)) === 0);
  const order: Array<ActorId> = [];

  for (let at = 0; at < ready.length; at += 1) {
    const next = ready[at];

    if (next === undefined) continue;
    order.push(next.actor);

    for (const key of new Set([...next.bound.values()].map(actorKey))) {
      const left = (consumersLeft.get(key) ?? 0) - 1;
      consumersLeft.set(key, left);
      const provider = world.incarnations.get(key);

      if (left === 0 && provider !== undefined) ready.push(provider);
    }
  }

  return order;
};
