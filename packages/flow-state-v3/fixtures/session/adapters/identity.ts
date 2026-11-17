// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Effect, Layer, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpIncomingMessage,
} from "effect/http";
import { IdentityApi, NoResponse, Profile, Refused } from "../services.ts";

const Refusal = Schema.Struct({ reason: Schema.String });

/**
 * The identity provider over HTTP: the production Layer of `IdentityApi`. A 200 is a profile, a
 * 403 a refusal, and anything else, or no answer, is `NoResponse`.
 */
export const IdentityHttp = (origin: string) =>
  Layer.effect(
    IdentityApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));

      return IdentityApi.of({
        signIn: (input, { idempotencyKey }) =>
          HttpClientRequest.post("/sessions").pipe(
            HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
            HttpClientRequest.bodyJsonUnsafe(input),
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": (r) => HttpIncomingMessage.schemaBodyJson(Profile)(r),
                403: (r) =>
                  Effect.flatMap(HttpIncomingMessage.schemaBodyJson(Refusal)(r), ({ reason }) =>
                    Effect.fail(new Refused({ reason })),
                  ),
                orElse: () => Effect.fail(new NoResponse()),
              }),
            ),
            Effect.catchTags({
              HttpClientError: () => Effect.fail(new NoResponse()),
              SchemaError: () => Effect.fail(new NoResponse()),
            }),
          ),
      });
    }),
  );

/**
 * `IdentityHttp` over the browser's fetch: what the app's setup provides.
 */
export const IdentityLive = (origin: string) =>
  IdentityHttp(origin).pipe(Layer.provide(FetchHttpClient.layer));
