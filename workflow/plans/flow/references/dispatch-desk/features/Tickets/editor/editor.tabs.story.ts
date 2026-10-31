// Tabs and reloads (2.10.10): app Stories over the persisted browser setup, written as transcripts (inputs and
// checkpoints; desk.test.tsx reads them). A tab is an independent Runtime of
// the setup; all tabs share the run's `Desk` server and `Fake.storage`. Multi-tab sharing is deferred
// (Persistence.plan O7): only the first tab persists, and a second cannot take a save over.
//
// design gap: `browserSetup` brings `layerIndexedDb`; in a Story the run's `Fake.storage` stands in for the
// store (2.10.4 says "one per run, used by every tab"), so no `storage` option is written.
import { Fake, Story } from "flow-state/testing";
import { browserSetup } from "../../../app/persistence.js";
import { Desk, DeskClient } from "../../../testing/desk.fake.js";
import { SessionRef } from "../../Session/session.ref.js";
import { ToastsRef } from "../../Toasts/toasts.ref.js";
import { Editor } from "./editor.definition.js";
import { Editor42, FIRST, T42 } from "./editor.story.js";

const { E } = Editor;

const desk = (id: string, world: ReadonlyArray<unknown>) =>
  Story.make(browserSetup("dispatcher-7"), { id, fixtures: [DeskClient], world })
    .ensure(SessionRef, { input: { userId: "dispatcher-7" } })
    .ensure(ToastsRef)
    .ensure(Editor42, { input: T42 });

export const inB = { actor: Editor42, tab: "b" } as const;

// Tab b has its own editor, ensured by `from`. It saves while main is closed, and nothing hands the save over:
// b's own lane carries it. The held save is released after main is gone.
export const secondTab = desk("editor/second-tab", [Desk.saveTitle.hold()])
  .openTab("b", { from: "main" })
  .checkpoint("second-tab")
  .send(inB, E.TitleChanged({ title: "Only in tab b" }), E.SaveRequested())
  .checkpoint("b-saving")
  .closeTab("main")
  .checkpoint("main-closed") // no handover: b's save is still b's
  .world(Desk.saveTitle.release())
  .checkpoint("b-saved");

// A save that outlives a closed ticket, on a persisted identity. Close and dispose cancel nothing (rule 44): the
// Runtime owns the lane, the listing a host's `beforeunload` reads shows it unbound, and the answer lands with no
// actor. `editorRef` persists, so with a saved record (`Fake.storage`) the ending is parked for the identity, and
// the next incarnation adopts it at the root before any event: the toast says so, and nothing is left unsettled.
export const outlivesClose = desk("editor/outlives-close", [Desk.saveTitle.hold()])
  .send(Editor42, E.TitleChanged({ title: FIRST }), E.SaveRequested(), E.Close())
  .checkpoint("closed-while-saving")
  .dispose(Editor42, { how: "now" })
  .checkpoint("unbound")
  .world(Desk.saveTitle.release()) // handled; the ending is parked for the identity's saved record
  .ensure(Editor42, { input: T42 })
  .checkpoint("adopted");

// Reload mid-save, the request on the wire. The acknowledged Attempt is stored, so the reopened editor finds
// its lane `Held` and delivers `unknown { Restored }` (rule 46): UNSURE, with no second invocation. The
// orphaned request is released (the server handles it, nobody hears), then the re-send carries the SAME
// Attempt and the server dedupes: one change in the log.
export const reloadMidSave = desk("editor/reload-mid-save", [Desk.saveTitle.hold()])
  .send(Editor42, E.TitleChanged({ title: FIRST }), E.SaveRequested())
  .checkpoint("saving")
  .reload()
  .checkpoint("reloaded")
  .world(Desk.saveTitle.release())
  .checkpoint("orphaned")
  .advance("3 seconds")
  .checkpoint("resent");

// The acknowledgement write is held, so the Attempt was never stored and never invoked. The tab closes and
// aborts that write (2.10.4): the restored lane has nothing to resend, `NotSent { Restored }` reaches the
// editor as `SaveNotSent`, which the root ignores on purpose (rule 20).
export const reloadAckHeld = desk("editor/reload-ack-held", [
  Fake.storage.write.hold({ match: { purpose: "acknowledge" } }),
])
  .send(Editor42, E.TitleChanged({ title: FIRST }), E.SaveRequested())
  .checkpoint("waiting-for-ack")
  .reload()
  .checkpoint("reloaded");

// The acknowledgement is stored but its confirmation is held (2.7.13's G1: acknowledged, never invoked). The
// record survived the close, so the restore reads an acknowledged Attempt and delivers `unknown { Restored }`:
// UNSURE. Nothing reached the server yet, so the first re-send is the only request, under the stored id.
export const reloadAckConfirmationHeld = desk("editor/reload-ack-confirmation-held", [
  Fake.storage.write.hold({ at: "response", match: { purpose: "acknowledge" } }),
])
  .send(Editor42, E.TitleChanged({ title: FIRST }), E.SaveRequested())
  .reload()
  .checkpoint("reloaded")
  .advance("3 seconds")
  .checkpoint("resent");
