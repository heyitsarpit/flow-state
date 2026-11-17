// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { NoResponse, SpeakerApi, Unavailable } from "../services.ts";

const lost = () => Effect.fail(new NoResponse());

/**
 * The speaker port over HTTP: `POST /play` with the Attempt's id as the idempotency key.
 */
export const SpeakerHttp = (origin: string) =>
  Layer.effect(
    SpeakerApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));

      return SpeakerApi.of({
        play: (input, { idempotencyKey }) =>
          HttpClientRequest.post("/play").pipe(
            HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
            HttpClientRequest.bodyJsonUnsafe(input),
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": () => Effect.void,
                409: () => Effect.fail(new Unavailable({ why: "not in your region" })),
                orElse: lost,
              }),
            ),
            Effect.catchTag("HttpClientError", lost),
          ),
      });
    }),
  );
