// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Effect, Layer, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { BankApi, Declined, NoResponse, Receipt } from "./contracts.ts";

/**
 * The bank's API over HTTP: the production Layer of `BankApi`. A 200 is a receipt, a 402 a
 * decline, and anything else, or no answer, is `NoResponse`.
 */
export const BankHttp = (origin: string) =>
  Layer.effect(
    BankApi,
    Effect.map(HttpClient.HttpClient, (client) =>
      BankApi.of({
        transfer: (input, { idempotencyKey }) =>
          HttpClientRequest.post(new URL("/transfers", origin)).pipe(
            HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
            HttpClientRequest.bodyJsonUnsafe(input),
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                200: (r) => Effect.flatMap(r.json, Schema.decodeUnknownEffect(Receipt)),
                402: (r) =>
                  Effect.flatMap(
                    Effect.flatMap(r.json, Schema.decodeUnknownEffect(Declined)),
                    Effect.fail,
                  ),
                orElse: () => Effect.fail(new NoResponse()),
              }),
            ),
            Effect.catch((e) => Effect.fail(e instanceof Declined ? e : new NoResponse())),
          ),
      }),
    ),
  );

/**
 * `BankHttp` over the browser's fetch: what the app's setup provides.
 */
export const BankLive = (origin: string) =>
  BankHttp(origin).pipe(Layer.provide(FetchHttpClient.layer));
