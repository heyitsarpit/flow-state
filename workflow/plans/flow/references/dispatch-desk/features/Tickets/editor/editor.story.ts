// Machine Stories (2.10.1): the editor alone, its context supplied, its world the `Desk` fake. No ending is
// injected (2.10.5): a lost answer is `Desk.saveTitle.drop({ at: "response" })`, a lock is `Desk.lock(...)`, a
// slow save is `Desk.saveTitle.hold()`. Each exported Story builds its own id; importing runs nothing.
//
// design gap: what a machine Story does with the editor's `send(ToastsRef, ...)` when no Toasts actor exists is
// not specified (plan section 6, item 8). Assumed: the send is dropped as evidence. The app Stories (desk.story.ts)
// start Toasts.
// design gap: `ensure()` after `dispose()` re-adopts a parked ending only for a persisted identity (OD21), and
// `editorRef` persists. Assumed: a machine Story's actor has the identity its subject's ref would give it.
import { Story } from "flow-state/testing";
import { PendingFilesLive } from "../../Attachments/attachments-api.js";
import { Desk, DeskClient } from "../../../testing/desk.fake.js";
import { Editor } from "./editor.definition.js";
import { EditorMachine } from "./editor.machine.js";
import { editorRef } from "./editor.ref.js";

const { S, E, O } = Editor;

export const T42 = { workspaceId: "north", ticketId: "T-42" };

export const Editor42 = editorRef(T42);

const FIRST = "Replace foyer light";

// The ticket's seeded title is "Replace lobby light", loaded into the draft when the editor opens.
const editor = (id: string, options: { world?: ReadonlyArray<unknown>; canEdit?: boolean } = {}) =>
  Story.make(EditorMachine, {
    id,
    input: T42,
    context: { canEdit: options.canEdit ?? true },
    fixtures: [DeskClient, PendingFilesLive],
    world: options.world,
  }).expect({ memory: { saved: "Replace lobby light", draft: "Replace lobby light" } });

const rename = (title: string) => E.TitleChanged({ title });

// The happy path. The commit is held on the wire so the moment between predicted and confirmed is a real step.
export const saved = editor("editor/saved", { world: [Desk.saveTitle.hold()] })
  .send(rename(FIRST), E.SaveRequested())
  .expect({ state: S.OPEN.SAVING, operations: { save: { pending: true, uncertain: false } } })
  .world(Desk.saveTitle.release())
  .expect({
    state: S.OPEN.SAVED,
    memory: { saved: FIRST, draft: FIRST },
    operations: { save: { pending: false } },
  })
  .expect(Desk.saveTitle, [{ phase: "answered", via: { attempts: [Story.attempt(O.save)] } }]);

// A debounce: each edit restarts the 2-second autosave; only the pause after the last one saves.
export const autosaved = editor("editor/autosave")
  .send(rename("Replace foyer"))
  .advance("1 second")
  .send(rename(FIRST))
  .advance("1 second")
  .expect({ state: S.OPEN.EDITING }) // the debounce restarted: nothing sent yet
  .expect(Desk.saveTitle, [])
  .advance("1 second")
  .expect({ state: S.OPEN.SAVED, memory: { saved: FIRST } });

// Typing during a save is kept: after Saved the draft still differs from what was saved, so the editor
// goes back to EDITING, where autosave saves the newer draft without another keystroke.
export const editedWhileSaving = editor("editor/edit-while-saving", {
  world: [Desk.saveTitle.hold()],
})
  .send(rename(FIRST), E.SaveRequested(), rename(`${FIRST}s`))
  .world(Desk.saveTitle.release())
  .expect({ state: S.OPEN.EDITING, memory: { saved: FIRST, draft: `${FIRST}s` } })
  .advance("2 seconds") // the autosave debounce, restarted by the edit made during the save
  .expect({ state: S.OPEN.SAVED, memory: { saved: `${FIRST}s` } })
  .expect(Desk.saveTitle, [{ phase: "answered" }, { phase: "answered" }]);

