// Inert scenario plans; importing them runs nothing. Stories target refs (Testing.plan O1) and
// run on the production Runtime with the TestClock, seeded ids and a seeded Random.
import { model, story } from "flow-state/testing";
import { DemoTicketApi } from "../../../app/demo-api.js";
import { DeskSetup } from "../../../app/setup.js";
import { LockedSave, SlowSave } from "../../../testing/fixtures.js";
import { Session } from "../../Session/session.definition.js";
import { SessionRef } from "../../Session/session.ref.js";
import { ToastsRef } from "../../Toasts/toasts.ref.js";
import { EditorMachine } from "./editor.machine.js";
import { Editor } from "./editor.definition.js";
import { editorRef } from "./editor.ref.js";

const { E } = Editor;

export const T42 = { workspaceId: "north", ticketId: "T-42" };

export const Editor42 = editorRef(T42);

// Every App Story starts the same way: providers, then the ticket's editor, then a drain.
const desk = (id: string, fixtures = [SlowSave]) =>
  story
    .app(DeskSetup, { id, fixtures })
    .ensure(SessionRef, { input: { userId: "dispatcher-7" } })
    .ensure(ToastsRef)
    .ensure(Editor42, { input: T42 })
    .process()
    .checkpoint("opened"); // the ticket has loaded into the draft

export const saved = desk("ticket-save")
  .send(Editor42, E.TitleChanged({ title: "Replace foyer light" }))
  .send(Editor42, E.SaveRequested())
  .process()
  .checkpoint("saving") // SlowSave: the commit is in flight; the title is already predicted
  .advance("2 seconds")
  .process()
  .checkpoint("saved");

// A debounce: each edit restarts the 2-second autosave; only the pause after the last saves.
export const autosaved = desk("ticket-autosave", [])
  .send(Editor42, E.TitleChanged({ title: "Replace foyer" }))
  .process()
  .advance("1 second")
  .send(Editor42, E.TitleChanged({ title: "Replace foyer light" }))
  .process()
  .advance("1 second")
  .process()
  .checkpoint("still-editing")
  .advance("1 second")
  .process()
  .checkpoint("autosaved");

// Typing during a save is kept: after Saved the draft still differs from what was saved, so the
// editor goes back to EDITING, where autosave saves the newer draft without another keystroke.
export const editedWhileSaving = desk("ticket-edit-while-saving")
  .send(Editor42, E.TitleChanged({ title: "Replace foyer light" }))
  .send(Editor42, E.SaveRequested())
  .process()
  .send(Editor42, E.TitleChanged({ title: "Replace foyer lights" }))
  .advance("2 seconds")
  .process()
  .checkpoint("saved-with-newer-draft")
  .advance("2 seconds") // the autosave debounce, restarted by the edit made during the save
  .process()
  .checkpoint("autosaving-newer-draft")
  .advance("2 seconds")
  .process()
  .checkpoint("newer-draft-saved");

export const emptyTitle = desk("ticket-empty-title")
  .send(Editor42, E.TitleChanged({ title: "" }))
  .send(Editor42, E.SaveRequested())
  .process()
  .checkpoint("declined"); // denied with EmptyTitle; no commit starts

// Escape falls through: with edits it discards them; without, OPEN's handler closes.
export const escaped = desk("ticket-escape", [])
  .send(Editor42, E.TitleChanged({ title: "Something else" }))
  .send(Editor42, E.Escape())
  .process()
  .checkpoint("discarded")
  .send(Editor42, E.Escape())
  .process()
  .checkpoint("closed");

export const revokedWhileSaving = desk("ticket-revoked-while-saving")
  .send(Editor42, E.TitleChanged({ title: "Replace foyer light" }))
  .send(Editor42, E.SaveRequested())
  .process()
  .send(SessionRef, Session.E.PermissionChanged({ canEdit: false })) // while the save is in flight
  .process()
  .checkpoint("revoked");

// Lock contention: the retry schedule backs off, each tick is a guarded event, then it gives up
// and says so in FAILED. Retries fire at 5, 15, 35, 75 and 155 seconds; the sixth tick, at 315
// seconds, takes the exhausted alternative.
export const lockedOut = desk("ticket-locked", [LockedSave])
  .send(Editor42, E.TitleChanged({ title: "Replace foyer light" }))
  .send(Editor42, E.SaveRequested())
  .process()
  .checkpoint("locked")
  .advanceToNextTimer()
  .process()
  .checkpoint("first-retry")
  .advance("10 minutes")
  .process()
  .checkpoint("gave-up");

// Focused Stories: one local editor, its context supplied directly and its services given as a
// Layer (a focused Story has no app setup). Each exported Story builds its own id.
const focusedEditor = (id: string) =>
  story
    .machine(EditorMachine, { id, input: T42, context: { canEdit: true }, services: DemoTicketApi })
    .process()
    .send(E.TitleChanged({ title: "Replace foyer light" }))
    .process()
    .checkpoint("edited");

export const focused = focusedEditor("editor-focused");

export const readonly = focusedEditor("editor-readonly")
  .setContext({ canEdit: false })
  .process()
  .checkpoint("readonly");

// Pure model exploration from a fresh, command-empty base. snapshot.state is a path literal
// ("OPEN.EDITING"), so the key needs no encoding. Internal events whose producers are declared
// (outcomes, schedules) are candidates too, driven through the services, so paths reach SAVED.
const modelBase = story.machine(EditorMachine, {
  id: "editor-model",
  input: T42,
  context: { canEdit: true },
  services: DemoTicketApi,
});

export function exploreEditor() {
  const editorModel = model(modelBase, {
    stateKey: ({ state, memory }) => ({
      state,
      empty: memory.draft.trim() === "",
      tooLong: memory.draft.length > 200,
      dirty: memory.draft !== memory.saved,
    }),
  });

  return editorModel.getShortestPaths({
    events: [
      E.TitleChanged({ title: "" }),
      E.TitleChanged({ title: "Ok" }),
      E.SaveRequested(),
      E.Escape(),
      E.Reopen(),
    ],
    maxDepth: 6,
    limit: 30,
  });
}
