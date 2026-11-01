// The dispatcher's ticket queue: filters, search, tabs, paging, new tickets, archive, bulk close, and a row per
// ticket with its own assign toggle. The comments preview drawer is the `Comments` trait placed as `preview`, reset
// by the previewed ticket (F7).
//
// How this module is different (COVERAGE.md 5.1): entities at list scale. The only module with a `serialize` bulk
// write over many records of one entity, condition operators (`or`, `isNull`, `lt`) and two sort keys; its rows own
// their assignment (`.each` copies on `latest`, batched below the commit); its SLA deadlines are a keyed schedule.
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import { CommentsDomain } from "../../Comments/comments.domain.js";
import { Comments } from "../../Comments/comments.trait.js";
import { ticketViewers } from "../../Presence/presence.contracts.js";
import { RosterDomain } from "../../Roster/roster.domain.js";
import { Session } from "../../Session/session.definition.js";
import { TicketsDomain } from "../ticket.domain.js";
import { TicketStatus } from "../types.js";
import { AssignToggle } from "./assign-toggle.trait.js";
import { RowFlash } from "./row-flash.trait.js";

export const MAX_ROWS = 200;

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

// What the list's confirmed value says about each row, kept for the row copies, the flashes and the SLA timers.
const RowFacts = Schema.Struct({
  ticketId: Schema.String,
  revision: Schema.Number,
  dueAt: Schema.NullOr(Schema.Number),
  assignee: Schema.NullOr(Schema.String),
  open: Schema.Boolean,
});

export const Queue = definition({
  id: "DispatchDesk/Queue",
  states: ["HEALTHY", "DEGRADED"],
  events: {
    SearchChanged: { search: Schema.String },
    StatusChanged: { status: Schema.NullOr(TicketStatus) },
    MineOnlyToggled: {},
    LoadMore: {},
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
    Select: { ticketId: Schema.String, selected: Schema.Boolean },
    CloseSelected: {},
  },
  internalEvents: {
    PollDue: {},
    SearchSettled: {}, // the search box's debounce: its own turn applies the search (S1)
    Minute: { now: Schema.Number }, // the clock, rounded to the minute: the triage list's `now`
    ListLoaded: { rows: Schema.Array(RowFacts) },
    ListUnavailable: { retryAfter: Schema.Number },
    SlaBreached: { workspaceId: Schema.String, ticketId: Schema.String },
    Created: { draftId: Schema.String, ticketId: Schema.String },
    CreateFailed: { draftId: Schema.String, reason: Schema.String },
    CreateUnsure: Flow.uncertain({ draftId: Schema.String }),
    Archived: {},
    ArchiveRefused: { reason: Schema.String },
    ArchiveUnsure: Flow.uncertain({}),
    BulkClosed: { closed: Schema.Int, skipped: Schema.Array(Schema.String) },
    BulkNotSent: { why: Schema.String },
    BulkUnsure: Flow.uncertain({}),
  },
  context: { userId: Session.select(({ memory }) => memory.userId) },
  memory: {
    workspaceId: Flow.input(Schema.String),
    search: Flow.initial(Schema.String, ""), // as typed
    appliedSearch: Flow.initial(Schema.String, ""), // what the list reads, after the debounce
    status: Flow.initial(Schema.NullOr(TicketStatus), null),
    mineOnly: Flow.initial(Schema.Boolean, false),
    notice: Flow.initial(Schema.String, ""),
    previewId: Flow.initial(Schema.NullOr(Schema.String), null), // the ticket whose comments the drawer shows
    tab: Flow.initial(QueueTab, "all"),
    now: Flow.initial(Schema.Number, 0), // 0 until the first minute tick; the triage read waits for it
    creating: Flow.initial(Schema.Array(NewTicketDraft), []),
    rows: Flow.initial(Schema.Array(RowFacts), []), // the list's confirmed rows, from its value
    visibleRows: Flow.initial(Schema.Array(Schema.String), []), // the `of:` list of `toggles`
    flashing: Flow.initial(Schema.Array(Schema.String), []), // the `of:` list of `flashes`
    selected: Flow.initial(Schema.Array(Schema.String), []),
    breached: Flow.initial(Schema.Array(Schema.String), []),
  },
  traits: {
    preview: Comments, // the drawer: its filling and `resetOn` are in the machine
    toggles: AssignToggle.each({ of: "visibleRows", max: MAX_ROWS }),
    flashes: RowFlash.each({ of: "flashing", max: MAX_ROWS }),
  },
  operations: ({ E }) => ({
    // Maps `value`, so the machine subscribes. The event carries the facts the copies and timers need.
    list: TicketsDomain.list.outcomes({
      value: E.ListLoaded.from((pages) => ({
        rows: pages.flatMap((page) =>
          page.tickets.map((t) => ({
            ticketId: t.ticketId,
            revision: t.revision,
            dueAt: t.dueAt,
            assignee: t.assignee,
            open: t.status !== "closed",
          })),
        ),
      })),
      failure: {
        QueueUnavailable: E.ListUnavailable.from(({ retryAfter }) => ({ retryAfter })),
        // A lost read degrades the queue the same way a 503 does; Flow's two are required in a tag record (rule 37).
        NoResponse: E.ListUnavailable.from(() => ({ retryAfter: 5 })),
        Defect: E.ListUnavailable.from(() => ({ retryAfter: 5 })),
        Interrupted: E.ListUnavailable.from(() => ({ retryAfter: 5 })),
      },
    }),
    open: TicketsDomain.openCount, // bare: the badge reads the lane
    unassigned: TicketsDomain.unassigned, // the other two tabs, each placed only while chosen
    triage: TicketsDomain.triage,
    mentions: CommentsDomain.mentions, // "@ you": unread comments that mention the signed-in dispatcher (E5)
    // The assignee's name comes from its own record (E1): one technician read per distinct assignee shown.
    assignees: RosterDomain.technicianById, // bare: rows read `Technician.get`
    // Who is viewing each visible ticket: one SDK session per row, keys following the visible rows (T6).
    viewers: ticketViewers, // pending merge 6: bare state feed
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
    bulkClose: TicketsDomain.bulkClose.outcomes({
      success: E.BulkClosed.from((page) => ({
        closed: page.tickets.filter((t) => t.status === "closed").length,
        skipped: page.tickets.filter((t) => t.status !== "closed").map((t) => t.ticketId),
      })),
      failure: { NotSent: E.BulkNotSent.from((r) => ({ why: r.why })) }, // Overloaded at the 65th (rule 35)
      unknown: E.BulkUnsure,
    }),
  }),
});
