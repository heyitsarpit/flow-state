import { Option } from "effect";
import { Cue } from "./cells.ts";
import { Evidence } from "./evidence.ts";
import { DISPOSAL_BOUND_MS, type Tx } from "./tx.ts";
import { Command, Disposal, Mail, Timer } from "./world.ts";
import type { Persistence } from "./persist.ts";
import { onWire } from "./lane-moves.ts";
import type { LaneSteps } from "./lanes.ts";

/**
 * Runtime disposal: admission closes, queued endings are parked, nothing new is invoked, no lane
 * drops, and calls on the wire are waited for up to the bound.
 */
export const makeDisposal = (tx: Tx, persistence: Persistence, lanes: LaneSteps) => {
  const { armTimer, disarmWhere } = tx;
  const { saveActor, park } = persistence;

  const disposeRuntime = () => {
    tx.set({ ...tx.world(), disposal: Disposal.Disposing() });
    const queued = tx.world().mail;
    tx.set({ ...tx.world(), mail: [] });

    for (const mail of queued)
      if (Mail.$is("Ending")(mail))
        Option.match(mail.ending.lane, {
          onNone: () => undefined,
          onSome: (lane) => park(mail.actor, lane, mail.ending.operation, mail.ending),
        });

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

    if ([...tx.world().lanes.values()].some(onWire)) return;

    disarmWhere((t) => Timer.$is("Bound")(t));
    tx.set({ ...tx.world(), disposal: Disposal.Disposed() });
    tx.emit(Evidence.RuntimeDisposed());
  };

  return { disposeRuntime, boundPassed, disposalEnds };
};

/**
 * Runtime disposal.
 */
export type DisposalSteps = ReturnType<typeof makeDisposal>;
