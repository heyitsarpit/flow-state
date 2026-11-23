// The executable configurations. Every port is the real adapter: `ShopHttp` over `fetch`, and Stripe.js loaded in
// the page. Stories replace the client half with the Stripe fake (`StripeFake`, testing/stripe.fake.ts), nothing
// else, so nothing here is Story-aware.
import { loadStripe } from "@stripe/stripe-js";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { runtimeSetup } from "flow-state";
import { layerIndexedDb } from "flow-state/persistence";
import { ShopHttp } from "../adapters/shop-api.js";
import { StripeClient } from "../adapters/stripe.js";
import { CheckoutApp } from "./app.js";

// Stripe.js, loaded once per Layer build. `loadStripe` resolves to null only when the script is blocked: a defect,
// because the checkout cannot run without it.
export const StripeJsLive = Layer.effect(
  StripeClient,
  Effect.promise(() => loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY ?? "")).pipe(
    Effect.flatMap((stripe) =>
      stripe === null
        ? Effect.die("Stripe.js was blocked")
        : Effect.succeed(StripeClient.of(stripe)),
    ),
  ),
);

const services = Layer.mergeAll(
  ShopHttp(location.origin).pipe(Layer.provide(FetchHttpClient.layer)),
  StripeJsLive,
);

// Without persistence: the merchant's back office, and every Story that is not about reloads.
export const CheckoutSetup = runtimeSetup({ app: CheckoutApp, services });

// The shop's browser setup. A payment on the wire must survive a reload, so it persists (rule 46). Version "2": the
// build that renamed the pay operation; a lane stored by "1" goes to the contract's `orphaned` handler, which
// re-sends the same Attempt (P8, P19).
export const shopSetup = (shopperId: string) =>
  runtimeSetup({
    app: CheckoutApp,
    scope: shopperId,
    services: Layer.mergeAll(services, layerIndexedDb({ database: "checkout" })),
    persistence: { version: "2" },
  });
