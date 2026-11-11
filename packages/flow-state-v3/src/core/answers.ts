import { Option } from "effect";
import { type Channel, Evidence } from "./evidence.ts";
import { CallResult } from "./input.ts";
import { type Tx, without } from "./tx.ts";
import { Command, type Lane, Phase, type Read } from "./world.ts";
import type { Persistence } from "./persist.ts";
import type { LaneSteps } from "./lanes.ts";

/**
 * Host answers (Actors R12, WriteAhead R13): a call's settlement queues its ending; a store's answer releases or refuses an acknowledged send.
 */
export const makeAnswers = (tx: Tx, persistence: Persistence, lanes: LaneSteps) => {
  const { incarnationOf, endingMail } = tx;
  const { setLane, dropLane } = persistence;
  const { invoke } = lanes;

  // ── settling: a call's ending is queued at settlement (Actors R12).
  // FLOW_STATE_ALLOW_UNKNOWN: an ending's value is the call's own, mapped at admission.
  const classified = (channel: Channel, reason: string, value: unknown) => ({
    channel,
    reason,
    value,
  });

  const classify = (result: CallResult, cancelled: boolean) =>
    CallResult.$match(result, {
      Success: ({ value }) => classified("success", "success", value),
      Failure: ({ reason, error }) => classified("failure", reason, error),
      Unknown: ({ reason, error }) => classified("unknown", reason, error),
      Defect: () => classified("unknown", "Defect", undefined),
      Interrupted: () => classified("unknown", cancelled ? "Cancelled" : "Interrupted", undefined),
    });

  const settledRead = (read: Read, result: CallResult) => {
    tx.set({ ...tx.world(), reads: without(tx.world().reads, read.call) });
    const incarnation = incarnationOf(read.actor);

    if (incarnation === undefined || incarnation.id !== read.incarnation) return;
    const c = classify(result, false);

    if (CallResult.$is("Defect")(result))
      tx.emit(Evidence.Issue({ code: "Defect", ending: Option.none() }));

    endingMail(read.actor, {
      operation: read.operation,
      attempt: Option.none(),
      lane: Option.none(),
      channel: c.channel === "unknown" ? "failure" : c.channel,
      reason: c.reason,
      value: c.value,
      owner: read.owner,
      current: false,
      redelivered: false,
      parked: false,
    });
  };

  const settledLane = (lane: Lane, call: string, result: CallResult) => {
    if (!Phase.$is("OnWire")(lane.head.phase) || lane.head.phase.call !== call) return;
    const c = classify(result, lane.head.phase.cancelled);

    if (CallResult.$is("Defect")(result))
      tx.emit(Evidence.Issue({ code: "Defect", ending: Option.none() }));

    endingMail(lane.actor, {
      operation: lane.operation,
      attempt: Option.some(lane.head.id),
      lane: Option.some(lane.id),
      ...c,
      owner: lane.head.owner,
      current: false,
      redelivered: false,
      parked: false,
    });
  };

  const settled = (call: string, result: CallResult) => {
    const read = tx.world().reads.get(call);

    if (read !== undefined) {
      settledRead(read, result);

      return;
    }

    for (const lane of tx.world().lanes.values()) settledLane(lane, call, result);
  };

  /**
   * A refused acknowledgement or capture (WriteAhead R13): a first send ends NotSent
   * StorageRefused and never reaches the server; a re-send returns to Held and delivers unknown
   * StorageRefused.
   */
  const refused = (lane: Lane, resend: boolean) => {
    if (resend) setLane({ ...lane, head: { ...lane.head, phase: Phase.Held() } });
    else dropLane(lane);

    tx.emit(
      Evidence.Lane({
        kind: "StorageFailure",
        operation: lane.operation,
        attempt: Option.some(lane.head.id),
      }),
    );

    endingMail(lane.actor, {
      operation: lane.operation,
      attempt: Option.some(lane.head.id),
      lane: Option.none(),
      channel: resend ? "unknown" : "failure",
      reason: "StorageRefused",
      value: { why: "StorageRefused" },
      owner: lane.head.owner,
      current: true,
      redelivered: false,
      parked: false,
    });
  };

  const awaits = (lane: Lane, ticket: string) =>
    Phase.$match(lane.head.phase, {
      Acknowledging: (p) => p.ticket === ticket,
      Recapturing: (p) => p.ticket === ticket,
      Ready: () => false,
      OnWire: () => false,
      Held: () => false,
    });

  const stored = (ticket: string, ok: boolean) => {
    const silent = tx.world().tickets.get(ticket);

    if (silent !== undefined) {
      tx.set({
        ...tx.world(),
        tickets: without(tx.world().tickets, ticket),
        timers: without(tx.world().timers, silent),
      });
      tx.command(Command.Disarm({ timer: silent }));
    }

    for (const lane of tx.world().lanes.values()) {
      if (!awaits(lane, ticket)) continue;

      if (ok) invoke(lane);
      else refused(lane, Phase.$is("Recapturing")(lane.head.phase));
    }
  };

  return { classified, classify, settledRead, settledLane, settled, refused, awaits, stored };
};

/**
 * Host answers.
 */
export type AnswerSteps = ReturnType<typeof makeAnswers>;
