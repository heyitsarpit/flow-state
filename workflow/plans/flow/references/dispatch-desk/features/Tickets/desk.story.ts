// App Stories across actors (`Story.app`, 2.10.1): Session, Toasts, the queue and the lazy editors run in one
// Runtime of `DeskSetup`, over the Desk fake (`DeskClient`). Each Story is a transcript: sends, wire words,
// lifecycle steps and named checkpoints; desk.test.tsx reads them. No ending is injected (2.10.5). What they show that a machine Story cannot:
//   - one write repairs another actor's list and count (the shared Ticket record, rules 27-30);
//   - a permission change reaches an editor through its context, and a stop releases at once (rule 44);
//   - a save outlives its screen and the next incarnation adopts it (rule 44);
//   - a sign-out refuses nothing by itself: the Runtime lists what is unsettled (C64) and `forget` drops it.
// `desk/pushed-rename` runs the workspace feed too, so it adds the feed's socket adapter as a fixture.
//
// `dispose(ref, { how: "now" })` (2.10.10) ends the actor at once (`disposeActor`). A plain `dispose(Editor42)`
// keeps it for its `retain`, expiring with `advance`, so a Story of "no actor when the answer lands" disposes `now`.
// `DeskSetup` has no persistence, so an ending that lands with no actor is evidence (rule 44). The adopted ending
// of a persisted identity is the app Story in editor/editor.tabs.story.ts (`outlivesClose`).
import { Layer } from "effect";
import { Story } from "flow-state/testing";
import { DeskSetup } from "../../app/setup.js";
import { Desk, DeskClient } from "../../testing/desk.fake.js";
import { socketClient } from "../../testing/desk.socket.fake.js";
import { Session } from "../Session/session.definition.js";
import { SessionRef } from "../Session/session.ref.js";
import { ToastsRef } from "../Toasts/toasts.ref.js";
import { DeskFeedSocket } from "./feed/feed.socket.js";
import { feedRef } from "./feed/feed.ref.js";
import { Editor } from "./editor/editor.definition.js";
import { editorRef } from "./editor/editor.ref.js";
import { Editor42, FIRST, T42 } from "./editor/editor.story.js";
import { Roster } from "../Roster/roster.definition.js";
import { rosterRef } from "../Roster/roster.ref.js";
import { Queue } from "./queue/queue.definition.js";
import { Technicians } from "./technicians/technicians.definition.js";
import { techniciansRef } from "./technicians/technicians.ref.js";
import { queueRef } from "./queue/queue.ref.js";

const { E } = Editor;

export const North = queueRef("north");

export const Editor43 = editorRef({ workspaceId: "north", ticketId: "T-43" });

export const key = (ticketId: string) => ({ workspaceId: "north", ticketId });

type World = NonNullable<Parameters<typeof Story.app>[1]["world"]>;

// The signed-in dispatcher, the toast stack, the north queue and the editor of T-42, all open. The queue loads
// its list and open count first, so each Story's request log starts with those two reads.
const desk = (
  id: string,
  world: World = [],
  fixtures: Parameters<typeof Story.app>[1]["fixtures"] = [DeskClient],
) =>
  Story.app(DeskSetup, { id, fixtures, world })
    .ensure(SessionRef, { input: { userId: "dispatcher-7" } })
    .ensure(ToastsRef)
    .ensure(North, { input: { workspaceId: "north" } })
    .ensure(Editor42, { input: T42 });

// A save that repairs the queue. The title shows at once in the one shared record, so the queue row and the
// panel agree while the request is on the wire (`predicted`). When the answer lands the record is confirmed,
// and only what can be wrong is read again: the list reads `title` and `updatedAt`, so it refetches; the open
// count reads only `status`, so it does not (rule 29).
export const saveRepairsQueue = desk("desk/save-repairs-queue", [Desk.saveTitle.hold()])
  .checkpoint("deskOpen")
  .send(Editor42, E.TitleChanged({ title: FIRST }), E.SaveRequested())
  .checkpoint("saving")
  .world(Desk.saveTitle.release())
  .checkpoint("saved");

