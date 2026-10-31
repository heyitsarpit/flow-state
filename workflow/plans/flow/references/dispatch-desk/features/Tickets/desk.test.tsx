// @vitest-environment happy-dom
// The app Stories' checks (desk.story.ts, editor/editor.tabs.story.ts), read from their checkpoints, and one
// render test: the playback frame at the saving step shows the panel as production would.
// `@flow-state/vitest` is proposed (COVERAGE.md section 6); editor/editor.test.ts states what `at` is. In an app
// Story `at.<name>` has no subject of its own, so every value is a read: `at.saving.read(Editor42)`.
import { render, screen } from "@testing-library/react";
import { storyTest } from "@flow-state/vitest"; // NEW (proposed)
import { Story, StoryFrame } from "flow-state/testing";
import { expect, test } from "vite-plus/test";
import { Desk } from "../../testing/desk.fake.js";
import { Session } from "../Session/session.definition.js";
import { SessionRef } from "../Session/session.ref.js";
import { ToastsRef } from "../Toasts/toasts.ref.js";
import { TicketPanel } from "./editor/TicketPanel.js";
import { Editor } from "./editor/editor.definition.js";
import { Editor42, FIRST, T42 } from "./editor/editor.story.js";
import {
  inB,
  outlivesClose,
  reloadAckConfirmationHeld,
  reloadAckHeld,
  reloadMidSave,
  secondTab,
} from "./editor/editor.tabs.story.js";
import {
  assignRepairs,
  closedMidSave,
  Editor43,
  key,
  North,
  pushedRename,
  revokedMidSave,
  saveRepairsQueue,
  signOut,
} from "./desk.story.js";
import { Ticket } from "./ticket.domain.js";

const { S, O } = Editor;

const SAVE_TITLE = "DispatchDesk/save-title";

storyTest(saveRepairsQueue, ({ at }) => {
  // Two screens, one record: the row and the panel agree while the save is on the wire.
  expect(at.saving.read(Story.entity(Ticket, key("T-42")))).toMatchObject({
    data: { title: FIRST },
    predicted: true,
  });
  expect(O.save.get(at.saving.read(Editor42), T42).pending).toBe(true);
  expect(at.saved.read(Story.entity(Ticket, key("T-42")))).toMatchObject({ predicted: false });
  expect(at.saved.read(Editor42)).toMatchObject({ state: S.OPEN.SAVED, memory: { saved: FIRST } });
  expect(at.saved.read(ToastsRef)?.memory.messages).toEqual([`Saved “${FIRST}”`]);
  // Only what can be wrong is read again: the list (title, updatedAt), not the open count (status).
  expect(at.saved.read(Desk.list).length - at["desk-open"].read(Desk.list).length).toBe(1);
  expect(at.saved.read(Desk.openCount)).toHaveLength(1);
});

storyTest(assignRepairs, ({ at }) => {
  expect(at.assigning.read(Story.entity(Ticket, key("T-43")))).toMatchObject({
    data: { assignee: "dispatcher-7", status: "assigned" },
    predicted: true,
  });
  expect(at.assigned.read(Story.entity(Ticket, key("T-43"))).predicted).toBe(false);
  expect(at.assigned.read(Editor43)).toMatchObject({
    state: S.OPEN.EDITING,
    memory: { draft: "Fix loading dock door" },
  });
  expect(at.assigned.read(Desk.openCount)).toHaveLength(2); // status is a condition field: repaired
  expect(at.assigned.read(Desk.assign)).toMatchObject([
    { phase: "answered", via: { actor: North } },
  ]);
});

storyTest(revokedMidSave, ({ at }) => {
  expect(at.saving.read(Story.inspection).lanes).toMatchObject([
    { contract: SAVE_TITLE, state: "InFlight", binding: "bound" },
  ]);
  expect(at.revoked.read(Editor42)?.state).toBe(S.CLOSED);
  expect(at.revoked.read(Story.inspection).lanes).toEqual([]); // released, not held
  expect(at["landed-unheard"].read(Desk.saveTitle)).toMatchObject([{ phase: "orphan" }]);
  expect(at["landed-unheard"].read(Desk).desk.tickets).toContainEqual(
    expect.objectContaining({ ticketId: "T-42", title: FIRST }), // it landed, and nobody heard
  );
});

storyTest(closedMidSave, ({ at }) => {
  expect(at.unbound.read(Story.inspection).lanes).toMatchObject([
    { contract: SAVE_TITLE, state: "InFlight", binding: "unbound" },
  ]);
  expect(at["settled-unbound"].read(Story.entity(Ticket, key("T-42")))).toMatchObject({
    data: { title: FIRST },
    predicted: false,
  });
  expect(at["settled-unbound"].read(Desk.list)).toHaveLength(2); // repaired with no editor alive
  expect(at.reopened.read(Editor42)?.memory).toMatchObject({ saved: FIRST, draft: FIRST });
  expect(at.reopened.read(ToastsRef)?.memory.messages).toEqual([]); // evidence, not an adopted Saved
});

