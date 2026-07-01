import { Stream } from "effect";

import { flow } from "@flow-state/server";

import type { ChatToken, LaunchAsset } from "./domain";
import type { AssetUploadProgress, AssistantProgress } from "./services";

const uploadParams = ({
  context,
}: {
  readonly context: { readonly assets: readonly LaunchAsset[] };
}) => context.assets;

const subscribeUpload = ({ params }: { readonly params: readonly LaunchAsset[] }) =>
  Stream.fromIterable(
    params.map((asset) => ({
      assetId: asset.id,
      uploadedBytes: asset.size,
      totalBytes: asset.size,
    })),
  );

const subscribeAssistantProgress = () =>
  Stream.fromIterable([
    {
      runId: "run-1",
      message: "Draft launch checklist",
    },
  ]);

const tokenParams = ({ context }: { readonly context: { readonly prompt: string } }) => ({
  threadId: "chat-1",
  prompt: context.prompt,
});

const subscribeTokens = () => Stream.fromIterable([{ index: 0, text: "Ready" }]);

export const uploadStream = flow.stream({
  id: "Assets.uploadStream",
  params: uploadParams,
  subscribe: ({ params }: { readonly params: readonly LaunchAsset[] }) =>
    subscribeUpload({ params }),
  pressure: {
    strategy: "coalesce-latest" as const,
    key: (progress: AssetUploadProgress) => progress.assetId,
  },
  routes: {
    value: (progress: AssetUploadProgress) => ({ type: "UPLOAD_PROGRESS", progress }),
    done: () => ({ type: "UPLOAD_DONE" }),
  },
});

export const assistantProgressStream = flow.stream<
  { readonly latest: unknown },
  { readonly type: "ASSISTANT_PROGRESS"; readonly event: AssistantProgress },
  void,
  AssistantProgress
>({
  id: "Assistant.progress",
  subscribe: subscribeAssistantProgress,
  pressure: { strategy: "queue", limit: 10 },
  routes: {
    value: (event) => ({ type: "ASSISTANT_PROGRESS", event }),
  },
});

export const tokenStream = flow.stream({
  id: "Chat.tokenStream",
  params: tokenParams,
  subscribe: subscribeTokens,
  pressure: { strategy: "queue" as const, limit: 32 },
  routes: {
    value: (token: ChatToken) => ({ type: "CHAT_TOKEN", token }),
  },
});
