// The roster admin screen: technicians, teams and customers of one workspace, for an admin.
//
// How this module is different (COVERAGE.md 5.2): several related entities in one domain; a merge that writes
// across two entities and N tickets, confirmed by a subroutine whose exit carries the survivor; deletes restored
// on a 409; an `allow` lane (invite emails) and an unkeyed one (rebuild index); invitations batched below the
// commit; and a change log polled with a cursor beside the roster read.
//
// Its actions exist only for an admin: the Session's `isAdmin` is context (F22), and every write's guard reads it,
// so `check()` tells a dispatcher why the buttons are disabled.
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import { Session } from "../Session/session.definition.js";
import { technicianOnline } from "../Presence/presence.contracts.js";
import { TicketsDomain } from "../Tickets/ticket.domain.js";
import { RosterChange } from "./roster-api.js";
import { rebuildIndex, rosterEvents, sendInviteEmail } from "./roster.contracts.js";
import { RosterDomain, RosterFeed } from "./roster.domain.js";
import { ConfirmMerge } from "./confirm-merge.subroutine.js";
import { SkillChip } from "./skill-chip.trait.js";

export const AUDIT_KEPT = 50;

export const MAX_SKILLS = 12;

// An invite on its way. Workflow, not a record: the roster shows it apart until it holds the server's id (rule 33).
export const InviteDraft = Schema.Struct({
  draftId: Schema.String,
  name: Schema.String,
  email: Schema.String,
  status: Schema.Literals(["sending", "failed", "unsure", "invited"]),
  reason: Schema.NullOr(Schema.String),
  technicianId: Schema.NullOr(Schema.String),
});

const Invitee = Schema.Struct({
  draftId: Schema.String,
  name: Schema.String,
  email: Schema.String,
});

const tech = { technicianId: Schema.String };

