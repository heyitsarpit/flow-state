// Machine Stories (2.10.1): the editor alone, its context supplied, its world the `Desk` fake. A Story is a
// transcript: the user's, time's and the world's inputs, and named checkpoints (COVERAGE.md section 6, decided
// Q4 A). It states no expectation: editor.test.ts reads each checkpoint (2.10.6). No ending is injected
// (2.10.5): a lost answer is `Desk.saveTitle.drop({ at: "response" })`, a lock is `Desk.lock(...)`, a slow save is
// `Desk.saveTitle.hold()`. A wire rule is set before the step that sends its request. Each exported Story builds
// its own id; importing runs nothing.
//
// The title save is the one home of the hand-written hold (COVERAGE.md section 3): the same Attempt re-sent on
// a schedule with `retryable`, then `cancel`. Its checkpoints are the module's named ones: `draft`, `saving`,
// `unsure`, `resending`, `gaveUp`, `closedWhileSaving`, `reopenedUnsure`.
//
// design gap: what a machine Story does with the editor's `send(ToastsRef, ...)` when no Toasts actor exists is
// not specified (plan section 6, item 8). Assumed: the send is dropped as evidence. The app Stories (desk.story.ts)
// start Toasts.
//
// A machine Story's actor is a local identity (2.10.10): it has no saved record, so an ending that lands with no live
// actor is evidence (rule 44). Stories about a parked ending are app Stories on `editorRef`
// (editor.tabs.story.ts `outlivesClose`). Here only a lane that is still held is found again by a rebind.
import { Story } from "flow-state/testing";
import { PendingFilesLive } from "../../Attachments/attachments-api.js";
import { Desk, DeskClient } from "../../../testing/desk.fake.js";
import { Editor } from "./editor.definition.js";
import { EditorMachine } from "./editor.machine.js";
import { editorRef } from "./editor.ref.js";

const { E } = Editor;

export const T42 = { workspaceId: "north", ticketId: "T-42" };

export const Editor42 = editorRef(T42);

export const SEEDED = "Replace lobby light"; // the ticket's title in `Server.seed()`

export const FIRST = "Replace foyer light";

// The ticket's seeded title is loaded into the draft when the editor opens; every Story names that moment.
const editor = (
  id: string,
  options: { world?: ReadonlyArray<Story.Step>; canEdit?: boolean } = {},
) =>
  Story.machine(EditorMachine, {
    id,
    input: T42,
    context: { canEdit: options.canEdit ?? true },
    fixtures: [DeskClient, PendingFilesLive],
    world: options.world,
  }).checkpoint("opened");

const rename = (title: string) => E.TitleChanged({ title });

// The happy path. The commit is held on the wire so the moment between predicted and confirmed is a real step.
export const saved = editor("editor/saved", { world: [Desk.saveTitle.hold()] })
  .send(rename(FIRST))
  .checkpoint("draft")
  .send(E.SaveRequested())
  .checkpoint("saving")
  .world(Desk.saveTitle.release())
  .checkpoint("saved");

// A debounce: each edit restarts the 2-second autosave; only the pause after the last one saves.
export const autosavePaused = editor("editor/autosave")
  .send(rename("Replace foyer"))
  .advance("1 second")
  .send(rename(FIRST))
  .advance("1 second")
  .checkpoint("restarted") // the debounce restarted: nothing sent yet
  .advance("1 second")
  .checkpoint("autosaved");

// Typing during a save is kept: after Saved the draft still differs from what was saved, so the editor
// goes back to EDITING, where autosave saves the newer draft without another keystroke.
export const editedWhileSaving = editor("editor/edit-while-saving", {
  world: [Desk.saveTitle.hold()],
})
  .send(rename(FIRST), E.SaveRequested(), rename(`${FIRST}s`))
  .world(Desk.saveTitle.release())
  .checkpoint("movedOn")
  .advance("2 seconds") // the autosave debounce, restarted by the edit made during the save
  .checkpoint("caughtUp");

export const emptyTitle = editor("editor/empty-title")
  .send(rename(""), E.SaveRequested())
  .checkpoint("denied");

// Escape falls through: with edits it discards them; without, OPEN's handler closes.
export const escaped = editor("editor/escape")
  .send(rename("Something else"), E.Escape())
  .checkpoint("discarded")
  .send(E.Escape())
  .checkpoint("closed");

export const readonly = editor("editor/readonly", { canEdit: false })
  .send(rename(FIRST), E.SaveRequested())
  .checkpoint("denied");

