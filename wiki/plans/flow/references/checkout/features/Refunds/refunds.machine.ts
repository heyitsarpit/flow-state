import { machine } from "flow-state";
import { Refunds } from "./refunds.definition.js";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export const RefundsMachine = machine(Refunds, ({ S, O }) => ({
  default: S.READY,
  activities: [O.orders.subscribe(() => ({}))],
  on: {
    // No `idle` guard: a refund while another on the same charge is on its way is queued behind it, not refused.
    RefundAsked: {
      target: "self",
      updateMemory: () => ({ notice: "" }),
      actions: [O.refund.commit(({ event }) => event)],
    },
    Refunded: { target: "self", updateMemory: () => ({ notice: "Refunded" }) },
    OverRefund: {
      target: "self",
      updateMemory: ({ event }) => ({
        notice: `Only ${money(event.leftCents)} is left to refund on that charge.`,
      }),
    },
    RefundNotSent: {
      target: "self",
      updateMemory: ({ event }) => ({
        notice:
          event.why === "Overloaded" ? "Too many refunds queued on this charge." : "Not sent.",
      }),
    },
    // A lost answer: the same Attempt once more (the shop dedups by its key); then release and let the list repair.
    // The next refund on the charge waits behind the hold until then (rule 29).
    RefundUnsure: [
      { target: "self", guard: [O.refund.retryable({ times: 2 })], actions: [O.refund.retry] },
      {
        target: "self",
        updateMemory: () => ({
          notice: "We couldn't confirm a refund. Check the order before refunding again.",
        }),
        actions: [O.refund.cancel],
      },
    ],
  },
  states: { READY: {} },
}));
