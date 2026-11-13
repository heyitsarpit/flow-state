// @vitest-environment happy-dom
// The app Stories' checks (desk.story.ts, editor/editor.tabs.story.ts), read from their checkpoints (2.10.6), and two
// render tests: the playback frame at the saving step shows the panel as production would. In an app Story a
// checkpoint has no subject of its own, so every value is a read: `saving.read(Editor42)`, `saving.entity(...)`,
// `saving.lane({ actor, operation, key })`.
import { render, screen } from "@testing-library/react";
import { StoryFrame } from "flow-state/testing";
import { expect, test } from "vite-plus/test";
import { Desk } from "../../testing/desk.fake.js";
import { Session } from "../Session/session.definition.js";
import { SessionRef } from "../Session/session.ref.js";
import { ToastsRef } from "../Toasts/toasts.ref.js";
import { TicketPanel } from "./editor/TicketPanel.js";
import { Autosave } from "./editor/autosave.trait.js";
import { Editor } from "./editor/editor.definition.js";
import { Editor42, FIRST, T42 } from "./editor/editor.story.js";
import {
  continuedFromReload,
  fieldsInTwoTabs,
  inB,
  outlivesClose,
  quotaRefused,
  reloadedMidAutosave,
  reloadMidCommentEdit,
  seededStaleLane,
  reloadAckConfirmationHeld,
  reloadAckHeld,
  reloadMidSave,
  secondTab,
} from "./editor/editor.tabs.story.js";
import {
  assignRepairs,
  bulkVsSave,
  closedMidSave,
  editedInPreview,
  Editor43,
  key,
  North,
  pushedRename,
  revokedMidSave,
  saveRepairsQueue,
  renameMeetsDispatch,
  signOut,
  twoDispatchers,
} from "./desk.story.js";
import { Comment } from "../Comments/comments.domain.js";
import { Technician } from "../Roster/roster.domain.js";
import { Ticket } from "./ticket.domain.js";
import { techniciansRef } from "./technicians/technicians.ref.js";

const { S, O } = Editor;

const SAVE_TITLE = "DispatchDesk/save-title";

const save = { actor: Editor42, operation: O.save, key: T42 };

test("a save shows at once on both screens, and only what can be wrong is read again", async () => {
  const { deskOpen, saving, saved } = (await saveRepairsQueue.run()).checkpoints;

  // Two screens, one record: the row and the panel agree while the save is on the wire.
  expect(saving.entity(Ticket, key("T-42"))).toMatchObject({
    data: { title: FIRST },
    predicted: true,
  });
  expect(saving.lane(save)).toMatchObject({ pending: true });
  expect(saved.entity(Ticket, key("T-42"))).toMatchObject({ predicted: false });
  expect(saved.read(Editor42)?.state).toBe(S.OPEN.SAVED);
  expect(saved.read(Editor42)).toMatchObject({ memory: { saved: FIRST } });
  expect(saved.read(ToastsRef)?.memory.messages).toEqual([`Saved “${FIRST}”`]);
  // Only what can be wrong is read again: the list (title, updatedAt), not the open count (status).
  expect(saved.read(Desk.list).length - deskOpen.read(Desk.list).length).toBe(1);
  expect(saved.read(Desk.openCount)).toHaveLength(1);
});

test("assigning from the queue repairs the open count and leaves the editor's memory alone", async () => {
  const { assigning, assigned } = (await assignRepairs.run()).checkpoints;

  expect(assigning.entity(Ticket, key("T-43"))).toMatchObject({
    data: { assignee: "dispatcher-7", status: "assigned" },
    predicted: true,
  });
  expect(assigned.entity(Ticket, key("T-43"))?.predicted).toBe(false);
  expect(assigned.read(Editor43)?.state).toBe(S.OPEN.EDITING);
  expect(assigned.read(Editor43)).toMatchObject({ memory: { draft: "Fix loading dock door" } });
  expect(assigned.read(Desk.openCount)).toHaveLength(2); // status is a condition field: repaired
  expect(assigned.read(Desk.assignBatch)).toMatchObject([
    { phase: "answered", via: { actor: North } },
  ]);
});

test("a permission revoked mid-save releases the lane, and the request lands unheard", async () => {
  const { saving, revoked, landedUnheard } = (await revokedMidSave.run()).checkpoints;

  expect(saving.inspection?.lanes).toMatchObject([
    { contract: SAVE_TITLE, state: "InFlight", binding: "bound" },
  ]);
  expect(revoked.read(Editor42)?.state).toBe(S.CLOSED);
  expect(revoked.inspection?.lanes).toEqual([]); // released, not held
  expect(landedUnheard.read(Desk.saveTitle)).toMatchObject([{ phase: "orphan" }]);
  expect(landedUnheard.read(Desk).desk.tickets).toContainEqual(
    expect.objectContaining({ ticketId: "T-42", title: FIRST }), // it landed, and nobody heard
  );
});