storyTest(signOut, ({ at }) => {
  expect(at["sign-out-refused"].read(Story.inspection).lanes).toMatchObject([
    { contract: SAVE_TITLE, state: "InFlight" },
  ]);
  expect(at["signed-out"].read(SessionRef)).toMatchObject({
    state: Session.S.SIGNED_OUT,
    memory: { canEdit: false },
  });
  expect(at["signed-out"].read(Editor42)?.state).toBe(S.CLOSED);
  expect(at.forgotten.read(SessionRef)).toBeUndefined();
});

// pending merge 6
storyTest(pushedRename, ({ at }) => {
  const renamed = "Replace lobby light, east";
  expect(at["pushed-rename"].read(Editor42)?.memory).toMatchObject({
    saved: renamed,
    draft: renamed,
  });
  expect(at["pushed-over-draft"].read(Editor43)?.memory).toMatchObject({
    saved: "Dock door, second try",
    draft: "My own wording",
  });
  expect(at["pushed-over-draft"].read(Desk.list)).toHaveLength(3);
  expect(at["pushed-over-draft"].read(Desk.openCount)).toHaveLength(1);
});

storyTest(secondTab, ({ at }) => {
  expect(at["second-tab"].read(Story.inspection({ tab: "b" })).persistence.status).toBe(
    "SecondTabNoPersistence",
  );
  expect(at["b-saving"].read(inB)?.state).toBe(S.OPEN.SAVING);
  expect(at["b-saving"].read(Editor42)?.memory.draft).toBe("Replace lobby light"); // main is untouched
  expect(at["main-closed"].read(inB)?.state).toBe(S.OPEN.SAVING);
  expect(at["b-saved"].read(inB)?.memory.saved).toBe("Only in tab b");
  expect(at["b-saved"].read(Desk.saveTitle)).toMatchObject([
    { phase: "answered", via: { tab: { name: "b" } } },
  ]);
});

storyTest(outlivesClose, ({ at }) => {
  expect(O.save.get(at["closed-while-saving"].read(Editor42), T42).pending).toBe(true);
  expect(at.unbound.read(Story.inspection).lanes).toMatchObject([
    { contract: SAVE_TITLE, state: "InFlight", binding: "unbound" },
  ]);
  expect(at.adopted.read(Editor42)?.memory).toMatchObject({ saved: FIRST, draft: FIRST });
  expect(at.adopted.read(ToastsRef)?.memory.messages).toEqual([`Saved “${FIRST}”`]); // only an adopted Saved says it
  expect(at.adopted.read(Story.inspection).lanes).toEqual([]);
});

storyTest(reloadMidSave, ({ at }) => {
  expect(at.saving.read(Editor42)?.state).toBe(S.OPEN.SAVING);
  expect(at.reloaded.read(Editor42)).toMatchObject({
    state: S.OPEN.UNSURE,
    memory: { draft: FIRST },
  });
  expect(at.reloaded.read(Story.inspection).lanes).toMatchObject([
    { contract: SAVE_TITLE, state: "Held", binding: "bound" },
  ]);
  expect(at.orphaned.read(Desk.saveTitle)).toMatchObject([{ phase: "orphan" }]);
  expect(at.resent.read(Editor42)?.state).toBe(S.OPEN.SAVED);
  expect(at.resent.read(Desk.saveTitle)).toMatchObject([
    { phase: "orphan", via: { tab: { name: "main", open: 1 } } },
    { phase: "answered", via: { tab: { name: "main", open: 2 } } },
  ]);
  expect(at.resent.read(Desk).desk.nextSeq).toBe(2); // stored once
});

storyTest(reloadAckHeld, ({ at }) => {
  expect(at["waiting-for-ack"].read(Desk.saveTitle)).toEqual([]); // nothing has left
  expect(at.reloaded.read(Editor42)?.operations.save).toEqual([]);
  expect(at.reloaded.read(Story.inspection).lanes).toEqual([]);
  expect(at.reloaded.read(Desk.saveTitle)).toEqual([]);
});

storyTest(reloadAckConfirmationHeld, ({ at }) => {
  expect(at.reloaded.read(Editor42)?.state).toBe(S.OPEN.UNSURE);
  expect(at.reloaded.read(Desk.saveTitle)).toEqual([]);
  expect(at.resent.read(Editor42)?.state).toBe(S.OPEN.SAVED);
  expect(at.resent.read(Desk.saveTitle)).toHaveLength(1); // the first re-send is the only request
});

// design gap: `StoryFrame`'s props are not spelled in 2.10.13. Assumed: the run, a checkpoint name and the views
// to render from that frame as children.
test("the panel at the saving step offers Cancel and not Save", async () => {
  const run = await saveRepairsQueue.run();

  render(
    <StoryFrame run={run} checkpoint="saving">
      <TicketPanel ticket={T42} />
    </StoryFrame>,
  );

  expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  expect(screen.getByRole("textbox").getAttribute("value")).toBe(FIRST);
});
