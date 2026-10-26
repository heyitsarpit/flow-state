// The closed machine universe. Nothing starts here; tooling groups machines by ID prefix.
import { app } from "flow-state";
import { SessionMachine } from "../features/Session/session.machine.js";
import { SessionRef } from "../features/Session/session.ref.js";
import { QueueMachine } from "../features/Tickets/queue/queue.machine.js";
import { ToastsMachine } from "../features/Toasts/toasts.machine.js";

// Wiring is declared once (Runtime.plan D2): every editor and queue, shared or local, reads the
// session through these defaults; a ref may still set its own.
export const DeskApp = app({
  id: "dispatch-desk",
  machines: {
    session: SessionMachine,
    toasts: ToastsMachine,
    editor: {
      id: "DispatchDesk/Editor",
      load: () =>
        import("../features/Tickets/editor/editor.machine.js").then((m) => m.EditorMachine),
      context: { canEdit: SessionRef },
    },
    queue: { machine: QueueMachine, context: { userId: SessionRef } },
  },
});
