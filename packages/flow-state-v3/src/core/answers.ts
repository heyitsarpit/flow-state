import { Option } from "effect";
import { type Channel, Evidence } from "./evidence.ts";
import { CallResult } from "./input.ts";
import { type Tx, without } from "./tx.ts";
import { type CallId, type Read, Timer, type TicketId, Tries } from "./world.ts";
import { onWireAs } from "./lane-moves.ts";
import type { LaneSteps } from "./lanes.ts";

/**
 * Host answers: a call's settlement queues its ending, or parks it during disposal; a store's
 * answer invokes or refuses the sends waiting on it.
 */
export const makeAnswers = (tx: Tx, lanes: LaneSteps) => {
  const { incarnationOf, endingMail, disarmWhere } = tx;

  // FLOW_STATE_ALLOW_UNKNOWN: an ending's value is the call's own, mapped at admission.
  const classified = (channel: Channel, reason: string, value: unknown) => ({
    channel,
    reason,
    value,
  });

  const classify = (result: CallResult) =>
    CallResult.$match(result, {
      Success: ({ value }) => classified("success", "success", value),
      Failure: ({ reason, error }) => classified("failure", reason, error),
      Unknown: ({ reason, error }) => classified("unknown", reason, error),
      Defect: () => classified("unknown", "Defect", undefined),
      Interrupted: () => classified("unknown", "Interrupted", undefined),
    });

  const settledRead = (read: Read, result: CallResult) => {
    tx.set({ ...tx.world(), reads: without(tx.world().reads, read.call) });
    const incarnation = incarnationOf(read.actor);

    if (incarnation === undefined || incarnation.id !== read.incarnation) return;
    const c = classify(result);

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
      tries: Tries.First(),
    });
  };

  /**
   * A call settled: a lookup's ending is queued for its incarnation; a commit's is applied to its
   * lane, queued while the Runtime is open and parked while it is disposing.
   */
  const settled = (call: CallId, result: CallResult, route: "queue" | "park") => {
    const read = tx.world().reads.get(call);

    if (read !== undefined) {
      settledRead(read, result);

      return;
    }

    const live = [...tx.world().lanes.values()].some((lane) => onWireAs(lane, call));

    if (live && CallResult.$is("Defect")(result) && route === "queue")
      tx.emit(Evidence.Issue({ code: "Defect", ending: Option.none() }));

    lanes.settle(call, classify(result), route);
  };

  const answered = (ticket: TicketId, landed: boolean) => {
    disarmWhere((t) => Timer.$is("Silent")(t) && t.ticket === ticket);
    lanes.answer(ticket, landed);
  };

  /**
   * The store landed a ticket's batch: each send waiting on it is invoked.
   */
  const stored = (ticket: TicketId) => answered(ticket, true);

  /**
   * The store refused a ticket's batch: a first send ends NotSent StorageRefused, a re-send
   * returns to Held.
   */
  const storeRefused = (ticket: TicketId) => answered(ticket, false);

  return { settled, stored, storeRefused };
};

/**
 * Host answers.
 */
export type AnswerSteps = ReturnType<typeof makeAnswers>;
