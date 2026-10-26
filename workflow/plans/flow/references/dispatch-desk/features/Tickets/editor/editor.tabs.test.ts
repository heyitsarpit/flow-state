import { expect, test } from "vite-plus/test";
import { Editor } from "./editor.definition.js";
import { Editor42, T42 } from "./editor.story.js";
import { reloaded, secondTabIndependent } from "./editor.tabs.story.js";

test("the second tab has its own editor and never takes over a save", async () => {
  const run = await secondTabIndependent.run();
  const saving = run.checkpoints["b-saving"];
  expect(Editor.S.OPEN.SAVING.is(saving.tabs.b.actor(Editor42).snapshot)).toBe(true);
  expect(saving.tabs.main.actor(Editor42).snapshot.memory.draft).toBe("Replace lobby light");
  expect(
    Editor.S.OPEN.SAVING.is(run.checkpoints["no-handover"].tabs.b.actor(Editor42).snapshot),
  ).toBe(true);
  expect(Editor.S.OPEN.SAVED.is(run.checkpoints["b-saved"].tabs.b.actor(Editor42).snapshot)).toBe(
    true,
  );
});

test("reload restores an invoked save as UNCERTAIN with the original Attempt", async () => {
  const run = await reloaded.run();
  const restored = run.checkpoints.restored.actor(Editor42).snapshot;
  expect(Editor.S.OPEN.UNCERTAIN.is(restored)).toBe(true);
  expect(restored.memory.uncertain).toMatchObject({
    input: { ...T42, title: "Replace foyer light" },
  });
  expect(restored.memory.uncertain?.id).toBeTruthy();

  // No second adapter invocation during restore; the durable pre-invocation attempt owns the id.
  const started = run.trace.filter(
    (event) => event._tag === "CommitStarted" && event.write === "tickets.saveTitle",
  );

  expect(started).toHaveLength(1);
  expect(started[0]).toMatchObject({ attempt: { id: restored.memory.uncertain?.id } });
});
