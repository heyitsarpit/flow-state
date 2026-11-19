// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Effect, Layer, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpIncomingMessage,
} from "effect/http";
import { ProfileApi, Taken, Unanswered } from "../services.ts";

const unanswered = () => Effect.fail(new Unanswered());

const Handle = Schema.Struct({ handle: Schema.String });

const Me = Schema.Struct({ handle: Schema.String, refreshToken: Schema.String });

/**
 * The profile service over HTTP: a 2xx is the handle, a 409 the handle taken, anything else or no
 * answer `Unanswered`.
 */
export const ProfileHttp = (origin: string) =>
  Layer.effect(
    ProfileApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));

      return ProfileApi.of({
        setUsername: (input, { idempotencyKey }) =>
          HttpClientRequest.post("/username").pipe(
            HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
            HttpClientRequest.bodyJsonUnsafe(input),
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": (r) => HttpIncomingMessage.schemaBodyJson(Handle)(r),
                409: () => Effect.fail(new Taken({ handle: input.handle })),
                orElse: unanswered,
              }),
            ),
            Effect.catchTags({
              HttpClientError: unanswered,
              SchemaError: unanswered,
            }),
          ),
        me: (input) =>
          HttpClientRequest.post("/me").pipe(
            HttpClientRequest.bodyJsonUnsafe(input),
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": (r) => HttpIncomingMessage.schemaBodyJson(Me)(r),
                orElse: unanswered,
              }),
            ),
            Effect.catchTags({
              HttpClientError: unanswered,
              SchemaError: unanswered,
            }),
          ),
      });
    }),
  );

/**
 * `ProfileHttp` over the browser's fetch: what the app's setup provides.
 */
export const ProfileLive = (origin: string) =>
  ProfileHttp(origin).pipe(Layer.provide(FetchHttpClient.layer));
