import "server-only";
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { runtimeSetup } from "flow-state";
import { ShopHttp } from "../adapters/shop-api.js";
import { StripeClient } from "../adapters/stripe.js";
import { CheckoutApp } from "../app/app.js";

// The cart page rendered on the server. Each request owns its services; no storage and no persistence. Stripe.js
// does not run on a server: the port is provided as a defect, because nothing the server renders may call it (the
// page ensures the shopper and the cart only).
export const shopServerSetup = (shopper: { id: string; cookie: string }) =>
  runtimeSetup({
    app: CheckoutApp,
    scope: shopper.id,
    services: Layer.mergeAll(
      ShopHttp(process.env.SHOP_ORIGIN ?? "http://localhost:3000").pipe(
        Layer.provide(FetchHttpClient.layer),
      ),
      Layer.succeed(
        StripeClient,
        StripeClient.of({
          handleNextAction: () => Promise.reject(new Error("Stripe.js runs in the browser")),
        }),
      ),
    ),
  });
