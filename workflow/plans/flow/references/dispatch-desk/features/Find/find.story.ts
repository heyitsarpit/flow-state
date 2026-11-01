// The palette: machine Stories (`Story.machine`), its world the Desk fake (the real `FindHttp` adapter over
// `Fake.fetch`). Transcripts; find.test.ts reads them. Module checkpoints (COVERAGE.md section 6, "FD"): `typing`,
// `tooShort`, `results`, `staleDropped`, `cleared`, `jumped`.
import { Story } from "flow-state/testing";
import { Desk, DeskClient } from "../../testing/desk.fake.js";
import { Find } from "./find.definition.js";
import { FindMachine } from "./find.machine.js";

const { E } = Find;

type World = NonNullable<Parameters<typeof Story.machine>[1]["world"]>;

const palette = (id: string, world: World = []) =>
  Story.machine(FindMachine, {
    id,
    input: { workspaceId: "north" },
    fixtures: [DeskClient],
    world,
  });

// Each keystroke restarts the pause; one lookup after the last (S1). One letter is too short: Enter is refused, and
// the same reason is what the box shows (F21).
export const found = palette("find/found")
  .send(E.Typed({ q: "l" }))
  .checkpoint("typing")
  .send(E.Search())
  .checkpoint("tooShort")
  .send(E.Typed({ q: "lo" }), E.Typed({ q: "lob" }), E.Typed({ q: "lobby" }))
  .advance("250 millis")
  .checkpoint("results");

// A slow answer to an older query never lands (2.7.9): "dock" is held on the wire, the user types on, "door" is
// answered; when "dock"'s answer finally arrives it is released evidence (`Superseded`), not an event.
export const staleDropped = palette("find/stale-dropped", [
  Desk.find.hold({ at: "response", times: 1 }),
])
  .send(E.Typed({ q: "dock" }))
  .advance("250 millis")
  .send(E.Typed({ q: "door" }))
  .advance("250 millis")
  .world(Desk.find.release())
  .checkpoint("staleDropped");

// Clearing the box while a lookup is in flight: the key-less `cancel` releases it, and its answer never lands.
export const cleared = palette("find/cleared", [Desk.find.hold({ at: "response" })])
  .send(E.Typed({ q: "bulb" }))
  .advance("250 millis")
  .checkpoint("inFlight")
  .send(E.Typed({ q: "" }))
  .advance("250 millis")
  .world(Desk.find.release())
  .checkpoint("cleared");

// A failed search keeps the last results, dimmed (R4).
export const failedKeeps = palette("find/failed-keeps")
  .send(E.Typed({ q: "bulb" }))
  .advance("250 millis")
  .world(Desk.find.drop({ times: 1 }))
  .send(E.Typed({ q: "bulbs" }))
  .advance("250 millis")
  .checkpoint("failedKept");

// Choosing a ticket opens it in the queue's preview: a send to the queue's public event.
export const jumped = palette("find/jumped")
  .send(E.Typed({ q: "dock" }))
  .advance("250 millis")
  .send(E.Choose({ kind: "ticket", id: "T-43" }))
  .checkpoint("jumped");
