import { Duration } from "effect";
import { Story } from "../../../src/host/testing/index.ts";
import { RuntimeDefaults } from "../../../src/index.ts";
import { chatSetup, general, hub, me, random } from "../app.ts";
import { Account } from "../machines/account.ts";
import { Hub } from "../machines/hub.ts";
import { Thread } from "../machines/thread.ts";
import { Chat } from "../server/chat.ts";
import { AssistantFake, HistoryFake, HistoryFakeSteadfast, MessagesFake } from "../server/layer.ts";

/**
 * The chat app over its port fakes, with no steps yet.
 */
export const chatStory = (id: string) =>
  Story.app(chatSetup, { id, fixtures: [HistoryFake, MessagesFake, AssistantFake] });

/**
 * Ada signed in, with the sidebar and the general thread open.
 */
export const signedIn = (story: ReturnType<typeof chatStory>) =>
  story
    .ensure(me)
    .send(me, Account.E.SignIn({ who: "ada" }))
    .ensure(hub)
    .ensure(general);

const joined = (id: string) =>
  signedIn(chatStory(id)).send(general, Thread.E.Join()).checkpoint("joined");

/**
 * The sidebar and the thread open `general` while its history is on the wire for 20 seconds, so
 * both wait on one read; a message Ada sends shows at once and takes the server's id when it
 * answers; joining again ten seconds after the history landed (30 after it was asked) shows what
 * was read, and joining once it is 40 seconds old reads it again.
 */
export const usual = signedIn(chatStory("chat/usual"))
  .world(Chat.history.hold())
  .send(hub, Hub.E.Open({ thread: "general" }))
  .send(general, Thread.E.Join())
  .checkpoint("joining")
  .advance("20 seconds")
  .world(Chat.history.release())
  .checkpoint("joined")
  .send(general, Thread.E.Send({ clientId: "c-1", text: "hello" }))
  .checkpoint("sent")
  .advance("10 seconds")
  .send(general, Thread.E.Join())
  .checkpoint("joined again")
  .advance("30 seconds")
  .send(general, Thread.E.Join())
  .checkpoint("stale");

/**
 * Two threads read at once are two reads; the sidebar opening one of them joins that one's read.
 */
export const twoThreads = signedIn(chatStory("chat/two-threads"))
  .ensure(random)
  .world(Chat.history.hold(), Chat.history.hold())
  .send(general, Thread.E.Join())
  .send(random, Thread.E.Join())
  .send(hub, Hub.E.Open({ thread: "general" }))
  .checkpoint("reading")
  .world(Chat.history.release(), Chat.history.release())
  .checkpoint("read");

/**
 * The thread is closed while the sidebar still waits on the same history: the read goes on and the
 * sidebar shows its preview.
 */
export const oneReaderLeft = signedIn(chatStory("chat/one-reader-left"))
  .world(Chat.history.hold())
  .send(hub, Hub.E.Open({ thread: "general" }))
  .send(general, Thread.E.Join())
  .dispose(general)
  .checkpoint("one left")
  .world(Chat.history.release())
  .checkpoint("answered");

/**
 * The thread asks first and the sidebar joins its read; the thread, which started the read, is
 * closed: the read belongs to its entry, so it goes on and the sidebar shows its preview.
 */
export const firstReaderLeft = signedIn(chatStory("chat/first-reader-left"))
  .world(Chat.history.hold())
  .send(general, Thread.E.Join())
  .send(hub, Hub.E.Open({ thread: "general" }))
  .dispose(general)
  .checkpoint("one left")
  .world(Chat.history.release())
  .checkpoint("answered");

/**
 * The thread is closed, then the sidebar opens another thread: nobody waits on `general`'s history
 * any more, so its read is stopped.
 */
export const noReaderLeft = signedIn(chatStory("chat/no-reader-left"))
  .world(Chat.history.hold())
  .send(hub, Hub.E.Open({ thread: "general" }))
  .send(general, Thread.E.Join())
  .dispose(general)
  .send(hub, Hub.E.Open({ thread: "random" }))
  .checkpoint("none left")
  .world(Chat.history.release())
  .checkpoint("released");

/**
 * Deleting a message whose undo link the server garbles: the mapper throws, so its row is tried
 * once more and then kept, with an issue. A second message deleted with a working link is heard,
 * and the first one's issue stays. Letting the first go clears it.
 */
