// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Effect, Layer, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpIncomingMessage,
} from "effect/http";
import { AccountsApi, AvailableApi, Cents, NoAnswer } from "../services.ts";

const noAnswer = () => Effect.fail(new NoAnswer());

/**
 * The accounts service over HTTP: a 2xx is the balance; anything else, or no answer, is
 * `NoAnswer`.
 */
export const AccountsHttp = (origin: string) =>
  Layer.effect(
    AccountsApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));

      return AccountsApi.of({
        balance: ({ account }) =>
          HttpClientRequest.get(`/accounts/${encodeURIComponent(account)}/balance`).pipe(
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": (r) =>
                  HttpIncomingMessage.schemaBodyJson(Schema.Struct({ cents: Schema.Number }))(r),
                orElse: noAnswer,
              }),
            ),
            Effect.catchTags({
              HttpClientError: noAnswer,
              SchemaError: noAnswer,
            }),
          ),
      });
    }),
  );

/**
 * `AccountsHttp` over the browser's fetch: what the app's setup provides.
 */
export const AccountsLive = (origin: string) =>
  AccountsHttp(origin).pipe(Layer.provide(FetchHttpClient.layer));

/**
 * The available-balance port over HTTP: a balance is a GET, a debit a POST carrying its
 * idempotency key; a lost answer or one that does not decode is `NoAnswer`.
 */
export const AvailableHttp = (origin: string) =>
  Layer.effect(
    AvailableApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));
      const lost = () => Effect.fail(new NoAnswer());

      return AvailableApi.of({
        available: ({ account }) =>
          HttpClientRequest.get(`/accounts/${encodeURIComponent(account)}/available`).pipe(
            client.execute,
            Effect.flatMap((r) => HttpIncomingMessage.schemaBodyJson(Cents)(r)),
            Effect.catchTags({ HttpClientError: lost, SchemaError: lost }),
          ),
        debit: ({ account, cents }, { idempotencyKey }) =>
          HttpClientRequest.post(`/accounts/${encodeURIComponent(account)}/debits`).pipe(
            HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
            HttpClientRequest.bodyJsonUnsafe({ cents }),
            client.execute,
            Effect.flatMap((r) => HttpIncomingMessage.schemaBodyJson(Cents)(r)),
            Effect.catchTags({ HttpClientError: lost, SchemaError: lost }),
          ),
      });
    }),
  );

/**
 * `AvailableHttp` over the browser's fetch: what the grown app's setup provides.
 */
export const AvailableLive = (origin: string) =>
  AvailableHttp(origin).pipe(Layer.provide(FetchHttpClient.layer));
