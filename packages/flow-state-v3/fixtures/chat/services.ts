import { Context, type Effect, Schema } from "effect";

/**
 * No answer came back: the chat server may have taken the request.
 */
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}

/**
 * The message was already deleted, by this user or another.
 */
export class Gone extends Schema.TaggedError<Gone>()("Gone", {}) {}

/**
 * The assistant is answering another question in this thread.
 */
export class Busy extends Schema.TaggedError<Busy>()("Busy", {}) {}

/**
 * One message as the server keeps it.
 */
export const Message = Schema.Struct({
  id: Schema.String,
  author: Schema.String,
  text: Schema.String,
});

/**
 * The server's answer to a delete: the message it removed and the link that restores it.
 */
export const Removed = Schema.Struct({ messageId: Schema.String, undo: Schema.String });

/**
 * The chat history service: a thread's messages, oldest first.
 */
export class HistoryApi extends Context.Service<
  HistoryApi,
  {
    readonly history: (input: {
      readonly thread: string;
    }) => Effect.Effect<{ readonly messages: ReadonlyArray<typeof Message.Type> }, NoResponse>;
  }
>()("flow-state-v3/fixtures/chat/HistoryApi") {}

/**
 * The messages service: posting and deleting, each request carrying its idempotency key.
 */
export class MessagesApi extends Context.Service<
  MessagesApi,
  {
    readonly send: (
      input: { readonly thread: string; readonly clientId: string; readonly text: string },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<
      { readonly id: string; readonly thread: string; readonly author: string },
      NoResponse
    >;
    readonly remove: (
      input: { readonly thread: string; readonly messageId: string },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<typeof Removed.Type, Gone | NoResponse>;
  }
>()("flow-state-v3/fixtures/chat/MessagesApi") {}

/**
 * The assistant service: one answer per question.
 */
export class AssistantApi extends Context.Service<
  AssistantApi,
  {
    readonly ask: (input: {
      readonly thread: string;
      readonly question: string;
    }) => Effect.Effect<{ readonly answer: string }, Busy | NoResponse>;
  }
>()("flow-state-v3/fixtures/chat/AssistantApi") {}

/**
 * The uploads port: one chunk of an attachment, sent with the upload's id as its key.
 */
export class UploadsApi extends Context.Service<
  UploadsApi,
  {
    readonly chunk: (input: {
      readonly uploadId: string;
      readonly chunk: number;
      readonly of: number;
    }) => Effect.Effect<void, NoResponse>;
  }
>()("flow-state-v3/fixtures/chat/UploadsApi") {}
