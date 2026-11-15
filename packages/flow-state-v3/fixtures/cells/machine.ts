import { actorRef, app, definition, machine, runtimeSetup } from "../../src/index.ts";
import { Pay, payBody } from "../pay/machine.ts";
import { ShopLive } from "../pay/shop-http.ts";

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

/**
 * The checkout app with Cells in place of Pay.
 */
export const cellsShop = app({ id: "cells", machines: { pay: CellsMachine } });

/**
 * The Cells checkout's real setup: the shop over HTTP, persisted, each capture written at once.
 */
export const cellsSetup = runtimeSetup({
  app: cellsShop,
  services: ShopLive("https://shop.example"),
  scope: "cells",
  persistence: { captureMs: 0 },
});

/**
 * The Cells checkout the stories use.
 */
export const cellsCheckout = actorRef(CellsMachine, "checkout-1");