export const emptyTitle = editor("editor/empty-title")
  .send(rename(""), E.SaveRequested())
  .expect(Story.records("verdict", { event: E.SaveRequested }), [
    { result: { _tag: "Denied", reasons: [{ code: "EmptyTitle" }] } },
  ])
  .expect(Desk.saveTitle, []); // denied before any commit

// Escape falls through: with edits it discards them; without, OPEN's handler closes.
export const escaped = editor("editor/escape")
  .send(rename("Something else"), E.Escape())
  .expect({ state: S.OPEN.EDITING, memory: { draft: "Replace lobby light" } })
  .send(E.Escape())
  .expect({ state: S.CLOSED });

export const readonly = editor("editor/readonly", { canEdit: false })
  .send(rename(FIRST), E.SaveRequested())
  .expect(Story.records("verdict", { event: E.SaveRequested }), [
    { result: { _tag: "Denied", reasons: [{ code: "NoPermission" }] } },
  ]);

// Lock contention, a definite failure (423): the backoff is memory, and every retry is a NEW Attempt. Retries
// fire at 5, 15, 35, 75 and 155 seconds; the sixth tick, at 315, takes the exhausted alternative.
export const lockedOut = editor("editor/locked-out", {
  world: [Desk.lock({ ...T42, by: "dispatcher-2", times: "always" })],
})
  .send(rename(FIRST), E.SaveRequested())
  .expect({ state: S.OPEN.LOCKED, memory: { error: "Locked by dispatcher-2" } })
  .advance({ next: { schedule: "retry" } })
  .expect({ state: S.OPEN.LOCKED, memory: { lockRetries: 1 } })
  .advance("10 minutes") // runs the whole chain
  .expect({ state: S.OPEN.FAILED })
  .expect(
    Desk.saveTitle,
    Array.from({ length: 6 }, () => ({ phase: "answered" })), // the first send and five retries, each its own Attempt
  );

// A lock that lifts: the third retry succeeds.
export const lockLifts = editor("editor/lock-lifts", {
  world: [Desk.lock({ ...T42, by: "dispatcher-2", times: 2 })],
})
  .send(rename(FIRST), E.SaveRequested())
  .advance("1 minute")
  .expect({ state: S.OPEN.SAVED, memory: { saved: FIRST, lockRetries: 0 } });

// The hold. The server stores the title but every answer is lost, three times. The editor goes UNSURE,
// re-sends the SAME Attempt every 3 seconds (`retryable({ times: 3 })` allows three), and the third re-send's
// answer arrives. The server deduplicates on `attempt.id`: one applied, four requests in the log.
export const unsureResend = editor("editor/unsure-resend", {
  world: [Desk.saveTitle.drop({ at: "response", times: 3 })],
})
  .send(rename(FIRST), E.SaveRequested())
  .expect({
    state: S.OPEN.UNSURE,
    operations: { save: { pending: false, uncertain: true, retryCount: 0 } },
  })
  .advance("3 seconds")
  .expect({ state: S.OPEN.UNSURE, operations: { save: { uncertain: true, retryCount: 1 } } })
  .advance("6 seconds") // the 6 s and 9 s ticks
  .expect({
    state: S.OPEN.SAVED,
    memory: { saved: FIRST },
    operations: { save: { pending: false, uncertain: false } },
  })
  .expect(Desk.saveTitle, [
    { phase: "dropped", via: { attempts: [Story.attempt(O.save)] } },
    { phase: "dropped", via: { attempts: [Story.attempt(O.save)] } },
    { phase: "dropped", via: { attempts: [Story.attempt(O.save)] } },
    { phase: "answered", via: { attempts: [Story.attempt(O.save)] } }, // one Attempt in all four
  ])
  .expect(Desk, { desk: { nextSeq: 2 } }); // stored once: one change in the log