test("a write outlives its screen, and the store still takes the confirmation", async () => {
  const { unbound, settledUnbound, reopened } = (await closedMidSave.run()).checkpoints;

  expect(unbound.inspection?.lanes).toMatchObject([
    { contract: SAVE_TITLE, state: "InFlight", binding: "unbound" },
  ]);
  expect(settledUnbound.entity(Ticket, key("T-42"))).toMatchObject({
    data: { title: FIRST },
    predicted: false,
  });
  expect(settledUnbound.read(Desk.list)).toHaveLength(2); // repaired with no editor alive
  expect(reopened.read(Editor42)?.memory).toMatchObject({ saved: FIRST, draft: FIRST });
  expect(reopened.read(ToastsRef)?.memory.messages).toEqual([]); // evidence, not an adopted Saved
});

test("sign-out lists the save on the wire, closes the editor and forgets the session", async () => {
  const { signOutRefused, signedOut, forgotten } = (await signOut.run()).checkpoints;

  expect(signOutRefused.inspection?.lanes).toMatchObject([
    { contract: SAVE_TITLE, state: "InFlight" },
  ]);
  expect(signedOut.read(SessionRef)?.state).toBe(Session.S.SIGNED_OUT);
  expect(signedOut.read(SessionRef)).toMatchObject({ memory: { canEdit: false } });
  expect(signedOut.read(Editor42)?.state).toBe(S.CLOSED);
  expect(forgotten.read(SessionRef)).toBeUndefined();
});

test("a pushed rename reaches a clean editor, and an edited one keeps its draft", async () => {
  const { pushedRename: renamedOnce, pushedOverDraft } = (await pushedRename.run()).checkpoints;
  const renamed = "Replace lobby light, east";

  expect(renamedOnce.read(Editor42)?.memory).toMatchObject({
    saved: renamed,
    draft: renamed,
  });
  expect(pushedOverDraft.read(Editor43)?.memory).toMatchObject({
    saved: "Dock door, second try",
    draft: "My own wording",
  });
  expect(pushedOverDraft.read(Desk.list)).toHaveLength(3);
  expect(pushedOverDraft.read(Desk.openCount)).toHaveLength(1);
});

test("a second tab saves on its own, and closing main does not hand its save over", async () => {
  const { secondTab: opened, bSaving, mainClosed, bSaved } = (await secondTab.run()).checkpoints;

  expect(opened.tabs.b?.inspection.persistence.status).toBe("SecondTabNoPersistence");
  expect(bSaving.read(inB)?.state).toBe(S.OPEN.SAVING);
  expect(bSaving.read(Editor42)?.memory.draft).toBe("Replace lobby light"); // main is untouched
  expect(mainClosed.read(inB)?.state).toBe(S.OPEN.SAVING);
  expect(bSaved.read(inB)?.memory.saved).toBe("Only in tab b");
  expect(bSaved.read(Desk.saveTitle)).toMatchObject([
    { phase: "answered", via: { tab: { name: "b" } } },
  ]);
});

test("a write that outlives a closed screen is adopted by the next one", async () => {
  const { closedWhileSaving, unbound, adopted } = (await outlivesClose.run()).checkpoints;

  expect(closedWhileSaving.lane(save)).toMatchObject({ pending: true });
  expect(unbound.inspection?.lanes).toMatchObject([
    { contract: SAVE_TITLE, state: "InFlight", binding: "unbound" },
  ]);
  expect(adopted.read(Editor42)?.memory).toMatchObject({ saved: FIRST, draft: FIRST });
  expect(adopted.read(ToastsRef)?.memory.messages).toEqual([`Saved “${FIRST}”`]); // only an adopted Saved says it
  expect(adopted.inspection?.lanes).toEqual([]);
});

