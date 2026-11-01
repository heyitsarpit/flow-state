// The technician panel's checks (`@flow-state/vitest`, proposed). Pending merge 6.
import { storyTest } from "@flow-state/vitest"; // NEW (proposed)
import { Story } from "flow-state/testing";
import { expect } from "vite-plus/test";
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

storyTest(live, ({ at }) => {
  const cut = at["technicians-live"];
  expect(cut.memory.shown).toEqual(["tech-ana", "tech-ben", "tech-eli"]);
  expect(cut.memory.cards.map((card) => card.key)).toEqual(cut.memory.shown); // copies over the live keys
  // One session per technician (I1: Inspection lists sessions by key).
  expect(
    cut
      .read(Story.inspection)
      .sessions.filter((s: { operation: string }) => s.operation === "pulse"),
  ).toHaveLength(3);
  expect(O.pulse.get(cut, ana)).toMatchObject({ connection: "Live", value: { location: "Depot" } });
});

storyTest(stale, ({ at }) => {
  const row = O.pulse.get(at["technician-stale"], ana);
  expect(row?.connection).toBe("Live");
  expect(row?.value?.reportedAt).toBe(0); // the phone's own time: two minutes old, so the card says "seen 2 min ago"
  expect(row?.last?.at).toBe(120_000); // Flow's: the last poll confirmed it now
});

storyTest(pollerDown, ({ at }) => {
  const row = O.pulse.get(at["poller-down"], ana);
  expect(row).toMatchObject({
    connection: "Connecting",
    drop: { _tag: "PollFailed", status: 503 },
    value: undefined,
  });
  expect(row?.last?.value.location).toBe("Depot"); // dimmed, never emptied
  expect(O.pulse.get(at["poller-back"], ana)?.connection).toBe("Live");
});

storyTest(overnight, ({ at }) => {
  expect(O.pulse.get(at.woke, ana)?.connection).toBe("Live");
  // Overdue polls fired once each at wake, not once per missed ten seconds.
  expect(
    at.woke.read(Desk.pulse).filter((r) => r.input.technicianId === "tech-ana").length,
  ).toBeLessThan(5);
});

storyTest(dispatched, ({ at }) => {
  const cut = at["dispatched-moves-column"];
  expect(cut.read(Story.entity(Technician, ana))).toMatchObject({
    data: { status: "busy" },
    predicted: true,
  });
  expect(
    cut.read(Story.entity(Ticket, { workspaceId: "north", ticketId: "T-43" }))?.data.assignee,
  ).toBe("tech-ana");
  expect(at["dispatch-confirmed"].read(Story.entity(Technician, ana))?.predicted).toBe(false);
});

storyTest(nudged, ({ at }) => {
  expect(O.nudge.get(at.nudging, ana)).toMatchObject({ pending: true, outstanding: 1 }); // two on Ana's key
  expect(at.nudged.read(Desk.nudge)).toHaveLength(3);
  expect(at.nudged.read(Story.inspection).lanes).toEqual([]); // nothing holds under `allow`
});

storyTest(onBreak, ({ at }) => {
  expect(at["break-predicted"].operations.breaks).toMatchObject({
    data: { "tech-ben": true },
    predicted: true,
  });
  expect(at["break-confirmed"].operations.breaks).toMatchObject({
    data: { "tech-ben": true },
    predicted: false,
  });
});
