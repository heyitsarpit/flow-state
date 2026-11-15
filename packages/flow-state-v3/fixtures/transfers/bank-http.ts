// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Effect, Layer, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpIncomingMessage,
} from "effect/http";
import { BankApi, Declined, NoResponse, Receipt } from "./contracts.ts";

const Refusal = Schema.Struct({ code: Schema.String });

/**
 * The bank's API over HTTP: the production Layer of `BankApi`. A 200 is a receipt, a 402 a
 * decline, and anything else, or no answer, is `NoResponse`.
 */
export const BankHttp = (origin: string) =>
  Layer.effect(
    BankApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));

      return BankApi.of({
        transfer: (input, { idempotencyKey }) =>
          HttpClientRequest.post("/transfers").pipe(
            HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
            HttpClientRequest.bodyJsonUnsafe(input),
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": (r) => HttpIncomingMessage.schemaBodyJson(Receipt)(r),
                402: (r) =>
                  Effect.flatMap(HttpIncomingMessage.schemaBodyJson(Refusal)(r), ({ code }) =>
                    Effect.fail(new Declined({ code })),
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
 * `BankHttp` over the browser's fetch: what the app's setup provides.
 */
export const BankLive = (origin: string) =>
  BankHttp(origin).pipe(Layer.provide(FetchHttpClient.layer));
