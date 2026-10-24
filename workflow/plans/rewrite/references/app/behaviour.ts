// behavior-gateway
// CLI-only registration: import is inert; the gateway names this app and its external Story IDs.
import { behavior } from "flow-state/testing";
import { DeskApp } from "./app.js";
import { saved, closed, reminder, focused } from "../features/Tickets/editor/editor.story.js";

export const gateway = behavior({
  app: DeskApp,
  stories: {
    "ticket-save": saved,
    "ticket-close": closed,
    "ticket-reminder": reminder,
    "editor-focused": focused,
  },
});
