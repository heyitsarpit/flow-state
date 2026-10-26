// Closed machine universe; no actors or services start here. Tooling groups by machine ID prefix.
import { app } from "flow-state";
import { SessionMachine } from "../features/Session/session.machine.js";
import { EditorMachine } from "../features/Tickets/editor/editor.machine.js";
import { QueueMachine } from "../features/Tickets/queue/queue.machine.js";

export const DeskApp = app({
  id: "dispatch-desk",
  machines: { session: SessionMachine, editor: EditorMachine, queue: QueueMachine },
});

// DeskApp.M.editor is EditorMachine. Persistence versioning lives on the persistence options.
