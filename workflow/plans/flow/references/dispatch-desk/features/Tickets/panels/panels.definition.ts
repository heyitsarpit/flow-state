// The panels beside the ticket editor: History, Customer and Parts, one tab at a time. A machine of its own, so its
// tabs are not tangled with the title's save states (one active leaf per actor). One per workspace window: it
// shows whichever ticket is open, and each tab's trait is fresh when the ticket changes (`resetOn`, F13).
//
// How this module is different (COVERAGE.md 5.1, "ED panels"): the desk's only resumable fragments. Each tab's
// trait is placed on its own node with `Flow.state(…, { traits })` (F3) and `.resumable()` (F12), so leaving a tab
// freezes it: memory kept, schedules frozen with their `dueAt`, reads cut, writes outliving it.
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import { CustomerCard } from "./customer-card.trait.js";
import { History } from "./history.trait.js";
import { PartsPanel } from "./parts.trait.js";

export const Tab = Schema.Literals(["history", "customer", "parts"]);

export const Panels = definition({
  id: "DispatchDesk/Panels",
  states: [
    {
      TABS: [
        { HISTORY: Flow.state({ traits: { history: History.resumable() } }) },
        { CUSTOMER: Flow.state({ traits: { customer: CustomerCard.resumable() } }) },
        { PARTS: Flow.state({ traits: { parts: PartsPanel.resumable() } }) },
      ],
    },
  ],
  events: {
    OpenTab: { tab: Tab },
    ShowTicket: { ticketId: Schema.String, customerId: Schema.NullOr(Schema.String) },
    ShowEntry: { entryId: Schema.String }, // a deep link to one history entry
  },
  memory: {
    workspaceId: Flow.input(Schema.String),
    ticketId: Flow.initial(Schema.String, ""),
    customerId: Flow.initial(Schema.NullOr(Schema.String), null),
  },
});
