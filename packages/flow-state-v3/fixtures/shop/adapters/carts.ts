// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Effect, Layer, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpIncomingMessage,
} from "effect/http";
import { CartApi, CartViewApi, Line, Lines, NoResponse, NotEnough, SoldOut } from "../services.ts";

const lost = () => Effect.fail(new NoResponse());

/**
 * The cart service over HTTP: a 2xx is the line, a 409 the endpoint's refusal decoded, anything
 * else or no answer `NoResponse`.
 */
export const CartHttp = (origin: string) =>
  Layer.effect(
    CartApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));

      const post = (
        path: string,
        body: Readonly<Record<string, string | number>>,
        idempotencyKey: string,
      ) =>
        HttpClientRequest.post(path).pipe(
          HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
          HttpClientRequest.bodyJsonUnsafe(body),
          client.execute,
        );

      return CartApi.of({
        addLine: (input, { idempotencyKey }) =>
          post("/cart/lines", input, idempotencyKey).pipe(
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": (r) => HttpIncomingMessage.schemaBodyJson(Line)(r),
                409: (r) =>
                  Effect.flatMap(HttpIncomingMessage.schemaBodyJson(SoldOut)(r), ({ lineId }) =>
                    Effect.fail(SoldOut.make({ lineId })),
                  ),
                orElse: lost,
              }),
            ),
            Effect.catchTags({
              HttpClientError: lost,
              SchemaError: lost,
            }),
          ),
        setQuantity: (input, { idempotencyKey }) =>
          post("/cart/quantity", input, idempotencyKey).pipe(
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": (r) => HttpIncomingMessage.schemaBodyJson(Line)(r),
                409: (r) =>
                  Effect.flatMap(
                    HttpIncomingMessage.schemaBodyJson(NotEnough)(r),
                    ({ lineId, quantity }) => Effect.fail(NotEnough.make({ lineId, quantity })),
                  ),
                orElse: lost,
              }),
            ),
            Effect.catchTags({
              HttpClientError: lost,
              SchemaError: lost,
            }),
          ),
      });
    }),
  );

/**
 * `CartHttp` over the browser's fetch: what the app's setup provides.
 */
export const CartLive = (origin: string) =>
  CartHttp(origin).pipe(Layer.provide(FetchHttpClient.layer));

/**
 * The cart read port over HTTP: a whole cart's lines, and a quick add, a 409 the sold-out refusal,
 * anything else or no answer `NoResponse`.
 */
export const CartViewHttp = (origin: string) =>
  Layer.effect(
    CartViewApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));

      return CartViewApi.of({
        cart: ({ cartId }) =>
          HttpClientRequest.get(`/carts/${encodeURIComponent(cartId)}`).pipe(
            client.execute,
            Effect.flatMap((r) =>
              HttpIncomingMessage.schemaBodyJson(Schema.Struct({ lines: Lines }))(r),
            ),
            Effect.catchTags({ HttpClientError: lost, SchemaError: lost }),
          ),
        quickAdd: ({ cartId, lineId, variantId }, { idempotencyKey }) =>
          HttpClientRequest.post(`/carts/${encodeURIComponent(cartId)}/lines`).pipe(
            HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
            HttpClientRequest.bodyJsonUnsafe({ lineId, variantId }),
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": () => Effect.void,
                409: (r) =>
                  Effect.flatMap(HttpIncomingMessage.schemaBodyJson(SoldOut)(r), ({ lineId }) =>
                    Effect.fail(SoldOut.make({ lineId })),
                  ),
                orElse: lost,
              }),
            ),
            Effect.catchTags({ HttpClientError: lost, SchemaError: lost }),
          ),
      });
    }),
  );

/**
 * `CartViewHttp` over the browser's fetch: what the mini cart's setup provides.
 */
export const CartViewLive = (origin: string) =>
  CartViewHttp(origin).pipe(Layer.provide(FetchHttpClient.layer));