// Assigning from the queue repairs a different set: `status` and `assignee` are condition fields, so the open
// count refetches. The editor of the same ticket reads the same record and needs no event: its title is
// unchanged, so its memory is untouched.
export const assignRepairs = desk("desk/assign-repairs", [
  Desk.assignBatch.hold({ at: "response" }),
])
  .ensure(Editor43, { input: key("T-43") })
  .send(North, Queue.E.toggles.key("T-43").Toggle({ assignee: "dispatcher-7" }))
  .advance("10 millis") // the resolver's window: the batched assign leaves
  .checkpoint("assigning")
  .world(Desk.assignBatch.release())
  .checkpoint("assigned");

// Permission revoked mid-save. The session's `canEdit` is the editor's context; the root sends the editor to
// CLOSED and cancels the lane. That is the user's own stop: the fetch is interrupted, `unknown { Cancelled }`
// maps to `SaveStopped`, and the lane is released at once (nothing is held; only a lost answer is). The request
// had left the device, so it stays in transit and the server applies it when released: the screen is closed,
// the title changed anyway, and that is what "may have landed" means.
export const revokedMidSave = desk("desk/revoked-mid-save", [Desk.saveTitle.hold()])
  .send(Editor42, E.TitleChanged({ title: FIRST }), E.SaveRequested())
  .checkpoint("saving")
  .send(SessionRef, Session.E.PermissionChanged({ canEdit: false }))
  .checkpoint("revoked")
  .world(Desk.saveTitle.release())
  .checkpoint("landedUnheard");

// A write that outlives the screen. Close and dispose cancel nothing (rule 44): the Runtime owns the lane, and
// the listing a host's `beforeunload` reads shows it, unbound. The answer lands with no actor, and in this setup
// there is no saved record, so the ending is evidence (rule 44) and no toast follows. The store still takes the
// confirmation at settlement (the queue repairs), so the next incarnation's ticket read fills `saved` and the
// draft. (With storage, the ending is parked and adopted: editor.tabs.story.ts `outlivesClose`.)
export const closedMidSave = desk("desk/closed-mid-save", [Desk.saveTitle.hold()])
  .send(Editor42, E.TitleChanged({ title: FIRST }), E.SaveRequested(), E.Close())
  .dispose(Editor42, { how: "now" }) // the screen is gone and so is the actor
  .checkpoint("unbound")
  .world(Desk.saveTitle.release())
  .checkpoint("settledUnbound")
  .ensure(Editor42, { input: T42 })
  .checkpoint("reopened");

// Sign-out with a save on the wire. The host reads the same listing (`runtime.unsettledWrites()`, app/host.ts)
// and asks before it goes on. Here the user goes on: the session's state closes the editor through its context
// and releases the stop, and `forget` removes the session's stored record. Reading the session afterwards finds
// no actor.
export const signOut = desk("desk/sign-out", [Desk.saveTitle.hold()])
  .send(Editor42, E.TitleChanged({ title: FIRST }), E.SaveRequested())
  .checkpoint("signOutRefused") // what app/host.ts `signOut` lists and asks about before going on
  .send(SessionRef, Session.E.SignedOut())
  .checkpoint("signedOut")
  .dispose(SessionRef, { how: "forget" })
  .checkpoint("forgotten");

// Another dispatcher renames two tickets, and the feed pushes each change. The push updates the one Ticket
// record everywhere: the clean editor of T-42 takes the new title as its draft, the editor of T-43 with an
// unsaved edit keeps its draft and moves only `saved`, and the queue's list repairs once per change (it reads
// `title`). The open count reads only `status` and never refetches. (feed/pushed-rename checks the feed's
// own side: the activity line.)
export const pushedRename = desk(
  "desk/pushed-rename",
  [],
  [DeskClient, DeskFeedSocket.layer.pipe(Layer.provide(socketClient(Desk)))],
)
  .ensure(feedRef("north"), { input: { workspaceId: "north" } })
  .ensure(Editor43, { input: key("T-43") })
  .send(Editor43, E.TitleChanged({ title: "My own wording" }))
  .world(Desk.renameElsewhere({ ...key("T-42"), title: "Replace lobby light, east" }))
  .checkpoint("pushedRename")
  .world(Desk.renameElsewhere({ ...key("T-43"), title: "Dock door, second try" }))
  .checkpoint("pushedOverDraft");

