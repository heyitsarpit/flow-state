// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { NoResponse, Offline, ThermostatApi } from "../services.ts";

const lost = () => Effect.fail(new NoResponse());

/**
 * The thermostat port over HTTP: `PUT /rooms/:room/target` with the Attempt's id as the
 * idempotency key; 503 is an offline heater.
 */
export const ThermostatHttp = (origin: string) =>
  Layer.effect(
    ThermostatApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));

      return ThermostatApi.of({
        setTarget: ({ room, celsius }, { idempotencyKey }) =>
          HttpClientRequest.put(`/rooms/${encodeURIComponent(room)}/target`).pipe(
            HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
            HttpClientRequest.bodyJsonUnsafe({ celsius }),
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": () => Effect.void,
                503: () => Effect.fail(new Offline()),
                orElse: lost,
              }),
            ),
            Effect.catchTag("HttpClientError", lost),
          ),
      });
    }),
  );
