import { Fake, Story } from "../../../src/host/testing/index.ts";
import { chatSetup, general, hub, me, random, threadOf } from "../app.ts";
import { Account } from "../machines/account.ts";
import { Hub } from "../machines/hub.ts";
import { Thread } from "../machines/thread.ts";
import { Chat } from "../server/chat.ts";
import { AssistantFake, HistoryFake, MessagesFake } from "../server/layer.ts";
import { longSend } from "./samples.ts";
import { chatStory, signedIn } from "./usual.ts";

/**
 * The stress run the chat samples print from seed 36: sign-outs mid-send, reloads that drop held
 * writes or land them, a forgotten thread, a refused store load and an offline spell.
 */
export const seededStress = Story.app(chatSetup, {
  id: "chat/stress-36",
  fixtures: [HistoryFake, MessagesFake, AssistantFake],
})
  .world(Chat.undoLinks({ working: false }))
  .ensure(me)
  .world(Fake.storage.hold())
  .ensure(hub)
  .ensure(general)
  .ensure(random)
  .send(me, Account.E.SignOut())
  .send(general, longSend)
  .send(me, Account.E.SignIn({ who: "ada" }))
  .world(Chat.undoLinks({ working: true }))
  .send(me, Account.E.SignIn({ who: "ada" }))
  .send(general, Thread.E.Ask({ question: "when is standup" }))
  .send(general, longSend)
  .send(hub, Hub.E.Open({ thread: "general" }))
  .send(me, Account.E.SignOut())
  .reload({ reattach: false })
  .send(general, Thread.E.Ask({ question: "when is standup" }))
  .send(general, Thread.E.Ask({ question: "when is standup" }))
  .send(random, Thread.E.Join())
  .send(general, Thread.E.Ask({ question: "when is standup" }))
  .send(general, Thread.E.Delete({ messageId: "m-1" }))
  .send(hub, Hub.E.Open({ thread: "general" }))
  .send(random, Thread.E.Join())
  .send(general, Thread.E.LetGo({ messageId: "m-1" }))
  .send(general, Thread.E.Resend())
  .send(me, Account.E.SignOut())
  .world(Fake.network.offline())
  .send(general, Thread.E.Ask({ question: "when is standup" }))
  .dispose(general, { how: "forget" })
  .world(Chat.post({ thread: "general", author: "grace", text: "lunch?" }))
  .send(general, Thread.E.Send({ clientId: "c-2", text: "" }))
  .send(general, Thread.E.Send({ clientId: "c-2", text: "" }))
  .advance("20 millis")
  .disposeRuntime()
  .reload()
  .advance("7 millis")
  .send(me, Account.E.SignIn({ who: "ada" }))
  .world(Fake.storage.hold())
  .advance("20 millis")
  .send(hub, Hub.E.Open({ thread: "general" }))
  .advance("3 millis")
  .send(me, Account.E.SignOut())
  .send(general, Thread.E.Resend())
  .advance("16 millis")
  .send(general, Thread.E.Send({ clientId: "c-1", text: "hello" }))
  .send(general, Thread.E.Join())
  .send(general, Thread.E.LetGo({ messageId: "m-1" }))
  .send(hub, Hub.E.Open({ thread: "random" }))
  .send(general, Thread.E.Resend())
  .send(general, Thread.E.Resend())
  .send(general, Thread.E.Resend())
  .send(general, Thread.E.Send({ clientId: "c-1", text: "hello" }))
  .send(general, Thread.E.Send({ clientId: "c-1", text: "hello" }))
  .advance("5 millis")
  .send(general, Thread.E.Send({ clientId: "c-1", text: "hello" }))
  .advance("2 millis")
  .send(general, Thread.E.Delete({ messageId: "m-1" }))
  .advance("17 millis")
  .send(general, Thread.E.LetGo({ messageId: "m-1" }))
  .send(hub, Hub.E.Open({ thread: "random" }))
  .send(general, Thread.E.Delete({ messageId: "m-1" }))
  .advance("18 millis")
  .send(me, Account.E.SignOut())
  .send(random, Thread.E.Join())
  .send(general, Thread.E.Ask({ question: "when is standup" }))
  .send(general, Thread.E.Resend())
  .send(general, Thread.E.Ask({ question: "when is standup" }))
  .send(general, Thread.E.Send({ clientId: "c-1", text: "hello" }))
  .world(Fake.storage.refuseLoad())
  .reload({ reattach: false, heldWrites: "land" })
  .advance("4 millis")
  .send(general, Thread.E.Delete({ messageId: "m-1" }))
  .advance("10 millis")
  .send(me, Account.E.SignOut())
  .send(general, Thread.E.Join())
  .send(general, Thread.E.Join())
  .send(general, Thread.E.Resend())
  .send(general, Thread.E.Send({ clientId: "c-1", text: "hello" }))
  .send(hub, Hub.E.Open({ thread: "general" }))
  .send(me, Account.E.SignOut())
  .send(random, Thread.E.Join())
  .send(general, Thread.E.Ask({ question: "when is standup" }))
  .send(general, Thread.E.Ask({ question: "when is standup" }))
  .send(random, Thread.E.Join())
  .send(hub, Hub.E.Open({ thread: "general" }))
  .advance("20 millis")
  .send(me, Account.E.SignOut())
  .send(general, Thread.E.Send({ clientId: "c-2", text: "" }))
  .send(general, Thread.E.Join())
  .send(me, Account.E.SignIn({ who: "ada" }))
  .advance("15 millis")
  .send(me, Account.E.SignIn({ who: "ada" }))
  .send(hub, Hub.E.Open({ thread: "general" }))
  .send(general, Thread.E.LetGo({ messageId: "m-1" }))
  .advance("8 millis")
  .send(general, Thread.E.Delete({ messageId: "m-1" }))
  .send(general, Thread.E.LetGo({ messageId: "m-1" }))
  .advance("7 millis")
  .send(hub, Hub.E.Open({ thread: "general" }))
  .send(general, Thread.E.Ask({ question: "when is standup" }))
  .send(hub, Hub.E.Open({ thread: "general" }))
  .advance("15 millis")
  .send(general, Thread.E.Ask({ question: "when is standup" }))
  .advance("15 millis")
  .send(hub, Hub.E.Open({ thread: "random" }))
  .advance("56438 millis")
  .world(Fake.network.online())
  .advance("2 minutes")
  .advance("2 minutes");

