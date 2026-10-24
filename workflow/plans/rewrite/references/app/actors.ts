// Stable actor identities and their provider wiring, declared once (D11).
// Only a host's ensureActor obtains ownership; these values start nothing.
import { actorRef } from "flow-state";
import { SessionMachine } from "../features/Session/session.machine.js";
import { EditorMachine } from "../features/Tickets/editor/editor.machine.js";
import { QueueMachine } from "../features/Tickets/queue/queue.machine.js";

export const SessionRef = actorRef(SessionMachine, "coordinator", { persist: true });

export const EditorRef = actorRef(EditorMachine, "north/T-42", {
  persist: true,
  context: { canEdit: SessionRef },
});

// Not persisted: the queue rebuilds from the list resource after a reload.
export const QueueRef = actorRef(QueueMachine, "north", {
  context: { userId: SessionRef },
});
