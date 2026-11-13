// Stripe.js, as the checkout uses it. Effect-only: a structural subset of `@stripe/stripe-js` (so this file
// type-checks without it) and the Effect service that holds the loaded instance.
//
// Where the data comes from, and what it cannot say:
//   - Stripe.js runs in the page and returns Promises. It takes NO AbortSignal: interrupting the fiber that awaits
//     `handleNextAction` does not close the challenge the bank is showing, so a customer can still finish it after
//     the checkout stopped waiting (F11). The commit can only stop listening.
//   - A Stripe.js error has a `type`: `card_error` (the bank said no: definite), `invalid_request_error` with
//     `payment_intent_unexpected_state` (the intent moved on: definite), `api_connection_error` (the request may or
//     may not have arrived: unknown). The commit maps these, beside the call (pay.contracts.ts).
//   - Confirming the intent itself goes through our server (shop-api.ts), because only the server can put an
//     `Idempotency-Key` on Stripe's API: Flow's `attempt.id` (rule 19).
import { Context, Effect, Schema } from "effect";
import { ChallengeFailed, IntentStatus, NoResponse } from "./types.js";

export type StripeJsError = {
  readonly type: "card_error" | "invalid_request_error" | "api_connection_error" | "api_error";
  readonly code?: string;
  readonly decline_code?: string;
};

export type StripeJsResult = {
  readonly paymentIntent?: { readonly id: string; readonly status: typeof IntentStatus.Type };
  readonly error?: StripeJsError;
};

// The part of the Stripe.js instance the checkout calls.
export interface StripeJs {
  readonly handleNextAction: (options: { clientSecret: string }) => Promise<StripeJsResult>;
}

export class StripeClient extends Context.Service<StripeClient, StripeJs>()(
  "Checkout/StripeClient",
) {}

// The challenge's outcome, as typed values: the authorized intent, or a definite failure, or "no answer".
export const Authorized = Schema.Struct({ intentId: Schema.String, status: IntentStatus });

export type Authorized = typeof Authorized.Type;

export const handleNextAction = (clientSecret: string) =>
  Effect.flatMap(StripeClient, (stripe) =>
    Effect.tryPromise({
      try: () => stripe.handleNextAction({ clientSecret }), // no signal: Stripe.js cannot be aborted
      catch: () => new NoResponse(),
    }).pipe(
      Effect.flatMap((result) =>
        Effect.gen(function* () {
          if (result.paymentIntent !== undefined)
            return { intentId: result.paymentIntent.id, status: result.paymentIntent.status };

          if (result.error?.type === "api_connection_error" || result.error === undefined)
            return yield* new NoResponse();

          return yield* new ChallengeFailed({ code: result.error.code ?? result.error.type });
        }),
      ),
    ),
  );