// Nothing ever answers. After the third re-send the fourth tick finds `retryable` spent, `cancel` releases the
// hold, and FAILED says "We couldn't confirm". The lane is Idle: no hold is left without an owner (rule 45).
export const unsureGaveUp = editor("editor/unsure-gave-up", {
  world: [Desk.saveTitle.drop({ at: "response", times: "always" })],
})
  .send(rename(FIRST), E.SaveRequested())
  .advance("12 seconds") // ticks at 3, 6, 9 re-send; the one at 12 gives up
  .expect({
    state: S.OPEN.FAILED,
    memory: { error: "We couldn't confirm your last save" },
    operations: { save: { pending: false, uncertain: false } },
  })
  .expect(Story.inspection, { lanes: [] })
  .expect(
    Desk.saveTitle,
    Array.from({ length: 4 }, () => ({ phase: "dropped" })), // the first send and three re-sends: one Attempt
  );

// Cancel while it is on the wire: the fetch is interrupted (`unknown { Cancelled }`), the root's SaveStopped
// releases it at once, and the editor is back to EDITING. The request may still have reached the server.
export const stopped = editor("editor/stopped", { world: [Desk.saveTitle.hold()] })
  .send(rename(FIRST), E.SaveRequested(), E.CancelSave())
  .expect({
    state: S.OPEN.EDITING,
    operations: { save: { pending: false, uncertain: false } },
  })
  .expect(Story.inspection, { lanes: [] });

// A save that outlives a closed ticket. Close and dispose do not cancel: the Runtime owns the lane. The lane is
// listed (the same listing as `runtime.unsettledWrites()`, which a host's `beforeunload` reads), the answer
// lands with no actor, and the next incarnation of the same identity adopts the ending at the root, before
// any event: `saved` and the draft hold the new title and nothing is left unsettled.
export const outlivesClose = editor("editor/outlives-close", { world: [Desk.saveTitle.hold()] })
  .send(rename(FIRST), E.SaveRequested(), E.Close())
  .expect({ state: S.CLOSED, operations: { save: { pending: true } } })
  .dispose()
  .expect(Story.inspection, {
    lanes: [{ contract: "DispatchDesk/save-title", state: "InFlight", binding: "unbound" }],
  })
  .world(Desk.saveTitle.release()) // handled; the ending is parked for the identity
  .ensure()
  .expect({ state: S.OPEN, memory: { saved: FIRST, draft: FIRST } })
  .expect(Story.inspection, { lanes: [] }); // nothing unsettled

// The same, but the answer is lost: the unknown is parked and adopted as SaveUnsure, which the root sends to
// UNSURE. The re-send then settles it, on the same Attempt.
export const outlivesCloseUnsure = editor("editor/outlives-close-unsure", {
  world: [Desk.saveTitle.hold()],
})
  .send(rename(FIRST), E.SaveRequested(), E.Close())
  .dispose()
  .world(Desk.saveTitle.drop({ at: "response" }), Desk.saveTitle.release())
  .expect(Story.inspection, {
    lanes: [{ contract: "DispatchDesk/save-title", state: "Held", binding: "unbound" }],
  })
  .ensure()
  .expect({ state: S.OPEN.UNSURE, operations: { save: { uncertain: true } } })
  .advance("3 seconds")
  .expect({ state: S.OPEN.SAVED, memory: { saved: FIRST } });

// Reopening a live CLOSED editor with a hold goes to UNSURE, not to a fresh EDITING that could not save.
export const reopenedUnsure = editor("editor/reopened-unsure", {
  world: [Desk.saveTitle.drop({ at: "response", times: "always" })],
})
  .send(rename(FIRST), E.SaveRequested(), E.Close())
  .expect({ state: S.CLOSED, operations: { save: { uncertain: true } } })
  .send(E.Reopen())
  .expect({ state: S.OPEN.UNSURE });

// A file dropped in the editor: the editor adds the entry, the `uploads` placement makes a copy, and the copy
// uploads itself. The bytes were kept first (the hook does it); a removed entry releases the lane (rule 60).
export const attached = editor("editor/attached")
  .send(E.AttachFile({ ref: "r-1", name: "photo.jpg", size: 40_000 }))
  .expect({ memory: { uploads: [{ key: "r-1" }] } }) // a copy's public memory (rule 9)
  .send(E.RemoveAttachment({ ref: "r-1" }))
  .expect({ memory: { attachments: [], uploads: [] } })
  .expect(Story.inspection, { lanes: [] });
