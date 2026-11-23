// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Effect, Layer, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpIncomingMessage,
} from "effect/http";
import { Conflict, DocsApi, Doc, NoResponse, Outline } from "../services.ts";

const noResponse = () => Effect.fail(new NoResponse());

/**
 * The documents service over HTTP: a 2xx is the answer, a 409 on a save a `Conflict` carrying
 * the current revision, and anything else, or no answer, `NoResponse`.
 */
export const DocsHttp = (origin: string) =>
  Layer.effect(
    DocsApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));

      return DocsApi.of({
        document: ({ id }) =>
          HttpClientRequest.get(`/documents/${encodeURIComponent(id)}`).pipe(
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": (r) => HttpIncomingMessage.schemaBodyJson(Doc)(r),
                orElse: noResponse,
              }),
            ),
            Effect.catchTags({ HttpClientError: noResponse, SchemaError: noResponse }),
          ),
        outline: ({ id }) =>
          HttpClientRequest.get(`/documents/${encodeURIComponent(id)}/outline`).pipe(
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": (r) => HttpIncomingMessage.schemaBodyJson(Outline)(r),
                orElse: noResponse,
              }),
            ),
            Effect.catchTags({ HttpClientError: noResponse, SchemaError: noResponse }),
          ),
        save: ({ id, body, revision }, { idempotencyKey }) =>
          HttpClientRequest.put(`/documents/${encodeURIComponent(id)}`).pipe(
            HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
            HttpClientRequest.bodyJsonUnsafe({ body, revision }),
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": (r) =>
                  HttpIncomingMessage.schemaBodyJson(Schema.Struct({ revision: Schema.Number }))(r),
                409: (r) =>
                  Effect.flatMap(
                    HttpIncomingMessage.schemaBodyJson(Schema.Struct({ revision: Schema.Number }))(
                      r,
                    ),
                    (current) => Effect.fail(new Conflict(current)),
                  ),
                orElse: noResponse,
              }),
            ),
            Effect.catchTags({ HttpClientError: noResponse, SchemaError: noResponse }),
          ),
      });
    }),
  );

/**
 * `DocsHttp` over the browser's fetch: what the app's setup provides.
 */
export const DocsLive = (origin: string) =>
  DocsHttp(origin).pipe(Layer.provide(FetchHttpClient.layer));
