// Assertions on Story evidence. Checkpoints are atomic cuts: snapshots, the store revision and
// the entity repair evidence of that moment (FlowState O9).
import { render, screen } from "@testing-library/react";
import { expect, test } from "vite-plus/test";
import { check } from "flow-state";
import { CheckpointProvider } from "flow-state/testing";
import { Ticket } from "../ticket.domain.js";
import { Editor } from "./editor.definition.js";
import { TicketPanel } from "./TicketPanel.js";
import {
  Editor42,
  T42,
  autosaved,
  editedWhileSaving,
  emptyTitle,
  escaped,
  exploreEditor,
  lockedOut,
  readonly,
  revokedWhileSaving,
  saved,
} from "./editor.story.js";

const { S, E } = Editor;

test("a save predicts the title at once and the response confirms it", async () => {
  const run = await saved.run();
  const saving = run.checkpoints.saving;

  // Predicted, not yet confirmed: every copy of the ticket shows it, marked pending.
  expect(Ticket.get(saving, T42, ["title"])).toMatchObject({
    data: { title: "Replace foyer light" },
    pending: true,
  });
  expect(S.OPEN.SAVING.is(saving.actor(Editor42).snapshot)).toBe(true);

  const done = run.checkpoints.saved;
  expect(Ticket.get(done, T42, ["title"])).toMatchObject({
    data: { title: "Replace foyer light" },
    pending: false,
  });
  expect(done.actor(Editor42).snapshot.memory.saved).toBe("Replace foyer light");
  // The commit declared no writes and no cache update: the domain did both (ticket.domain.ts).
  // The queue tests show the lists it repairs.
});

test("autosave waits for a pause in typing", async () => {
  const run = await autosaved.run();
  expect(S.OPEN.EDITING.is(run.checkpoints["still-editing"].actor(Editor42).snapshot)).toBe(true);
  expect(S.OPEN.SAVED.is(run.checkpoints.autosaved.actor(Editor42).snapshot)).toBe(true);
});

test("an edit made during a save stays unsaved, and is saved next", async () => {
  const run = await editedWhileSaving.run();
  const after = run.checkpoints["saved-with-newer-draft"].actor(Editor42).snapshot;
  expect(after.memory.saved).toBe("Replace foyer light");
  expect(after.memory.draft).toBe("Replace foyer lights");
  // Not SAVED: the newer draft is still editable and savable.
  expect(S.OPEN.EDITING.is(after)).toBe(true);
  expect(check(after, E.SaveRequested())._tag).toBe("Allowed");

  expect(S.OPEN.SAVING.is(run.checkpoints["autosaving-newer-draft"].actor(Editor42).snapshot)).toBe(
    true,
  );
  const done = run.checkpoints["newer-draft-saved"].actor(Editor42).snapshot;
  expect(S.OPEN.SAVED.is(done)).toBe(true);
  expect(done.memory.saved).toBe("Replace foyer lights");
});

test("an empty title is denied with a reason and starts no save", async () => {
  const run = await emptyTitle.run();
  const snapshot = run.checkpoints.declined.actor(Editor42).snapshot;
  const verdict = check(snapshot, E.SaveRequested());

  expect(verdict._tag).toBe("Denied");
  expect(verdict._tag === "Denied" && verdict.reasons.map((reason) => reason.code)).toEqual([
    "EmptyTitle",
  ]);
  expect(S.OPEN.EDITING.is(snapshot)).toBe(true);
});

test("Escape discards edits first, then closes", async () => {
  const run = await escaped.run();
  expect(run.checkpoints.discarded.actor(Editor42).snapshot.memory.draft).toBe(
    "Replace lobby light",
  );
  expect(S.CLOSED.is(run.checkpoints.closed.actor(Editor42).snapshot)).toBe(true);
});

test("revoking permission mid-save closes the editor and reports an honest outcome", async () => {
  const run = await revokedWhileSaving.run();
  const snapshot = run.checkpoints.revoked.actor(Editor42).snapshot;

  expect(S.CLOSED.is(snapshot)).toBe(true);
  // Cancelled after the adapter was invoked, the save may have reached the server: unknown. The
  // attempt is kept, with its input and idempotency key, so a retry cannot double-apply.
  expect(snapshot.memory.uncertain?.input).toMatchObject({ title: "Replace foyer light" });
  expect(Ticket.get(run.checkpoints.revoked, T42, ["title"])?.uncertain).toBe(true);
});

test("a held lock backs off, retries as ordinary events, then gives up", async () => {
  const run = await lockedOut.run();
  expect(S.OPEN.LOCKED.is(run.checkpoints.locked.actor(Editor42).snapshot)).toBe(true);
  expect(run.checkpoints["first-retry"].actor(Editor42).snapshot.memory.lockRetries).toBe(1);

  const last = run.checkpoints["gave-up"].actor(Editor42).snapshot;
  // @ts-expect-error RetrySave is an internal event: nothing outside the actor may check or send it.
  check(last, E.RetrySave());
  // Exhausted: FAILED says so, the counter is reset for a manual save, and no retry is pending.
  expect(S.OPEN.FAILED.is(last)).toBe(true);
  expect(last.memory.error).toBe("Locked by dispatcher-2; gave up after 5 retries");
  expect(last.memory.lockRetries).toBe(0);
  // One save and five retries reached the adapter; the ten minutes after started none.
  const saves = run.trace.filter(
    (event) => event._tag === "CommitStarted" && event.write === "tickets.saveTitle",
  );
  expect(saves).toHaveLength(6);
});

test("focused context changes use the same reaction path", async () => {
  const run = await readonly.run();
  expect(run.checkpoints.readonly.snapshot.context.canEdit).toBe(false);
  expect(S.CLOSED.is(run.end.snapshot)).toBe(true);
});

test("the panel renders a checkpoint exactly as the user saw it", async () => {
  const run = await saved.run();

  render(
    <CheckpointProvider checkpoint={run.checkpoints.saving}>
      <TicketPanel ticket={T42} />
    </CheckpointProvider>,
  );

  expect(screen.getByRole("heading").textContent).toBe("Replace foyer light"); // the prediction
  expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
});

test("model paths replay live with the same keys", async () => {
  const { paths, truncated } = exploreEditor();
  expect(truncated).toBe(false);
  expect(paths.some((path) => path.state.state === "OPEN.SAVED")).toBe(true); // through outcomes
  for (const path of paths) {
    const run = await path.story.process().run();
    expect(path.keyOf(run.end.snapshot)).toEqual(path.state); // live replay reaches the same key
  }
});
