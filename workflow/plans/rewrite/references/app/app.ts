// Closed machine universe and tooling ownership; no actors or services start here.
import { app, module } from "flow-state";
import { SessionMachine } from "../features/Session/session.machine.js";
import { EditorMachine } from "../features/Tickets/editor/editor.machine.js";

export const DeskApp = app({
  id: "dispatch-desk",
  persistenceVersion: "1",
  modules: [
    module({ id: "tickets", machines: { session: SessionMachine, editor: EditorMachine } }),
  ],
});
