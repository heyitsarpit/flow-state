import { flow } from "@flow-state/core";
import type { FlowEvent, FlowMachine, FlowStreamDefinition } from "@flow-state/core";

import type { ChatToken } from "./domain";
import { tokenStream } from "./launchWorkspaceStreams";

export interface ChatContext {
  readonly prompt: string;
  readonly partial: string;
}

export type ChatState = "idle" | "streaming";
export type ChatEvent =
  | ({ readonly type: "TYPE_PROMPT"; readonly prompt: string } & FlowEvent)
  | ({ readonly type: "SUBMIT_PROMPT" } & FlowEvent)
  | ({ readonly type: "CHAT_TOKEN"; readonly token: Partial<ChatToken> } & FlowEvent)
  | ({ readonly type: "STOP_GENERATION" } & FlowEvent);

type ChatControlledTokenStream = FlowStreamDefinition<
  ChatToken,
  never,
  void,
  ChatEvent,
  ChatContext
>;

export const createChatComposer = (
  chatTokenStream: typeof tokenStream | ChatControlledTokenStream = tokenStream,
): FlowMachine<ChatContext, ChatEvent, ChatState> =>
  flow.machine<ChatContext, ChatEvent, ChatState>({
    id: "Chat.composer",
    initial: "idle",
    context: () => ({ prompt: "", partial: "" }),
    states: {
      idle: {
        on: {
          TYPE_PROMPT: {
            update: ({ event }) => (event.type === "TYPE_PROMPT" ? { prompt: event.prompt } : {}),
          },
          SUBMIT_PROMPT: {
            target: "streaming",
            guard: ({ context }) => context.prompt.trim().length > 0,
          },
        },
      },
      streaming: {
        invoke: chatTokenStream,
        on: {
          CHAT_TOKEN: {
            update: ({ context, event }) =>
              event.type === "CHAT_TOKEN"
                ? { partial: `${context.partial}${event.token.text ?? ""}` }
                : {},
          },
          STOP_GENERATION: {
            target: "idle",
            update: () => ({ prompt: "", partial: "" }),
          },
        },
      },
    },
  });

export const chatComposer = createChatComposer();

export const chatLifecycleView = flow.view<
  ChatContext,
  ChatState,
  {
    readonly state: ChatState;
    readonly partialText: string;
    readonly streamStatus: string;
    readonly cleanupStatus: "idle" | "subscribed" | "unsubscribed" | "disposed";
  }
>({
  id: "Chat.lifecycleView",
  sources: ["context", "streams", "receipts"],
  select: ({ value, context, streams, receipts }) => {
    const lastLifecycleReceipt = receipts.findLast((receipt) =>
      ["actor:subscribe", "actor:unsubscribe", "actor:dispose"].includes(receipt.type),
    );
    const cleanupStatus =
      lastLifecycleReceipt?.type === "actor:dispose"
        ? "disposed"
        : lastLifecycleReceipt?.type === "actor:unsubscribe"
          ? "unsubscribed"
          : lastLifecycleReceipt?.type === "actor:subscribe"
            ? "subscribed"
            : "idle";

    return {
      state: value,
      partialText: context.partial,
      streamStatus: streams["Chat.tokenStream"]?.status ?? "idle",
      cleanupStatus,
    };
  },
});

export const Chat = flow.module(
  "Chat",
  () => ({
    composer: chatComposer,
    tokenStream,
    chatLifecycleView,
    machines: { composer: chatComposer },
    streams: { tokenStream },
    views: { chatLifecycleView },
  }),
  {
    dependencies: ["Session", "Project"],
    tags: ["chat"],
    screens: ["Chat"],
    fixtures: ["chatThread"],
  },
);
