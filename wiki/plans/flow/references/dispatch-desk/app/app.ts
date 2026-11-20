// The closed machine universe. Nothing starts here; tooling groups machines by ID prefix.
import { app } from "flow-state";
import { AssistantMachine } from "../features/Assistant/assistant.machine.js";
import { PresenceMachine } from "../features/Presence/presence.machine.js";
import { SessionMachine } from "../features/Session/session.machine.js";
import { SessionRef } from "../features/Session/session.ref.js";
import { DeskFeedMachine } from "../features/Tickets/feed/feed.machine.js";
import { QueueMachine } from "../features/Tickets/queue/queue.machine.js";
import { RosterMachine } from "../features/Roster/roster.machine.js";
import { PanelsMachine } from "../features/Tickets/panels/panels.machine.js";
import { FindMachine } from "../features/Find/find.machine.js";
import { VisitMachine } from "../features/Resolve/visit.machine.js";
import { TechniciansMachine } from "../features/Tickets/technicians/technicians.machine.js";
import { ToastsMachine } from "../features/Toasts/toasts.machine.js";

// Wiring is declared once (Runtime.plan D2): every editor and queue, shared or local, reads the
// session through these defaults; a ref may still set its own. The feed, the watcher and the
// assistant read nothing upward: the feed and the watcher take their keys as input, and the
// assistant sends its text into the editor's public event, which needs no wiring.
export const DeskApp = app({
  id: "dispatch-desk",
  machines: {
    session: SessionMachine,
    toasts: ToastsMachine,
    editor: {
      id: "DispatchDesk/Editor",
      // Lazy: the Comments and Attachments traits come with it (LazyFeatures O1).
      load: () =>
        import("../features/Tickets/editor/editor.machine.js").then((m) => m.EditorMachine),
      context: { canEdit: SessionRef },
    },
    queue: { machine: QueueMachine, context: { userId: SessionRef } },
    roster: { machine: RosterMachine, context: { isAdmin: SessionRef } },
    panels: PanelsMachine,
    find: FindMachine,
    visit: { machine: VisitMachine, context: { me: SessionRef } },
    technicians: { machine: TechniciansMachine, context: { userId: SessionRef } },
    feed: DeskFeedMachine,
    presence: PresenceMachine,
    assistant: AssistantMachine,
  },
});
