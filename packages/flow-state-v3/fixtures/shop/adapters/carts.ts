// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Effect, Layer } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpIncomingMessage,
} from "effect/http";
import { CartApi, Line, NotEnough, SoldOut } from "../services.ts";

const lost = { _tag: "NoResponse" } as const;

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
                    Effect.fail({ _tag: "SoldOut" as const, lineId }),
                  ),
                orElse: () => Effect.fail(lost),
              }),
            ),
            Effect.catchTags({
              HttpClientError: () => Effect.fail(lost),
              SchemaError: () => Effect.fail(lost),
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
                    ({ lineId, quantity }) =>
                      Effect.fail({ _tag: "NotEnough" as const, lineId, quantity }),
                  ),
                orElse: () => Effect.fail(lost),
              }),
            ),
            Effect.catchTags({
              HttpClientError: () => Effect.fail(lost),
              SchemaError: () => Effect.fail(lost),
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
