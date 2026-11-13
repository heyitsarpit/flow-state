// Bulk close and SLA checks, read from the Stories' checkpoints (2.10.6). `bulkQueued` and `slaBreached` are also
// checkpoint names, so those two are read under an alias. The FIFO's `outstanding` count is on the keyed row
// `cut.operations.bulkClose`; `cut.lane` carries `pending` for the same lane.
import { expect, test } from "vite-plus/test";
import { Desk } from "../../../testing/desk.fake.js";
import { Ticket } from "../ticket.domain.js";
import { Queue } from "./queue.definition.js";
import { bulkOverloaded, bulkQueued, bulkUnsure, slaBreached, T43 } from "./queue.bulk.story.js";

const { O } = Queue;

const north = { workspaceId: "north" };

const t = (ticketId: string) => ({ workspaceId: "north", ticketId });

test("two bulk closes run in the order asked, each predicting its tickets closed at once", async () => {
  const { bulkQueued: queued, bulkPartlyFailed: done } = (await bulkQueued.run()).checkpoints;

  expect(queued.lane(O.bulkClose, north)).toMatchObject({ pending: true });
  expect(queued.operations.bulkClose).toMatchObject([
    { key: north, pending: true, outstanding: 1 },
  ]); // the FIFO
  expect(queued.read(Desk.closeMany)).toHaveLength(1); // only the head reached the server
  for (const id of ["T-101", "T-102", "T-42", "T-103", "T-104"])
    expect(queued.entity(Ticket, t(id))).toMatchObject({
      data: { status: "closed" },
      predicted: true,
    });
  expect(done.read(Desk.closeMany).map((r) => r.input.tickets.map((x) => x.ticketId))).toEqual([
    ["T-101", "T-102", "T-42"],
    ["T-103", "T-104"], // in the order asked
  ]);
  expect(done.entity(Ticket, t("T-42"))).toMatchObject({
    data: { status: "assigned" },
    predicted: false,
  });
  expect(done.memory.notice).toBe("Closed 2"); // the second bulk's answer, the last to land
});

test("the 65th waiting bulk close is declined as Overloaded", async () => {
  const { overloaded } = (await bulkOverloaded.run()).checkpoints;

  expect(overloaded.operations.bulkClose).toMatchObject([{ key: north, outstanding: 64 }]);
  expect(
    overloaded.records("ending", { operation: O.bulkClose, channel: "failure" }),
  ).toMatchObject([{ reason: { _tag: "NotSent", why: "Overloaded" } }]);
  expect(overloaded.memory.notice).toBe("Not sent (Overloaded): too many at once");
});

test("a lost bulk answer marks every listed ticket uncertain, and the re-send clears them", async () => {
  const { bulkResolved: cut } = (await bulkUnsure.run()).checkpoints;

  expect(cut.read(Desk.closeMany)).toHaveLength(2); // the lost one and its re-send, one Attempt
  expect(cut.records("store", { entity: "DispatchDesk/Ticket" })).toContainEqual(
    expect.objectContaining({ kind: "uncertain", key: t("T-101") }),
  );
  for (const id of ["T-101", "T-102"]) expect(cut.entity(Ticket, t(id))?.uncertain).toBe(false); // cleared
});

test("an SLA deadline fires once, says so, and its timer is gone", async () => {
  const { slaArmed, slaBreached: breached } = (await slaBreached.run()).checkpoints;

  expect(slaArmed.schedules.sla).toContainEqual({ key: T43, dueAt: 3_600_000 }); // one timer per open row
  expect(breached.memory).toMatchObject({
    breached: ["T-43"],
    notice: "T-43 has breached its deadline",
  });
  expect(breached.schedules.sla.some((timer) => timer.key.ticketId === "T-43")).toBe(false);
});
