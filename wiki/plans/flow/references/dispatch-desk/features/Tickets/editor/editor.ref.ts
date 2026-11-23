import { actorRef } from "flow-state";
import type { TicketKey } from "../types.js";
import { EditorMachine } from "./editor.machine.js";

// One durable editor per ticket: the same ticket always names the same actor. The id is given
// as parts, which Flow encodes unambiguously; joining them into one string would let
// ("a/b", "c") and ("a", "b/c") name the same actor. Its context wiring (canEdit from the
// session) is the app's default for the editor machine (app/app.ts).
export const editorRef = (ticket: TicketKey) =>
  actorRef(EditorMachine, [ticket.workspaceId, ticket.ticketId], {
    persist: true,
    retain: "10 minutes", // stays alive for a while after the last component lets go
  });
