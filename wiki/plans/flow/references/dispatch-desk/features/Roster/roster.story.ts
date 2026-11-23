// Roster Stories: app Stories (`Story.app`) over `DeskSetup` (the Session's `isAdmin` is the roster's context), with the Desk
// fake. The roster's port runs the real `RosterHttp` adapter over `Fake.fetch` (testing/desk.roster.fake.ts), so
// every status the adapter reads is one the fake's handler returned (Y6). Transcripts: inputs and named
// checkpoints; roster.test.ts reads them.
//
// Module checkpoints (COVERAGE.md section 6): `roster`, `movedTeam`, `mergePredicted`, `mergeRefusedRestored`,
// `removeRefusedRestored`.
import { Story } from "flow-state/testing";
import { browserSetup } from "../../app/persistence.js";
import { DeskSetup } from "../../app/setup.js";
import { Desk, DeskClient } from "../../testing/desk.fake.js";
import { Collab } from "../../testing/presence.fake.js";
import { Session } from "../Session/session.definition.js";
import { SessionRef } from "../Session/session.ref.js";
import { Roster } from "./roster.definition.js";
import { rosterRef } from "./roster.ref.js";

const { E } = Roster;

export const North = rosterRef("north");

export const ana = { technicianId: "tech-ana" };

type World = NonNullable<Parameters<typeof Story.app>[1]["world"]>;

const admin = (id: string, world: World = [], isAdmin = true) =>
  Story.app(DeskSetup, { id, fixtures: [DeskClient], world })
    .ensure(SessionRef, { input: { userId: "dispatcher-7" } })
    .send(SessionRef, Session.E.RoleChanged({ isAdmin }))
    .ensure(North, { input: { workspaceId: "north" } });

// East and the unplaced (`or(eq(teamId, east), isNull(teamId))`), ordered by team, name, key; then West.
export const browse = admin("roster/browse")
  .checkpoint("roster")
  .send(North, E.TeamChosen({ teamId: "team-west" }))
  .checkpoint("west");

// A move predicts the technician's team and both teams' counts, before the server answers (E1, E14). Ana leaves
// "East and unplaced" at once; the counts move by one each; the answer confirms the technician, and the counts,
// which the response does not carry (`.alsoChanges`), are confirmed by a read.
export const movedTeam = admin("roster/moved-team", [Desk.moveTechnician.hold({ at: "response" })])
  .send(North, E.Move({ ...ana, from: "team-east", to: "team-west" }))
  .checkpoint("movedTeam")
  .world(Desk.moveTechnician.release())
  .checkpoint("moveConfirmed");

// The counts replay over a new base (E11). While Ana's move is on the wire another admin moves Dee to East, and
// the admin refreshes: the teams' new counts are the base, and the predicted -1 and +1 are applied over them.
export const countReplayed = admin("roster/count-replayed", [
  Desk.moveTechnician.hold({ at: "response" }),
])
  .send(North, E.Move({ ...ana, from: "team-east", to: "team-west" }))
  .world(
    Desk.moveTechnicianElsewhere({
      workspaceId: "north",
      technicianId: "tech-dee",
      to: "team-east",
    }),
  )
  .send(North, E.Refresh())
  .checkpoint("countReplayed")
  .world(Desk.moveTechnician.release())
  .checkpoint("settled");

// A technician who still holds a ticket cannot be removed. The remove hid Ben everywhere at once; the 409 is a
// definite failure, so the row is back in place with no repair (E3), and the notice says why.
export const removeRefused = admin("roster/remove-refused", [
  Desk.changeElsewhere({
    workspaceId: "north",
    ticketId: "T-101",
    status: "assigned",
    assignee: "tech-ben",
  }),
  Desk.removeTechnician.hold({ at: "response" }),
])
  .send(North, E.Remove({ technicianId: "tech-ben" }))
  .checkpoint("removePredicted")
  .world(Desk.removeTechnician.release())
  .checkpoint("removeRefusedRestored");

