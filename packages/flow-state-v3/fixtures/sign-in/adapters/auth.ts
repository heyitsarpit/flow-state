// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Effect, Layer } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { AuthApi, NoResponse, Throttled, WrongCode } from "../services.ts";

const lost = () => Effect.fail(new NoResponse());

/**
 * The auth server's API over HTTP: the production Layer of `AuthApi`. A 2xx is done, a 429 is
 * throttled, a 401 a wrong code, and anything else, or no answer, is `NoResponse`.
 */
export const AuthHttp = (origin: string) =>
  Layer.effect(
    AuthApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));

      const post = (path: string, body: Readonly<Record<string, string>>, idempotencyKey: string) =>
        HttpClientRequest.post(path).pipe(
          HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
          HttpClientRequest.bodyJsonUnsafe(body),
          client.execute,
        );

      return AuthApi.of({
        begin: (input, { idempotencyKey }) =>
          post("/codes", input, idempotencyKey).pipe(
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": () => Effect.void,
                429: () => Effect.fail(new Throttled()),
                orElse: lost,
              }),
            ),
            Effect.catchTag("HttpClientError", lost),
          ),
        verify: (input, { idempotencyKey }) =>
          post("/sessions", input, idempotencyKey).pipe(
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": () => Effect.void,
                401: () => Effect.fail(new WrongCode()),
                orElse: lost,
              }),
            ),
            Effect.catchTag("HttpClientError", lost),
          ),
      });
    }),
  );

/**
 * `AuthHttp` over the browser's fetch: what the app's setup provides.
 */
export const AuthLive = (origin: string) =>
  AuthHttp(origin).pipe(Layer.provide(FetchHttpClient.layer));