// Lock contention, a definite failure (423): the backoff is memory, and every retry is a NEW Attempt. Retries
// fire at 5, 15, 35, 75 and 155 seconds; the sixth tick, at 315, takes the exhausted alternative.
export const lockedOut = editor("editor/locked-out", {
  world: [Desk.lock({ ...T42, by: "dispatcher-2", times: "always" })],
})
  .send(rename(FIRST), E.SaveRequested())
  .checkpoint("locked")
  .advance({ next: { schedule: "retry" } })
  .checkpoint("firstRetry")
  .advance("10 minutes") // runs the whole chain
  .checkpoint("gaveUpOnLock");

// A lock that lifts: the third retry succeeds.
export const lockLifts = editor("editor/lock-lifts", {
  world: [Desk.lock({ ...T42, by: "dispatcher-2", times: 2 })],
})
  .send(rename(FIRST), E.SaveRequested())
  .advance("1 minute")
  .checkpoint("saved");

// The hold. The server stores the title but every answer is lost, three times. The editor goes UNSURE,
// re-sends the SAME Attempt every 3 seconds (`retryable({ times: 3 })` allows three), and the third re-send's
// answer arrives. The server deduplicates on `attempt.id`: one applied, four requests in the log.
export const unsureResend = editor("editor/unsure-resend", {
  world: [Desk.saveTitle.drop({ at: "response", times: 3 })],
})
  .send(rename(FIRST), E.SaveRequested())
  .checkpoint("unsure")
  .advance("3 seconds")
  .checkpoint("resending")
  .advance("6 seconds") // the 6 s and 9 s ticks
  .checkpoint("saved");

// Nothing ever answers. After the third re-send the fourth tick finds `retryable` spent, `cancel` releases the
// hold, and FAILED says "We couldn't confirm". The lane is Idle: no hold is left without an owner (rule 45).
export const unsureGaveUp = editor("editor/unsure-gave-up", {
  world: [Desk.saveTitle.drop({ at: "response", times: "always" })],
})
  .send(rename(FIRST), E.SaveRequested())
  .advance("12 seconds") // ticks at 3, 6, 9 re-send; the one at 12 gives up
  .checkpoint("gaveUp");

// Cancel while it is on the wire: the fetch is interrupted (`unknown { Cancelled }`), the root's SaveStopped
// releases it at once, and the editor is back to EDITING. The request may still have reached the server.
export const saveStopped = editor("editor/stopped", { world: [Desk.saveTitle.hold()] })
  .send(rename(FIRST), E.SaveRequested(), E.CancelSave())
  .checkpoint("stopped");

// A lane that is held when the screen goes is found again by a rebind of the same identity: rule 44 delivers the
// held lane as `unknown { Restored }` (mapped to SaveUnsure), which OPEN sends to UNSURE, and the re-send then
// settles it on the same Attempt. (An ending that lands while no actor lives is evidence here; see the header.)
export const heldLaneReadopted = editor("editor/held-lane-readopted", {
  world: [Desk.saveTitle.drop({ at: "response", times: 1 })],
})
  .send(rename(FIRST), E.SaveRequested(), E.Close())
  .checkpoint("closedWhileSaving")
  .dispose()
  .checkpoint("disposed")
  .ensure()
  .checkpoint("readopted")
  .advance("3 seconds")
  .checkpoint("saved");

// Reopening a live CLOSED editor with a hold goes to UNSURE, not to a fresh EDITING that could not save.
export const reopenedUnsure = editor("editor/reopened-unsure", {
  world: [Desk.saveTitle.drop({ at: "response", times: "always" })],
})
  .send(rename(FIRST), E.SaveRequested(), E.Close())
  .checkpoint("closedWhileSaving")
  .send(E.Reopen())
  .checkpoint("reopenedUnsure");

// Reopening while the save is still on the wire goes to OPEN, not to SAVING: the old SAVING has ended, so the
// ending is late and lands on the root or OPEN handlers (M2). Save stays disabled by the lane; the ending then
// settles the editor.
export const reopenedInFlight = editor("editor/reopened-in-flight", {
  world: [Desk.saveTitle.hold()],
})
  .send(rename(FIRST), E.SaveRequested(), E.Close(), E.Reopen())
  .checkpoint("reopened")
  .world(Desk.saveTitle.release())
  .checkpoint("settledLate");

// A file dropped in the editor: the editor adds the entry, the `uploads` placement makes a copy, and the copy
// uploads itself. The bytes were kept first (the hook does it); a removed entry releases the lane (rule 60).
export const fileAttached = editor("editor/attached")
  .send(E.AttachFile({ ref: "r-1", name: "photo.jpg", size: 40_000 }))
  .checkpoint("attached")
  .send(E.RemoveAttachment({ ref: "r-1" }))
  .checkpoint("removed");
