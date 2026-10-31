// Who has a ticket open, and who is typing in it, over the collaboration SDK. Pending merge 6: written against
// merge-6-streams/proposal-v2.md revision 7.1, S1–S10.
//
// Two sessions on one channel: the viewers (a state feed: the set, each time) and typing (a fact feed: each message
// once). The viewers are also copies: one `ViewerBadge` per viewer the SDK reports (F5), whose membership is host
// data filled from the feed's `value`. No RETRY_WAIT (T9): the SDK reconnects by itself; a channel it gave up on
// ends here in ENDED, and the panel says so.
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import { typingIn, ticketViewers, typingPing } from "./presence.contracts.js";
import { ViewerBadge } from "./viewer-badge.trait.js";

export const TYPING_SHOWN_MS = 4_000;

export const Presence = definition({
  id: "DispatchDesk/Presence",
  states: ["WATCHING", "ENDED"],
  events: { Typed: { memberId: Schema.String, at: Schema.Number } }, // the editor's keystrokes, at most every 2 s
  internalEvents: {
    Viewers: { ids: Schema.Array(Schema.String) },
    Typing: { memberId: Schema.String, at: Schema.Number, id: Schema.String },
    MayHaveMissed: { why: Schema.Literals(["Unproven", "Lost", "Reset"]), initial: Schema.Boolean },
    Ended: { reason: Schema.String },
  },
  memory: {
    workspaceId: Flow.input(Schema.String),
    ticketId: Flow.input(Schema.String),
    viewerIds: Flow.initial(Schema.Array(Schema.String), []), // the `of:` list of `badges`
    typing: Flow.initial(Schema.Record(Schema.String, Schema.Number), {}), // memberId → when
    reason: Flow.initial(Schema.String, ""),
  },
  traits: { badges: ViewerBadge.each({ of: "viewerIds", max: 20 }) },
  operations: ({ E }) => {
    const gaveUp = E.Ended.from((e) => ({ reason: e.reason })); // the SDK's own words
    const broke = (reason: string) => E.Ended.from(() => ({ reason }));

    return {
      // A state feed may map `value` (only a reconciled, changed value arrives); then `failure` is required (M6 2.7).
      viewers: ticketViewers.outcomes({
        value: E.Viewers.from((members) => ({ ids: Object.keys(members) })),
        failure: {
          CollabFailed: gaveUp,
          Closed: broke("closed"),
          Overflow: broke("overflow"),
          Defect: broke("defect"),
          Interrupted: broke("interrupted"),
        },
      }),
      typing: typingIn.outcomes({
        value: E.Typing.from((t) => ({ memberId: t.memberId, at: t.at, id: t.id })),
        missed: E.MayHaveMissed.from((m) => ({ why: m.why, initial: m.initial })),
        failure: {
          CollabFailed: gaveUp,
          Closed: broke("closed"),
          Overflow: broke("overflow"),
          Defect: broke("defect"),
          Interrupted: broke("interrupted"),
        },
      }),
      // Bare: fire and forget (rule 40: a bare write's endings are evidence and it never holds).
      ping: typingPing,
    };
  },
});
