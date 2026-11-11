import { Option } from "effect";
import { type Channel, Evidence } from "./evidence.ts";
import type { CallResult } from "./input.ts";
import { DECLINES, DISPOSAL_BOUND_MS, ROOT_ACTIVATION, type Tx } from "./tx.ts";
import { Command, Disposal, type Ending, type Lane, Mail, Phase, Timer } from "./world.ts";
import type { Persistence } from "./persist.ts";
import type { AnswerSteps } from "./answers.ts";

/**
 * Runtime disposal (Actors R22, R23): admission closes, nothing new is invoked, endings are parked, and no lane drops.
 */
export const makeDisposal = (tx: Tx, persistence: Persistence, answers: AnswerSteps) => {
  const { armTimer, disarmWhere } = tx;
  const { persist, laneWrite, saveActor, setLane, dropLane, park } = persistence;
  const { classify } = answers;

  // ── Runtime disposal (Actors R22, R23): admission closes, nothing new is invoked, no lane drops.
  // FLOW_STATE_ALLOW_UNKNOWN: a parked ending's value is the call's own.
  const parkOnLane = (lane: Lane, channel: Channel, reason: string, value: unknown) => {
    const ending: Ending = {
      operation: lane.operation,
      attempt: Option.some(lane.head.id),
      lane: Option.some(lane.id),
      channel:
        channel === "failure" && lane.head.mayHaveApplied && !DECLINES.has(reason)
          ? "unknown"
          : channel,
      reason:
        channel === "failure" && lane.head.mayHaveApplied && !DECLINES.has(reason)
          ? "StillUnknown"
          : reason,
      value,
      owner: ROOT_ACTIVATION,
      current: true,
      redelivered: false,
      parked: false,
    };

    if (ending.channel === "unknown") {
      const held = { ...lane, head: { ...lane.head, mayHaveApplied: true, phase: Phase.Held() } };
      setLane(held);
      persist(lane.actor, [laneWrite(held, false)], Option.none());
    } else dropLane(lane);

    park(lane.actor, lane.id, lane.operation, ending);
  };

  const disposeRuntime = () => {
    tx.set({ ...tx.world(), disposal: Disposal.Disposing() });
    const queued = tx.world().mail;
    tx.set({ ...tx.world(), mail: [] });

    for (const mail of queued)
      if (Mail.$is("Ending")(mail))
        Option.match(mail.ending.lane, {
          onNone: () => undefined,
          onSome: (lane) =>
            park(mail.actor, lane, mail.ending.operation, { ...mail.ending, parked: true }),
        });

    for (const lane of tx.world().lanes.values())
      Phase.$match(lane.head.phase, {
        Acknowledging: () => parkOnLane(lane, "failure", "Disposed", { why: "Disposed" }),
        Ready: () =>
          lane.head.sent
            ? setLane({ ...lane, head: { ...lane.head, phase: Phase.Held() } })
            : parkOnLane(lane, "failure", "Disposed", { why: "Disposed" }),
        Recapturing: () => setLane({ ...lane, head: { ...lane.head, phase: Phase.Held() } }),
        OnWire: () => undefined,
        Held: () => undefined,
      });

    for (const call of tx.world().reads.keys()) tx.command(Command.Interrupt({ call }));
    tx.set({ ...tx.world(), reads: new Map() });
    disarmWhere((t) => Timer.$is("Schedule")(t) || Timer.$is("Grace")(t));

    for (const incarnation of tx.world().incarnations.values()) saveActor(incarnation.actor);
    armTimer(Timer.Bound(), tx.env.now + DISPOSAL_BOUND_MS);
  };

  const settledWhileDisposing = (call: string, result: CallResult) => {
    for (const lane of tx.world().lanes.values())
      if (Phase.$is("OnWire")(lane.head.phase) && lane.head.phase.call === call) {
        const c = classify(result, lane.head.phase.cancelled);
        parkOnLane(lane, c.channel, c.reason, c.value);
      }
  };

  const boundPassed = () => {
    for (const lane of tx.world().lanes.values())
      if (Phase.$is("OnWire")(lane.head.phase)) {
        tx.command(Command.Interrupt({ call: lane.head.phase.call }));
        parkOnLane(lane, "unknown", "Disposed", undefined);
      }
  };

  const disposalEnds = () => {
    if (!Disposal.$is("Disposing")(tx.world().disposal)) return;

    if ([...tx.world().lanes.values()].some((l) => Phase.$is("OnWire")(l.head.phase))) return;

    disarmWhere((t) => Timer.$is("Bound")(t));
    tx.set({ ...tx.world(), disposal: Disposal.Disposed() });
    tx.emit(Evidence.RuntimeDisposed());
  };

  return { park, parkOnLane, disposeRuntime, settledWhileDisposing, boundPassed, disposalEnds };
};

/**
 * Runtime disposal.
 */
export type DisposalSteps = ReturnType<typeof makeDisposal>;