// The merge: the dialog compares Acme and ACME Ltd, the admin keeps Acme, and the exit carries the survivor
// (F10). The commit predicts across two entities and many records (E2): ACME Ltd is deleted, Acme's count grows
// by its 22 tickets, and every one of those tickets is re-pointed to Acme, all before the server answers.
export const merged = admin("roster/merged", [Desk.mergeCustomers.hold({ at: "response" })])
  .send(North, E.MergeRequested({ first: "acme", second: "acme-ltd" }))
  .checkpoint("comparing")
  .send(North, E.MERGING.Confirm()) // denied: nothing picked yet
  .send(North, E.MERGING.Pick({ survivorId: "acme" }), E.MERGING.Confirm())
  .checkpoint("mergePredicted")
  .world(Desk.mergeCustomers.release())
  .checkpoint("merged");

// Another dispatcher moves one more ticket to ACME Ltd while the dialog is open, so the server's set differs from
// the one the admin's screen re-pointed: 409. Every prediction goes with no repair: both customers and all the
// tickets are back as they were (rule 30).
export const mergeRefused = admin("roster/merge-refused", [
  Desk.mergeCustomers.hold({ at: "response" }),
])
  .send(North, E.MergeRequested({ first: "acme", second: "acme-ltd" }))
  .world(Desk.changeElsewhere({ workspaceId: "north", ticketId: "T-42", customerId: "acme-ltd" }))
  .send(North, E.MERGING.Pick({ survivorId: "acme" }), E.MERGING.Confirm())
  .world(Desk.mergeCustomers.release())
  .checkpoint("mergeRefusedRestored");

// Both answers are lost: the first send's and its one re-send's. The merge may have happened, so all of it stays
// predicted until the forced repair lands, every record it touched is marked uncertain across both entities (E17),
// and the admin is told. (The record queues of both entities holding the Attempt are read in `merged`, E12.)
export const mergeUnsure = admin("roster/merge-unsure", [
  Desk.mergeCustomers.drop({ at: "response", times: 2 }),
])
  .send(North, E.MergeRequested({ first: "acme", second: "acme-ltd" }))
  .send(North, E.MERGING.Pick({ survivorId: "acme" }), E.MERGING.Confirm())
  .checkpoint("mergeUncertain");

// A merge outlives the admin screen (O14). The admin confirms and leaves; the roster is disposed with the request
// on the wire. `rosterRef` persists, so the answer that lands with no actor is parked for the identity, and the
// next roster screen adopts it before any event: the notice says it merged. Retained for a minute meanwhile (P2).
export const mergeOutlivesScreen = Story.app(browserSetup("dispatcher-7"), {
  id: "roster/merge-outlives-screen",
  fixtures: [DeskClient],
  world: [Desk.mergeCustomers.hold({ at: "response" })],
})
  .ensure(SessionRef, { input: { userId: "dispatcher-7" } })
  .send(SessionRef, Session.E.RoleChanged({ isAdmin: true }))
  .ensure(North, { input: { workspaceId: "north" } })
  .send(North, E.MergeRequested({ first: "acme", second: "acme-ltd" }))
  .send(North, E.MERGING.Pick({ survivorId: "acme" }), E.MERGING.Confirm())
  .dispose(North) // kept for its `retain`
  .advance("2 minutes") // the retain expires: no actor
  .checkpoint("leftMidMerge")
  .world(Desk.mergeCustomers.release()) // lands unbound; parked for the persisted identity
  .ensure(North, { input: { workspaceId: "north" } })
  .checkpoint("mergeAdopted");

// Three invites in one turn's window: three commits, three Attempts, three lanes, and one HTTP request, because the
// adapter's `RequestResolver` batches below the commit (O19). Each completes from its own item: two are created,
// one is refused (an address that is not one), and the drafts say so one by one (E13).
export const invited = admin("roster/invited")
  .send(
    North,
    E.Invite({ draftId: "i1", name: "Fay", email: "fay@north.example" }),
    E.Invite({ draftId: "i2", name: "Gus", email: "gus@north.example" }),
    E.Invite({ draftId: "i3", name: "Hal", email: "not an address" }),
  )
  .advance("10 millis") // the resolver's window
  .checkpoint("invited");

