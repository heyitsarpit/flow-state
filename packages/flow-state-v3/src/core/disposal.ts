import { Cue } from "./cells.ts";
import { Act } from "./evidence-of.ts";
import type { LedgerSteps } from "./ledger.ts";
import { DISPOSAL_BOUND_MS, type Tx } from "./tx.ts";
import { Command, Disposal, Timer } from "./world.ts";
import type { Persistence } from "./persist.ts";
import { onWire } from "./lane-moves.ts";
import type { LaneSteps } from "./lanes.ts";

/**
 * Runtime disposal: admission closes, queued endings wait, nothing new is invoked, no lane
 * drops, and calls on the wire are waited for up to the bound.
 */
export const makeDisposal = (
  tx: Tx,
  persistence: Persistence,
  lanes: LaneSteps,
  ledger: LedgerSteps,
) => {
  const { armTimer, disarmWhere } = tx;
  const { saveActor } = persistence;

  const disposeRuntime = () => {
    tx.set({ ...tx.world(), disposal: Disposal.Disposing(), mail: [] });

    // Each identity can no longer hear: its queued rows wait for its next start.
    for (const [first] of tx.world().owed.values())
      if (first !== undefined) ledger.suspend(first.actor, false);

    lanes.everyLane(Cue.DisposalStarts());

    for (const call of tx.world().reads.keys()) tx.command(Command.Interrupt({ call }));
    tx.set({ ...tx.world(), reads: new Map() });
    disarmWhere((t) => Timer.$is("Schedule")(t) || Timer.$is("Grace")(t));

    for (const incarnation of tx.world().incarnations.values()) saveActor(incarnation.actor);
    armTimer(Timer.Bound(), tx.env.now + DISPOSAL_BOUND_MS);
  };

  const boundPassed = () => lanes.everyLane(Cue.BoundPassed());

  const disposalEnds = () => {
    if (!Disposal.$is("Disposing")(tx.world().disposal)) return;

    if ([...tx.world().lanes.values()].some(onWire) || tx.world().displaced.size > 0) return;

    disarmWhere((t) => Timer.$is("Bound")(t));
    tx.set({ ...tx.world(), disposal: Disposal.Disposed() });
    tx.act(Act.RuntimeEnded());
  };

  return { disposeRuntime, boundPassed, disposalEnds };
};

/**
 * Runtime disposal.
 */
export type DisposalSteps = ReturnType<typeof makeDisposal>;
