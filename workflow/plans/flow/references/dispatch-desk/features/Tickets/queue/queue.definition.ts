// The dispatcher's ticket queue: filters, search, paging, assignment and list availability. Named operations
// (rule 39–43): `list` and `open` are reads, `assign` is a keyed write (one lane per ticket). The comments
// preview drawer is the `Comments` trait placed as `preview`, reset by the previewed ticket (F7).
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import { CommentsDomain } from "../../Comments/comments.domain.js";
import { Comments } from "../../Comments/comments.trait.js";
import { Session } from "../../Session/session.definition.js";
import { TicketsDomain } from "../ticket.domain.js";
import { TicketStatus } from "../types.js";

export const MAX_ASSIGN_RESENDS = 3; // user-defined: re-sends after the first send, then give up

export const QueueTab = Schema.Literals(["all", "unassigned", "triage"]);

// A ticket the dispatcher is creating. It is workflow, not a record: no temporary id enters a list (rule 33).
// The view shows it apart from the rows until a list holds `id`, the server's.
export const NewTicketDraft = Schema.Struct({
  draftId: Schema.String,
  title: Schema.String,
  priority: Schema.Int,
  status: Schema.Literals(["sending", "failed", "unsure", "created"]),
  failure: Schema.NullOr(Schema.String),
  id: Schema.NullOr(Schema.String),
});

export type NewTicketDraft = typeof NewTicketDraft.Type;

export const Queue = definition({
  id: "DispatchDesk/Queue",
  states: ["HEALTHY", "DEGRADED"],
  events: {
    SearchChanged: { search: Schema.String },
    StatusChanged: { status: Schema.NullOr(TicketStatus) },
    MineOnlyToggled: {},
    LoadMore: {},
    AssignToMe: { ticketId: Schema.String },
    // The drawer's open and close set `memory.previewId`.
    PreviewOpened: { ticketId: Schema.String },
    PreviewClosed: {},
    TabChosen: { tab: QueueTab },
    CreateTicket: {
      draftId: Schema.String, // the view mints it (2.9.5): the create's lane and the draft's key
      title: Schema.String,
      priority: Schema.Int,
      dueAt: Schema.NullOr(Schema.Number),
    },
    RetryCreate: { draftId: Schema.String },
    DiscardDraft: { draftId: Schema.String },
    Archive: { ticketId: Schema.String },
  },
  internalEvents: {
    PollDue: {},
    Minute: { now: Schema.Number }, // the clock, rounded to the minute: the triage list's `now`
    ListLoaded: { ticketIds: Schema.Array(Schema.String) },
    ListUnavailable: { retryAfter: Schema.Number },
    AssignFailed: { reason: Schema.String },
    AssignConflict: { assignee: Schema.String }, // 409: someone else holds the ticket
    // One unknown event for the one keyed write whose handler acts on its lane (rule 43).
    AssignUnsure: Flow.uncertain({ workspaceId: Schema.String, ticketId: Schema.String }),
    ReconcileAssign: { workspaceId: Schema.String, ticketId: Schema.String },
    Created: { draftId: Schema.String, ticketId: Schema.String },
    CreateFailed: { draftId: Schema.String, reason: Schema.String },
    CreateUnsure: Flow.uncertain({ draftId: Schema.String }),
    Archived: {},
    ArchiveRefused: { reason: Schema.String },
    ArchiveUnsure: Flow.uncertain({}),
  },
  context: { userId: Session.select(({ memory }) => memory.userId) },
  memory: {
    workspaceId: Flow.input(Schema.String),
    search: Flow.initial(Schema.String, ""), // as typed; the list input trims and lowercases it
    status: Flow.initial(Schema.NullOr(TicketStatus), null),
    mineOnly: Flow.initial(Schema.Boolean, false),
    notice: Flow.initial(Schema.String, ""),
    previewId: Flow.initial(Schema.NullOr(Schema.String), null), // the ticket whose comments the drawer shows
    tab: Flow.initial(QueueTab, "all"),
    now: Flow.initial(Schema.Number, 0), // 0 until the first minute tick; the triage read waits for it
    creating: Flow.initial(Schema.Array(NewTicketDraft), []),
  },
  // `Comments` at the root, once: the drawer. Its filling and `resetOn` are in the machine.
  traits: { preview: Comments },
  operations: ({ E }) => ({
    // Maps `value`, so the machine subscribes. Rows are read from the lane; the event only says "loaded".
    list: TicketsDomain.list.outcomes({
      value: E.ListLoaded.from((pages) => ({
        ticketIds: pages.flatMap((page) => page.tickets.map((ticket) => ticket.ticketId)),
      })),
      failure: {
        QueueUnavailable: E.ListUnavailable.from(({ retryAfter }) => ({ retryAfter })),
        // A lost read degrades the queue the same way a 503 does; Flow's two are required in a tag record
        // (rule 37), and a list that cannot be read is "unavailable" whatever the reason.
        NoResponse: E.ListUnavailable.from(() => ({ retryAfter: 5 })),
        Defect: E.ListUnavailable.from(() => ({ retryAfter: 5 })),
        Interrupted: E.ListUnavailable.from(() => ({ retryAfter: 5 })),
      },
    }),
    open: TicketsDomain.openCount, // bare: the badge reads the lane
    // The other two tabs, each placed only while chosen. Bare: the rows are the lane's data.
    unassigned: TicketsDomain.unassigned,
    triage: TicketsDomain.triage,
    // "@ you": unread comments that mention the signed-in dispatcher (a `contains` condition, E5).
    mentions: CommentsDomain.mentions, // bare: the badge reads the lane
    // One lane per draft (the contract's key, `draftId`).
    create: TicketsDomain.create.outcomes({
      success: E.Created.from((ticket, { key }) => ({
        draftId: key.draftId,
        ticketId: ticket.ticketId,
      })),
      failure: {
        TicketRejected: E.CreateFailed.from((e, { key }) => ({
          draftId: key.draftId,
          reason: e.reason,
        })),
        NotSent: E.CreateFailed.from((r, { key }) => ({
          draftId: key.draftId,
          reason: `Not sent (${r.why})`,
        })),
      },
      unknown: E.CreateUnsure.from((_r, { key }) => ({ draftId: key.draftId })),
    }),
    archive: TicketsDomain.archive.outcomes({
      success: E.Archived,
      failure: {
        ArchiveRefused: E.ArchiveRefused.from((e) => ({ reason: e.reason })),
        TicketNotFound: E.Archived, // gone already: what was asked
        NotSent: E.ArchiveRefused.from(() => ({ reason: "That archive was not sent" })),
      },
      unknown: E.ArchiveUnsure,
    }),
    // Key `["workspaceId", "ticketId"]` on the contract: one lane per ticket, created by work.
    assign: TicketsDomain.assign.outcomes({
      failure: {
        TicketNotFound: E.AssignFailed.from(() => ({ reason: "That ticket was removed" })),
        AlreadyAssigned: E.AssignConflict.from(({ assignee }) => ({ assignee })),
        NotSent: E.AssignFailed.from(() => ({ reason: "That assignment was not sent" })), // rule 20
      },
      unknown: E.AssignUnsure.from((_ending, { key }) => ({
        workspaceId: key.workspaceId,
        ticketId: key.ticketId,
      })),
    }),
  }),
});
