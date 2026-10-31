// Bulk close and SLA checks (`@flow-state/vitest`, proposed; editor/editor.test.ts says what `at` is).
import { storyTest } from "@flow-state/vitest"; // NEW (proposed)
import { Story } from "flow-state/testing";
import { expect } from "vite-plus/test";
import { Desk } from "../../../testing/desk.fake.js";
import { Ticket } from "../ticket.domain.js";
import { Queue } from "./queue.definition.js";
import { bulkOverloaded, bulkQueued, bulkUnsure, slaBreached, T43 } from "./queue.bulk.story.js";

const { O } = Queue;

const north = { workspaceId: "north" };

const t = (ticketId: string) => ({ workspaceId: "north", ticketId });

storyTest(bulkQueued, ({ at }) => {
  const queued = at["bulk-queued"];
  expect(O.bulkClose.get(queued, north)).toMatchObject({ pending: true, outstanding: 1 }); // the FIFO
  expect(queued.read(Desk.closeMany)).toHaveLength(1); // only the head reached the server
  for (const id of ["T-101", "T-102", "T-42", "T-103", "T-104"])
    expect(queued.read(Story.entity(Ticket, t(id)))).toMatchObject({
      data: { status: "closed" },
      predicted: true,
    });
  const done = at["bulk-partly-failed"];
  expect(done.read(Desk.closeMany).map((r) => r.input.tickets.map((x) => x.ticketId))).toEqual([
    ["T-101", "T-102", "T-42"],
    ["T-103", "T-104"], // in the order asked
  ]);
  expect(done.read(Story.entity(Ticket, t("T-42")))).toMatchObject({
    data: { status: "assigned" },
    predicted: false,
  });
  expect(done.memory.notice).toBe("Closed 2"); // the second bulk's answer, the last to land
});

storyTest(bulkOverloaded, ({ at }) => {
  expect(O.bulkClose.get(at.overloaded, north).outstanding).toBe(64);
  expect(
    at.overloaded.read(Story.records("ending", { operation: O.bulkClose, channel: "failure" })),
  ).toMatchObject([{ reason: { _tag: "NotSent", why: "Overloaded" } }]);
  expect(at.overloaded.memory.notice).toBe("Not sent (Overloaded): too many at once");
});

storyTest(bulkUnsure, ({ at }) => {
  const cut = at["bulk-resolved"];
  expect(cut.read(Desk.closeMany)).toHaveLength(2); // the lost one and its re-send, one Attempt
  expect(cut.read(Story.records("store", { entity: "DispatchDesk/Ticket" }))).toContainEqual(
    expect.objectContaining({ kind: "uncertain", key: t("T-101") }),
  );
  for (const id of ["T-101", "T-102"])
    expect(cut.read(Story.entity(Ticket, t(id)))?.uncertain).toBe(false); // cleared
});

storyTest(slaBreached, ({ at }) => {
  expect(at["sla-armed"].schedules.sla).toContainEqual({ key: T43, dueAt: 3_600_000 }); // one timer per open row
  expect(at["sla-breached"].memory).toMatchObject({
    breached: ["T-43"],
    notice: "T-43 has breached its deadline",
  });
  expect(at["sla-breached"].schedules.sla.some((timer) => timer.key.ticketId === "T-43")).toBe(
    false,
  );
});