// Invite emails under `allow`: several on the wire at once, even twice for one technician, each its own Attempt
// answered in its own turn. Nothing holds (O9).
export const inviteEmails = admin("roster/invite-emails", [
  Desk.inviteEmail.hold({ at: "response" }),
])
  .send(
    North,
    E.ResendInviteEmail(ana),
    E.ResendInviteEmail(ana),
    E.ResendInviteEmail({ technicianId: "tech-cy" }),
  )
  .checkpoint("emailsInFlight")
  .world(Desk.inviteEmail.release())
  .checkpoint("emailsSent");

// One rebuild per workspace: an unkeyed lane, so `idle` and `commit` name it with no key (O18). A second press while
// it runs is refused before anything is sent.
export const rebuilt = admin("roster/rebuilt", [Desk.reindex.hold({ at: "response" })])
  .send(North, E.RebuildIndex(), E.RebuildIndex())
  .checkpoint("rebuilding")
  .world(Desk.reindex.release())
  .checkpoint("rebuilt");

// A dispatcher who is not an admin sees the roster, and every action is refused by the Session's context (F22).
export const notAdmin = admin("roster/not-admin", [], false)
  .send(North, E.Remove(ana), E.RebuildIndex())
  .checkpoint("refused");

// The skills form: one `SkillChip` copy per skill in the form's list (F4). A chip asks to be removed through its
// callback; the host writes its own list (rule 9). Saving predicts the technician's skills.
export const skills = admin("roster/skills")
  .send(North, E.EditSkills(ana), E.AddSkill({ skill: "ladders" }), E.AddSkill({ skill: "keys" }))
  .checkpoint("twoChips")
  .send(North, E.chips.key("ladders").Remove())
  .checkpoint("oneChip")
  .send(North, E.SaveSkills())
  .checkpoint("skillsSaved");

// A rename whose answer is lost is held: the row shows a retry chip (E9), and nothing re-sends it until the admin
// presses it. The same Attempt goes again and the server dedupes.
export const renameUnsure = admin("roster/rename-unsure", [
  Desk.renameTechnician.drop({ at: "response", times: 1 }),
])
  .send(North, E.Rename({ ...ana, name: "Ana Lopez" }))
  .checkpoint("renameUncertain")
  .send(North, E.RetryRename(ana))
  .checkpoint("renameConfirmed");

// A technician's device goes on a break: the poll a second later carries the change into the
// Technician record (the `listen` entry) and into the audit log (the fact feed), each once. The first registration
// on an empty log was `fresh`, so no notice (T2).
export const audited = admin("roster/audited")
  .checkpoint("fresh")
  .world(Desk.statusElsewhere({ workspaceId: "north", technicianId: "tech-cy", status: "break" }))
  .advance("1 second")
  .checkpoint("audited");

// SSR (P7): the roster page renders on the server and hydrates in the browser. The polled sessions run on the server
// only until capture, where they are released (2.10.11); the browser opens its own.
export const rosterPage = Story.app(DeskSetup, { id: "roster/ssr-server", fixtures: [DeskClient] })
  .ensure(SessionRef, { input: { userId: "dispatcher-7" } })
  .ensure(North, { input: { workspaceId: "north" } })
  .dehydrate("roster", { within: "1500 millis" });

export const rosterHydrated = Story.app(DeskSetup, {
  id: "roster/ssr-browser",
  fixtures: [DeskClient],
})
  .hydrate(rosterPage, "roster")
  .checkpoint("hydrated");

// Online dots: one SDK session per technician on the page (`subscribe.each`, T6), the same
// collaboration contract the ticket watcher uses, placed per row (T7). Ana's phone joins her channel.
export const onlineDots = admin("roster/online-dots")
  .world(
    Collab.join({ channel: "technician:north:tech-ana", member: { id: "tech-ana", name: "Ana" } }),
  )
  .checkpoint("anaOnline");
