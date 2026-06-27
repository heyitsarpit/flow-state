import { describe, expect, it } from "vite-plus/test";

import { Effect } from "effect";

import { createControlledStream, createRuntime, flow } from "./index";
import type { FlowEvent } from "./index";

describe("orchestrator system", () => {
  it("keeps a stable actor alive across unsubscribe and disposes owned streams on stop", async () => {
    type ChatEvent =
      | ({ readonly type: "SUBMIT_PROMPT" } & FlowEvent)
      | ({ readonly type: "CHAT_TOKEN"; readonly token: { readonly text: string } } & FlowEvent)
      | ({ readonly type: "STOP_GENERATION" } & FlowEvent)
      | ({ readonly type: "CHAT_INTERRUPTED" } & FlowEvent);
    interface ChatContext {
      readonly prompt: string;
      readonly partial: string;
    }

    const tokens = createControlledStream<{ readonly text: string }, never>("chat.tokens");
    const tokenStream = flow.stream<ChatContext, ChatEvent, void, { readonly text: string }>({
      id: "Chat.tokenStream",
      stream: () => tokens.stream(),
      routes: {
        value: (token) => ({ type: "CHAT_TOKEN", token }),
        interrupt: () => ({ type: "CHAT_INTERRUPTED" }),
      },
    });
    const chatMachine = flow.machine<ChatContext, ChatEvent, "idle" | "streaming">({
      id: "Chat.composer",
      initial: "idle",
      context: () => ({ prompt: "Ship it", partial: "" }),
      states: {
        idle: {
          on: {
            SUBMIT_PROMPT: "streaming",
          },
        },
        streaming: {
          invoke: tokenStream,
          on: {
            CHAT_TOKEN: {
              update: ({ context, event }) =>
                event.type === "CHAT_TOKEN"
                  ? { partial: `${context.partial}${event.token.text}` }
                  : {},
            },
            STOP_GENERATION: "idle",
            CHAT_INTERRUPTED: "idle",
          },
        },
      },
    });

    const runtime = createRuntime();
    const actor = runtime.orchestrators.start(chatMachine, {
      id: "chat:launch-1",
      policy: "keep-alive",
    });
    actor.send({ type: "SUBMIT_PROMPT" });
    const unsubscribe = actor.subscribe(() => undefined);

    tokens.emit({ text: "Ready" });
    await actor.flush();
    expect(actor.snapshot().context.partial).toBe("Ready");

    unsubscribe();
    tokens.emit({ text: " now" });
    await actor.flush();

    const reattached = runtime.orchestrators.get("chat:launch-1");
    expect(reattached).toBe(actor);
    expect(actor.snapshot().context.partial).toBe("Ready now");

    await runtime.orchestrators.stop("chat:launch-1");
    await actor.flush();
    const receiptCountAfterStop = actor.receipts().length;

    actor.send({ type: "SUBMIT_PROMPT" });
    const staleUnsubscribe = actor.subscribe(() => undefined);
    staleUnsubscribe();
    await actor.dispose();

    expect(tokens.cancelled()).toBe(true);
    expect(actor.snapshot().streams["Chat.tokenStream"]).toMatchObject({
      status: "interrupt",
      emitted: 2,
    });
    expect(actor.receipts()).toHaveLength(receiptCountAfterStop);
    expect(actor.receipts().filter((receipt) => receipt.type === "actor:dispose")).toHaveLength(1);
    expect(actor.receipts().map((receipt) => receipt.type)).toEqual(
      expect.arrayContaining([
        "actor:start",
        "actor:subscribe",
        "actor:unsubscribe",
        "actor:dispose",
        "stream:interrupt",
      ]),
    );
    expect(actor.issues()).toEqual([
      expect.objectContaining({
        kind: "interrupt",
        source: "stream",
        id: "Chat.tokenStream",
      }),
    ]);
    expect(runtime.orchestrators.get("chat:launch-1")).toBeNull();
  });

  it("runs parent-owned child actors and bubbles child failures as parent issues", async () => {
    type ChildEvent = { readonly type: "READY" } & FlowEvent;
    const childLoad = flow.resource<[], { readonly ok: true }, "child failed">({
      id: "Assistant.childLoad",
      key: () => "assistant-child-load",
      lookup: () => Effect.fail("child failed" as const),
    });
    const childMachine = flow.machine<{}, ChildEvent, "loading" | "failed">({
      id: "Assistant.task",
      initial: "loading",
      context: () => ({}),
      states: {
        loading: {
          invoke: flow.ensure(childLoad.ref()),
          on: {
            READY: "failed",
          },
        },
        failed: {},
      },
    });
    const parentMachine = flow.machine<{}, FlowEvent, "running">({
      id: "Assistant.run",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          invoke: flow.child({
            id: "Assistant.task",
            machine: childMachine,
            supervision: "stop-on-failure",
          }),
        },
      },
    });

    const actor = createRuntime().createActor(parentMachine);
    await actor.flush();

    expect(actor.children()["Assistant.task"]).toMatchObject({
      id: "Assistant.task",
      status: "failure",
      state: "loading",
      parentState: "running",
    });
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "child:start", id: "Assistant.task" }),
        expect.objectContaining({ type: "child:failure", id: "Assistant.task" }),
      ]),
    );
    expect(actor.issues()).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "child",
        id: "Assistant.task",
        handled: true,
      }),
    ]);

    await actor.dispose();

    expect(actor.children()["Assistant.task"]).toMatchObject({
      status: "stopped",
      state: "loading",
    });
  });

  it("retries only the failed child actor", async () => {
    const attempts: string[] = [];
    const createChild = (id: string) => {
      const load = flow.resource<[], { readonly ok: true }, "failed">({
        id: `child.${id}.load`,
        key: () => `child-${id}-load`,
        lookup: () =>
          Effect.sync(() => {
            attempts.push(id);
            return { ok: true as const };
          }).pipe(
            Effect.flatMap(() =>
              id === "a" ? Effect.fail("failed" as const) : Effect.succeed({ ok: true as const }),
            ),
          ),
      });
      return flow.machine<{}, FlowEvent, "running">({
        id: `Child.${id}`,
        initial: "running",
        context: () => ({}),
        states: {
          running: {
            invoke: flow.ensure(load.ref()),
          },
        },
      });
    };
    const parent = flow.machine<{}, FlowEvent, "running">({
      id: "Parent",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          invoke: [
            flow.child({
              id: "child-a",
              machine: createChild("a"),
              supervision: "stop-on-failure",
            }),
            flow.child({
              id: "child-b",
              machine: createChild("b"),
              supervision: "stop-on-failure",
            }),
          ],
        },
      },
    });
    const actor = createRuntime().createActor(parent);
    await actor.flush();

    expect(actor.children()["child-a"]).toMatchObject({ status: "failure" });
    expect(actor.children()["child-b"]).toMatchObject({ status: "active" });
    expect(attempts).toEqual(["a", "b"]);

    expect(actor.retryChild("child-b")).toBe(false);
    expect(actor.retryChild("child-a")).toBe(true);
    await actor.flush();

    expect(attempts).toEqual(["a", "b", "a"]);
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "child:retry", id: "child-a" }),
        expect.objectContaining({ type: "child:start", id: "child-a" }),
      ]),
    );
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.type === "child:start" && receipt.id === "child-b"),
    ).toHaveLength(1);
  });
});