// One comment on two screens (E7): the editor of T-42 shows its thread, and the queue previews the same ticket.
// An edit made in the preview is predicted in the one `Comment` record, so the editor's thread shows the new text
// at once, while the request is on the wire; the answer confirms it for both.
export const editedInPreview = desk("desk/edited-in-preview", [
  Desk.commentsElsewhere({ ...key("T-42"), count: 1 }),
  Desk.editComment.hold({ at: "response" }),
])
  .send(North, Queue.E.PreviewOpened({ ticketId: "T-42" }))
  .send(North, Queue.E.preview.Edit({ commentId: "c-1", text: "Bulb is 40 W, not 60" }))
  .checkpoint("editedInPreview")
  .world(Desk.editComment.release())
  .checkpoint("editConfirmed");

// A FIFO of N and one save meet on one record (E8). The editor's title save on T-42 is on the wire; the queue's bulk
// close lists T-42 too. Both predict at once, but the record queue orders their sends across actors (rule 29): the
// bulk waits behind the save on T-42's queue (`Entity.queue`, E12), and goes when the save answers.
export const bulkVsSave = desk("desk/bulk-vs-save", [Desk.saveTitle.hold({ at: "response" })])
  .send(Editor42, E.TitleChanged({ title: FIRST }), E.SaveRequested())
  .send(North, Queue.E.Select({ ticketId: "T-42", selected: true }), Queue.E.CloseSelected())
  .checkpoint("bulkBehindSave")
  .world(Desk.saveTitle.release())
  .checkpoint("bothLanded");

// Two dispatchers, two tabs, the same ticket, the same instant (Y5: `together` states that both arrived before
// either ran). Each tab's row copy commits; the server takes the first and refuses the second (409), which that
// tab's copy reports. One Runtime per tab, one server.
// `together` takes a send's data form, `{ send: [target, event] }` (2.10.1).
export const twoDispatchers = desk("desk/two-dispatchers")
  .openTab("b", { from: "main" })
  .together(
    { send: [North, Queue.E.toggles.key("T-43").Toggle({ assignee: "dispatcher-7" })] },
    {
      send: [
        { actor: North, tab: "b" },
        Queue.E.toggles.key("T-43").Toggle({ assignee: "dispatcher-8" }),
      ],
    },
  )
  .advance("10 millis")
  .checkpoint("oneWins");

// One technician on two screens (E7, E8): the admin renames Ana on the roster while the queue's technician panel
// shows her, and the panel dispatches T-43 to her before the rename answers. The rename shows on the panel at once
// (one Technician record), and the dispatch's status prediction joins Ana's record queue BEHIND the rename: the
// two writes from two actors are sent in order (rule 29).
export const renameMeetsDispatch = desk("desk/rename-meets-dispatch", [
  Desk.renameTechnician.hold({ at: "response" }),
])
  .send(SessionRef, Session.E.RoleChanged({ isAdmin: true }))
  .ensure(rosterRef("north"), { input: { workspaceId: "north" } })
  .ensure(techniciansRef("north"), { input: { workspaceId: "north" } })
  .send(rosterRef("north"), Roster.E.Rename({ technicianId: "tech-ana", name: "Ana Lopez" }))
  .send(
    techniciansRef("north"),
    Technicians.E.Dispatch({ ticketId: "T-43", technicianId: "tech-ana" }),
  )
  .checkpoint("renameAndDispatchQueued")
  .world(Desk.renameTechnician.release())
  .checkpoint("bothLandedInOrder");
