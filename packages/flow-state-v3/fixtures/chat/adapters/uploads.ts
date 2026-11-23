// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Effect, Layer } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { NoResponse, UploadsApi } from "../services.ts";

/**
 * The uploads port over HTTP: `PUT /uploads/:id/chunks/:n`.
 */
export const UploadsHttp = (origin: string) =>
  Layer.effect(
    UploadsApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));
      const lost = () => Effect.fail(new NoResponse());

      return UploadsApi.of({
        chunk: ({ uploadId, chunk, of }) =>
          HttpClientRequest.put(
            `/uploads/${encodeURIComponent(uploadId)}/chunks/${String(chunk)}`,
          ).pipe(
            HttpClientRequest.setHeader("Upload-Length", String(of)),
            client.execute,
            Effect.asVoid,
            Effect.catchTags({ HttpClientError: lost }),
          ),
      });
    }),
  );

/**
 * `UploadsHttp` over the browser's fetch: what the attachment's setup provides.
 */
export const UploadsLive = (origin: string) =>
  UploadsHttp(origin).pipe(Layer.provide(FetchHttpClient.layer));
