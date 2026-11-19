import { Effect, Fiber, Schema } from "effect";
import { Outcome, transaction } from "../../../../src/index.ts";
import { capturableStatus, ShopApi } from "../services.ts";

const LOST = ["NoResponse", "ServerError"] as const;

/**
 * How long one send of `pay` may take before it is unknown: the commit's own deadline
 * (Operations O3), as the real Pay pins it.
 */
const PAY_DEADLINE = "60 seconds";

/**
 * A request that stays on the wire when its caller stops waiting: the deadline below ends the
 * wait, not the request, so a request the network will not interrupt still times out.
 */
const onTheWire = <A, E>(request: Effect.Effect<A, E>) =>
  Effect.flatMap(Effect.forkDetach(request), Fiber.join);

const confirmed = (status: string, clientSecret: string, afterUnsure: boolean) => ({
  status,
  clientSecret,
  afterUnsure,
});

/**
 * `pay`'s success: the intent's status and client secret, and whether an earlier send may have
 * applied.
 */
export type Confirmed = {
  readonly status: string;
  readonly clientSecret: string;
  readonly afterUnsure: boolean;
};

/**
 * One charge of a cart's intent, keyed by the intent: a lost answer, or none within 60 seconds,
 * is unknown; an intent busy elsewhere is a success only when an earlier send may have applied and
 * the intent is capturable.
 */
export const pay = transaction({
  id: "Checkout/pay",
  input: { intentId: Schema.String, paymentMethodId: Schema.String },
  key: ["intentId"],
  concurrency: "reject",
  services: [ShopApi],
  commit: (input, { attempt }) =>
    ShopApi.use((api) => onTheWire(api.confirm(input, { idempotencyKey: attempt.id }))).pipe(
      Effect.map((v) => confirmed(v.status, v.clientSecret ?? "", attempt.mayHaveApplied)),
      Effect.catchTag("IntentBusy", (e) =>
        attempt.mayHaveApplied && capturableStatus(e.status)
          ? Outcome.success(confirmed(e.status, "", true))
          : Outcome.failure(e),
      ),
      Effect.catchTag(LOST, (e) => Outcome.unknown(e)),
      Effect.timeoutOrElse({
        duration: PAY_DEADLINE,
        orElse: () => Outcome.unknown({ _tag: "TimedOut" as const }),
      }),
    ),
});

/**
 * Places the cart's order once, keyed by the cart: the cart's existing order is a success.
 */
export const placeOrder = transaction({
  id: "Checkout/place-order",
  input: { cartId: Schema.String, intentId: Schema.String },
  key: ["cartId"],
  concurrency: "reject",
  services: [ShopApi],
  commit: (input, { attempt }) =>
    ShopApi.use((api) => api.placeOrder(input, { idempotencyKey: attempt.id })).pipe(
      Effect.map((order) => ({ order, alreadyPlaced: false })),
      Effect.catchTag("OrderExists", (e) =>
        Outcome.success({ order: e.order, alreadyPlaced: true }),
      ),
      Effect.catchTag(LOST, (e) => Outcome.unknown(e)),
    ),
});

/**
 * Releases the hold on the card, keyed by the intent; already captured stays a failure.
 */
export const voidAuthorization = transaction({
  id: "Checkout/void-authorization",
  input: { intentId: Schema.String },
  key: ["intentId"],
  concurrency: "reject",
  services: [ShopApi],
  commit: (input, { attempt }) =>
    ShopApi.use((api) => api.voidAuthorization(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag(LOST, (e) => Outcome.unknown(e)),
    ),
});
