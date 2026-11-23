import { Alarm } from "./alarms.ts";
import { Option } from "effect";
import type { Channel } from "./evidence.ts";
import { Act } from "./evidence-of.ts";
import { CallResult } from "./input.ts";
import type { Tx } from "./tx.ts";
import type { CallId, TicketId } from "./world.ts";
import { onWireAs } from "./lane-moves.ts";
import type { LaneSteps } from "./lanes.ts";
import type { EntrySteps } from "./entries.ts";

/**
 * Host answers: a call's settlement is routed by where the call is, the one place that decides
 * who hears an answer; a store's answer invokes or refuses the sends waiting on it.
 */
export const makeAnswers = (tx: Tx, lanes: LaneSteps, entries: EntrySteps) => {
  const { clearAlarm } = tx;

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

  /**
   * A call settled: a read's, released or its entry's request, goes to the entries; a commit's is
   * applied to its lane and owed to its identity, Queued while the Runtime is open and Waiting
   * while it is disposing.
   */
  const settled = (call: CallId, result: CallResult, open: boolean) => {
    if (entries.settled(call, result)) return;

    const live = Option.exists(tx.laneWaiting(call), ([, lane]) => onWireAs(lane, call));

    if (live && CallResult.$is("Defect")(result) && open) tx.act(Act.Defect());

    lanes.settle(call, classify(result));
  };

  const answered = (ticket: TicketId, landed: boolean) => {
    clearAlarm(Alarm.Silent({ ticket }));
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
