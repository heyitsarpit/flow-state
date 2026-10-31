// The technician's visit screen for one ticket: on site, resolving (the wizard), resolved. It hosts the wizard
// subroutine and owns every write a resolution needs, because a subroutine may not own a write it hears (rule 48):
// reserving a part when the wizard adds one, releasing them when the wizard is abandoned (compensation, O20), and
// the resolution itself.
//
// Where a resolution's ending goes: it is committed in the host's filling of the wizard's `Submit` exit, owned by
// RESOLVED, so its endings are current there. Every ending is ALSO handled at the root, because a new incarnation
// adopts the lane in any leaf (rule 44), and the hold has its owner in RESOLVED's "Check again" (rule 45, O15).
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import { Session } from "../Session/session.definition.js";
import { historyOf } from "../Tickets/editor/fields.contracts.js";
import { releaseParts, reservePart, resolveTicket } from "./resolve.contracts.js";
import { Draft, ResolveWizard } from "./resolve-wizard.subroutine.js";

export const emptyDraft: typeof Draft.Type = { reason: "", parts: [], signatureRef: null };

export const Visit = definition({
  id: "DispatchDesk/Visit",
  states: ["ON_SITE", { RESOLVING: ResolveWizard }, "RESOLVED", "RELEASING"],
  events: {
    StartResolve: {},
    StepChosen: { step: Schema.Literals(["reason", "parts", "signoff"]) }, // the step bar
    CalledAway: {}, // the dispatcher sends the technician elsewhere mid-resolve
    CheckAgain: {},
    Done: {},
  },
  internalEvents: {
    Reserved: {},
    ReserveRefused: { reason: Schema.String },
    ReserveUnsure: Flow.uncertain({}),
    Released: {},
    ReleaseUnsure: Flow.uncertain({}),
    Resolved: {},
    ResolveRefused: { reason: Schema.String },
    ResolveUnsure: Flow.uncertain({}),
  },
  context: {
    me: Session.select(({ memory }) => memory.userId),
  },
  memory: {
    workspaceId: Flow.input(Schema.String),
    ticketId: Flow.input(Schema.String),
    assignee: Flow.input(Schema.String), // who the ticket is with; the guard port compares it with the session
    step: Flow.initial(Schema.Literals(["reason", "parts", "signoff"]), "reason"), // the step bar, from `onProgressed`
    draft: Flow.initial(Draft, emptyDraft), // what an abandoned wizard handed back (F14)
    releasing: Flow.initial(Schema.Array(Schema.String), []),
    notice: Flow.initial(Schema.String, ""),
  },
  operations: ({ E }) => ({
    reserve: reservePart.outcomes({
      success: E.Reserved,
      failure: {
        PartUnknown: E.ReserveRefused.from((e) => ({ reason: `No part ${e.partNumber}` })),
        OutOfStock: E.ReserveRefused.from((e) => ({ reason: `${e.partNumber} is out of stock` })),
        NotSent: E.ReserveRefused.from(() => ({ reason: "Not reserved" })),
      },
      unknown: E.ReserveUnsure,
    }),
    release: releaseParts.outcomes({
      success: E.Released,
      failure: { NotSent: E.Released },
      unknown: E.ReleaseUnsure,
    }),
    resolve: resolveTicket.outcomes(
      {
        success: E.Resolved,
        failure: {
          SignatureMissing: E.ResolveRefused.from(() => ({
            reason: "The signature didn't upload. Sign again.",
          })),
          TicketNotFound: E.ResolveRefused.from(() => ({ reason: "That ticket was removed" })),
          NotSent: E.ResolveRefused.from(() => ({ reason: "Not sent. Try again." })),
        },
        unknown: E.ResolveUnsure,
      },
      // The history panel's read is stale the moment a resolution lands: it has a new line (O22, rule 36).
      {
        writes: ({ input }) => [
          historyOf.invalidate({ workspaceId: input.workspaceId, ticketId: input.ticketId }),
        ],
      },
    ),
  }),
});