/**
 * Sends in one burst while the first is on the wire, a first guess the bench re-measures.
 */
export const BURST = 100;

/**
 * Threads that read their history at once, a first guess the bench re-measures.
 */
export const THREADS = 64;

/**
 * Ada sends {@link BURST} messages while the first is held: they go one at a time, in order, and
 * each takes its own server id.
 */
export const sendBurst = Array.from({ length: BURST }, (_, n) => n)
  .reduce(
    (story, n) =>
      story.send(general, Thread.E.Send({ clientId: `c-${String(n)}`, text: `line ${String(n)}` })),
    signedIn(chatStory("chat/stress-send-burst"))
      .send(general, Thread.E.Join())
      .world(Chat.send.hold()),
  )
  .checkpoint("queued")
  .world(Chat.send.release())
  .checkpoint("sent");

/**
 * {@link THREADS} threads, each opened by the sidebar and joined by its own thread while every read
 * is held: one read per thread, shared by the two.
 */
export const manyThreads = Array.from({ length: THREADS }, (_, n) => threadOf(n))
  .reduce(
    (story, thread, n) =>
      story
        .ensure(thread)
        .world(Chat.history.hold())
        .send(hub, Hub.E.Open({ thread: `t-${String(n)}` }))
        .send(thread, Thread.E.Join()),
    signedIn(chatStory("chat/stress-many-threads")),
  )
  .checkpoint("reading")
  .world(...Array.from({ length: THREADS }, () => Chat.history.release()))
  .checkpoint("read");
