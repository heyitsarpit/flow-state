// Consumer assertions after Story.run(). Target examples, not executed rewrite proof.
// This documentation tree is intentionally excluded from the workspace runtime test suite.
import { expect, test } from "vite-plus/test";
import { editorDefinition } from "./editor.definition.js";
import {
  closed,
  editor,
  saved,
  revoked,
  emptyTitle,
  locked,
  reminder,
  readonlyEditor,
} from "./editor.story.js";

test("save publishes the canonical ticket and preserves earlier checkpoint truth", async () => {
  const run = await saved.run();
  const initial = run.checkpoints.opened.actor(editor).snapshot;
  const final = run.checkpoints.saved.actor(editor).snapshot;
  const key = final.O.ticketById.key({ workspaceId: "north", ticketId: "T-42" });

  expect(initial.memory.draft).toBe("Replace lobby light");
  expect(final.state).toBe(editorDefinition.S.OPEN.S.SAVED);
  expect(final.memory.draft).toBe("Replace foyer light");
  expect(final.O.ticketById.getData(key)?.title).toBe("Replace foyer light");
});

test("another branch gets fresh services and does not inherit a previous save", async () => {
  await saved.run();
  const run = await closed.run();
  const final = run.checkpoints.closed.actor(editor).snapshot;
  expect(final.state).toBe(editorDefinition.S.CLOSED);
  expect(final.memory.draft).toBe("Replace lobby light");
});

test("changed provider context closes the editor through its authored event", async () => {
  const run = await revoked.run();
  expect(run.checkpoints.revoked.actor(editor).snapshot.state).toBe(editorDefinition.S.CLOSED);
});

test("a declined save starts no transaction", async () => {
  const run = await emptyTitle.run();
  const snapshot = run.checkpoints.declined.actor(editor).snapshot;
  expect(snapshot.state).toBe(editorDefinition.S.OPEN.S.EDITING);
  expect(snapshot.O.saveTitle.getState(["north", "T-42"]).status).toBe("idle");
});

test("typed adapter failure is valid evidence, with no canonical result promotion", async () => {
  const run = await locked.run();
  const snapshot = run.checkpoints.failed.actor(editor).snapshot;
  expect(snapshot.state).toBe(editorDefinition.S.OPEN.S.FAILED);
  expect(snapshot.memory.error).toBe("Ticket is locked");
  expect(snapshot.O.ticketById.getData(["north", "T-42"])?.title).toBe("Replace lobby light");
});

test("explicit timer advancement delivers the reminder", async () => {
  const run = await reminder.run();
  expect(run.checkpoints.reminded.actor(editor).snapshot.memory.reminders).toBe(1);
});

test("focused machine context uses the same ordinary change path", async () => {
  const run = await readonlyEditor.run();
  expect(run.checkpoints.readonly.snapshot.context.canEdit).toBe(false);
  expect(run.end.snapshot.state).toBe(editorDefinition.S.CLOSED);
  console.log(run.end.runtime.now, run.end.runtime.pendingWork);
});
