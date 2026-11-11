// The panels: machine Stories (`Story.machine`) over the panels machine, its world the Desk fake. Transcripts;
// panels.test.ts reads them. Module checkpoints (COVERAGE.md section 6, "ED panels"): `historyOpen`, `frozen`,
// `thawed`, `reservationExpiredWhileAway`.
import { Story } from "flow-state/testing";
import { Desk, DeskClient } from "../../../testing/desk.fake.js";
import { Panels } from "./panels.definition.js";
import { PanelsMachine } from "./panels.machine.js";

const { E } = Panels;

type World = NonNullable<Parameters<typeof Story.machine>[1]["world"]>;

const panels = (id: string, world: World = []) =>
  Story.machine(PanelsMachine, {
    id,
    input: { workspaceId: "north" },
    fixtures: [DeskClient],
    world,
  })
    .send(E.ShowTicket({ ticketId: "T-42", customerId: "acme" }))
    .checkpoint("historyOpen");

// A read cut by a freeze, delivered at thaw (rule 52). "Load earlier" is a one-off read the tab waits on; the
// dispatcher switches to Parts while it is on the wire. The freeze ends it `Interrupted`, parked with the frozen
// slice; the live read is released. Back on History, the thaw delivers the cut lookup first, the tab asks again,
// and the live read is placed again from the thawed memory.
export const frozenAndThawed = panels("panels/frozen-and-thawed")
  .world(Desk.history.hold({ at: "response" })) // after the opening read, so only "load earlier" is held
  .send(E.history.LoadEarlier())
  .send(E.OpenTab({ tab: "parts" }))
  .checkpoint("frozen")
  .world(Desk.history.release()) // the held answer goes nowhere: its lookup ended at the freeze
  .send(E.OpenTab({ tab: "history" }))
  .checkpoint("thawed");

// A write that outlives the freeze (rule 53): the pin is on the wire when the tab freezes; its ending is parked for
// the tab's subject path and the thawed incarnation adopts it (rule 54).
export const pinOutlivesFreeze = panels("panels/pin-outlives-freeze", [
  Desk.pinNote.hold({ at: "response" }),
])
  .send(E.history.Pin({ entryId: "h-15", pinned: true }))
  .send(E.OpenTab({ tab: "customer" }))
  .world(Desk.pinNote.release())
  .checkpoint("pinParked")
  .send(E.OpenTab({ tab: "history" }))
  .checkpoint("pinAdopted");

// A deadline that survives a freeze (F1, F12): parts are held for fifteen minutes; the dispatcher leaves the tab for
// twenty. Nothing fires while frozen; the deadline is kept, and on return the overdue hold fires once.
export const reservationExpiredWhileAway = panels("panels/reservation-expired-while-away")
  .send(E.OpenTab({ tab: "parts" }), E.parts.Reserve({ partNumber: "BULB-40W" }))
  .checkpoint("reserved")
  .send(E.OpenTab({ tab: "history" }))
  .advance("20 minutes")
  .checkpoint("away")
  .send(E.OpenTab({ tab: "parts" }))
  .checkpoint("reservationExpiredWhileAway");

// Resumable, but fresh when the ticket changes (F13): the reset value is the ticket, so Parts comes back empty for
// another ticket, and the old ticket's slice is gone.
export const freshOnNewTicket = panels("panels/fresh-on-new-ticket")
  .send(
    E.OpenTab({ tab: "parts" }),
    E.parts.Reserve({ partNumber: "BULB-40W" }),
    E.OpenTab({ tab: "history" }),
  )
  .send(E.ShowTicket({ ticketId: "T-43", customerId: "acme-ltd" }))
  .send(E.OpenTab({ tab: "parts" }))
  .checkpoint("fresh");

// A deep link to one entry: the panels machine raises the trait's host event (F16).
export const deepLinked = panels("panels/deep-linked")
  .send(E.OpenTab({ tab: "history" }), E.ShowEntry({ entryId: "h-3" }))
  .checkpoint("highlighted");
