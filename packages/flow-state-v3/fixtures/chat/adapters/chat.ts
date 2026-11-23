// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Effect, Layer, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpIncomingMessage,
} from "effect/http";
import {
  AssistantApi,
  Busy,
  Gone,
  HistoryApi,
  Message,
  MessagesApi,
  NoResponse,
  Removed,
} from "../services.ts";

const noResponse = () => Effect.fail(new NoResponse());

const clientOf = (origin: string) =>
  Effect.map(HttpClient.HttpClient, (http) =>
    HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin)),
  );

/**
 * The chat server over HTTP: the production Layers of the history, messages and assistant ports.
 * A 2xx is the answer, a 404 on a delete is `Gone`, a 409 on a question is `Busy`, and anything
 * else, or no answer, is `NoResponse`.
 */
export const ChatHttp = (origin: string) =>
  Layer.mergeAll(
    Layer.effect(
      HistoryApi,
      Effect.map(clientOf(origin), (client) =>
        HistoryApi.of({
          history: ({ thread }) =>
            HttpClientRequest.get(`/threads/${encodeURIComponent(thread)}/messages`).pipe(
              client.execute,
              Effect.flatMap(
                HttpClientResponse.matchStatus({
                  "2xx": (r) =>
                    HttpIncomingMessage.schemaBodyJson(
                      Schema.Struct({ messages: Schema.Array(Message) }),
                    )(r),
                  orElse: noResponse,
                }),
              ),
              Effect.catchTags({ HttpClientError: noResponse, SchemaError: noResponse }),
            ),
        }),
      ),
    ),
    Layer.effect(
      MessagesApi,
      Effect.map(clientOf(origin), (client) =>
        MessagesApi.of({
          send: (input, { idempotencyKey }) =>
            HttpClientRequest.post(`/threads/${encodeURIComponent(input.thread)}/messages`).pipe(
              HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
              HttpClientRequest.bodyJsonUnsafe({ clientId: input.clientId, text: input.text }),
              client.execute,
              Effect.flatMap(
                HttpClientResponse.matchStatus({
                  "2xx": (r) =>
                    HttpIncomingMessage.schemaBodyJson(
                      Schema.Struct({
                        id: Schema.String,
                        thread: Schema.String,
                        author: Schema.String,
                      }),
                    )(r),
                  orElse: noResponse,
                }),
              ),
              Effect.catchTags({ HttpClientError: noResponse, SchemaError: noResponse }),
            ),
          remove: ({ thread, messageId }, { idempotencyKey }) =>
            HttpClientRequest.delete(
              `/threads/${encodeURIComponent(thread)}/messages/${encodeURIComponent(messageId)}`,
            ).pipe(
              HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
              client.execute,
              Effect.flatMap(
                HttpClientResponse.matchStatus({
                  "2xx": (r) => HttpIncomingMessage.schemaBodyJson(Removed)(r),
                  404: () => Effect.fail(new Gone()),
                  orElse: noResponse,
                }),
              ),
              Effect.catchTags({ HttpClientError: noResponse, SchemaError: noResponse }),
            ),
        }),
      ),
    ),
    Layer.effect(
      AssistantApi,
      Effect.map(clientOf(origin), (client) =>
        AssistantApi.of({
          ask: ({ thread, question }) =>
            HttpClientRequest.post(`/threads/${encodeURIComponent(thread)}/questions`).pipe(
              HttpClientRequest.bodyJsonUnsafe({ question }),
              client.execute,
              Effect.flatMap(
                HttpClientResponse.matchStatus({
                  "2xx": (r) =>
                    HttpIncomingMessage.schemaBodyJson(Schema.Struct({ answer: Schema.String }))(r),
                  409: () => Effect.fail(new Busy()),
                  orElse: noResponse,
                }),
              ),
              Effect.catchTags({ HttpClientError: noResponse, SchemaError: noResponse }),
            ),
        }),
      ),
    ),
  );

/**
 * `ChatHttp` over the browser's fetch: what the app's setup provides.
 */
export const ChatLive = (origin: string) =>
  ChatHttp(origin).pipe(Layer.provide(FetchHttpClient.layer));