test("a reload mid-save restores the save as unsure, and Resend stores it once", async () => {
  const { saving, reloaded, orphaned, resent } = (await reloadMidSave.run()).checkpoints;

  expect(saving.read(Editor42)?.state).toBe(S.OPEN.SAVING);
  expect(reloaded.read(Editor42)?.state).toBe(S.OPEN.UNSURE);
  expect(reloaded.read(Editor42)).toMatchObject({ memory: { draft: FIRST } });
  expect(reloaded.inspection?.lanes).toMatchObject([
    { contract: SAVE_TITLE, state: "Held", binding: "bound" },
  ]);
  expect(orphaned.read(Desk.saveTitle)).toMatchObject([{ phase: "orphan" }]);
  expect(resent.read(Editor42)?.state).toBe(S.OPEN.SAVED);
  expect(resent.read(Desk.saveTitle)).toMatchObject([
    { phase: "orphan", via: { tab: { name: "main", open: 1 } } },
    { phase: "answered", via: { tab: { name: "main", open: 2 } } },
  ]);
  expect(resent.read(Desk).desk.nextSeq).toBe(2); // stored once
});

test("a reload before the acknowledgement was stored sends nothing and keeps no lane", async () => {
  const { waitingForAck, reloaded } = (await reloadAckHeld.run()).checkpoints;

  expect(waitingForAck.read(Desk.saveTitle)).toEqual([]); // nothing has left
  expect(reloaded.read(Editor42)?.operations.save).toEqual([]);
  expect(reloaded.inspection?.lanes).toEqual([]);
  expect(reloaded.read(Desk.saveTitle)).toEqual([]);
});

test("a reload with the confirmation held restores the save as unsure, and the first re-send is the only request", async () => {
  const { reloaded, resent } = (await reloadAckConfirmationHeld.run()).checkpoints;

  expect(reloaded.read(Editor42)?.state).toBe(S.OPEN.UNSURE);
  expect(reloaded.read(Desk.saveTitle)).toEqual([]);
  expect(resent.read(Editor42)?.state).toBe(S.OPEN.SAVED);
  expect(resent.read(Desk.saveTitle)).toHaveLength(1); // the first re-send is the only request
});

test("the panel at the saving step offers Cancel and not Save", async () => {
  const { saving } = (await saveRepairsQueue.run()).checkpoints;

  render(
    <StoryFrame frame={saving}>
      <TicketPanel ticket={T42} />
    </StoryFrame>,
  );

  expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  expect(screen.getByRole("textbox").getAttribute("value")).toBe(FIRST);
});

test("an edit made in the preview shows in the editor's thread at once", async () => {
  const { editedInPreview: cut, editConfirmed } = (await editedInPreview.run()).checkpoints;
  const c1 = { ...key("T-42"), commentId: "c-1" };

  expect(cut.entity(Comment, c1)).toMatchObject({
    data: { text: "Bulb is 40 W, not 60" },
    predicted: true,
  });
  // The editor's own thread lists the same record: one copy, read through the store, never memory.
  const editorThread = cut.read(Editor42)?.operations.comments?.thread;
  expect(editorThread?.data?.flatMap((page) => page.comments).map((c) => c.commentId)).toEqual([
    "c-1",
  ]);
  expect(editConfirmed.entity(Comment, c1)?.predicted).toBe(false);
});

const summary = { ...T42, field: "summary" as const };

test("fields typed in tab b are not kept on this device", async () => {
  const { secondTab: b } = (await fieldsInTwoTabs.run()).checkpoints;

  expect(b.tabs.b?.inspection.persistence.status).toBe("SecondTabNoPersistence");
  expect(b.read(Desk.saveField)).toMatchObject([
    { input: { value: "Lobby light, from tab b" }, via: { tab: { name: "b" } } },
  ]);
  expect(b.tabs.b?.inspection.lanes).toEqual([]); // nothing of b's saves is kept on this device
});

test("a reload mid-autosave re-sends the head and never queues the waiting value", async () => {
  const {
    headAndWaiting,
    reloadedMidAutosave: restored,
    settledAfterReload: settled,
  } = (await reloadedMidAutosave.run()).checkpoints;

  expect(
    headAndWaiting.lane({ actor: Editor42, operation: Autosave.O.save, key: summary }),
  ).toMatchObject({ pending: true, waiting: true });
  expect(
    restored.records("ending", { operation: Autosave.O.save, since: "headAndWaiting" }),
  ).toMatchObject([
    { channel: "unknown", reason: { _tag: "Restored" } }, // the sent head: a lane, re-sent
    { channel: "failure", reason: { _tag: "NotSent", why: "Restored" } }, // the waiting value: never a lane
  ]);
  expect(restored.read(Editor42)?.memory.fields[0]?.check.value).toBe("Lobby light, east"); // memory kept the newest
  expect(settled.read(Desk).desk.details["north/T-42"]?.fields.summary).toBe("Lobby light, east");
});

