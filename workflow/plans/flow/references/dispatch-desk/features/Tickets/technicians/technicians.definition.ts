// The technician panel beside the queue: who is free, busy or on a break, how recently each phone reported, and
// a ticket dragged onto a card dispatches it. Pending merge 6 for its pulse feeds.
//
// How this module is different (COVERAGE.md 5.1, "QU techs"): all keyed state feeds. One pulse session per shown
// technician (`subscribe.each`), `TechCard` copies over the same live keys, `allow` nudges toasted one by one, a
// plain optimistic break toggle, and a dispatch whose prediction moves a SECOND record (the technician) between
// columns.
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import { RosterDomain } from "../../Roster/roster.domain.js";
import { Session } from "../../Session/session.definition.js";
import { breaksOf, nudgeTechnician, setBreak, technicianPulse } from "./technicians.contracts.js";
import { DispatchDomain } from "./technicians.domain.js";
import { TechCard } from "./tech-card.trait.js";

export const STALE_AFTER_MS = 60_000; // a pulse older than a minute is shown as stale

export const Technicians = definition({
  id: "DispatchDesk/Technicians",
  states: ["PANEL"],
  events: {
    TeamChosen: { teamId: Schema.String },
    Nudge: { technicianId: Schema.String, text: Schema.String },
    ToggleBreak: { technicianId: Schema.String, onBreak: Schema.Boolean },
    Dispatch: { ticketId: Schema.String, technicianId: Schema.String },
  },
  internalEvents: {
    Shown: { technicianIds: Schema.Array(Schema.String) },
    RosterFailed: {},
    Nudged: { technicianId: Schema.String },
    NudgeFailed: { technicianId: Schema.String, reason: Schema.String },
    NudgeUnsure: Flow.uncertain({ technicianId: Schema.String }),
    BreakSet: {},
    BreakUnsure: Flow.uncertain({}),
    Dispatched: {},
    DispatchRefused: { reason: Schema.String },
    DispatchUnsure: Flow.uncertain({}),
  },
  context: { userId: Session.select(({ memory }) => memory.userId) },
  memory: {
    workspaceId: Flow.input(Schema.String),
    teamId: Flow.initial(Schema.String, "team-east"),
    shown: Flow.initial(Schema.Array(Schema.String), []), // the `of:` list of `cards`, from the roster's value
    notice: Flow.initial(Schema.String, ""),
  },
  traits: { cards: TechCard.each({ of: "shown", max: 30 }) },
  operations: ({ E }) => ({
    // The team's technicians, live. Its value fills `shown`: membership of the cards and of the pulse sessions.
    roster: RosterDomain.roster.outcomes({
      value: E.Shown.from((pages) => ({
        technicianIds: pages.flatMap((page) => page.technicians.map((t) => t.technicianId)),
      })),
      failure: { NoResponse: E.RosterFailed, Defect: E.RosterFailed, Interrupted: E.RosterFailed },
    }),
    pulse: technicianPulse, // pending merge 6: bare state feed: the card reads its row (`value`, `last.at`, `drop`)
    breaks: breaksOf, // bare: the switch reads the row, optimistic while a toggle is on its way
    setBreak: setBreak.outcomes({
      success: E.BreakSet,
      failure: { NotSent: E.BreakSet },
      unknown: E.BreakUnsure,
    }),
    nudge: nudgeTechnician.outcomes({
      success: E.Nudged.from((_v, { key }) => ({ technicianId: key.technicianId })),
      failure: {
        NudgeRefused: E.NudgeFailed.from((e, { key }) => ({
          technicianId: key.technicianId,
          reason: e.reason,
        })),
      },
      unknown: E.NudgeUnsure.from((_r, { key }) => ({ technicianId: key.technicianId })),
    }),
    dispatch: DispatchDomain.dispatch.outcomes({
      success: E.Dispatched,
      failure: {
        AlreadyAssigned: E.DispatchRefused.from((e) => ({ reason: `Already with ${e.assignee}` })),
        TicketNotFound: E.DispatchRefused.from(() => ({ reason: "That ticket was removed" })),
        NotSent: E.DispatchRefused.from(() => ({ reason: "Not sent" })),
      },
      unknown: E.DispatchUnsure,
    }),
  }),
});
