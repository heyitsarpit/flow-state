import { Effect, Schema } from "effect";
import { Outcome, transaction } from "../../../src/index.ts";
import { AssistantApi, MessagesApi, UploadsApi } from "../services.ts";

/**
 * Posts one message; a thread's sends go one at a time, in order. The server keys a message by its
 * client id, so a send tried again is the same message. A lost answer is unknown.
 */
export const send = transaction({
  id: "Chat/send",
  input: { thread: Schema.String, clientId: Schema.String, text: Schema.String },
  key: ["thread"],
  concurrency: "serialize",
  idempotency: ["clientId"],
  services: [MessagesApi],
  commit: (input) =>
    MessagesApi.use((api) => api.send(input, { idempotencyKey: input.clientId })).pipe(
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

/**
 * An attachment sent in chunks, keyed by its upload id, reporting the share sent after each chunk.
 */
export const upload = transaction({
  id: "Chat/upload",
  input: { uploadId: Schema.String, chunks: Schema.Number },
  key: ["uploadId"],
  concurrency: "reject",
  idempotency: ["uploadId"],
  progress: Schema.Number,
  services: [UploadsApi],
  commit: (input, context) =>
    Effect.forEach(
      Array.from({ length: input.chunks }, (_, n) => n),
      (n) =>
        UploadsApi.use((api) =>
          api.chunk({ uploadId: input.uploadId, chunk: n, of: input.chunks }),
        ).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              context.progress((n + 1) / input.chunks);
            }),
          ),
        ),
      { concurrency: 1 },
    ).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e))),
});