export const Roster = definition({
  id: "DispatchDesk/Roster",
  states: [
    {
      ROSTER: [
        "BROWSING",
        {
          SKILLS: Flow.state({
            traits: { chips: SkillChip.each({ of: "skillsDraft", max: MAX_SKILLS }) },
          }),
        },
      ],
    },
    { MERGING: ConfirmMerge },
  ],
  events: {
    TeamChosen: { teamId: Schema.String },
    LoadMore: {},
    Move: { ...tech, from: Schema.String, to: Schema.String },
    Rename: { ...tech, name: Schema.String },
    RetryRename: tech,
    DismissRename: tech,
    Remove: tech,
    EditSkills: tech,
    AddSkill: { skill: Schema.String },
    SaveSkills: {},
    CloseSkills: {},
    MergeRequested: { first: Schema.String, second: Schema.String },
    Invite: Invitee.fields,
    ResendInviteEmail: tech,
    RebuildIndex: {},
    DismissNotice: {},
    Refresh: {}, // read the teams and the roster again
    ResumeFeed: {},
  },
  internalEvents: {
    Changed: {}, // a write landed: the store shows it, memory has nothing to write
    Refused: { notice: Schema.String },
    MoveUnsure: Flow.uncertain({}),
    RenameUnsure: Flow.uncertain({ technicianId: Schema.String }),
    RemoveUnsure: Flow.uncertain({}),
    SkillsUnsure: Flow.uncertain({}),
    Merged: { survivorId: Schema.String },
    MergeRefused: { reason: Schema.String },
    MergeUnsure: Flow.uncertain({}),
    Invited: { draftId: Schema.String, technicianId: Schema.String },
    InviteRefused: { draftId: Schema.String, reason: Schema.String },
    InviteUnsure: Flow.uncertain({ draftId: Schema.String }),
    EmailSent: {},
    EmailUnsure: Flow.uncertain({}),
    IndexRebuilt: {},
    IndexUnsure: Flow.uncertain({}),
    // the audit log's facts, the gap notice and the polled sessions' ends
    Change: { change: RosterChange },
    MayHaveMissed: { why: Schema.Literals(["Unproven", "Lost", "Reset"]) },
    FeedEnded: {},
  },
  context: {
    isAdmin: Session.select(({ memory }) => memory.isAdmin),
  },
  memory: {
    workspaceId: Flow.input(Schema.String),
    teamId: Flow.initial(Schema.String, "team-east"),
    locale: Flow.initial(Schema.String, "en"),
    notice: Flow.initial(Schema.String, ""),
    skillsFor: Flow.initial(Schema.NullOr(Schema.String), null), // the technician the skills form edits
    skillsDraft: Flow.initial(Schema.Array(Schema.String), []), // the `of:` list of `chips`
    inviting: Flow.initial(Schema.Array(InviteDraft), []),
    // The two customers the merge dialog compares, while it is open: their tickets are read for both.
    mergePair: Flow.initial(
      Schema.NullOr(Schema.Struct({ first: Schema.String, second: Schema.String })),
      null,
    ),
    audit: Flow.initial(Schema.Array(RosterChange), []), // the newest changes, by `seq`
    feedPaused: Flow.initial(Schema.Boolean, false), // the polled sessions ended; Resume places them
  },
  operations: ({ E }) => {
    const refused = (notice: string) => E.Refused.from(() => ({ notice }));

    return {
      // Reads, bare: the screen reads their rows; nothing the machine decides waits on them.
      roster: RosterDomain.roster,
      teams: RosterDomain.teams,
      teamSizes: RosterDomain.teamSizes,
      customers: RosterDomain.customers,
      // Online dots per row: the collaboration SDK's presence, one session per technician shown (`subscribe.each`,
      // T6), the same SDK contract the ticket watcher uses, placed per row (T7).
      online: technicianOnline,
      // What a merge re-points: the tickets of the customer that goes, one placement per open merge dialog.
      mergedTickets: TicketsDomain.byCustomer,

      move: RosterDomain.move.outcomes({
        success: E.Changed,
        failure: {
          TechnicianGone: refused("That technician was removed"),
          NotSent: refused("Not moved"),
        },
        unknown: E.MoveUnsure,
      }),
      rename: RosterDomain.rename.outcomes({
        success: E.Changed,
        failure: {
          TechnicianGone: refused("That technician was removed"),
          NotSent: refused("Not renamed"),
        },
        unknown: E.RenameUnsure.from((_r, { key }) => ({ technicianId: key.technicianId })),
      }),
      setSkills: RosterDomain.setSkills.outcomes({
        success: E.Changed,
        failure: {
          TechnicianGone: refused("That technician was removed"),
          NotSent: refused("Not saved"),
        },
        unknown: E.SkillsUnsure,
      }),
      remove: RosterDomain.remove.outcomes({
        success: E.Changed,
        failure: {
          HasOpenTickets: E.Refused.from((e) => ({
            notice: `Still holds ${String(e.open)} open tickets`,
          })),
          TechnicianGone: E.Changed, // gone already: what was asked
          NotSent: refused("Not removed"),
        },
        unknown: E.RemoveUnsure,
      }),
      merge: RosterDomain.merge.outcomes({
        success: E.Merged.from((customer) => ({ survivorId: customer.customerId })),
        failure: {
          MergeConflict: E.MergeRefused.from((e) => ({ reason: e.reason })),
          NotSent: E.MergeRefused.from(() => ({ reason: "That merge was not sent" })),
        },
        unknown: E.MergeUnsure,
      }),
      invite: RosterDomain.invite.outcomes({
        success: E.Invited.from((row, { key }) => ({
          draftId: key.draftId,
          technicianId: row.technicianId,
        })),
        failure: {
          InviteRejected: E.InviteRefused.from((e, { key }) => ({
            draftId: key.draftId,
            reason: e.reason,
          })),
          NotSent: E.InviteRefused.from((r, { key }) => ({
            draftId: key.draftId,
            reason: `Not sent (${r.why})`,
          })),
        },
        unknown: E.InviteUnsure.from((_r, { key }) => ({ draftId: key.draftId })),
      }),
      // Plain writes (no domain). `allow` holds nothing: an email that may not have gone is re-sent at once, in its
      // own ending's turn, or let go.
      inviteEmail: sendInviteEmail.outcomes({
        success: E.EmailSent,
        failure: { TechnicianGone: refused("That technician was removed") },
        unknown: E.EmailUnsure,
      }),
      rebuild: rebuildIndex.outcomes(
        {
          success: E.IndexRebuilt,
          failure: { NotSent: refused("Already rebuilding") },
          unknown: E.IndexUnsure,
        },
        {
          writes: ({ input }) => [
            RosterDomain.roster.invalidate({ workspaceId: input.workspaceId }),
          ],
        },
      ),

      // the change log, twice. Into the store (a `listen` entry maps only `failure`, SR26), and
      // into the audit log in memory (a fact feed maps `value`, `missed` and `failure`).
      changes: RosterFeed.changes.outcomes({
        failure: { PollFailed: E.FeedEnded, Feed: E.FeedEnded },
      }),
      audit: rosterEvents.outcomes({
        value: E.Change.from((change) => ({ change })),
        missed: E.MayHaveMissed.from((m) => ({ why: m.why })),
        fills: "audit",
        failure: { PollFailed: E.FeedEnded, Feed: E.FeedEnded },
      }),
    };
  },
});
