// The queue's checks, read from its Stories' checkpoints (2.10.6; COVERAGE.md section 6). Each test runs its Story
// once and destructures the checkpoints it reads. `filtered`, `leftUnassigned`, `created`, `archived`, `toggled`
// and `toggledWhileUnsure` are both a Story's name and a checkpoint's, so each of those checkpoints is read under
// an alias. `cut.lane` is `undefined` once a write settles, so every lane read here is a write still in progress.
import { expect, test } from "vite-plus/test";
import { Desk } from "../../../testing/desk.fake.js";
import { Ticket } from "../ticket.domain.js";
import { Queue } from "./queue.definition.js";
import {
  archived,
  bulkAssigned,
  created,
  filtered,
  key,
  leftUnassigned,
  mineOnly,
  paged,
  predictionReplayed,
  previewABA,
  queueDegraded,
  searchDebounced,
  toggled,
  toggledWhileUnsure,
} from "./queue.story.js";
import { AssignToggle } from "./assign-toggle.trait.js";

const { S } = Queue;

// Ticket ids on every loaded page of a paged answer.
const ids = (
  lane: { data?: ReadonlyArray<{ tickets: ReadonlyArray<{ ticketId: string }> }> } | undefined,
) => lane?.data?.flatMap((page) => page.tickets.map((ticket) => ticket.ticketId)) ?? [];

test("search is one key: three edits apply once, after the debounce", async () => {
  const { typing, searched } = (await searchDebounced.run()).checkpoints;

  expect(typing.read(Desk.list)).toHaveLength(1); // nothing applied yet: the debounce waits for a pause
  expect(searched.read(Desk.list).map((r) => r.input.search)).toEqual([undefined, "lobby"]);
  expect(searched.read(Desk.list).map((r) => r.phase)).toEqual(["answered", "answered"]);
});

test("mine only reads the session's user, and a new user changes the key", async () => {
  const { mine, someoneElse } = (await mineOnly.run()).checkpoints;

  expect(ids(mine.operations.list)).toEqual(["T-42"]);
  expect(ids(someoneElse.operations.list)).toEqual([]);
  expect(someoneElse.read(Desk.list).map((r) => r.input.assignee)).toEqual([
    undefined,
    "dispatcher-7",
    "dispatcher-8",
  ]);
});

test("paging appends while a next page exists, then LoadMore is denied", async () => {
  const { secondPage, lastPage, noMore } = (await paged.run()).checkpoints;

  expect(secondPage.operations.list).toMatchObject({ hasMore: true, data: [{}, {}] }); // PROPOSED: gap 23
  expect(lastPage.operations.list).toMatchObject({ hasMore: false, data: [{}, {}, {}] });
  expect(noMore.records("verdict", { since: "lastPage" })).toMatchObject([
    { result: { _tag: "Denied", reasons: [{ code: "NoMorePages" }] } },
  ]);
});

test("an outage degrades the queue and a later poll recovers it", async () => {
  const { degraded, recovered } = (await queueDegraded.run()).checkpoints;

  expect(degraded.state).toBe(S.DEGRADED);
  expect(degraded.read(Desk.list)).toHaveLength(2);
  expect(recovered.state).toBe(S.HEALTHY);
});

test("the triage tab: urgent first, overdue unassigned tickets join as the clock passes", async () => {
  const { filtered: atStart, overdueJoined } = (await filtered.run()).checkpoints;

  // At the start of the day only the urgent ticket is in triage.
  expect(ids(atStart.operations.triage)).toEqual(["T-43"]);
  // A day later the routine tickets that have a deadline and nobody on them are overdue; those with none are not.
  const later = ids(overdueJoined.operations.triage);
  expect(later).toContain("T-101");
  expect(later).not.toContain("T-104"); // index 4: no deadline (null), never `lt` anything
  expect(later).not.toContain("T-42"); // assigned, and not urgent
});

test("assigning from the Unassigned tab removes the ticket before the server answers", async () => {
  const { unassigned, leftUnassigned: left, confirmed } = (await leftUnassigned.run()).checkpoints;

  expect(ids(unassigned.operations.unassigned)).toContain("T-43");
  // Gone from the list in the starting turn's publication, while the request is still on the wire (E4).
  expect(ids(left.operations.unassigned)).not.toContain("T-43");
  expect(left.lane(AssignToggle.O.set, key("T-43"))).toMatchObject({ pending: true });
  expect(left.entity(Ticket, key("T-43"))).toMatchObject({
    data: { assignee: "dispatcher-7" },
    predicted: true,
  });
  expect(ids(confirmed.operations.unassigned)).not.toContain("T-43");
  expect(confirmed.entity(Ticket, key("T-43"))?.predicted).toBe(false);
});

