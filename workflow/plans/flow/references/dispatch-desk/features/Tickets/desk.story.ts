// App Stories across actors (2.10.1 "an app setup"): Session, Toasts, the queue and the lazy editors run in one
// Runtime of `DeskSetup`, over the Desk fake (`DeskClient`). Each Story is a plan of inputs: sends, wire words,
// lifecycle steps. No ending is injected (2.10.5). What they show that a machine Story cannot:
//   - one write repairs another actor's list and count (the shared Ticket record, rules 27-30);
//   - a permission change reaches an editor through its context, and a stop releases at once (rule 44);
//   - a save outlives its screen and the next incarnation adopts it (rule 44);
//   - a sign-out refuses nothing by itself: the Runtime lists what is unsettled (C64) and `forget` drops it.
// `desk/pushed-rename` needs the workspace feed and is pending merge 6.
//
// `dispose(ref, { how: "now" })` (2.10.10) ends the actor at once (`disposeActor`). A plain `dispose(Editor42)`
// keeps it for its `retain`, expiring with `advance`, so a Story of "no actor when the answer lands" disposes `now`.
// `DeskSetup` has no persistence, so an ending that lands with no actor is evidence (rule 44). The adopted ending
// of a persisted identity is the app Story in editor/editor.tabs.story.ts (`outlivesClose`).
import { Story } from "flow-state/testing";
import { DeskSetup } from "../../app/setup.js";
import { Desk, DeskClient } from "../../testing/desk.fake.js";
import { Session } from "../Session/session.definition.js";
import { SessionRef } from "../Session/session.ref.js";
import { ToastsRef } from "../Toasts/toasts.ref.js";
import { feedRef } from "./feed/feed.ref.js"; // pending merge 6
import { Editor } from "./editor/editor.definition.js";
import { editorRef } from "./editor/editor.ref.js";
import { Editor42, T42 } from "./editor/editor.story.js";
import { Queue } from "./queue/queue.definition.js";
import { queueRef } from "./queue/queue.ref.js";
import { Ticket } from "./ticket.domain.js";

const { S, E, O } = Editor;

const North = queueRef("north");

const Editor43 = editorRef({ workspaceId: "north", ticketId: "T-43" });

const FIRST = "Replace foyer light";

const SAVE_TITLE = "DispatchDesk/save-title";

const key = (ticketId: string) => ({ workspaceId: "north", ticketId });

// The signed-in dispatcher, the toast stack, the north queue and the editor of T-42, all open. The queue loads
// its list and open count first, so each Story's request log starts with those two reads.
const desk = (id: string, world: ReadonlyArray<unknown> = []) =>
  Story.make(DeskSetup, { id, fixtures: [DeskClient], world })
    .ensure(SessionRef, { input: { userId: "dispatcher-7" } })
    .ensure(ToastsRef)
    .ensure(North, { input: { workspaceId: "north" } })
    .ensure(Editor42, { input: T42 });

// A save that repairs the queue. The title shows at once in the one shared record, so the queue row and the
// panel agree while the request is on the wire (`predicted`). When the answer lands the record is confirmed,
// and only what can be wrong is read again: the list reads `title` and `updatedAt`, so it refetches; the open
// count reads only `status`, so it does not (rule 29).
export const saveRepairsQueue = desk("desk/save-repairs-queue", [Desk.saveTitle.hold()])
  .send(Editor42, E.TitleChanged({ title: FIRST }), E.SaveRequested())
  .checkpoint("saving")
  .expect(Story.entity(Ticket, key("T-42")), { data: { title: FIRST }, predicted: true })
  .expect(Editor42, { operations: { save: [{ key: key("T-42"), pending: true }] } })
  .world(Desk.saveTitle.release())
  .expect(Story.entity(Ticket, key("T-42")), { data: { title: FIRST }, predicted: false })
  .expect(Editor42, { state: S.OPEN.SAVED, memory: { saved: FIRST } })
  .expect(ToastsRef, { memory: { messages: [`Saved “${FIRST}”`] } })
  .expect(Desk.saveTitle, [{ phase: "answered", via: { attempts: [Story.attempt(O.save)] } }])
  .expect(Desk.list, [{ phase: "answered" }, { phase: "answered" }]) // the first read, then the repair
  .expect(Desk.openCount, [{ phase: "answered" }]); // status did not change: no repair

// Assigning from the queue repairs a different set: `status` and `assignee` are condition fields, so the open
// count refetches. The editor of the same ticket reads the same record and needs no event: its title is
// unchanged, so its memory is untouched.
export const assignRepairs = desk("desk/assign-repairs", [Desk.assign.hold({ at: "response" })])
  .ensure(Editor43, { input: key("T-43") })
  .send(North, Queue.E.AssignToMe({ ticketId: "T-43" }))
  .expect(Story.entity(Ticket, key("T-43")), {
    data: { assignee: "dispatcher-7", status: "assigned" },
    predicted: true,
  })
  .world(Desk.assign.release())
  .expect(Story.entity(Ticket, key("T-43")), {
    data: { assignee: "dispatcher-7" },
    predicted: false,
  })
  .expect(Editor43, { state: S.OPEN.EDITING, memory: { draft: "Fix loading dock door" } })
  .expect(Desk.openCount, [{ phase: "answered" }, { phase: "answered" }])
  .expect(Desk.assign, [{ phase: "answered", via: { actor: North } }]);

