// The queue's checks, read from its Stories' checkpoints (`@flow-state/vitest`, proposed; COVERAGE.md section 6;
// features/Tickets/editor/editor.test.ts says what `at` is).
import { storyTest } from "@flow-state/vitest"; // NEW (proposed)
import { Story } from "flow-state/testing";
import { expect } from "vite-plus/test";
import { Desk } from "../../../testing/desk.fake.js";
import { Ticket } from "../ticket.domain.js";
import { Queue } from "./queue.definition.js";
import {
  alreadyAssigned,
  archived,
  assigned,
  assignedMany,
  assignUnsure,
  created,
  degraded,
  filtered,
  key,
  leftUnassigned,
  mineOnly,
  paged,
  previewABA,
  replayedOverPush,
  searched,
} from "./queue.story.js";

const { S, O } = Queue;

// Ticket ids on every loaded page of a paged answer.
const ids = (
  lane: { data?: ReadonlyArray<{ tickets: ReadonlyArray<{ ticketId: string }> }> } | undefined,
) => lane?.data?.flatMap((page) => page.tickets.map((ticket) => ticket.ticketId)) ?? [];

storyTest(searched, ({ at }) => {
  expect(at.searched.read(Desk.list)).toMatchObject([
    { input: { search: undefined }, phase: "answered" },
    { input: { search: "lobby" }, phase: "answered" },
  ]);
});

storyTest(mineOnly, ({ at }) => {
  expect(ids(at.mine.operations.list)).toEqual(["T-42"]);
  expect(ids(at["someone-else"].operations.list)).toEqual([]);
  expect(at["someone-else"].read(Desk.list).map((r) => r.input.assignee)).toEqual([
    undefined,
    "dispatcher-7",
    "dispatcher-8",
  ]);
});

storyTest(paged, ({ at }) => {
  expect(at["second-page"].operations.list).toMatchObject({ hasMore: true, data: [{}, {}] }); // PROPOSED: gap 23
  expect(at["last-page"].operations.list).toMatchObject({ hasMore: false, data: [{}, {}, {}] });
  expect(at["no-more"].read(Story.records("verdict", { since: "last-page" }))).toMatchObject([
    { result: { _tag: "Denied", reasons: [{ code: "NoMorePages" }] } },
  ]);
});

storyTest(degraded, ({ at }) => {
  expect(at.degraded.state).toBe(S.DEGRADED);
  expect(at.degraded.read(Desk.list)).toHaveLength(2);
  expect(at.recovered.state).toBe(S.HEALTHY);
});

storyTest(filtered, ({ at }) => {
  // At the start of the day only the urgent ticket is in triage.
  expect(ids(at.filtered.operations.triage)).toEqual(["T-43"]);
  // A day later the routine tickets that have a deadline and nobody on them are overdue; those with none are not.
  const later = ids(at["overdue-joined"].operations.triage);
  expect(later).toContain("T-101");
  expect(later).not.toContain("T-104"); // index 4: no deadline (null), never `lt` anything
  expect(later).not.toContain("T-42"); // assigned, and not urgent
});

storyTest(leftUnassigned, ({ at }) => {
  expect(ids(at.unassigned.operations.unassigned)).toContain("T-43");
  // Gone from the list in the starting turn's publication, while the request is still on the wire (E4).
  expect(ids(at["left-unassigned"].operations.unassigned)).not.toContain("T-43");
  expect(O.assign.get(at["left-unassigned"], key("T-43")).pending).toBe(true);
  expect(at["left-unassigned"].read(Story.entity(Ticket, key("T-43")))).toMatchObject({
    data: { assignee: "dispatcher-7" },
    predicted: true,
  });
  expect(ids(at.confirmed.operations.unassigned)).not.toContain("T-43");
  expect(at.confirmed.read(Story.entity(Ticket, key("T-43")))?.predicted).toBe(false);
});

storyTest(replayedOverPush, ({ at }) => {
  // The server's priority (the new base) under the still-predicted assignee.
  expect(at["replayed-over-push"].read(Story.entity(Ticket, key("T-43")))).toMatchObject({
    data: { priority: 0, assignee: "dispatcher-7" },
    predicted: true,
  });
  expect(at.settled.read(Story.records("diagnostic"))).not.toContainEqual(
    expect.objectContaining({ code: "PredictionNotRetained" }),
  );
});

