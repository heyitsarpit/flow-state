import { samplesOf } from "../../../src/host/testing/index.ts";
import { general, hub, me, random } from "../app.ts";
import { Account } from "../machines/account.ts";
import { Hub } from "../machines/hub.ts";
import { Thread } from "../machines/thread.ts";
import { Chat } from "../server/chat.ts";
import { chatStory } from "./usual.ts";

/**
 * A 10,000-character message.
 */
export const longSend = Thread.E.Send({ clientId: "c-3", text: "x".repeat(10_000) });

/**
 * What Ada, the sidebar and the chat server can do, for generated runs: sign in and out, open and
 * join threads, send (an empty and a 10,000-character message among them), resend, take a send
 * back, refresh, hear a post, leave, delete and let go of a delete, and ask; the server garbles
 * undo links, has its assistant busy, and others post.
 */
export const samples = samplesOf({
  id: "chat",
  story: chatStory("chat/samples"),
  names: { setup: "chatSetup", fixtures: ["HistoryFake", "MessagesFake", "AssistantFake"] },
  actors: { me, hub, general, random },
  servers: { Chat },
  failures: [Chat.undoLinks({ working: false }), Chat.thinking({ thread: "general" })],
  landedFailures: [],
  values: { longSend },
  controls: [
    Chat.undoLinks({ working: true }),
    Chat.post({ thread: "general", author: "grace", text: "lunch?" }),
  ],
  steps: (story) =>
    story
      .send(me, Account.E.SignIn({ who: "ada" }))
      .send(me, Account.E.SignOut())
      .send(hub, Hub.E.Open({ thread: "general" }))
      .send(hub, Hub.E.Open({ thread: "random" }))
      .send(general, Thread.E.Join())
      .send(random, Thread.E.Join())
      .send(general, Thread.E.Send({ clientId: "c-1", text: "hello" }))
      .send(general, Thread.E.Send({ clientId: "c-2", text: "" }))
      .send(general, longSend)
      .send(general, Thread.E.Resend())
      .send(general, Thread.E.Unsend())
      .send(general, Thread.E.Refresh())
      .send(general, Thread.E.Posted())
      .send(general, Thread.E.Leave())
      .send(random, Thread.E.Posted())
      .send(general, Thread.E.Delete({ messageId: "m-1" }))
      .send(general, Thread.E.LetGo({ messageId: "m-1" }))
      .send(general, Thread.E.Ask({ question: "when is standup" })),
});
