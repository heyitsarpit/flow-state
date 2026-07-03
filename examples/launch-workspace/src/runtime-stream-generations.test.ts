import { describe, expect, it } from "vite-plus/test";

import { selectView } from "flow-state";
import * as flow from "flow-state";
import { createControlledStream } from "flow-state/testing";

import type { ChatToken } from "./domain";
import { createChatComposer, chatLifecycleView } from "./launchWorkspace";
import type { ChatContext, ChatEvent } from "./launchWorkspace";

function createTestRuntime() {
  return flow.runtime(
    flow.app({ modules: [] }).layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
    }),
  );
}

describe("runtime stream generations", () => {
  it("runtime chat restarts ignore stale tokens from the prior generation", async () => {
    const tokens = createControlledStream<ChatToken, never>("launch.chat.tokens.runtime-reused");
    const controlledTokenStream = flow.stream<ChatContext, ChatEvent, void, ChatToken>({
      id: "Chat.tokenStream",
      subscribe: () => tokens.stream(),
      routes: {
        value: (token) => ({ type: "CHAT_TOKEN", token }),
      },
    });
    const runtime = createTestRuntime();
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