// Permission revoked mid-save. The session's `canEdit` is the editor's context; the root sends the editor to
// CLOSED and cancels the lane. That is the user's own stop: the fetch is interrupted, `unknown { Cancelled }`
// maps to `SaveStopped`, and the lane is released at once (nothing is held; only a lost answer is). The request
// had left the device, so it stays in transit and the server applies it when released: the screen is closed,
// the title changed anyway, and that is what "may have landed" means.
export const revokedMidSave = desk("desk/revoked-mid-save", [Desk.saveTitle.hold()])
  .send(Editor42, E.TitleChanged({ title: FIRST }), E.SaveRequested())
  .expect(Story.inspection, {
    lanes: [{ contract: SAVE_TITLE, state: "InFlight", binding: "bound" }],
  })
  .send(SessionRef, Session.E.PermissionChanged({ canEdit: false }))
  .expect(Editor42, {
    state: S.CLOSED,
    operations: { save: [] },
  })
  .expect(Story.inspection, { lanes: [] }) // released, not held
  .expect(Desk.saveTitle, [{ phase: "held" }])
  .world(Desk.saveTitle.release())
  .expect(Desk.saveTitle, [{ phase: "orphan", via: { attempts: [Story.attempt(O.save)] } }])
  .expect(Desk, { desk: { tickets: [{ ticketId: "T-42", title: FIRST }] } }); // it landed, and nobody heard

// A write that outlives the screen. Close and dispose cancel nothing (rule 44): the Runtime owns the lane, and
// the listing a host's `beforeunload` reads shows it, unbound. The answer lands with no actor, and in this setup
// there is no saved record, so the ending is evidence (rule 44) and no toast follows. The store still takes the
// confirmation at settlement (the queue repairs), so the next incarnation's ticket read fills `saved` and the
// draft. (With storage, the ending is parked and adopted: editor.tabs.story.ts `outlivesClose`.)
export const closedMidSave = desk("desk/closed-mid-save", [Desk.saveTitle.hold()])
  .send(Editor42, E.TitleChanged({ title: FIRST }), E.SaveRequested(), E.Close())
  .dispose(Editor42, { how: "now" }) // the screen is gone and so is the actor
  .expect(Story.inspection, {
    lanes: [{ contract: SAVE_TITLE, state: "InFlight", binding: "unbound" }],
  })
  .world(Desk.saveTitle.release())
  .expect(Story.entity(Ticket, key("T-42")), { data: { title: FIRST }, predicted: false })
  .expect(Desk.list, [{ phase: "answered" }, { phase: "answered" }]) // repaired with no editor alive
  .ensure(Editor42, { input: T42 })
  .expect(Editor42, { state: S.OPEN, memory: { saved: FIRST, draft: FIRST } })
  .expect(ToastsRef, { memory: { messages: [] } }) // evidence, not an adopted Saved
  .expect(Story.inspection, { lanes: [] });

// Sign-out with a save on the wire. The host reads the same listing (`runtime.unsettledWrites()`, app/host.ts)
// and asks before it goes on. Here the user goes on: the session's state closes the editor through its context
// and releases the stop, and `forget` removes the session's stored record. Reading the session afterwards finds
// no actor.
export const signOut = desk("desk/sign-out", [Desk.saveTitle.hold()])
  .send(Editor42, E.TitleChanged({ title: FIRST }), E.SaveRequested())
  .expect(Story.inspection, { lanes: [{ contract: SAVE_TITLE, state: "InFlight" }] })
  .send(SessionRef, Session.E.SignedOut())
  .expect(SessionRef, { state: Session.S.SIGNED_OUT, memory: { canEdit: false } })
  .expect(Editor42, { state: S.CLOSED })
  .expect(Story.inspection, { lanes: [] })
  .dispose(SessionRef, { how: "forget" })
  .expect(SessionRef, undefined);

// PM6. Another dispatcher renames two tickets, and the feed pushes each change. The push updates the one Ticket
// record everywhere: the clean editor of T-42 takes the new title as its draft, the editor of T-43 with an
// unsaved edit keeps its draft and moves only `saved`, and the queue's list repairs once per change (it reads
// `title`). The open count reads only `status` and never refetches. (feed/pushed-rename checks the feed's
// own side: the activity line.)
export const pushedRename = desk("desk/pushed-rename") // pending merge 6
  .ensure(feedRef("north"), { input: { workspaceId: "north" } }) // pending merge 6
  .ensure(Editor43, { input: key("T-43") })
  .send(Editor43, E.TitleChanged({ title: "My own wording" }))
  .world(Desk.renameElsewhere({ ...key("T-42"), title: "Replace lobby light, east" }))
  .expect(Editor42, {
    memory: { saved: "Replace lobby light, east", draft: "Replace lobby light, east" },
  })
  .world(Desk.renameElsewhere({ ...key("T-43"), title: "Dock door, second try" }))
  .expect(Editor43, { memory: { saved: "Dock door, second try", draft: "My own wording" } })
  .expect(Story.entity(Ticket, key("T-43")), { data: { title: "Dock door, second try" } })
  .expect(Desk.list, [{ phase: "answered" }, { phase: "answered" }, { phase: "answered" }])
  .expect(Desk.openCount, [{ phase: "answered" }]);
