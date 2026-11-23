// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Effect, Layer, Schema } from "effect";
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpIncomingMessage,
} from "effect/http";
import { NoResponse, SensorsApi } from "../services.ts";

const lost = () => Effect.fail(new NoResponse());

/**
 * The sensors port over HTTP: `GET /rooms/:room/temperature`; anything but a 2xx, or no answer,
 * is `NoResponse`.
 */
export const SensorsHttp = (origin: string) =>
  Layer.effect(
    SensorsApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));

      return SensorsApi.of({
        reading: ({ room }) =>
          HttpClientRequest.get(`/rooms/${encodeURIComponent(room)}/temperature`).pipe(
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": (r) =>
                  HttpIncomingMessage.schemaBodyJson(Schema.Struct({ celsius: Schema.Number }))(r),
                orElse: lost,
              }),
            ),
            Effect.catchTags({ HttpClientError: lost, SchemaError: lost }),
          ),
      });
    }),
  );