export const deleteBadUndo = joined("chat/delete-bad-undo")
  .world(Chat.undoLinks({ working: false }))
  .send(general, Thread.E.Delete({ messageId: "m-1" }))
  .checkpoint("kept")
  .world(Chat.undoLinks({ working: true }))
  .send(general, Thread.E.Delete({ messageId: "m-2" }))
  .checkpoint("other deleted")
  .send(general, Thread.E.LetGo({ messageId: "m-1" }))
  .checkpoint("let go");

/**
 * Deleting a message the server no longer has fails Gone, naming the message from the delete's own
 * key.
 */
export const deleteGone = joined("chat/delete-gone")
  .send(general, Thread.E.Delete({ messageId: "m-9" }))
  .checkpoint("gone");

/**
 * A message whose answer is lost is unsure; Ada resends it twice, the page reloading between the
 * two, and each answer is lost again; a third resend is declined, since it was tried twice.
 */
export const resendLimit = joined("chat/resend-limit")
  .world(Chat.send.drop({ at: "response" }))
  .send(general, Thread.E.Send({ clientId: "c-1", text: "are you there" }))
  .checkpoint("unsure")
  .world(Chat.send.drop({ at: "response" }))
  .send(general, Thread.E.Resend())
  .checkpoint("resent once")
  .reload()
  .checkpoint("reloaded")
  .world(Chat.send.drop({ at: "response" }))
  .send(general, Thread.E.Resend())
  .checkpoint("resent twice")
  .send(general, Thread.E.Resend())
  .checkpoint("limit");

/**
 * A message deleted, the page reloaded, and a second message deleted: each delete carries its own
 * key.
 */
export const newDeleteAfterReload = joined("chat/new-delete-after-reload")
  .send(general, Thread.E.Delete({ messageId: "m-1" }))
  .reload()
  .send(general, Thread.E.Delete({ messageId: "m-2" }))
  .checkpoint("deleted");

/**
 * Two questions in a row while the assistant answers the first: the second is not sent.
 */
export const askTwice = joined("chat/ask-twice")
  .world(Chat.ask.hold())
  .send(general, Thread.E.Ask({ question: "when is standup" }))
  .send(general, Thread.E.Ask({ question: "where" }))
  .checkpoint("refused")
  .world(Chat.ask.release())
  .checkpoint("answered");

/**
 * The sidebar opens `general` over a network that never stops a read once sent, then `random`, so
 * `general`'s read is told to stop and goes on; opening `general` again holds its key. No issue
 * shows before the Runtime's disposal bound, one shows once it passes, and none once that read
 * ends.
 */
export const releaseOverdue = signedIn(
  Story.app(chatSetup, {
    id: "chat/release-overdue",
    fixtures: [HistoryFakeSteadfast, MessagesFake, AssistantFake],
  }),
)
  .world(Chat.history.hold())
  .send(hub, Hub.E.Open({ thread: "general" }))
  .send(hub, Hub.E.Open({ thread: "random" }))
  .send(hub, Hub.E.Open({ thread: "general" }))
  .checkpoint("released")
  .advance(Duration.subtract(RuntimeDefaults.disposalBound, Duration.millis(1)))
  .checkpoint("before bound")
  .advance("1 milli")
  .checkpoint("past bound")
  .world(Chat.history.release())
  .checkpoint("ended");

/**
 * Ada sends a message while its answer is held, and the sidebar opens `general` five seconds later:
 * the history is fresh, so the preview is served from it with the send's echo applied, with no
 * request; once the server answers, the message stays.
 */
export const echoInPreview = joined("chat/echo-in-preview")
  .world(Chat.send.hold())
  .send(general, Thread.E.Send({ clientId: "c-1", text: "hello" }))
  .advance("5 seconds")
  .send(hub, Hub.E.Open({ thread: "general" }))
  .checkpoint("previewed")
  .world(Chat.send.release())
  .checkpoint("sent");

/**
 * The app booted without the history service its reads list, as a Layer whose type was widened
 * can: a type error where the type is kept, and refused at boot, by name, where it is not.
 */
export const missingHistory = () =>
  Story.app(chatSetup, {
    id: "chat/missing-history",
    // @ts-expect-error Operations O1: a setup that lacks a listed service does not compile
    fixtures: [MessagesFake, AssistantFake],
  })
    .ensure(me)
    .checkpoint("booted");

/**
 * Every usual chat Story, by name.
 */
export const stories = {
  usual,
  twoThreads,
  oneReaderLeft,
  firstReaderLeft,
  noReaderLeft,
  deleteBadUndo,
  deleteGone,
  resendLimit,
  newDeleteAfterReload,
  askTwice,
  releaseOverdue,
  echoInPreview,
};