storyTest(created, ({ at }) => {
  expect(at.creating.memory.creating).toMatchObject([
    { draftId: "d1", status: "sending", id: null },
  ]);
  expect(ids(at.creating.operations.list)).not.toContain("T-1045"); // no temporary id in a list (rule 33)
  // The list's refetch holds the server's id, so the draft is gone: the ticket shows once, as a row.
  expect(ids(at.created.operations.list)).toContain("T-1045");
  expect(at.created.memory.creating).toEqual([]);
});

storyTest(archived, ({ at }) => {
  expect(at["archive-predicted"].read(Story.entity(Ticket, key("T-42")))).toBeUndefined();
  expect(at["archive-predicted"].read(Story.entity(Ticket, key("T-101")))).toBeUndefined();
  // T-42 is back (403), T-101 is gone for good.
  expect(at.archived.read(Story.entity(Ticket, key("T-42")))).toMatchObject({ predicted: false });
  expect(at.archived.read(Story.entity(Ticket, key("T-101")))).toBeUndefined();
  expect(at.archived.memory.notice).toBe("dispatcher-7 is working on it");
});

storyTest(assigned, ({ at }) => {
  expect(at.assigning.operations.assign).toMatchObject([{ key: key("T-43"), pending: true }]);
  expect(at.assigning.read(Story.entity(Ticket, key("T-43")))).toMatchObject({
    data: { assignee: "dispatcher-7", status: "assigned" },
    predicted: true,
  });
  expect(at["second-press"].read(Story.records("verdict"))).toMatchObject([
    { result: { _tag: "Allowed" } },
    { result: { _tag: "Denied", reasons: [{ code: "InFlight" }] } },
  ]);
  expect(at.assigned.operations.assign).toEqual([]); // the lane held nothing, so it is gone
  expect(at.assigned.read(Desk.assign)).toMatchObject([
    {
      input: { ticketId: "T-43", key: at.assigned.read(Story.attempt(O.assign)) },
      phase: "answered",
    },
  ]);
  expect(at.assigned.read(Desk.openCount)).toHaveLength(2); // the first read, then the repair
});

storyTest(assignedMany, ({ at }) => {
  expect(at["both-on-the-wire"].operations.assign).toMatchObject([
    { key: key("T-43"), pending: true },
    { key: key("T-101"), pending: true },
  ]);
  expect(at["one-unsure"].operations.assign).toMatchObject([
    { key: key("T-101"), uncertain: true },
  ]);
  expect(at["one-unsure"].read(Story.entity(Ticket, key("T-101")))?.uncertain).toBe(true);
});

storyTest(assignUnsure, ({ at }) => {
  expect(at.unsure.operations.assign).toMatchObject([
    { key: key("T-43"), uncertain: true, retryCount: 0 },
  ]);
  expect(at["gave-up"].memory.notice).toBe("We couldn't confirm that assignment");
  expect(at["gave-up"].operations.assign).toEqual([]); // released: no lane
  const attempt = at["gave-up"].read(Story.attempt(O.assign));
  expect(at["gave-up"].read(Desk.assign).map((r) => r.input.key)).toEqual([
    attempt,
    attempt,
    attempt,
    attempt,
  ]);
});

storyTest(alreadyAssigned, ({ at }) => {
  expect(at.conflict.memory.notice).toBe("Already assigned to dispatcher-2");
  expect(at.conflict.read(Story.entity(Ticket, key("T-43")))?.data.assignee).toBe("dispatcher-2");
  expect(at.conflict.read(Desk.list)).toHaveLength(2); // the refetch
});

storyTest(previewABA, ({ at }) => {
  expect(at["previewing-b"].memory).toMatchObject({ previewId: "T-43", preview: { drafts: [] } });
  expect(at["previewing-b"].read(Story.inspection).lanes).toMatchObject([
    { key: key("T-42"), subject: ["T-42"], binding: "unplaced" },
  ]);
  expect(at["back-on-a"].memory).toMatchObject({ previewId: "T-42", preview: { drafts: [] } });
  expect(at["back-on-a"].read(Desk).desk.comments).toMatchObject([
    { clientId: "a1", text: "For A" },
  ]);
});