test("a prediction replays over a new base without losing the server's change", async () => {
  const { replayedOverPush, settled } = (await predictionReplayed.run()).checkpoints;

  // The server's priority (the new base) under the still-predicted assignee.
  expect(replayedOverPush.entity(Ticket, key("T-43"))).toMatchObject({
    data: { priority: 0, assignee: "dispatcher-7" },
    predicted: true,
  });
  expect(settled.records("diagnostic")).not.toContainEqual(
    expect.objectContaining({ code: "PredictionNotRetained" }),
  );
});

test("a new ticket is a draft until a list holds the server's id, never shown twice", async () => {
  const { creating, created: done } = (await created.run()).checkpoints;

  expect(creating.memory.creating).toMatchObject([{ draftId: "d1", status: "sending", id: null }]);
  expect(ids(creating.operations.list)).not.toContain("T-1045"); // no temporary id in a list (rule 33)
  // The list's refetch holds the server's id, so the draft is gone: the ticket shows once, as a row.
  expect(ids(done.operations.list)).toContain("T-1045");
  expect(done.memory.creating).toEqual([]);
});

test("archive predicts a delete; a refused one comes back, an allowed one stays gone", async () => {
  const { loaded, archivePredicted, archived: done } = (await archived.run()).checkpoints;

  expect(loaded.entity(Ticket, key("T-101"))).toBeDefined(); // there before the archive, so `undefined` below is gone

  expect(archivePredicted.entity(Ticket, key("T-42"))).toBeUndefined();
  expect(archivePredicted.entity(Ticket, key("T-101"))).toBeUndefined();
  // T-42 is back (403), T-101 is gone for good.
  expect(done.entity(Ticket, key("T-42"))).toMatchObject({ predicted: false });
  expect(done.entity(Ticket, key("T-101"))).toBeUndefined();
  expect(done.memory.notice).toBe("dispatcher-7 is working on it");
});

test("a row's toggle: the middle tap is replaced before it is sent", async () => {
  const { assigning, toggled: tapped, assigned } = (await toggled.run()).checkpoints;

  expect(assigning.entity(Ticket, key("T-43"))).toMatchObject({
    data: { assignee: "dispatcher-7", status: "assigned" },
    predicted: true,
  });
  // The toggle's lane is the copy's: one on the wire, one waiting, the middle tap replaced before it was sent.
  expect(tapped.lane(AssignToggle.O.set, key("T-43"))).toMatchObject({
    pending: true,
    waiting: true,
  });
  expect(tapped.records("lane", { operation: AssignToggle.O.set })).toContainEqual(
    expect.objectContaining({ cell: expect.objectContaining({ evidence: "Superseded" }) }),
  );
  const sent = assigned
    .read(Desk.assignBatch)
    .flatMap((r) => r.input.items.map((i) => i.input.assignee));
  expect(sent).toEqual(["dispatcher-7", "dispatcher-7"]); // never the release
  expect(assigned.read(Desk.openCount)).toHaveLength(2); // the first read, then the repair
});

test("a tap while the row's assignment is unsure waits behind the hold", async () => {
  const { toggledWhileUnsure: waiting, caughtUp } = (await toggledWhileUnsure.run()).checkpoints;

  expect(waiting.lane(AssignToggle.O.set, key("T-43"))).toMatchObject({
    pending: true,
    retryCount: 1,
    waiting: true,
  });
  expect(caughtUp.entity(Ticket, key("T-43"))?.data.assignee).toBeNull(); // the waiting tap won
});

test("two rows at once are two Attempts in one request, and only the refused row loses its prediction", async () => {
  const { bulkPartlyFailed: cut } = (await bulkAssigned.run()).checkpoints;

  expect(cut.read(Desk.assignBatch)).toHaveLength(1); // two commits, one request
  expect(cut.read(Desk.assignBatch)[0]?.via.attempts).toHaveLength(2); // a batched request carries both Attempts
  expect(cut.memory.toggles.find((copy) => copy.key === "T-42")).toMatchObject({ problem: "held" });
  expect(cut.memory.notice).toBe("T-42 is with dispatcher-2");
  expect(cut.entity(Ticket, key("T-43"))).toMatchObject({
    data: { assignee: "dispatcher-7" },
    predicted: false,
  });
  expect(cut.entity(Ticket, key("T-42"))?.data.assignee).toBe("dispatcher-2"); // its prediction removed
});

test("a post held for A while the drawer previews B is parked and adopted when A returns", async () => {
  const { previewingB, backOnA } = (await previewABA.run()).checkpoints;

  expect(previewingB.memory).toMatchObject({ previewId: "T-43", preview: { drafts: [] } });
  expect(previewingB.inspection.lanes).toMatchObject([
    { key: key("T-42"), subject: ["T-42"], binding: "unplaced" },
  ]);
  expect(backOnA.memory).toMatchObject({ previewId: "T-42", preview: { drafts: [] } });
  expect(backOnA.read(Desk).desk.comments).toMatchObject([{ clientId: "a1", text: "For A" }]);
});
