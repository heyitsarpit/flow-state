// The technician panel's checks (2.10.6): each test runs its Story once and destructures what it names. A pulse row
// is read with `cp.lane(O.pulse, key)`: a wrong key, or a session that is not placed, reads `undefined` and fails.
import { expect, test } from "vite-plus/test";
import { Desk } from "../../../testing/desk.fake.js";
import { Technician } from "../../Roster/roster.domain.js";
import { Ticket } from "../ticket.domain.js";
import { Technicians } from "./technicians.definition.js";
import {
  ana,
  dispatched,
  live,
  nudged,
  onBreak,
  overnight,
  pollerDown,
  stale,
} from "./technicians.story.js";

const { O } = Technicians;

test("one card copy and one pulse session per technician shown", async () => {
  const { techniciansLive: cp } = (await live.run()).checkpoints;

  expect(cp.memory.shown).toEqual(["tech-ana", "tech-ben", "tech-eli"]);
  expect(cp.memory.cards.map((card) => card.key)).toEqual(cp.memory.shown); // copies over the live keys
  // One session per technician (I1: Inspection lists sessions by key).
  expect(
    cp.inspection.sessions.filter((s: { operation: string }) => s.operation === "pulse"),
  ).toHaveLength(3);
  expect(cp.lane(O.pulse, ana)).toMatchObject({ connection: "Live", value: { location: "Depot" } });
});

test("a quiet phone keeps a current row with an old report", async () => {
  const { technicianStale } = (await stale.run()).checkpoints;

  expect(technicianStale.lane(O.pulse, ana)).toMatchObject({
    connection: "Live",
    value: { reportedAt: 0 }, // the phone's own time: two minutes old, so the card says "seen 2 min ago"
    last: { at: 120_000 }, // Flow's: the last poll confirmed it now
  });
});

test("an outage drops the sessions and dims the cards, and the next poll confirms", async () => {
  const { pollerDown: down, pollerBack } = (await pollerDown.run()).checkpoints;

  const row = down.lane(O.pulse, ana);
  expect(row).toMatchObject({
    connection: "Connecting",
    drop: { _tag: "PollFailed", status: 503 },
  });
  expect(row?.value).toBeUndefined();
  expect(row?.last?.value.location).toBe("Depot"); // dimmed, never emptied
  expect(pollerBack.lane(O.pulse, ana)).toMatchObject({ connection: "Live" });
});

test("overdue polls fire once each at wake, not once per missed ten seconds", async () => {
  const { woke } = (await overnight.run()).checkpoints;

  expect(woke.lane(O.pulse, ana)).toMatchObject({ connection: "Live" });
  expect(
    woke.read(Desk.pulse).filter((r) => r.input.technicianId === "tech-ana").length,
  ).toBeLessThan(5);
});

test("dispatching predicts the technician's status and the ticket's assignee", async () => {
  const { dispatchedMovesColumn, dispatchConfirmed } = (await dispatched.run()).checkpoints;

  expect(dispatchedMovesColumn.entity(Technician, ana)).toMatchObject({
    data: { status: "busy" },
    predicted: true,
  });
  expect(
    dispatchedMovesColumn.entity(Ticket, { workspaceId: "north", ticketId: "T-43" })?.data.assignee,
  ).toBe("tech-ana");
  expect(dispatchConfirmed.entity(Technician, ana)?.predicted).toBe(false);
});

test("nudges run several at once under allow, and nothing holds", async () => {
  const { nudging, nudged: done } = (await nudged.run()).checkpoints;

  expect(nudging.lane(O.nudge, ana)).toMatchObject({ pending: true, outstanding: 2 }); // two on Ana's key
  expect(done.read(Desk.nudge)).toHaveLength(3);
  expect(done.inspection.lanes).toEqual([]); // nothing holds under `allow`
  expect(done.lane(O.nudge, ana)).toBeUndefined(); // every answer landed
});

test("the break switch flips at once, and the answer confirms it", async () => {
  const { breakPredicted, breakConfirmed } = (await onBreak.run()).checkpoints;

  expect(breakPredicted.operations.breaks).toMatchObject({
    data: { "tech-ben": true },
    predicted: true,
  });
  expect(breakConfirmed.operations.breaks).toMatchObject({
    data: { "tech-ben": true },
    predicted: false,
  });
});
