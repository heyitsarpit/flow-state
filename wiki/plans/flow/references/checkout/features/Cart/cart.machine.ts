// The cart page. Its steppers ask, it writes. Every line write is keyed by the line, so a burst on one line never
// waits for another; the coupon is the actor's one unkeyed lane.
import { deny, machine } from "flow-state";
import { CartPage } from "./cart.definition.js";

type Memory = typeof CartPage.Memory.Type;

const COUPON_RATE = 0.1; // the page's guess at SAVE10; the shop's answer is what counts

export const CartMachine = machine(CartPage, ({ S, O }) => ({
  default: S.SHOPPING,
  activities: [
    O.cart.subscribe(({ memory }) => ({ cartId: memory.cartId })),
    // Each line's product by its key (E19): one session per distinct product the cart's confirmed lines name.
    O.product.subscribe.each(({ operations }) =>
      [...new Set(operations.cart?.data?.lines.map((l) => l.productId) ?? [])].map((productId) => ({
        productId,
      })),
    ),
  ],

  // One filling for every stepper copy (rule 9): `key` is the line id. The host owns the write.
  traits: {
    steppers: {
      input: ({ memory, key }) => ({ quantity: memory.quantities[key] ?? 1 }),
      callbacks: {
        onChange: {
          actions: [
            O.setQuantity.commit(({ memory, key, payload }) => ({
              cartId: memory.cartId,
              lineId: key,
              quantity: payload.quantity,
            })),
          ],
        },
        // A callback never moves the host out of the placement's node (rule 6): `steppers` is a root trait, so it
        // may target any state, the remove dialog included.
        onRemoveAsked: { target: S.REMOVING, updateMemory: ({ key }) => ({ removing: key }) },
      },
    },
  },

  on: {
    // Membership is host data: the cart's confirmed lines decide which steppers exist.
    Loaded: {
      target: "self",
      updateMemory: ({ event }) => ({
        lineIds: event.lines.map((l) => l.lineId),
        quantities: Object.fromEntries(event.lines.map((l) => [l.lineId, l.quantity])),
        subtotalCents: event.subtotalCents,
      }),
    },
    LoadFailed: { target: "self" },
    QuantitySet: { target: "self" },
    LineGone: { target: "self" },
    // Key-less: `setQuantity` alone maps it. Once more as the same Attempt, then release: a waiting tap goes next.
    QuantityUnsure: [
      {
        target: "self",
        guard: [O.setQuantity.retryable({ times: 1 })],
        actions: [O.setQuantity.retry],
      },
      { target: "self", actions: [O.setQuantity.cancel] },
    ],
    Removed: { target: "self" },
    RemoveUnsure: [
      {
        target: "self",
        guard: [O.removeLine.retryable({ times: 1 })],
        actions: [O.removeLine.retry],
      },
      { target: "self", actions: [O.removeLine.cancel] },
    ],

    // The coupon: the page's own guess at the new total, in memory, until the shop answers (O21). One per cart: the
    // lane is the actor's, so a second code while one is on its way is refused before anything is sent.
    ApplyCoupon: {
      target: "self",
      guard: [({ event }) => event.code.trim() !== "" || deny("NoCode"), O.coupon.idle],
      updateMemory: ({ memory, event }) => ({
        coupon: {
          code: event.code,
          status: "applying" as const,
          predictedTotalCents: Math.round(memory.subtotalCents * (1 - COUPON_RATE)),
          reason: null,
        },
      }),
      actions: [
        O.coupon.commit(({ memory, event }) => ({ cartId: memory.cartId, code: event.code })),
      ],
    },
    CouponApplied: {
      target: "self",
      updateMemory: ({ memory }) => ({
        coupon: { ...memory.coupon, status: "applied" as const, predictedTotalCents: null },
      }),
    },
    CouponRefused: {
      target: "self",
      updateMemory: ({ event }) => ({
        coupon: {
          code: null,
          status: "refused" as const,
          predictedTotalCents: null,
          reason: event.reason,
        },
      }),
    },
    // Unkeyed: the coupon's one lane, named with no key. Release it; the next read says whether it applied.
    CouponUnsure: {
      target: "self",
      updateMemory: ({ memory }: { memory: Memory }) => ({
        coupon: { ...memory.coupon, status: "unsure" as const },
      }),
      actions: [O.coupon.cancel],
    },
  },

  states: {
    SHOPPING: {},
    // The dialog's input is the line its stepper asked about; its exit says which line to remove (F8).
    REMOVING: {
      input: ({ memory }) => ({ lineId: memory.removing ?? "" }), // before-walk: the callback's own patch is in
      exits: {
        Remove: {
          target: S.SHOPPING,
          updateMemory: () => ({ removing: null }),
          actions: [
            O.removeLine.commit(({ memory, payload }) => ({
              cartId: memory.cartId,
              lineId: payload.lineId,
            })),
          ],
        },
        Keep: { target: S.SHOPPING, updateMemory: () => ({ removing: null }) },
      },
    },
  },
}));