test("a refused autosave write never leaves the device", async () => {
  const { quotaRefused: refused } = (await quotaRefused.run()).checkpoints;

  expect(refused.records("ending", { operation: Autosave.O.save })).toMatchObject([
    { channel: "failure", reason: { _tag: "NotSent", why: "StorageRefused" } },
  ]);
  expect(refused.read(Desk.saveField)).toEqual([]); // it never left the device
});

test("a continued reload restores the save as unsure", async () => {
  const { restoredUnsure } = (await continuedFromReload.run()).checkpoints;

  expect(restoredUnsure.read(Editor42)?.state).toBe(Editor.S.OPEN.UNSURE);
});

test("a stale lane seeded in storage is re-sent with its old key", async () => {
  const { restored, resent } = (await seededStaleLane.run()).checkpoints;

  expect(restored.read(Editor42)?.state).toBe(Editor.S.OPEN.UNSURE);
  expect(resent.read(Desk.saveTitle)).toMatchObject([{ input: { key: "attempt-from-yesterday" } }]);
});

test("a reload mid comment edit keeps the edit uncertain until the repair", async () => {
  const { commentUncertain, commentRepaired } = (await reloadMidCommentEdit.run()).checkpoints;
  const c1 = { ...T42, commentId: "c-1" };

  expect(commentUncertain.entity(Comment, c1)?.uncertain).toBe(true);
  expect(commentRepaired.entity(Comment, c1)).toMatchObject({
    data: { text: "Note 1, corrected" },
  });
});

// X2: two tabs side by side, one frame each. Tab b shows its own draft; main shows the server's text.
test("two tabs, one ticket, side by side", async () => {
  const { secondTab: both } = (await fieldsInTwoTabs.run()).checkpoints;

  render(
    <>
      <StoryFrame frame={both} tab="main">
        <TicketPanel ticket={T42} />
      </StoryFrame>
      <StoryFrame frame={both} tab="b">
        <TicketPanel ticket={T42} />
      </StoryFrame>
    </>,
  );

  expect(
    screen.getAllByRole("textbox", { name: "Summary" }).map((input) => input.getAttribute("value")),
  ).toEqual(["Lobby light out", "Lobby light, from tab b"]);
  expect(screen.getByText("Not saved on this device")).toBeTruthy();
});

test("a bulk close waits in the record queue behind the save on the same ticket", async () => {
  const { bulkBehindSave, bothLanded } = (await bulkVsSave.run()).checkpoints;

  // design gap: the shape of a record queue in Inspection (`domains.<name>.queues`) is 2.10.18.4's; its members'
  // fields are not listed. Assumed: per record, its key and the Attempts in order with their operation.
  expect(bulkBehindSave.inspection?.domains.tickets.queues).toContainEqual(
    expect.objectContaining({
      key: key("T-42"),
      members: [
        expect.objectContaining({ operation: "save" }),
        expect.objectContaining({ operation: "bulkClose" }),
      ],
    }),
  );
  expect(bulkBehindSave.read(Desk.closeMany)).toEqual([]); // waits in T-42's record queue behind the save
  expect(bothLanded.read(Desk.closeMany)).toHaveLength(1);
});

test("two dispatchers in two tabs: the server takes the first and the second is refused", async () => {
  const { oneWins: cut } = (await twoDispatchers.run()).checkpoints;

  expect(cut.read(Desk.assignBatch).map((r) => r.via.tab.name)).toEqual(["main", "b"]); // tab order (2.10.2)
  expect(cut.read({ actor: North, tab: "b" })?.memory.notice).toBe("T-43 is with dispatcher-7");
  expect(cut.read(Desk).desk.tickets.find((t) => t.ticketId === "T-43")?.assignee).toBe(
    "dispatcher-7",
  );
});

test("a rename and a dispatch from two actors meet on one record, in order", async () => {
  const { renameAndDispatchQueued, bothLandedInOrder } = (await renameMeetsDispatch.run())
    .checkpoints;
  const ana = { workspaceId: "north", technicianId: "tech-ana" };
  const cut = renameAndDispatchQueued;

  // One record, two predictions from two actors: the panel shows the new name and the busy status at once.
  expect(cut.entity(Technician, ana)).toMatchObject({
    data: { name: "Ana Lopez", status: "busy" },
    predicted: true,
  });
  expect(cut.read(techniciansRef("north"))).toBeDefined();
  expect(cut.read(Desk.dispatch)).toEqual([]); // behind the rename in Ana's record queue
  expect(bothLandedInOrder.read(Desk.dispatch)).toHaveLength(1);
  expect(bothLandedInOrder.entity(Technician, ana)?.predicted).toBe(false);
});
