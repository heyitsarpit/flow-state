import * as flow from "flow-state";
import type { FlowEvent, FlowStreamDefinition } from "flow-state";

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
) =>
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
  }
>({
  id: "Chat.lifecycleView",
  sources: ["context", "streams"],
  select: ({ value, context, streams }) => ({
    state: value,
    partialText: context.partial,
    streamStatus: streams["Chat.tokenStream"]?.status ?? "idle",
  }),
});

export const Chat = flow.module(
  "Chat",
  {
    composer: chatComposer,
    tokenStream,
    chatLifecycleView,
    machines: { composer: chatComposer },
    streams: { tokenStream },
    views: { chatLifecycleView },
  },
  {
    dependencies: ["Session", "Project"],
    tags: ["chat"],
    screens: ["Chat"],
    fixtures: ["chatThread"],
  },
);
