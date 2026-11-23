// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Effect, Layer, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpIncomingMessage,
} from "effect/http";
import { BookingApi, NoResponse, Taken, Uncovered } from "../services.ts";

const noResponse = () => Effect.fail(new NoResponse());

/**
 * The booking service over HTTP: a 2xx is the answer, a 404 on an area `Uncovered`, a 409 on a
 * hold `Taken`, and anything else, or no answer, `NoResponse`.
 */
export const BookingHttp = (origin: string) =>
  Layer.effect(
    BookingApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));

      return BookingApi.of({
        area: ({ postcode }) =>
          HttpClientRequest.get(`/areas/${encodeURIComponent(postcode)}`).pipe(
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": (r) =>
                  HttpIncomingMessage.schemaBodyJson(Schema.Struct({ area: Schema.String }))(r),
                404: () => Effect.fail(new Uncovered()),
                orElse: noResponse,
              }),
            ),
            Effect.catchTags({ HttpClientError: noResponse, SchemaError: noResponse }),
          ),
        slots: ({ area, day }) =>
          HttpClientRequest.get(`/areas/${encodeURIComponent(area)}/slots/${day}`).pipe(
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": (r) =>
                  HttpIncomingMessage.schemaBodyJson(
                    Schema.Struct({ slots: Schema.Array(Schema.String) }),
                  )(r),
                orElse: noResponse,
              }),
            ),
            Effect.catchTags({ HttpClientError: noResponse, SchemaError: noResponse }),
          ),
        hold: ({ area, slot }, { idempotencyKey }) =>
          HttpClientRequest.post(`/areas/${encodeURIComponent(area)}/holds`).pipe(
            HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
            HttpClientRequest.bodyJsonUnsafe({ slot }),
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": (r) =>
                  HttpIncomingMessage.schemaBodyJson(Schema.Struct({ heldUntil: Schema.Number }))(
                    r,
                  ),
                409: () => Effect.fail(new Taken()),
                orElse: noResponse,
              }),
            ),
            Effect.catchTags({ HttpClientError: noResponse, SchemaError: noResponse }),
          ),
      });
    }),
  );

/**
 * `BookingHttp` over the browser's fetch: what the app's setup provides.
 */
export const BookingLive = (origin: string) =>
  BookingHttp(origin).pipe(Layer.provide(FetchHttpClient.layer));
