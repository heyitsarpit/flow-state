// Tabs and reloads (2.10.10): app Stories over the persisted browser setup. A tab is an independent Runtime of
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
import { Editor42, T42 } from "./editor.story.js";

const { S, E, O } = Editor;

const FIRST = "Replace foyer light";

const SAVE_TITLE = "DispatchDesk/save-title";

const desk = (id: string, world: ReadonlyArray<unknown>) =>
  Story.make(browserSetup("dispatcher-7"), { id, fixtures: [DeskClient], world })
    .ensure(SessionRef, { input: { userId: "dispatcher-7" } })
    .ensure(ToastsRef)
    .ensure(Editor42, { input: T42 });

const inB = { actor: Editor42, tab: "b" } as const;

// Tab b has its own editor, ensured by `from`. It saves while main is closed, and nothing hands the save over:
// b's own lane carries it. The held save is released after main is gone.
export const secondTab = desk("editor/second-tab", [Desk.saveTitle.hold()])
  .openTab("b", { from: "main" })
  .expect(Story.inspection({ tab: "b" }), { persistence: { status: "SecondTabNoPersistence" } })
  .send(inB, E.TitleChanged({ title: "Only in tab b" }), E.SaveRequested())
  .expect(inB, { state: S.OPEN.SAVING })
  .expect(Editor42, { state: S.OPEN.EDITING, memory: { draft: "Replace lobby light" } }) // main is untouched
  .closeTab("main")
  .expect(inB, { state: S.OPEN.SAVING }) // no handover: b's save is still b's
  .world(Desk.saveTitle.release())
  .expect(inB, { state: S.OPEN.SAVED, memory: { saved: "Only in tab b" } })
  .expect(Desk.saveTitle, [{ phase: "answered", via: { tab: { name: "b" } } }]);

// Reload mid-save, the request on the wire. The acknowledged Attempt is stored, so the reopened editor finds
// its lane `Held` and delivers `unknown { Restored }` (rule 46): UNSURE, with no second invocation. The
// orphaned request is released (the server handles it, nobody hears), then the re-send carries the SAME
// Attempt and the server dedupes: one change in the log.
export const reloadMidSave = desk("editor/reload-mid-save", [Desk.saveTitle.hold()])
  .send(Editor42, E.TitleChanged({ title: FIRST }), E.SaveRequested())
  .expect(Editor42, { state: S.OPEN.SAVING })
  .reload()
  .expect(Editor42, {
    state: S.OPEN.UNSURE,
    memory: { draft: FIRST },
    operations: { save: { pending: false, uncertain: true, retryCount: 0 } },
  })
  .expect(Story.inspection, {
    lanes: [{ contract: SAVE_TITLE, state: "Held", binding: "bound" }],
  })
  .world(Desk.saveTitle.release())
  .expect(Desk.saveTitle, [{ phase: "orphan", via: { attempts: [Story.attempt(O.save)] } }])
  .advance("3 seconds")
  .expect(Editor42, { state: S.OPEN.SAVED, memory: { saved: FIRST } })
  .expect(Desk.saveTitle, [
    { phase: "orphan", via: { tab: { name: "main", open: 1 } } },
    {
      phase: "answered",
      via: { tab: { name: "main", open: 2 }, attempts: [Story.attempt(O.save)] },
    },
  ])
  .expect(Desk, { desk: { nextSeq: 2 } }); // stored once

// The acknowledgement write is held, so the Attempt was never stored and never invoked. The tab closes and
// aborts that write (2.10.4): the restored lane has nothing to resend, `NotSent { Restored }` reaches the
// editor as `SaveNotSent`, which the root ignores on purpose (rule 20).
export const reloadAckHeld = desk("editor/reload-ack-held", [
  Fake.storage.write.hold({ match: { purpose: "acknowledge" } }),
])
  .send(Editor42, E.TitleChanged({ title: FIRST }), E.SaveRequested())
  .expect(Desk.saveTitle, []) // waits for the acknowledgement: nothing has left
  .reload()
  .expect(Editor42, { operations: { save: { pending: false, uncertain: false } } })
  .expect(Story.inspection, { lanes: [] })
  .expect(Desk.saveTitle, []);

// The acknowledgement is stored but its confirmation is held (2.7.13's G1: acknowledged, never invoked). The
// record survived the close, so the restore reads an acknowledged Attempt and delivers `unknown { Restored }`:
// UNSURE. Nothing reached the server yet, so the first re-send is the only request, under the stored id.
export const reloadAckConfirmationHeld = desk("editor/reload-ack-confirmation-held", [
  Fake.storage.write.hold({ at: "response", match: { purpose: "acknowledge" } }),
])
  .send(Editor42, E.TitleChanged({ title: FIRST }), E.SaveRequested())
  .reload()
  .expect(Editor42, {
    state: S.OPEN.UNSURE,
    operations: { save: { uncertain: true } },
  })
  .expect(Desk.saveTitle, [])
  .advance("3 seconds")
  .expect(Editor42, { state: S.OPEN.SAVED, memory: { saved: FIRST } })
  .expect(Desk.saveTitle, [{ phase: "answered", via: { attempts: [Story.attempt(O.save)] } }]);
