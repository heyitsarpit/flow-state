import { definition, machine } from "../../../src/index.ts";
import { Pay, payBody } from "../../services/shop/machines/pay.ts";

/**
 * Pay with one more root event, `AbortPay`, which cancels `pay`. It keeps Pay's machine id, so an
 * app holds one of the two.
 */
export const Cells = definition({
  id: Pay.id,
  persist: true,
  states: Pay.states,
  events: { ...Pay.events, AbortPay: {} },
  internalEvents: Pay.internalEvents,
  memory: Pay.memory,
  operations: () => Pay.operations,
});

/**
 * The `cells` machine: Pay's handlers, and `AbortPay` cancelling the intent's `pay`.
 */
export const CellsMachine = machine(Cells, (tokens) => {
  const base = payBody(tokens);

  return {
    ...base,
    on: {
      ...base.on,
      AbortPay: {
        actions: [tokens.O.pay.cancel(({ memory }) => ({ intentId: memory.intentId }))],
      },
    },
  };
});
