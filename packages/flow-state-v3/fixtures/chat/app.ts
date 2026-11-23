import { Layer } from "effect";
import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { layerIndexedDb } from "../../src/host/persistence.ts";
import { ChatLive } from "./adapters/chat.ts";
import { UploadsLive } from "./adapters/uploads.ts";
import { AccountMachine } from "./machines/account.ts";
import { AttachmentMachine } from "./machines/attachment.ts";
import { HubMachine } from "./machines/hub.ts";
import { ThreadMachine } from "./machines/thread.ts";

/**
 * The signed-in user.
 */
export const me = actorRef(AccountMachine, "me");

/**
 * The sidebar.
 */
export const hub = actorRef(HubMachine, "hub");

/**
 * The thread most Stories use, which starts with two messages.
 */
export const general = actorRef(ThreadMachine, { thread: "general" });

/**
 * A second, empty thread.
 */
export const random = actorRef(ThreadMachine, { thread: "random" });

/**
 * The `n`th of many threads.
 */
export const threadOf = (n: number) => actorRef(ThreadMachine, { thread: `t-${String(n)}` });

/**
 * The chat app: the account, the sidebar and each thread, every one reading the signed-in user.
 */
export const chatApp = app({
  id: "chat",
  machines: {
    account: AccountMachine,
    hub: { machine: HubMachine, context: { who: me } },
    thread: { machine: ThreadMachine, context: { author: me } },
  },
});

/**
 * The chat app's real setup: the chat server over HTTP, persisted, each capture written at once.
 */
export const chatSetup = runtimeSetup({
  app: chatApp,
  services: Layer.merge(ChatLive("https://chat.example"), layerIndexedDb()),
  scope: "chat",
  persistence: { captureMs: 0 },
});

/**
 * A photo attached to a message.
 */
export const photo = actorRef(AttachmentMachine, { uploadId: "up-1" });

/**
 * The chat app grown with attachments: every machine of the chat fixture, under the same app id.
 */
export const chatGrownApp = app({
  id: "chat",
  machines: {
    account: AccountMachine,
    hub: { machine: HubMachine, context: { who: me } },
    thread: { machine: ThreadMachine, context: { author: me } },
    attachment: AttachmentMachine,
  },
});

/**
 * The attachment's own setup, with the chat app id and only the attachment machine: the uploads
 * server over HTTP, persisted, each capture written at once.
 */
export const attachmentSetup = runtimeSetup({
  app: app({ id: "chat", machines: { attachment: AttachmentMachine } }),
  services: Layer.merge(UploadsLive("https://uploads.chat.example"), layerIndexedDb()),
  scope: "chat",
  persistence: { captureMs: 0 },
});
