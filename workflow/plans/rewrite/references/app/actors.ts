// Inert stable identities. Only a host's ensureActor obtains ownership leases.
import { actorRef } from "flow-state";
import { SessionMachine } from "../features/Session/session.machine.js";
import { EditorMachine } from "../features/Tickets/editor/editor.machine.js";

export const SessionRef = actorRef(SessionMachine, "coordinator", { persist: true });

export const EditorRef = actorRef(EditorMachine, "north/T-42", { persist: true });
