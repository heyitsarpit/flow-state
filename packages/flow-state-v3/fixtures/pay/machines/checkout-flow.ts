import { Schema } from "effect";
import { definition, deny, Flow, machine } from "../../../src/index.ts";
import { Pay } from "../machine.ts";
import { Cart, itemsIn, waiting } from "./cart.ts";
import { Shopper } from "./shopper.ts";

/**
 * A cart's checkout steps: address, then shipping (a method, then a delivery slot), then pay. It
 * reads its cart's item count and whether the cart still waits on the cart service, its shopper's
 * name, and the state of the checkout's Pay.
 */
export const CheckoutFlow = definition({
  id: "Shop/CheckoutFlow",
  persist: true,
  states: ["BROWSING", "ADDRESS", { SHIPPING: ["METHOD", "SLOT"] }, "PAY", "DONE"],
  events: {
    Begin: {},
    AddressEntered: { line1: Schema.String },
    MethodChosen: { method: Schema.String },
    SlotChosen: { slot: Schema.String },
    Back: {},
  },
  internalEvents: {
    CartChanged: { count: Schema.Number },
    CartWaiting: { waiting: Schema.Boolean },
    ShopperChanged: { name: Schema.String },
    PaymentChanged: { state: Schema.String },
  },
  memory: {
    cartId: Flow.input(Schema.String),
    lineCount: Flow.initial(Schema.Number, 0),
    cartWaiting: Flow.initial(Schema.Boolean, false),
    shopperName: Flow.initial(Schema.String, ""),
    line1: Flow.initial(Schema.String, ""),
    method: Flow.initial(Schema.String, ""),
    slot: Flow.initial(Schema.String, ""),
  },
  context: {
    count: Cart.Provider.select(Schema.Number, (c) => itemsIn(c.memory.lines)),
    busy: Cart.Provider.select(Schema.Boolean, (c) => waiting(c.memory)),
    shopper: Shopper.Provider.select(Schema.String, (s) => s.memory.name),
    payment: Pay.Provider.select(Schema.String, (p) => p.state),
  },
});

/**
 * The checkout flow: Begin is denied on an empty cart or one still waiting on the cart service;
 * Back from pay re-enters shipping at the step it left, by history; the checkout's Pay reaching PAID
 * ends it. Guards cannot read context, so the flow keeps the cart's count and waiting as its
 * `onContext` reactions report them.
 */
export const CheckoutFlowMachine = machine(CheckoutFlow, ({ S, E }) => ({
  default: S.BROWSING,
  onContext: [
    {
      select: ({ context }) => context.count,
      event: E.CartChanged.from((count: number) => ({ count })),
    },
    {
      select: ({ context }) => context.busy,
      event: E.CartWaiting.from((busy: boolean) => ({ waiting: busy })),
    },
    {
      select: ({ context }) => context.shopper,
      event: E.ShopperChanged.from((name: string) => ({ name })),
    },
    {
      select: ({ context }) => context.payment,
      event: E.PaymentChanged.from((state: string) => ({ state })),
    },
  ],
  on: {
    CartChanged: { updateMemory: ({ event }) => ({ lineCount: event.count }) },
    CartWaiting: { updateMemory: ({ event }) => ({ cartWaiting: event.waiting }) },
    ShopperChanged: { updateMemory: ({ event }) => ({ shopperName: event.name }) },
    PaymentChanged: [
      { target: S.DONE, guard: [({ event }) => event.state === "PAID" || deny("NotPaid")] },
      {},
    ],
  },
  states: {
    BROWSING: {
      on: {
        Begin: {
          target: S.ADDRESS,
          guard: [
            ({ memory }) => memory.lineCount > 0 || deny("EmptyCart"),
            ({ memory }) => !memory.cartWaiting || deny("CartBusy"),
          ],
        },
      },
    },
    ADDRESS: {
      on: {
        AddressEntered: {
          target: S.SHIPPING,
          updateMemory: ({ event }) => ({ line1: event.line1 }),
        },
        Back: S.BROWSING,
      },
    },
    SHIPPING: {
      default: S.SHIPPING.METHOD,
      states: {
        METHOD: {
          on: {
            MethodChosen: {
              target: S.SHIPPING.SLOT,
              updateMemory: ({ event }) => ({ method: event.method }),
            },
            Back: S.ADDRESS,
          },
        },
        SLOT: {
          on: {
            SlotChosen: { target: S.PAY, updateMemory: ({ event }) => ({ slot: event.slot }) },
            Back: S.SHIPPING.METHOD,
          },
        },
      },
    },
    PAY: {
      on: {
        Back: S.SHIPPING.history,
      },
    },
    DONE: {},
  },
}));
