// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Effect, Layer, Option, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpIncomingMessage,
} from "effect/http";
import { ShopApi } from "./contracts.ts";

const Intent = Schema.Struct({
  status: Schema.String,
  clientSecret: Schema.optionalKey(Schema.String),
});

const Order = Schema.Struct({ orderId: Schema.String });

const lost = { _tag: "NoResponse" } as const;

const serverError = { _tag: "ServerError" } as const;

/**
 * The shop's API over HTTP: the production Layer of `ShopApi`, as far as Flow's own fixtures need
 * it. A 2xx is decoded as the endpoint's answer; a 5xx or an answer that does not decode is
 * `ServerError`; anything else, or no answer, is `NoResponse`.
 */
export const ShopHttp = (origin: string) =>
  Layer.effect(
    ShopApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));

      const call = <S extends Schema.Constraint>(
        path: string,
        body: Readonly<Record<string, string>>,
        answer: S,
        key: Option.Option<string>,
      ) =>
        HttpClientRequest.post(path).pipe(
          (request) =>
            Option.match(key, {
              onNone: () => request,
              onSome: (k) => HttpClientRequest.setHeader(request, "Idempotency-Key", k),
            }),
          HttpClientRequest.bodyJsonUnsafe(body),
          client.execute,
          Effect.flatMap(
            HttpClientResponse.matchStatus({
              "2xx": (r) => HttpIncomingMessage.schemaBodyJson(answer)(r),
              "5xx": () => Effect.fail(serverError),
              orElse: () => Effect.fail(lost),
            }),
          ),
          Effect.catchTags({
            HttpClientError: () => Effect.fail(lost),
            SchemaError: () => Effect.fail(serverError),
          }),
        );

      return ShopApi.of({
        confirm: (input, { idempotencyKey }) =>
          call("/confirm", input, Intent, Option.some(idempotencyKey)),
        placeOrder: (input, { idempotencyKey }) =>
          call("/orders", input, Order, Option.some(idempotencyKey)),
        voidAuthorization: (input, { idempotencyKey }) =>
          call("/void", input, Schema.Json, Option.some(idempotencyKey)),
        intent: (input) => call("/intent", input, Intent, Option.none()),
        orderFor: (input) => call("/order-for", input, Schema.NullOr(Order), Option.none()),
      });
    }),
  );

/**
 * `ShopHttp` over the browser's fetch: what the app's setup provides.
 */
export const ShopLive = (origin: string) =>
  ShopHttp(origin).pipe(Layer.provide(FetchHttpClient.layer));
