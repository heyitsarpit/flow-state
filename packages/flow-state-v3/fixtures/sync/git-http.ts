// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Effect, Layer, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpIncomingMessage,
} from "effect/http";
import { GitApi, NoResponse, RateLimited } from "./contracts.ts";

const Head = Schema.Struct({ head: Schema.String });

const Limit = Schema.Struct({ retryAfterMs: Schema.Number });

const lost = () => Effect.fail(new NoResponse());

/**
 * The Git host's API over HTTP: the production Layer of `GitApi`. A 2xx is the answer, a 429 a
 * rate limit with its delay, and anything else, or no answer, is `NoResponse`.
 */
export const GitHttp = (origin: string) =>
  Layer.effect(
    GitApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));

      return GitApi.of({
        sync: (input, { idempotencyKey }) =>
          HttpClientRequest.post(`/repos/${input.repo}/sync`).pipe(
            HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": () => Effect.void,
                429: (r) =>
                  Effect.flatMap(HttpIncomingMessage.schemaBodyJson(Limit)(r), ({ retryAfterMs }) =>
                    Effect.fail(new RateLimited({ retryAfterMs })),
                  ),
                orElse: lost,
              }),
            ),
            Effect.catchTags({ HttpClientError: lost, SchemaError: lost }),
          ),
        remoteHead: (input) =>
          HttpClientRequest.get(`/repos/${input.repo}/head`).pipe(
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": (r) => HttpIncomingMessage.schemaBodyJson(Head)(r),
                orElse: lost,
              }),
            ),
            Effect.catchTags({ HttpClientError: lost, SchemaError: lost }),
          ),
      });
    }),
  );

/**
 * `GitHttp` over the browser's fetch: what the app's setup provides.
 */
export const GitLive = (origin: string) =>
  GitHttp(origin).pipe(Layer.provide(FetchHttpClient.layer));
