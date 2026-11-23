import { Effect, Layer } from "effect";
import { AssistantApi, HistoryApi, MessagesApi } from "../services.ts";
import { Chat } from "./chat.ts";

const historyApi = (steadfast: boolean) =>
  Effect.map(Chat, (chat) =>
    HistoryApi.of({
      history: (input) =>
        steadfast ? Effect.uninterruptible(chat.history(input)) : chat.history(input),
    }),
  );

/**
 * The history port over the chat server; a lost answer is the port's NoResponse.
 */
export const HistoryFake = Layer.effect(HistoryApi, historyApi(false));

/**
 * The history port over a network that will not stop a read once sent: interrupted, it still runs
 * to its answer, as a fetch whose abort the server never sees.
 */
export const HistoryFakeSteadfast = Layer.effect(HistoryApi, historyApi(true));

/**
 * The messages port over the chat server, each request carrying its idempotency key.
 */
export const MessagesFake = Layer.effect(
  MessagesApi,
  Effect.map(Chat, (chat) =>
    MessagesApi.of({
      send: (input, { idempotencyKey }) => chat.send({ ...input, key: idempotencyKey }),
      remove: (input, { idempotencyKey }) => chat.remove({ ...input, key: idempotencyKey }),
    }),
  ),
);

/**
 * The assistant port over the chat server.
 */
export const AssistantFake = Layer.effect(
  AssistantApi,
  Effect.map(Chat, (chat) => AssistantApi.of({ ask: chat.ask })),
);
