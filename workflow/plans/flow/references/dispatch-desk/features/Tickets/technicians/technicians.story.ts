// The technician panel: machine Stories (`Story.machine`) over the panel, its world the Desk fake (pulses served by
// `Fake.fetch` under the real adapter). Transcripts; technicians.test.ts reads them. Module checkpoints (COVERAGE.md
// section 6, "QU techs"): `techniciansLive`, `technicianStale`, `pollerDown`, `dispatchedMovesColumn`, `nudged`.
import { Story } from "flow-state/testing";
import { Desk, DeskClient } from "../../../testing/desk.fake.js";
import { Technicians } from "./technicians.definition.js";
import { TechniciansMachine } from "./technicians.machine.js";

const { E, O } = Technicians;

export const ana = { workspaceId: "north", technicianId: "tech-ana" };

type World = NonNullable<Parameters<typeof Story.machine>[1]["world"]>;

const panel = (id: string, world: World = []) =>
  Story.machine(TechniciansMachine, {
    id,
    input: { workspaceId: "north" },
    context: { userId: "dispatcher-7" },
    fixtures: [DeskClient],
    world,
  });

// East's technicians and the unplaced: one card copy and one pulse session per technician shown (T6, F5).
export const live = panel("technicians/live").checkpoint("techniciansLive");

// Ana's phone stops reporting. Her session stays live (the polls answer, with the old report), so the row's value
// is current but the phone's own `reportedAt` is old: the quiet-feed recipe in the view says "seen 2 min ago" (S4).
// The row's `last.at` is when Flow last knew the value was current.
export const stale = panel("technicians/stale").advance("2 minutes").checkpoint("technicianStale");

// The pulse service is down: every poll fails, each session drops (`Feed.down`, T4), the cards dim with the
// drop's reason, and `reconnect` waits out Flow's own backoff before it tries again. The first advance reaches the
// next poll (the adapter's ten-second pause), which fails; the second reaches Ana's backoff timer, whatever jitter
// Flow gave it, and the reconnect's first poll confirms the row again.
export const pollerDown = panel("technicians/poller-down")
  .world(Desk.pulseOutage({ on: true }))
  .advance("10 seconds")
  .checkpoint("pollerDown")
  .world(Desk.pulseOutage({ on: false }))
  .advance({ next: { operation: O.pulse, key: ana, timer: "backoff" } })
  .checkpoint("pollerBack");

// Overnight with the tab in the background (Y5): nothing runs while suspended; at wake the overdue polls fire once
// each and the sessions confirm again.
export const overnight = panel("technicians/overnight")
  .advance("8 hours", { suspended: true })
  .checkpoint("woke");

// Dispatching T-43 to Ana predicts her status "busy" (a second record) as well as the ticket's assignee, so her card
// moves from "Free" to "Busy" before the server answers (E4).
export const dispatched = panel("technicians/dispatched", [Desk.dispatch.hold({ at: "response" })])
  .send(E.Dispatch({ ticketId: "T-43", technicianId: "tech-ana" }))
  .checkpoint("dispatchedMovesColumn")
  .world(Desk.dispatch.release())
  .checkpoint("dispatchConfirmed");

// Nudges are `allow`: three at once (twice to Ana), each its own Attempt, each toasted in its own turn (O9).
export const nudged = panel("technicians/nudged", [Desk.nudge.hold({ at: "response" })])
  .send(
    E.Nudge({ technicianId: "tech-ana", text: "Call the desk" }),
    E.Nudge({ technicianId: "tech-ana", text: "Call the desk, please" }),
    E.Nudge({ technicianId: "tech-ben", text: "T-43 is yours" }),
  )
  .checkpoint("nudging")
  .world(Desk.nudge.release())
  .checkpoint("nudged");

// The break switch: a plain write with `optimistic`. It flips at once; the answer confirms (O21).
export const onBreak = panel("technicians/on-break", [Desk.setBreak.hold({ at: "response" })])
  .send(E.ToggleBreak({ technicianId: "tech-ben", onBreak: true }))
  .checkpoint("breakPredicted")
  .world(Desk.setBreak.release())
  .checkpoint("breakConfirmed");
