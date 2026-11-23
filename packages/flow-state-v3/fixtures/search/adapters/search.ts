// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Effect, Layer, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpIncomingMessage,
} from "effect/http";
import { NoResponse, SearchApi } from "../services.ts";

const noResponse = () => Effect.fail(new NoResponse());

const Searches = Schema.Struct({ searches: Schema.Array(Schema.String) });

/**
 * The search service over HTTP: a 2xx is the answer; anything else, or no answer, `NoResponse`.
 */
export const SearchHttp = (origin: string) =>
  Layer.effect(
    SearchApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));

      return SearchApi.of({
        suggest: ({ q }) =>
          HttpClientRequest.get("/suggest").pipe(
            HttpClientRequest.setUrlParam("q", q),
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": (r) =>
                  HttpIncomingMessage.schemaBodyJson(
                    Schema.Struct({ suggestions: Schema.Array(Schema.String) }),
                  )(r),
                orElse: noResponse,
              }),
            ),
            Effect.catchTags({ HttpClientError: noResponse, SchemaError: noResponse }),
          ),
        results: ({ q, page }) =>
          HttpClientRequest.get("/search").pipe(
            HttpClientRequest.setUrlParams({ q, page: String(page) }),
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": (r) =>
                  HttpIncomingMessage.schemaBodyJson(
                    Schema.Struct({ rows: Schema.Array(Schema.String), total: Schema.Number }),
                  )(r),
                orElse: noResponse,
              }),
            ),
            Effect.catchTags({ HttpClientError: noResponse, SchemaError: noResponse }),
          ),
        saved: ({ shopper }) =>
          HttpClientRequest.get(`/shoppers/${encodeURIComponent(shopper)}/searches`).pipe(
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": (r) => HttpIncomingMessage.schemaBodyJson(Searches)(r),
                orElse: noResponse,
              }),
            ),
            Effect.catchTags({ HttpClientError: noResponse, SchemaError: noResponse }),
          ),
        save: ({ shopper, q }, { idempotencyKey }) =>
          HttpClientRequest.post(`/shoppers/${encodeURIComponent(shopper)}/searches`).pipe(
            HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
            HttpClientRequest.bodyJsonUnsafe({ q }),
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": (r) => HttpIncomingMessage.schemaBodyJson(Searches)(r),
                orElse: noResponse,
              }),
            ),
            Effect.catchTags({ HttpClientError: noResponse, SchemaError: noResponse }),
          ),
      });
    }),
  );

/**
 * `SearchHttp` over the browser's fetch: what the app's setup provides.
 */
export const SearchLive = (origin: string) =>
  SearchHttp(origin).pipe(Layer.provide(FetchHttpClient.layer));
