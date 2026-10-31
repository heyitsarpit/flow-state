// The cart's contracts: plain requests with no entity imports (cart.domain.ts says what they mean for records).
// Every contract states `input`, `output` and `key` (rule 39). Where the data comes from: adapters/shop-api.ts.
import { Effect, Schema } from "effect";
import { Outcome, resource, transaction } from "flow-state";
import { ShopApi } from "../../adapters/shop-api.js";
import { Cart, Product } from "../../adapters/types.js";

// A lost request and a 5xx are "this may have happened" (2.7.1); every other tagged error is a 4xx the shop meant.
export const unknownWhenLost = <A, E extends { readonly _tag: string }, R>(
  write: Effect.Effect<A, E, R>,
) =>
  write.pipe(
    Effect.catchTags({
      NoResponse: (e) => Outcome.unknown(e),
      ServerError: (e) => Outcome.unknown(e),
    }),
  );

export const productsOf = resource({
  id: "Checkout/products",
  input: {},
  output: Schema.Array(Product),
  key: [],
  lookup: (_input, { signal }) => ShopApi.use((api) => api.products({ signal })),
  staleTime: "5 minutes",
  gcTime: "30 minutes",
});

export const productById = resource({
  id: "Checkout/product-by-id",
  input: { productId: Schema.String },
  output: Product,
  key: ["productId"],
  lookup: (input, { signal }) => ShopApi.use((api) => api.product(input, { signal })),
  staleTime: "5 minutes",
  gcTime: "30 minutes",
});

export const cartOf = resource({
  id: "Checkout/cart",
  input: { cartId: Schema.String },
  output: Cart,
  key: ["cartId"],
  lookup: (input, { signal }) => ShopApi.use((api) => api.cart(input, { signal })),
  staleTime: "10 seconds",
  gcTime: "10 minutes",
  persist: true,
});

// A line's quantity: `latest`, one lane per line. A stepper tapped five times quickly sends at most two requests,
// the second with the final count, and the server ends with it (O4). A tap on a line whose last change is unsure
// waits behind that hold (O5).
export const setQuantity = transaction({
  id: "Checkout/set-quantity",
  input: { cartId: Schema.String, lineId: Schema.String, quantity: Schema.Int },
  output: Cart,
  key: ["cartId", "lineId"],
  concurrency: "latest",
  commit: (input, { attempt, signal }) =>
    ShopApi.use((api) => api.setQuantity(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});

export const removeLine = transaction({
  id: "Checkout/remove-line",
  input: { cartId: Schema.String, lineId: Schema.String },
  output: Cart,
  key: ["cartId", "lineId"],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    ShopApi.use((api) => api.removeLine(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});

// The coupon: one per cart, and the cart actor is per cart, so the key is empty: one lane for this actor (O18). A
// plain write (no domain): the total it predicts is the actor's own memory, and the cart's read is invalidated when
// it lands (rule 36).
export const applyCoupon = transaction({
  id: "Checkout/apply-coupon",
  input: { cartId: Schema.String, code: Schema.String },
  output: Cart,
  key: [],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    ShopApi.use((api) => api.applyCoupon(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});
