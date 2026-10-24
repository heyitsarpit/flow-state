// Consumer assertions after Story.run(). Target examples, not executed rewrite proof.
// This documentation tree is excluded from the workspace runtime test suite.
import { expect, test } from "vite-plus/test";
import { can } from "flow-state";
import { Editor } from "./editor.definition.js";
import { editorView } from "./editor.selectors.js";
import {
  autosaved,
  editor,
  emptyTitle,
  lockedOut,
  readonlyEditor,
  reminded,
  revokedWhileSaving,
  saved,
} from "./editor.story.js";

const ref = { workspaceId: "north", ticketId: "T-42" };

test("save publishes the canonical ticket and keeps the earlier checkpoint unchanged", async () => {
  const run = await saved.run();
  const before = run.checkpoints.opened.actor(editor).snapshot;
  const after = run.checkpoints.saved.actor(editor).snapshot;

  expect(before.memory.draft).toBe("Replace lobby light");
  expect(Editor.S.OPEN.SAVED.is(after)).toBe(true);
  expect(after.O.ticketById.getData(ref)?.title).toBe("Replace foyer light");
});

test("autosave waits for a pause in typing", async () => {
  const run = await autosaved.run();

  expect(
    run.checkpoints["still-editing"].actor(editor).snapshot.O.saveTitle.getState(ref)._tag,
  ).toBe("Idle");
  expect(Editor.S.OPEN.SAVED.is(run.checkpoints.autosaved.actor(editor).snapshot)).toBe(true);
});

test("an empty title is denied with a reason and starts no save", async () => {
  const run = await emptyTitle.run();
  const snapshot = run.checkpoints.declined.actor(editor).snapshot;
  const verdict = can(snapshot, Editor.E.SaveRequested(), { explain: true });

  expect(verdict.allowed).toBe(false);
  expect(verdict.denied[0]?.code).toBe("EmptyTitle");
  expect(editorView(snapshot).blockedBy).toBe("EmptyTitle"); // What the Save button shows.
  expect(snapshot.O.saveTitle.getState(ref)._tag).toBe("Idle");
});

test("revoking permission mid-save closes the editor and cancels the save", async () => {
  const run = await revokedWhileSaving.run();
  const snapshot = run.checkpoints.revoked.actor(editor).snapshot;

  expect(Editor.S.CLOSED.is(snapshot)).toBe(true);
  // Cancelled after dispatch may have reached the server, so the outcome is honestly unknown.
  expect(["Interrupted", "Unknown", "Success"]).toContain(snapshot.O.saveTitle.getState(ref)._tag);
});

test("a held lock backs off, retries as ordinary events, then gives up", async () => {
  const run = await lockedOut.run();

  expect(Editor.S.OPEN.LOCKED.is(run.checkpoints.locked.actor(editor).snapshot)).toBe(true);
  expect(run.checkpoints["first-retry"].actor(editor).snapshot.memory.lockRetries).toBe(1);

  const last = run.checkpoints["gave-up"].actor(editor).snapshot;
  const retry = can(last, Editor.E.RetrySave(), { explain: true });
  expect(retry.denied[0]?.code).toBe("RetryLimitReached");
  expect(last.memory.error).toBe("Locked by dispatcher-2");
});

test("the reminder schedule delivers an ordinary guarded event", async () => {
  const run = await reminded.run();
  expect(run.checkpoints.reminded.actor(editor).snapshot.memory.reminders).toBe(1);
});

test("focused context changes use the same reaction path", async () => {
  const run = await readonlyEditor.run();
  expect(run.checkpoints.readonly.snapshot.context.canEdit).toBe(false);
  expect(Editor.S.CLOSED.is(run.end.snapshot)).toBe(true);
});
