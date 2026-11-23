import { Effect, Schema } from "effect";
import { Outcome, transaction } from "../../../src/index.ts";
import { AssistantApi, MessagesApi } from "../services.ts";

/**
 * Posts one message; a thread's sends go one at a time, in order. A lost answer is unknown.
 */
export const send = transaction({
  id: "Chat/send",
  input: { thread: Schema.String, clientId: Schema.String, text: Schema.String },
  key: ["thread"],
  concurrency: "serialize",
  services: [MessagesApi],
  commit: (input, { attempt }) =>
    MessagesApi.use((api) => api.send(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    ),
});

/**
 * Deletes one message, keyed by thread and message; a second delete of it while the first is out
 * is refused. A lost answer is unknown.
 */
export const deleteMessage = transaction({
  id: "Chat/deleteMessage",
  input: { thread: Schema.String, messageId: Schema.String },
  key: ["thread", "messageId"],
  concurrency: "reject",
  services: [MessagesApi],
  commit: (input, { attempt }) =>
    MessagesApi.use((api) => api.remove(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    ),
});

/**
 * Asks the assistant one question per thread at a time; a second while it answers is refused.
 */
export const ask = transaction({
  id: "Chat/ask",
  input: { thread: Schema.String, question: Schema.String },
  key: ["thread"],
  concurrency: "reject",
  services: [AssistantApi],
  commit: (input) =>
    AssistantApi.use((api) => api.ask(input)).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    ),
});
