import { describe, expect, it } from "vite-plus/test";

import { createControlledStream, createRuntime, flow, selectView } from "@flow-state/core";

import type { ChatToken } from "./domain";
import { createChatComposer, chatLifecycleView } from "./launchWorkspace";

describe("runtime stream generations", () => {
  it("runtime chat restarts ignore stale tokens from the prior generation", async () => {
    const tokens = createControlledStream<ChatToken, never>("launch.chat.tokens.runtime-reused");
    const controlledTokenStream = flow.stream({
      id: "Chat.tokenStream",
      subscribe: () => tokens.stream(),
      routes: {
        value: (token: ChatToken) => ({ type: "CHAT_TOKEN" as const, token }),
      },
    });
    const runtime = createRuntime();
    const actor = runtime.orchestrators.start(createChatComposer(controlledTokenStream), {
      id: "chat:launch-runtime-restart",
      policy: "keep-alive",
    });

    actor.send({ type: "TYPE_PROMPT", prompt: "Draft launch summary" });
    actor.send({ type: "SUBMIT_PROMPT" });
    tokens.emit({ index: 0, text: "Ready" });
    await actor.flush();
    expect(selectView(actor.snapshot(), chatLifecycleView)).toMatchObject({
      partialText: "Ready",
      streamStatus: "running",
    });

    actor.send({ type: "STOP_GENERATION" });
    await actor.flush();

    expect(tokens.cancelled()).toBe(true);
    expect(selectView(actor.snapshot(), chatLifecycleView)).toMatchObject({
      partialText: "",
      streamStatus: "interrupt",
    });

    tokens.emit({ index: 1, text: " stale" });
    actor.send({ type: "TYPE_PROMPT", prompt: "Regenerate launch summary" });
    actor.send({ type: "SUBMIT_PROMPT" });
    tokens.emit({ index: 0, text: "Fresh" });
    await actor.flush();

    expect(selectView(actor.snapshot(), chatLifecycleView)).toMatchObject({
      partialText: "Fresh",
      streamStatus: "running",
    });
    expect(actor.issues()).toEqual([]);
  });
});
